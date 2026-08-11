import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { compareSnapshots } from '../utils/creditAnalysis'; 

export function useProgressReportData(clientId) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Data for Page 1 (Summary)
  const [data, setData] = useState(null);
  
  // Data for Page 2 (Raw Snapshots)
  const [startSnapshot, setStartSnapshot] = useState(null);
  const [currentSnapshot, setCurrentSnapshot] = useState(null);

  useEffect(() => {
    async function fetchData() {
      if (!clientId) return;
      
      try {
        setLoading(true);
        console.log(`🔍 Fetching report data for client: ${clientId}`);

        // --- 1. FETCH CLIENT PROFILE ---
        const { data: client, error: clientErr } = await supabase
          .from('clients')
          .select('full_name')
          .eq('id', clientId)
          .single();

        if (clientErr) throw clientErr;

        // --- 2. LIST FILES IN BUCKET ---
        const BUCKET = 'clients';
        const { data: files, error: filesErr } = await supabase.storage.from(BUCKET).list(clientId);
        
        if (filesErr) throw filesErr;

        // Filter for summary reports and sort chronologically (oldest to newest)
        const reportFiles = (files || [])
          .filter(f => f.name.includes('_summary_report.json'))
          .sort((a, b) => a.name.localeCompare(b.name)); 

        // 🚨 Require at least 2 files to compare progress
        if (reportFiles.length < 2) {
          console.warn("⚠️ Not enough summary reports to compare. Need at least 2.");
          setData(null);
          setLoading(false);
          return;
        }

        // --- 3. DOWNLOAD PREVIOUS & CURRENT FILES ---
        const downloadJson = async (filename) => {
          // We use createSignedUrl to safely bypass browser caching while respecting Supabase security rules!
          const { data: signedData, error: signErr } = await supabase.storage
             .from(BUCKET)
             .createSignedUrl(`${clientId}/${filename}`, 60); // Valid for 60 seconds
             
          if (signErr) throw signErr;

          // Fetch the file directly and force the browser to ignore its cache
          const res = await fetch(signedData.signedUrl, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Failed to fetch ${filename}`);
          
          return await res.json();
        };

        // 👇 Always grab the TWO MOST RECENT files! 👇
        const previousFile = reportFiles[reportFiles.length - 2].name;
        const currentFile = reportFiles[reportFiles.length - 1].name;

        console.log(`📊 Comparing ${previousFile} vs ${currentFile}`);

        const startJson = await downloadJson(previousFile);
        const currentJson = await downloadJson(currentFile);

        // --- 4. SET RAW SNAPSHOTS (Critical for Page 2) ---
        setStartSnapshot(startJson);
        setCurrentSnapshot(currentJson);

        // --- 5. RUN THE SHARED COMPARISON MATH ---
        const comparison = compareSnapshots(startJson, currentJson);

        // --- 6. HELPERS: SAFE SCORE & DATE EXTRACTION ---
        const getScoreValue = (bureauData) => {
            if (!bureauData) return 0;
            if (typeof bureauData === 'number') return bureauData;
            if (typeof bureauData === 'string') return parseInt(bureauData, 10) || 0;
            if (typeof bureauData === 'object') {
                return parseInt(bureauData.score || bureauData.riskScore || bureauData.Score, 10) || 0;
            }
            return 0;
        };

        // 🎯 Timezone-Proof Date Extractor (Pulls directly from the filename)
        const extractDateFromFilename = (filename) => {
            try {
                // Example filename: "2026-03-31_summary_report.json" -> "2026-03-31"
                const rawDate = filename.split('_')[0]; 
                const [year, month, day] = rawDate.split('-');
                
                // Manually format to MM/DD/YYYY so timezones don't accidentally shift it back a day!
                return `${parseInt(month, 10)}/${parseInt(day, 10)}/${year}`;
            } catch (e) {
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
                    date: extractDateFromFilename(previousFile), 
                    EX: getScoreValue(startJson.scores?.EX), 
                    TU: getScoreValue(startJson.scores?.TU), 
                    EQ: getScoreValue(startJson.scores?.EQ) 
                },
                { 
                    date: extractDateFromFilename(currentFile), 
                    EX: getScoreValue(currentJson.scores?.EX), 
                    TU: getScoreValue(currentJson.scores?.TU), 
                    EQ: getScoreValue(currentJson.scores?.EQ) 
                }
            ];
        }

        // --- 8. BUILD FINAL SUMMARY DATA (For Page 1) ---
        const processedData = {
            clientName: client?.full_name || 'Client',
            startDate: extractDateFromFilename(previousFile), 
            currentDate: extractDateFromFilename(currentFile), 
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
  }, [clientId]);

  return { data, startSnapshot, currentSnapshot, loading, error };
}