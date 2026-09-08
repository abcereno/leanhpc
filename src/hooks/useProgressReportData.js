import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { compareSnapshots } from '../utils/creditAnalysis';
import { normalizeScoreValue } from '../utils/normalizeCreditSnapshot';

// `baselineDate`/`currentDate` (optional, 'YYYY-MM-DD') let a caller pin the
// comparison to two specific snapshots instead of always earliest-vs-latest
// — see the date-range picker on ClientProgressPage.jsx. Omit either (or
// both) to keep the original auto behavior for that end.
export function useProgressReportData(clientId, { baselineDate, currentDate } = {}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Data for Page 1 (Summary)
  const [data, setData] = useState(null);

  // Data for Page 2 (Raw Snapshots)
  const [startSnapshot, setStartSnapshot] = useState(null);
  const [currentSnapshot, setCurrentSnapshot] = useState(null);

  // Every snapshot date available for this client (across dispute rounds,
  // when the email-keyed table has rows) — drives the date-range picker's
  // dropdown options on ClientProgressPage.jsx, independent of which two
  // are currently selected as baseline/current below.
  const [availableDates, setAvailableDates] = useState([]);

  useEffect(() => {
    async function fetchData() {
      if (!clientId) return;

      try {
        setLoading(true);

        // --- 1. FETCH CLIENT PROFILE ---
        const { data: client, error: clientErr } = await supabase
          .from('clients')
          .select('full_name, email')
          .eq('id', clientId)
          .single();

        if (clientErr) throw clientErr;

        const BUCKET = 'clients';

        // --- 2. RESOLVE THE FULL LIST OF AVAILABLE SNAPSHOTS ---
        // Prefer client_report_snapshots, queried by EMAIL across every
        // dispute round this client has ever had (see
        // sql/add_client_report_snapshots.sql and RoundSwitcher's own
        // .ilike("email", ...) pattern) — a new dispute round creates a
        // brand-new clients.id (utils/clientDuplicateRound.js), which
        // silently orphaned a client's prior-round snapshots from the old
        // per-clientId Storage listing below, because that round's report
        // files live under that round's OWN clientId folder, not this
        // one's.
        //
        // Falls back to the old per-clientId Storage listing when no rows
        // exist yet: migration not run, client email null/blank (legacy
        // clients — email isn't DB-unique or required pre-dispute-round,
        // see sql/add_dispute_round.sql), or snapshots written before this
        // table existed.
        let allSnapshots = []; // [{ reportDate: 'YYYY-MM-DD', storagePath }], ascending

        const email = client?.email ? String(client.email).trim().toLowerCase() : null;

        if (email) {
          const { data: snapshotRows, error: snapErr } = await supabase
            .from('client_report_snapshots')
            .select('report_date, storage_path')
            .ilike('email', email)
            .order('report_date', { ascending: true });

          if (snapErr) {
            console.warn("ℹ️ client_report_snapshots lookup failed (falling back to Storage listing):", snapErr.message);
          } else if (snapshotRows && snapshotRows.length >= 2) {
            allSnapshots = snapshotRows.map((r) => ({ reportDate: r.report_date, storagePath: r.storage_path }));
          }
        }

        if (allSnapshots.length === 0) {
          // --- 2b. FALLBACK: LIST FILES IN BUCKET FOR THIS CLIENT_ID ONLY ---
          const { data: files, error: filesErr } = await supabase.storage.from(BUCKET).list(clientId);

          if (filesErr) throw filesErr;

          // Filter for summary reports and sort chronologically (oldest to newest)
          const reportFiles = (files || [])
            .filter(f => f.name.includes('_summary_report.json'))
            .sort((a, b) => a.name.localeCompare(b.name));

          const dateFromFilename = (filename) => filename.split('_')[0];

          allSnapshots = reportFiles.map((f) => ({ reportDate: dateFromFilename(f.name), storagePath: `${clientId}/${f.name}` }));
        }

        setAvailableDates(allSnapshots.map((s) => s.reportDate));

        // 🚨 Require at least 2 snapshots to compare progress
        if (allSnapshots.length < 2) {
          console.warn("⚠️ Not enough summary reports to compare. Need at least 2.");
          setData(null);
          setLoading(false);
          return;
        }

        // --- 3. PICK BASELINE & CURRENT FROM THE LIST ---
        // Explicit baselineDate/currentDate (from the date-range picker)
        // win when they match a real snapshot; otherwise fall back to the
        // original default — earliest for baseline, latest for current —
        // so a Progress Report should always measure from where the
        // client truly started unless staff deliberately narrow it.
        const findByDate = (d) => (d ? allSnapshots.find((s) => s.reportDate === d) : null);
        const baselineFile = findByDate(baselineDate) || allSnapshots[0];
        const currentFile = findByDate(currentDate) || allSnapshots[allSnapshots.length - 1];

        // --- 3. DOWNLOAD BASELINE & CURRENT FILES ---
        const downloadJson = async (storagePath) => {
          // We use createSignedUrl to safely bypass browser caching while respecting Supabase security rules!
          // storagePath may belong to an earlier dispute round's own
          // clientId folder — that's expected and fine, Storage paths are
          // just strings, RLS is what actually gates access.
          const { data: signedData, error: signErr } = await supabase.storage
             .from(BUCKET)
             .createSignedUrl(storagePath, 60); // Valid for 60 seconds

          if (signErr) throw signErr;

          // Fetch the file directly and force the browser to ignore its cache
          const res = await fetch(signedData.signedUrl, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Failed to fetch ${storagePath}`);

          return await res.json();
        };

        const startJson = await downloadJson(baselineFile.storagePath);
        const currentJson = await downloadJson(currentFile.storagePath);

        // --- 4. SET RAW SNAPSHOTS (Critical for Page 2) ---
        setStartSnapshot(startJson);
        setCurrentSnapshot(currentJson);

        // --- 5. RUN THE SHARED COMPARISON MATH ---
        const comparison = compareSnapshots(startJson, currentJson);

        // Score value can be a plain number, a numeric string, or an object
        // like {score,riskScore,Score} depending on which parser wrote this
        // snapshot (see utils/normalizeCreditSnapshot.js) — shared with
        // compareSnapshots/detectProfileChanges instead of a local copy.
        const getScoreValue = normalizeScoreValue;

        // 🎯 Timezone-Proof Date Formatter (Pulls from the resolved report_date,
        // whether that came from client_report_snapshots.report_date or the
        // fallback filename's own YYYY-MM-DD prefix — both are the same
        // shape, see reportStorage.js#extractReportDate)
        const formatReportDate = (rawDate) => {
            try {
                const [year, month, day] = rawDate.split('-');

                // Manually format to MM/DD/YYYY so timezones don't accidentally shift it back a day!
                return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
            } catch {
                return "Unknown Date";
            }
        };

        // --- 7. FETCH HISTORY (For Page 1 Line Graph) ---
        let history = [];
        try {
            const { data: histData, error: histErr } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(`${clientId}/client_score_history.json`, 60);
                
            if (!histErr && histData) {
                const res = await fetch(histData.signedUrl, { cache: 'no-store' });
                if (res.ok) {
                    const rawHistory = await res.json();
                    history = rawHistory.map(h => ({
                        ...h,
                        date: h.date ? new Date(h.date).toLocaleDateString() : 'Unknown',
                        EX: getScoreValue(h.EX || h.scores?.EX),
                        TU: getScoreValue(h.TU || h.scores?.TU),
                        EQ: getScoreValue(h.EQ || h.scores?.EQ)
                    }));
                }
            }
        } catch (e) {
            console.log("ℹ️ No history file found, using Start/Current points.", e);
        }
        
        // Fallback if history couldn't be loaded or parsed
        if (history.length === 0) {
             history = [
                {
                    date: formatReportDate(baselineFile.reportDate),
                    EX: getScoreValue(startJson.scores?.EX),
                    TU: getScoreValue(startJson.scores?.TU),
                    EQ: getScoreValue(startJson.scores?.EQ)
                },
                {
                    date: formatReportDate(currentFile.reportDate),
                    EX: getScoreValue(currentJson.scores?.EX),
                    TU: getScoreValue(currentJson.scores?.TU),
                    EQ: getScoreValue(currentJson.scores?.EQ)
                }
            ];
        }

        // --- 8. BUILD FINAL SUMMARY DATA (For Page 1) ---
        const processedData = {
            clientName: client?.full_name || 'Client',
            startDate: formatReportDate(baselineFile.reportDate),
            currentDate: formatReportDate(currentFile.reportDate),
            scores: {
                start: { 
                    EX: getScoreValue(startJson.scores?.EX),
                    TU: getScoreValue(startJson.scores?.TU),
                    EQ: getScoreValue(startJson.scores?.EQ)
                },
                current: { 
                    EX: getScoreValue(currentJson.scores?.EX),
                    TU: getScoreValue(currentJson.scores?.TU),
                    EQ: getScoreValue(currentJson.scores?.EQ)
                },
                history: history
            },
            // Full item-level lists (not just counts) — ProgressReportDetails
            // (Page 2) used to call compareSnapshots() a second time itself
            // to get these same deleted/remaining/added arrays from the raw
            // snapshots. Computing it once here and handing the whole thing
            // down means both pages read from a single source of truth.
            comparisonDetails: comparison,
            results: {
                EX: { deleted: comparison.EX.deleted.length, remaining: comparison.EX.remaining.length, added: comparison.EX.added.length },
                TU: { deleted: comparison.TU.deleted.length, remaining: comparison.TU.remaining.length, added: comparison.TU.added.length },
                EQ: { deleted: comparison.EQ.deleted.length, remaining: comparison.EQ.remaining.length, added: comparison.EQ.added.length }
            }
        };

        setData(processedData);

      } catch (err) {
        console.error("❌ Hook Error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [clientId, baselineDate, currentDate]);

  return { data, startSnapshot, currentSnapshot, loading, error, availableDates };
}