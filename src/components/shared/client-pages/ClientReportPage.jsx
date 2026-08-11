import React, { useMemo, useRef, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import { parseSmartCredit } from "../../../utils/parseSmartCredit";
import { Form, Spinner, Alert, Button, InputGroup, Card } from "react-bootstrap";

import CreditAuditLayout from "./CreditAuditLayout";
import PdfPreviewModal from "../ui/PdfPreviewModal";
import { delay, waitForImages, pagesToImages, imagesToPdf } from "../../../utils/pdfExport";
import { paginateFromPrintRoot, destroyPaginatedPortal } from "../../../utils/paginateDom";
import { useToast } from "../ui/ToastNotifier";

// --- HELPER: UNIVERSAL SCORE EXTRACTOR (STRICTLY NUMBERS) ---
const extractScoresSafely = (rawData, cleanData) => {
  let scores = { exp: 0, tu: 0, eq: 0 };

  const potentialScoreSources = [
    cleanData?.scores,
    cleanData?.summary?.scores,
    cleanData?.summary?.credit_scores,
    rawData?.pdfData?.scores,
    rawData?.scores
  ];

  // Helper to ensure we ALWAYS return a primitive number, never an object!
  const getNum = (val) => {
    if (!val) return 0;
    if (typeof val === 'object') return Number(val.score || val.riskScore || 0);
    return Number(val) || 0;
  };

  for (const src of potentialScoreSources) {
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      if (src.EX !== undefined || src.exp !== undefined || src.Experian !== undefined || src.experian !== undefined) {
          scores.exp = getNum(src.EX || src.exp || src.Experian || src.experian);
      }
      if (src.TU !== undefined || src.tu !== undefined || src.TransUnion !== undefined || src.transunion !== undefined || src.TUC !== undefined) {
          scores.tu = getNum(src.TU || src.tu || src.TransUnion || src.transunion || src.TUC);
      }
      if (src.EQ !== undefined || src.eq !== undefined || src.Equifax !== undefined || src.equifax !== undefined || src.EQF !== undefined) {
          scores.eq = getNum(src.EQ || src.eq || src.Equifax || src.equifax || src.EQF);
      }
      if (scores.exp > 0 || scores.tu > 0 || scores.eq > 0) return scores;
    }
  }

  try {
    const components = rawData?.BundleComponents?.BundleComponent || rawData?.report?.BundleComponents?.BundleComponent || [];
    components.forEach(c => {
      if (c.CreditScoreType?.riskScore) {
        const bureau = String(c.CreditScoreType?.Source?.SourceType?.abbreviation || "").toLowerCase();
        const score = Number(c.CreditScoreType.riskScore);
        if (bureau.includes("exp")) scores.exp = score;
        else if (bureau.includes("tuc") || bureau.includes("trn") || bureau.includes("tu")) scores.tu = score;
        else if (bureau.includes("equ") || bureau.includes("eq")) scores.eq = score;
      }
    });
    if (scores.exp > 0 || scores.tu > 0 || scores.eq > 0) return scores;
  } catch (e) { }

  return scores;
};

