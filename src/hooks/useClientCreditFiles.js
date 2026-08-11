import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { runAuditEngine } from "../utils/auditEngine";

export function useClientCreditFiles(clientId, refreshKey = 0, selectedFile = null) {
  const [analysisParsed, setAnalysisParsed] = useState(null);
  const [analysisRaw, setAnalysisRaw] = useState(null);
  const [thread, setThread] = useState(null);
  
  const [auditReport, setAuditReport] = useState(null);
  const [availableReports, setAvailableReports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const bucket = "clients";

  async function downloadJsonFresh(path) {
    try {
      const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
      if (signErr) throw signErr;

      const res = await fetch(signed.signedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { json: await res.json(), err: null };

    } catch (e) {
        const { data: pub } = supabase.storage.from(bucket).getPublicUrl(path);
        if (pub?.publicUrl) {
            try {
                const res = await fetch(`${pub.publicUrl}?t=${Date.now()}`);
                if (!res.ok) throw new Error("Public fetch failed");
                return { json: await res.json(), err: null };
            } catch(e2) { return { json: null, err: e2.message }; }
        }
        return { json: null, err: e.message };
    }
  }

  useEffect(() => {
    let alive = true;
    if (!clientId) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError(null);

      const base = `${clientId}`;

      // 1. Fetch the list of historical snapshots
      const { data: files } = await supabase.storage.from(bucket).list(clientId);
      const summaries = files
        ?.filter(f => f.name.includes('_summary_report.json'))
        .map(f => f.name)
        .sort().reverse() || []; 
      
      if (alive) setAvailableReports(summaries);

      // 2. Determine which file to fetch
      const targetAuditFile = selectedFile || "client_audit_report.json";

      const [
        { json: activeReport }, 
        { json: reportA },      
        { json: reportB },      
        { json: threadJson },
        { json: parsedJson },
        { json: rawAnalysis }
      ] = await Promise.all([
        downloadJsonFresh(`${base}/${targetAuditFile}`),
        downloadJsonFresh(`${base}/raw_credit_report.json`),
        downloadJsonFresh(`${base}/SmartCreditRaw.json`),
        downloadJsonFresh(`${base}/thread.json`),
        downloadJsonFresh(`${base}/credit_analysis.parsed.json`),
        downloadJsonFresh(`${base}/credit_analysis.json`),
      ]);

      if (!alive) return;

      setThread(threadJson || null);
      setAnalysisParsed(parsedJson || null);
      setAnalysisRaw(rawAnalysis || null);

      // A handful of client_audit_report.json files in Storage were written
      // by an old, since-removed lighter parser (analyzeRawReport() in
      // creditAnalysis.js) that never built a `personal` block, never
      // flattened `inquiries`, and dropped account_num/date/balance off
      // negatives — the "Detected Names: None / 0 inquiries / blank Acct#
      // & Balance" bug. Every current writer of this file (ClientHeader.jsx
      // "Update Report", ParseRreportModal.jsx, RawReportDebugger.jsx) uses
      // the real parser (runAuditEngine), but a client whose file was
      // written before that got fixed is stuck showing the old, incomplete
      // blob forever — this branch just trusted whatever was already there,
      // with no shape check, so nothing ever re-derived it.
      // `personal` is the cleanest fingerprint: the old parser's output
      // never had that key at all, only the real one does.
      const isCompleteAuditShape = (report) =>
        !!report && typeof report.personal === "object" && report.personal !== null;

      let calculatedAudit = null;
      let needsResave = false;

      if (activeReport && isCompleteAuditShape(activeReport)) {
        calculatedAudit = activeReport;
      } else if (reportA || reportB) {
        try {
          const validReport = reportA || reportB;
          calculatedAudit = runAuditEngine(validReport);
          // If there WAS an activeReport, it existed but failed the shape
          // check above — re-save the corrected version so this recovery
          // only has to happen once per client instead of on every load.
          if (activeReport && calculatedAudit) needsResave = true;
        } catch (err) {
          console.error("❌ Error running audit engine:", err);
        }
      } else if (activeReport) {
        // No raw report to re-derive from — better to show the old,
        // incomplete data than nothing at all.
        console.warn(`⚠️ client_audit_report.json for ${clientId} is in the old incomplete shape, and no raw report exists to rebuild it from.`);
        calculatedAudit = activeReport;
      } else {
        console.warn(`⚠️ No credit report found for ${clientId}.`);
      }

      if (needsResave && calculatedAudit && !selectedFile) {
        supabase.storage
          .from(bucket)
          .upload(`${base}/client_audit_report.json`, JSON.stringify(calculatedAudit), { upsert: true, contentType: "application/json" })
          .then(({ error: resaveErr }) => {
            if (resaveErr) console.warn("Could not resave corrected client_audit_report.json:", resaveErr.message);
          });
      }

      // 👇 THE FIX: Forcefully sanitize data to arrays before doing anything else 👇
      if (calculatedAudit) {
          calculatedAudit.inquiries = Array.isArray(calculatedAudit.inquiries) ? calculatedAudit.inquiries : [];
          calculatedAudit.accounts = Array.isArray(calculatedAudit.accounts) ? calculatedAudit.accounts : [];
          calculatedAudit.negatives = Array.isArray(calculatedAudit.negatives) ? calculatedAudit.negatives : [];
          
          setAuditReport(calculatedAudit);
      }

      if (!threadJson && calculatedAudit) {
          const polyThread = { accounts: [], experian: [], transunion: [], equifax: [] };

          polyThread.accounts = calculatedAudit.accounts.map(acc => ({
              creditor: acc.name, type: acc.type, dateOpened: acc.opened, openClosed: acc.status 
          }));

          // Because we sanitized inquiries above, this .forEach is now 100% safe!
          calculatedAudit.inquiries.forEach(inq => {
              const item = { date: inq.date, creditor: inq.creditor };
              if (inq.bureau === 'EX') polyThread.experian.push(item);
              if (inq.bureau === 'TU') polyThread.transunion.push(item);
              if (inq.bureau === 'EQ') polyThread.equifax.push(item);
          });
          setThread(polyThread);
      }

      setLoading(false);
    })();

    return () => { alive = false; };
  }, [clientId, refreshKey, selectedFile]); 

  const normalized = useMemo(() => {
    return { thread, analysisParsed, analysisRaw, auditReport };
  }, [thread, analysisParsed, analysisRaw, auditReport]);

  return { loading, error, normalized, auditReport, availableReports };
}