export default function ClientReportPage(props) {
  const { addToast } = useToast();
  const { clientId: idFromRoute } = useParams();
  const clientId = props.clientId ?? idFromRoute;
  const companyId = props.companyId; // Ensure companyId is pulled from props

  const [companyProfile, setCompanyProfile] = useState(null);
  
  // ─── TOOL STATES ───
  const [step, setStep] = useState("init"); // "init" | "connecting" | "analyzing" | "results"
  const [rawJson, setRawJson] = useState(null);
  const [error, setError] = useState(null);

  // ─── FORM STATES ───
  const [provider, setProvider] = useState("SmartCredit");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityWord, setSecurityWord] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fetchingReport, setFetchingReport] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // ─── PDF STATES ───
  const [openPreview, setOpenPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewPages, setPreviewPages] = useState([]);
  const [cachedPdfImages, setCachedPdfImages] = useState(null);

  const stageRef = useRef(null);
  const [renderForStage, setRenderForStage] = useState(false);

  // ─── FETCH WHITELABEL DATA ───
  useEffect(() => {
    if (!companyId) return;

    const fetchCompanyProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('company_name, contact_email, phone, website, logo_url') 
          .eq('id', companyId)
          .single();

        if (error) throw error;
        if (data) setCompanyProfile(data);
      } catch (err) {
        console.error("Failed to fetch company whitelabel settings:", err);
      }
    };

    fetchCompanyProfile();
  }, [companyId]);

  // ─── 1. FETCH REPORT OR ASK FOR LOGINS ───
  useEffect(() => {
    if (!clientId) {
      // Opened as a standalone Quick Tool without a client ID
      setStep("connecting");
      return;
    }

    const fetchReportData = async () => {
      setStep("init");
      setError(null);
      try {
        const { data: files, error: listError } = await supabase
          .storage
          .from("clients")
          .list(clientId, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } });

        if (listError) throw listError;

        const jsonFile = files.find(f => f.name === 'raw_credit_report.json');

        if (!jsonFile) {
          setStep("connecting");
          return;
        }

        const { data: fileBlob, error: dlErr } = await supabase
          .storage
          .from("clients")
          .download(`${clientId}/${jsonFile.name}`);

        if (dlErr) throw dlErr;

        const text = await fileBlob.text();
        setRawJson(JSON.parse(text));
        setStep("results");
      } catch (err) {
        console.error("Data Fetch Error:", err);
        setError(err.message);
        setStep("connecting");
      }
    };

    fetchReportData();
  }, [clientId]);

  useEffect(() => {
    setCachedPdfImages(null);
    setPreviewPages([]);
  }, [rawJson]);

  // ─── 2. SCRAPE NEW CREDENTIALS ───
  const submitCredentials = async (e) => {
    e.preventDefault();
    setFetchingReport(true);
    setStep("analyzing");
    setError(null);
    setRetryCount(0);

    try {
      let rawReportData = null;
      let success = false;
      let attempts = 0;
      const maxRetries = 3;

      while (attempts < maxRetries && !success) {
        try {
          if (provider === "SmartCredit") {
            const analysisRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/credit_analysis`, {
              method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
              body: JSON.stringify({ email: username, password, months: 24 }),
            });
            const anJson = await analysisRes.json();
            if (!analysisRes.ok) throw new Error(anJson.error || "SmartCredit Analysis failed.");

            rawReportData = anJson;
          } else if (provider === "IdentityIQ") {
            const res = await fetch("https://backend-4uir.onrender.com/loginidiq", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: username, password, pin: securityWord, ssn: "" }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(json.error || `${provider} connection failed.`);

            rawReportData = json.report;
          } else {
            throw new Error(`${provider} integration is coming soon!`);
          }

          if (!rawReportData) throw new Error("Missing report data.");
          success = true;

        } catch (err) {
          attempts++;
          setRetryCount(attempts);
          if (attempts >= maxRetries || err.message.includes("coming soon")) {
            throw new Error(err.message.includes("coming soon") ? err.message : "Connection timed out. Please verify your credentials.");
          }
          await new Promise(res => setTimeout(res, 5000));
        }
      }

      setRawJson(rawReportData);

      // Optional: Save to bucket if we are actively inside a client profile
      if (clientId) {
        await supabase.storage.from("clients").upload(
          `${clientId}/raw_credit_report.json`,
          new Blob([JSON.stringify(rawReportData, null, 2)], { type: "application/json" }),
          { upsert: true }
        );
      } 
      // 👇 NEW: SAVE TO HISTORY IF STANDALONE TOOL 👇
      else if (companyId) {
          const timestamp = new Date().getTime();
          
          const root = Array.isArray(rawReportData) ? rawReportData[0] : rawReportData;
          let payload = root;
          if (root?.data && typeof root.data === 'object') payload = root.data;
          else if (root?.pdfData && typeof root.pdfData === 'object') payload = root.pdfData;
          else if (root?.report && typeof root.report === 'object') payload = root.report;
          
          const isRaw = payload?.BundleComponents || payload?.report?.BundleComponents;
          const p = isRaw ? parseSmartCredit(payload) : payload;

          const clientNameRaw = p.client?.full_name || p.personal?.names?.[0] || p.personal_info?.name || "Unknown";
          const safeName = clientNameRaw.replace(/[^a-zA-Z0-9]/g, "_");
          const storagePath = `quick_reports/${companyId}/${timestamp}_${safeName}_analysis.json`;

          // 1. Upload to bucket
          await supabase.storage.from("clients").upload(
              storagePath,
              new Blob([JSON.stringify(rawReportData, null, 2)], { type: "application/json" })
          );

          // 2. Log to history table
          await supabase.from("company_quick_reports").insert([{
              company_id: companyId,
              client_name: clientNameRaw,
              report_type: "CREDIT_ANALYSIS",
              scores: extractScoresSafely(rawReportData, p),
              storage_path: storagePath
          }]);
      }
      // 👆 END NEW BLOCK 👆

      setStep("results");
      if (props.onCheckCompleted) props.onCheckCompleted();

    } catch (err) {
      console.error("Import Error:", err);
      setError(err.message || "Failed to pull credit report. Check your credentials.");
      setStep("connecting");
    } finally {
      setFetchingReport(false);
    }
  };

  // ─── 3. MAP DATA TO LAYOUT PROPS (WITH DEEP UNWRAP & STRICT FICO MATH) ───
  const layoutProps = useMemo(() => {
    if (!rawJson) return null;

    try {
      // 1. DEEP UNWRAP
      const root = Array.isArray(rawJson) ? rawJson[0] : rawJson;
      let payload = root;
      if (root?.data && typeof root.data === 'object') payload = root.data;
      else if (root?.pdfData && typeof root.pdfData === 'object') payload = root.pdfData;
      else if (root?.report && typeof root.report === 'object') payload = root.report;

      // 2. CHECK IF RAW
      const isRaw = payload?.BundleComponents || payload?.report?.BundleComponents;
      
      let p;
      if (isRaw) {
        p = parseSmartCredit(payload);
      } else {
        p = payload;
      }

      // --- ROBUST GETTERS TO PREVENT ZEROING OUT ---
      const getStat = (bureauKeys, statKey, altKey) => {
        if (p.bureau_stats) {
          for (const bk of bureauKeys) {
            if (p.bureau_stats[bk] && p.bureau_stats[bk][statKey] !== undefined) {
              return Number(p.bureau_stats[bk][statKey]);
            }
          }
        }
        if (p.bureau_summary) {
          for (const bk of bureauKeys) {
            if (p.bureau_summary[bk]) {
              if (p.bureau_summary[bk][statKey] !== undefined) return Number(p.bureau_summary[bk][statKey]);
              if (altKey && p.bureau_summary[bk][altKey] !== undefined) return Number(p.bureau_summary[bk][altKey]);
            }
          }
        }
        return 0;
      };

      const clientName = props.clientName ||
        p.client?.full_name ||
        p.personal?.names?.[0] ||
        p.personal_info?.name ||
        p.client_name ||
        "Client Name";

      const clientAddress = p.client?.address || p.personal_info?.[0]?.value || p.personal?.address || "";
      let clientSsnLast4 = p.client?.ssn_last4 || p.personal?.ssn || "";
      if (clientSsnLast4 && !clientSsnLast4.includes('•')) clientSsnLast4 = `•••• ${clientSsnLast4.slice(-4)}`;

      const BUREAU_MAP = { EX: "Experian", TU: "TransUnion", EQ: "Equifax", Experian: "Experian", TransUnion: "TransUnion", Equifax: "Equifax" };
      const parseBureaus = (item) => {
        let arr = [];
        if (Array.isArray(item.bureaus) && item.bureaus.length > 0) arr = item.bureaus;
        else if (typeof item.bureau === 'string') arr = item.bureau.split(',').map(s => s.trim());
        else if (item.bureau) arr = [item.bureau];
        return arr.map(b => BUREAU_MAP[b] || b);
      };

      const safeScores = extractScoresSafely(rawJson, p);
      const exp = safeScores.exp || 0;
      const tu = safeScores.tu || 0;
      const eq = safeScores.eq || 0;
      const validScores = [exp, tu, eq].filter(x => x > 0);
      const avg = validScores.length ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length) : 0;

      const derogCounts = {
        delinquent: { Experian: 0, TransUnion: 0, Equifax: 0 },
        derogatory: {
          Experian: getStat(['EX', 'Experian'], "negative_count", "derogatory"),
          TransUnion: getStat(['TU', 'TransUnion'], "negative_count", "derogatory"),
          Equifax: getStat(['EQ', 'Equifax'], "negative_count", "derogatory")
        },
        collection: { 
          Experian: getStat(['EX', 'Experian'], "collections"), 
          TransUnion: getStat(['TU', 'TransUnion'], "collections"), 
          Equifax: getStat(['EQ', 'Equifax'], "collections") 
        },
        publicRecords: { 
          Experian: getStat(['EX', 'Experian'], "public_record_count", "public_records"), 
          TransUnion: getStat(['TU', 'TransUnion'], "public_record_count", "public_records"), 
          Equifax: getStat(['EQ', 'Equifax'], "public_record_count", "public_records") 
        },
        inquiries2yr: {
          Experian: getStat(['EX', 'Experian'], "inquiry_count", "inquiries_2y"),
          TransUnion: getStat(['TU', 'TransUnion'], "inquiry_count", "inquiries_2y"),
          Equifax: getStat(['EQ', 'Equifax'], "inquiry_count", "inquiries_2y")
        }
      };

      (p.negatives || []).forEach(neg => {
        const fullBureaus = parseBureaus(neg);
        fullBureaus.forEach(b => {
          if (neg.category === 'LATE_PAYMENT') derogCounts.delinquent[b] = (derogCounts.delinquent[b] || 0) + 1;
          if (neg.category === 'COLLECTION') derogCounts.collection[b] = (derogCounts.collection[b] || 0) + 1;
        });
      });

      (p.public_records || []).forEach(pr => {
        const fullBureaus = parseBureaus(pr);
        fullBureaus.forEach(b => {
          if (derogCounts.publicRecords[b] !== undefined) derogCounts.publicRecords[b] += 1;
        });
      });

      let safeInquiries = [];
      if (Array.isArray(p.inquiries)) {
        safeInquiries = p.inquiries;
      } else if (p.inquiries && typeof p.inquiries === 'object') {
        safeInquiries = [...(p.inquiries.EX || []), ...(p.inquiries.TU || []), ...(p.inquiries.EQ || [])];
      }

      // 👇 UTILIZATION MATH OVERRIDE 👇
      const allAccounts = Array.isArray(p.accounts) ? p.accounts : [];
      const openRevolvers = allAccounts.filter(a => {
        const isRev = a.is_revolving === true || String(a.type || "").toUpperCase() === "REVOLVING" || String(a.industry || "").toUpperCase().includes("REVOLVING");
        const isOpen = String(a.account_status || a.status || a.openClosed || "").toUpperCase() === "OPEN";
        return isRev && isOpen;
      });

      let trueLimit = openRevolvers.reduce((sum, a) => sum + (Number(a.limit || a.creditLimit) || 0), 0);
      let trueDebt = openRevolvers.reduce((sum, a) => sum + (Number(a.balance || a.currentBalance) || 0), 0);

      if (trueLimit === 0 && p.util) {
        trueLimit = Number(p.util.total_limit) || 0;
        trueDebt = Number(p.util.current_balance) || 0;
      }

      const trueAvailable = Math.max(0, trueLimit - trueDebt);
      const trueUtilPct = trueLimit > 0 ? Math.round((trueDebt / trueLimit) * 100) : 0;

      const getAccounts = (bk) => {
        if (p.bureau_stats?.[bk]?.account_count !== undefined) return Number(p.bureau_stats[bk].account_count);
        if (p.bureau_summary?.[bk]) return Number(p.bureau_summary[bk].open || 0) + Number(p.bureau_summary[bk].closed || 0);
        return 0;
      };

      return {
        title: "Credit Analysis Prepared for",
        clientName: clientName,
        clientAddress: clientAddress,
        clientSsnLast4: clientSsnLast4,
        createdDate: p.report_date ? new Date(p.report_date).toLocaleDateString("en-US") : new Date().toLocaleDateString("en-US"),
        scores: { exp, tu, eq, avg },

        // 👇 INJECT WHITELABEL PROPS HERE 👇
        companyName: companyProfile?.company_name || "Hidden Partner Cloud",
        companyEmail: companyProfile?.contact_email || "info@hiddenpartnercloud.com",
        companyPhone: companyProfile?.phone || "(919) 300-5202",
        companyWebsite: companyProfile?.website || "hiddenpartnercloud.com",
        companyLogo: companyProfile?.logo_url || "https://storage.googleapis.com/msgsndr/rqr5oOzXxiHjh8wSS7T2/media/1923f793-9139-4710-acdf-be54468f86ab.png",

        bureauSummaries: [
          { bureau: "Experian", accounts: getAccounts('EX'), positive: getStat(['EX', 'Experian'], "positive_count", "positive"), negative: getStat(['EX', 'Experian'], "negative_count", "derogatory"), inquiries: getStat(['EX', 'Experian'], "inquiry_count", "inquiries_2y"), collections: derogCounts.collection.Experian, publicRecords: getStat(['EX', 'Experian'], "public_record_count", "public_records") },
          { bureau: "TransUnion", accounts: getAccounts('TU'), positive: getStat(['TU', 'TransUnion'], "positive_count", "positive"), negative: getStat(['TU', 'TransUnion'], "negative_count", "derogatory"), inquiries: getStat(['TU', 'TransUnion'], "inquiry_count", "inquiries_2y"), collections: derogCounts.collection.TransUnion, publicRecords: getStat(['TU', 'TransUnion'], "public_record_count", "public_records") },
          { bureau: "Equifax", accounts: getAccounts('EQ'), positive: getStat(['EQ', 'Equifax'], "positive_count", "positive"), negative: getStat(['EQ', 'Equifax'], "negative_count", "derogatory"), inquiries: getStat(['EQ', 'Equifax'], "inquiry_count", "inquiries_2y"), collections: derogCounts.collection.Equifax, publicRecords: getStat(['EQ', 'Equifax'], "public_record_count", "public_records") }
        ],

        utilization: {
          percent: `${trueUtilPct}%`,
          available: `$${trueAvailable.toLocaleString()}`,
          balance: `$${trueDebt.toLocaleString()}`,
        },

        utilization_breakdown: openRevolvers
          .map(a => ({
            name: a.name || a.account_name || a.creditor,
            account_num: a.account_num || a.account_number || a.accountNumberLast4,
            bureau: a.bureau || (a.reported_to || []).join(", "),
            bureaus: a.bureaus || a.reported_to || [],
            balance: a.balance || a.currentBalance || 0,
            limit: a.limit || a.creditLimit || 0,
            available: Math.max(0, (a.limit || a.creditLimit || 0) - (a.balance || a.currentBalance || 0)),
            utilization_pct: (a.limit || a.creditLimit) > 0 ? Math.round(((a.balance || a.currentBalance) / (a.limit || a.creditLimit)) * 100) : 0,
            utilization_status: a.utilization_status || "Unknown",
            is_negative: a.is_negative || false,
            account_status: a.account_status || a.status || a.openClosed || "Open",
          }))
          .sort((a, b) => (b.utilization_pct || 0) - (a.utilization_pct || 0)),

        derogatorySummary: {
          counts: derogCounts,
          items: (p.negatives || []).map(n => ({
            accountName: n.name || n.accountName || n.creditor || "Unknown",
            bureaus: parseBureaus(n),
            issue: n.reason || n.category || n.issue || "Derogatory"
          }))
        },

        publicRecords: (p.public_records || []).map(pr => ({
          accountName: pr.type || pr.accountName || "Record",
          bureau: parseBureaus(pr).join(", "),
          bureaus: parseBureaus(pr),
          issue: `${pr.type || 'Record'} (${pr.status || 'Filed'})` || pr.issue
        })),

        inquiries: safeInquiries.map(iq => ({
          name: iq.creditor || iq.name || "Unknown",
          date: iq.date || iq.inquiryDate || "Unknown",
          bureau: parseBureaus(iq).join(", "),
          label: "Inquiry"
        })),

        expertise: "While we cannot promise to remove all of the negative items...",
        planOfAction: "The law gives you the right to dispute any item...",
        education: "We will be drafting many letters on your behalf...",
        nextSteps: ["Upload Photo ID...", "Keep utilization under 9–11%...", "Avoid new applications..."],
        speedUp: ["Stop applying for credit...", "Do not close any accounts...", "Pay your credit cards down..."],
        expectations: ["It takes 30 to 45 days...", "You'll receive real-time updates..."],
        closingIntro: "Just reach out to us...",
        closingNotes: ["We appreciate that you choose us..."],
      };

    } catch (err) {
      console.error("🚨 CRITICAL ERROR DURING DATA MAPPING:", err);
      return null;
    }
  }, [rawJson, props.clientName, companyProfile]);


  // ─── 4. PDF RENDER LOGIC ───
  async function makePaginatedPages() {
    setRenderForStage(true);
    await delay(100);
    await waitForImages(stageRef.current);

    const printRoot = stageRef.current?.querySelector(".print-root");
    if (!printRoot) throw new Error("No .print-root found");

    const { portalEl, pages } = paginateFromPrintRoot(printRoot);
    return { portalEl, pages };
  }

  async function handleOpenPreview() {
    if (!layoutProps) return;
    setBusy(true);
    let portalEl;
    try {
      const built = await makePaginatedPages();
      portalEl = built.portalEl;

      built.pages.forEach(pageEl => {
        pageEl.style.backgroundColor = "#0B1121";
        pageEl.style.color = "#f8fafc";
        pageEl.style.padding = "20px 40px";
        pageEl.style.boxSizing = "border-box";
      });

      const images = await pagesToImages(built.pages, { scale: 2, backgroundColor: "#0B1121" });

      setCachedPdfImages(images);
      setPreviewPages(images.map((i) => i.url));
      setOpenPreview(true);
    } catch (e) {
      addToast({ title: "Preview Failed", message: "Failed to render preview. See console for details.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      console.error(e);
    } finally {
      if (portalEl) destroyPaginatedPortal(portalEl);
      setRenderForStage(false);
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!layoutProps) return;
    setBusy(true);
    let portalEl;
    try {
      let finalImages = cachedPdfImages;

      if (!finalImages) {
        const built = await makePaginatedPages();
        portalEl = built.portalEl;

        built.pages.forEach(pageEl => {
          pageEl.style.backgroundColor = "#0B1121";
          pageEl.style.color = "#f8fafc";
          pageEl.style.padding = "20px 40px";
          pageEl.style.boxSizing = "border-box";
        });

        finalImages = await pagesToImages(built.pages, { scale: 2, backgroundColor: "#0B1121" });
        setCachedPdfImages(finalImages);
      }

      const pdf = imagesToPdf(finalImages, {
        marginMm: 0, orientation: "p", format: "a4", imageType: "JPEG", imageQuality: 1.0,
        docProps: { title: `Credit Analysis - ${layoutProps?.clientName || "Client"}` },
      });

      const safeName = (layoutProps?.clientName || "Client").replace(/[\\/:*?"<>|]/g, "_");
      pdf.save(`Credit_Analysis_${safeName}.pdf`);
      setOpenPreview(false);
    } catch (e) {
      addToast({ title: "PDF Generation Failed", message: "Error generating PDF. See console for details.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      console.error(e);
    } finally {
      if (portalEl) destroyPaginatedPortal(portalEl);
      setRenderForStage(false);
      setBusy(false);
    }
  }

  // ─── 5. RENDER UI ───
  return (
    <div style={{ gap: 12 }}>

      {/* ERROR DISPLAY */}
      {error && step !== "connecting" && (
        <Alert variant="danger" className="mx-3 mt-3 fw-bold small"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error}</Alert>
      )}

      {/* STEP: INIT / LOADING */}
      {step === "init" && (
        <div className="p-5 text-center d-flex flex-column align-items-center">
          <Spinner animation="border" style={{ color: '#38bdf8' }} className="mb-3" />
          <h5 className="fw-bold text-white">Loading Client File...</h5>
          <small className="text-muted">Fetching secure data from storage.</small>
        </div>
      )}

      {/* STEP: CONNECTING (LOGIN FORM) */}
      {step === "connecting" && (
        <Card className="border-0 shadow-lg mx-auto" style={{ maxWidth: '450px', backgroundColor: '#1e293b' }}>
          <div className="text-center py-3 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            <i className="bi bi-file-earmark-bar-graph-fill fs-3 d-block mb-2" style={{ color: '#38bdf8' }}></i>
            <h5 className="fw-bold text-white mb-0">Generate Credit Analysis</h5>
          </div>
          <Card.Body className="p-4">
            <Alert className="small fw-bold text-center mb-4" style={{ backgroundColor: "rgba(56, 189, 248, 0.1)", border: "1px solid rgba(56, 189, 248, 0.3)", color: "#38bdf8" }}>
              Enter credentials to pull a fresh analysis report.
            </Alert>

            <Form onSubmit={submitCredentials}>
              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Monitoring Provider</Form.Label>
                <Form.Select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={fetchingReport} style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }}>
                  <option value="SmartCredit">SmartCredit</option>
                  <option value="IdentityIQ">IdentityIQ</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Username / Email</Form.Label>
                <Form.Control type="text" required value={username} onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))} disabled={fetchingReport} style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} />
              </Form.Group>

              <Form.Group className="mb-4">
                <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Password</Form.Label>
                <InputGroup>
                  <Form.Control
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\s+/g, ""))}
                    disabled={fetchingReport}
                    placeholder="••••••••"
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155', borderRight: 'none' }}
                  />
                  <Button
                    variant="outline-secondary"
                    className="bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex="-1"
                    type="button"
                    style={{ backgroundColor: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderLeft: 'none' }}
                  >
                    <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                  </Button>
                </InputGroup>
              </Form.Group>

              {provider !== "SmartCredit" && (
                <Form.Group className="mb-4">
                  <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>PIN / Secret Word</Form.Label>
                  <Form.Control type="text" value={securityWord} onChange={(e) => setSecurityWord(e.target.value)} disabled={fetchingReport} placeholder="If required" style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} />
                </Form.Group>
              )}

              <Button type="submit" size="lg" className="w-100 fw-bold border-0 shadow-sm text-dark" disabled={fetchingReport || !username || !password} style={{ background: 'linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)' }}>
                {fetchingReport ? (
                  <><Spinner size="sm" className="me-2" /> {retryCount > 0 ? `Retrying (${retryCount}/3)...` : "Importing File..."}</>
                ) : "Generate Analysis"}
              </Button>
            </Form>
          </Card.Body>
        </Card>
      )}

      {/* STEP: ANALYZING SPINNER */}
      {step === "analyzing" && (
        <div className="text-center py-5 d-flex flex-column align-items-center justify-content-center">
          <Spinner animation="border" style={{ width: '3rem', height: '3rem', color: '#38bdf8' }} />
          <h5 className="mt-4 fw-bold text-white">Compiling Analysis...</h5>
          <p className="small mb-0" style={{ color: '#94a3b8' }}>Mapping data to PDF architecture.</p>
        </div>
      )}

      {/* STEP: RESULTS / RENDERED LAYOUT */}
      {step === "results" && layoutProps && (
        <div className="animate-fade-in pb-3">
          {/* Controls */}
          <div className="d-flex justify-content-center gap-3 mb-3 pt-3">
            {clientId && (
              <button onClick={() => { setStep("connecting"); setRawJson(null); }} className="btn btn-outline-secondary fw-bold" style={{ color: '#94a3b8', borderColor: '#334155' }}>
                <i className="bi bi-arrow-clockwise me-2"></i> Re-Pull
              </button>
            )}
            <button onClick={handleOpenPreview} disabled={busy} className="btn btn-info fw-bold text-dark shadow-sm">
              {busy ? <Spinner size="sm" /> : <><i className="bi bi-search me-2"></i> Preview</>}
            </button>
            <button onClick={handleDownload} disabled={busy} className="btn fw-bold shadow-sm text-dark" style={{ backgroundColor: '#38bdf8' }}>
              {busy ? <Spinner size="sm" /> : <><i className="bi bi-download me-2"></i> Download PDF</>}
            </button>
          </div>

          <div style={{ border: "1px solid #1e293b", borderRadius: 8, background: "#0B1121", overflow: "hidden", margin: '0 15px' }}>
            <CreditAuditLayout {...layoutProps} />
          </div>
        </div>
      )}

      {/* PDF PREVIEW MODAL */}
      <PdfPreviewModal
        open={openPreview}
        onClose={() => setOpenPreview(false)}
        onDownload={handleDownload}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 40, alignItems: "center", paddingBottom: 20 }}>
          {previewPages.length === 0 ? (
            <div style={{ color: "#e2e8f0" }}>Preparing preview…</div>
          ) : (
            previewPages.map((url, i) => (
              <div key={i} style={{ width: "100%", maxWidth: 550, textAlign: "center" }}>
                <div style={{ marginBottom: 10, fontSize: 12, fontWeight: "bold", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "1px" }}>
                  Page {i + 1} of {previewPages.length}
                </div>
                <img
                  src={url}
                  alt={`Page ${i + 1}`}
                  style={{ width: "100%", height: "auto", borderRadius: 4, boxShadow: "0 20px 40px rgba(0,0,0,0.6), 0 5px 15px rgba(0,0,0,0.4)" }}
                />
              </div>
            ))
          )}
        </div>
      </PdfPreviewModal>

      {/* HIDDEN RENDER STAGE FOR PDF */}
      <div
        ref={stageRef}
        style={{ position: "absolute", left: "-99999px", top: 0, width: "794px", background: "#0B1121" }}
        aria-hidden
      >
        {renderForStage && (
          <div className="print-root" style={{ width: 794, background: "#0B1121" }}>
            <CreditAuditLayout printMode {...layoutProps} />
          </div>
        )}
      </div>

    </div>
  );
}