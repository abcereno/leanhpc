import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, Button, Spinner, Row, Col, Alert, Form, Badge, Accordion, Tabs, Tab, Table, Modal } from "react-bootstrap";
import { calculateFundingEligibility } from "../../../utils/funderRules";
import { parseSmartCredit } from "../../../utils/parseSmartCredit";
import { supabase } from "../../../supabaseClient";

import FundingBlueprintReport from "../client-pages/FundingBlueprintReport"; 
import { delay, waitForImages, pagesToImages, imagesToPdf } from "../../../utils/pdfExport";
import { paginateFromPrintRoot, destroyPaginatedPortal } from "../../../utils/paginateDom";
import { useToast } from "./ToastNotifier";

// --- HELPER: UNIVERSAL SCORE EXTRACTOR ---
const extractScoresSafely = (rawData, cleanData) => {
  let scores = { exp: 0, tu: 0, eq: 0 };
  const getNum = (val) => {
    if (!val) return 0;
    if (typeof val === 'object') return Number(val.score || val.riskScore || 0);
    return Number(val) || 0;
  };
  const potentialScoreSources = [ cleanData?.scores, cleanData?.summary?.scores, cleanData?.summary?.credit_scores, rawData?.pdfData?.scores, rawData?.scores ];
  for (const src of potentialScoreSources) {
    if (src && typeof src === 'object' && !Array.isArray(src)) {
      if (src.EX !== undefined || src.exp !== undefined || src.Experian !== undefined || src.experian !== undefined) scores.exp = getNum(src.EX || src.exp || src.Experian || src.experian);
      if (src.TU !== undefined || src.tu !== undefined || src.TransUnion !== undefined || src.transunion !== undefined || src.TUC !== undefined) scores.tu = getNum(src.TU || src.tu || src.TransUnion || src.transunion || src.TUC);
      if (src.EQ !== undefined || src.eq !== undefined || src.Equifax !== undefined || src.equifax !== undefined || src.EQF !== undefined) scores.eq = getNum(src.EQ || src.eq || src.Equifax || src.equifax || src.EQF);
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

// --- HELPER: FICO STANDARD CREDIT AGE CALCULATION ---
const calculateAgeMetrics = (accounts) => {
    if (!accounts || !accounts.length) return null;
    const ageAccts = accounts.filter(a => !a.is_active_collection);
    if (!ageAccts.length) return { averageMonths: 0, oldestMonths: 0, rating: "Needs work", impact: "High", accounts: [] };
    const now = new Date();
    let totalMonths = 0; let oldestMonths = 0; const validAccts = [];
    ageAccts.forEach(a => {
        const dateStr = a.opened || a.dateOpened || a.openedDate;
        if (dateStr) {
            const opened = new Date(dateStr);
            if (!isNaN(opened.getTime())) {
                const months = (now.getFullYear() - opened.getFullYear()) * 12 + (now.getMonth() - opened.getMonth());
                const finalMonths = Math.max(0, months);
                totalMonths += finalMonths;
                if (finalMonths > oldestMonths) oldestMonths = finalMonths;
                const name = a.name || a.accountName || a.creditorName || a.creditor || "Unknown Account";
                const status = String(a.account_status || a.openClosed || "Unknown").toUpperCase();
                validAccts.push({ name: `${name} (${status})`, months: finalMonths });
            }
        }
    });
    const avgMonths = validAccts.length ? Math.round(totalMonths / validAccts.length) : 0;
    let rating = "Needs work"; let impact = "High";
    if (avgMonths >= 108) { rating = "Excellent"; impact = "Low"; }
    else if (avgMonths >= 84) { rating = "Good"; impact = "Medium-Low"; }
    else if (avgMonths >= 60) { rating = "Fair"; impact = "Medium"; }
    validAccts.sort((a, b) => b.months - a.months);
    return { averageMonths: avgMonths, oldestMonths, rating, impact, accounts: validAccts };
};

const formatAge = (months) => {
    const y = Math.floor(months / 12); const m = months % 12;
    return y === 0 ? `${m} mos` : `${y} yrs, ${m} mos`;
};

const getCaretPosition = (months) => {
    if (months < 60) return (months / 60) * 25;
    if (months < 84) return 25 + ((months - 60) / 24) * 25;
    if (months < 108) return 50 + ((months - 84) / 24) * 25;
    return 75 + (Math.min(months - 108, 48) / 48) * 25; 
};

// --- HELPER: DATA STANDARDIZATION & DEDUPLICATION ---
const standardizeData = (p) => {
    // 1. Safe Inquiries (Mapped accurately to catch all name variations)
    let safeInquiries = [];
    if (Array.isArray(p.inquiries)) {
        safeInquiries = p.inquiries;
    } else if (p.inquiries && typeof p.inquiries === 'object') {
        safeInquiries = [...(p.inquiries.EX || []), ...(p.inquiries.TU || []), ...(p.inquiries.EQ || [])];
    }
    
    safeInquiries = safeInquiries.map(iq => ({
        creditor: iq.creditor || iq.name || iq.subscriberName || "Unknown",
        date: iq.date || iq.inquiryDate || "Unknown",
        bureau: iq.bureau || (iq.bureaus ? iq.bureaus.join(", ") : "Unknown")
    }));

    // 2. Smart FICO Deduplication (Merges accounts with mismatched numbers across bureaus)
    const rawAccts = Array.isArray(p.accounts) ? p.accounts : [];
    const uniqueAccountsMap = new Map();

    rawAccts.forEach(a => {
        const name = String(a.name || a.account_name || a.creditor || "UNKNOWN").toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10);
        const limit = Number(a.limit || a.creditLimit || a.highCredit || 0);
        
        let openedStr = "UNKN";
        const dOpen = a.opened || a.dateOpened || a.openedDate;
        if(dOpen) {
           const d = new Date(dOpen);
           if(!isNaN(d.getTime())) openedStr = `${d.getFullYear()}-${d.getMonth()}`;
        }

        const key = `${name}_${limit}_${openedStr}`;

        if(uniqueAccountsMap.has(key)) {
            const existing = uniqueAccountsMap.get(key);
            const currentBureaus = new Set(existing.reported_to || []);
            const newBureaus = a.reported_to || (a.bureau ? [a.bureau] : []);
            newBureaus.forEach(b => currentBureaus.add(b));
            existing.reported_to = Array.from(currentBureaus);
            existing.bureau = existing.reported_to.join(", ");
            existing.balance = Math.max(Number(existing.balance || 0), Number(a.balance || a.currentBalance || 0));
        } else {
            const newAcct = { ...a };
            newAcct.reported_to = a.reported_to || (a.bureau ? [a.bureau] : []);
            newAcct.bureau = newAcct.reported_to.join(", ");
            newAcct.balance = Number(a.balance || a.currentBalance || 0);
            newAcct.limit = limit;
            uniqueAccountsMap.set(key, newAcct);
        }
    });

    const uniqueAccounts = Array.from(uniqueAccountsMap.values());

    // 3. Strict FICO Utilization Math (Open Revolvers Only)
    const openRevolvers = uniqueAccounts.filter(a => {
        const isRev = a.is_revolving === true || String(a.type || a.creditType || "").toUpperCase().includes("REVOLV") || String(a.industry || "").toUpperCase().includes("REVOLV");
        const isOpen = String(a.account_status || "").toUpperCase() === "OPEN" || String(a.openClosed || "").toUpperCase() === "OPEN" || String(a.status || "").toUpperCase() === "OPEN";
        return isRev && isOpen;
    });

    let trueLimit = openRevolvers.reduce((sum, a) => sum + (Number(a.limit) || 0), 0);
    let trueDebt = openRevolvers.reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

    if (trueLimit === 0 && p.util) {
        trueLimit = Number(p.util.total_limit) || 0;
        trueDebt = Number(p.util.current_balance) || 0;
    }
    const trueUtilPct = trueLimit > 0 ? Math.round((trueDebt / trueLimit) * 100) : 0;

    // 4. Detailed Utilization Breakdown
    const utilBreakdown = openRevolvers.map(a => ({
        displayName: a.name || a.account_name || a.creditor,
        displayBureau: a.bureau || "Unknown",
        parsedLimit: Number(a.limit || 0),
        parsedBalance: Number(a.balance || 0),
        calculatedUtil: (Number(a.limit) > 0) ? Math.round((Number(a.balance) / Number(a.limit)) * 100) : 0,
    })).sort((a,b) => b.calculatedUtil - a.calculatedUtil);

    return {
        ...p,
        accounts: uniqueAccounts,
        inquiries: safeInquiries,
        trueUtilPct,
        utilBreakdown,
        openRevolversCount: openRevolvers.length
    };
};

export default function QuickEligibilityChecker({ onCheckCompleted, companyId }) {
  const { addToast } = useToast();
  const [step, setStep] = useState("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  
  const [companyProfile, setCompanyProfile] = useState(null);

  const [rawJson, setRawJson] = useState(null); 
  const [parsedData, setParsedData] = useState(null); 
  const [result, setResult] = useState(null);
  const [ageMetrics, setAgeMetrics] = useState(null); 
  const [key, setKey] = useState("overview");

  const [provider, setProvider] = useState("SmartCredit");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityWord, setSecurityWord] = useState("");
  
  const [fetchingReport, setFetchingReport] = useState(false);
  const [retryCount, setRetryCount] = useState(0); 
  const [settings, setSettings] = useState({ inquiryMonths: 6, maxInqCount: 2, maxUtil: 35, minAccts: 5 });

  const [showReportModal, setShowReportModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const stageRef = useRef(null);
  const [renderForStage, setRenderForStage] = useState(false);

  const theme = {
    bgMain: "transparent", 
    bgCard: "#1e293b", headerBg: "#0f172a", border: "#334155", 
    textMain: "#e2e8f0", textMuted: "#94a3b8", accentBlue: "#60a5fa", 
    success: "#34d399", warning: "#fbbf24", danger: "#f87171", 
  };

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

  const submitCredentials = async (e) => {
      e.preventDefault();
      setFetchingReport(true); setErrorMsg(""); setRetryCount(0);
      try {
          let rawReportData = null; let cleanParsedData = null; let success = false; let attempts = 0; const maxRetries = 3;

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
                      const root = Array.isArray(anJson) ? anJson[0] : anJson;
                      let payload = root;
                      if (root?.data && typeof root.data === 'object') payload = root.data;
                      else if (root?.pdfData && typeof root.pdfData === 'object') payload = root.pdfData;
                      else if (root?.report && typeof root.report === 'object') payload = root.report;

                      const isRaw = payload?.BundleComponents || payload?.report?.BundleComponents;

                      if (isRaw) {
                          cleanParsedData = parseSmartCredit(payload);
                      } else {
                          cleanParsedData = payload;
                      }
                  } else if (provider === "IdentityIQ") {
                      const res = await fetch("https://backend-4uir.onrender.com/loginidiq", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: username, password, pin: securityWord, ssn: "" }),
                      });
                      const json = await res.json();
                      if (!res.ok || !json.success) throw new Error(json.error || `${provider} connection failed.`);
                      rawReportData = json.report;
                      cleanParsedData = parseSmartCredit(json.report);
                  } else {
                      throw new Error(`${provider} integration is coming soon!`);
                  }

                  if (!cleanParsedData) throw new Error("Missing report data.");
                  success = true;
              } catch (err) {
                  attempts++; setRetryCount(attempts);
                  if (attempts >= maxRetries || err.message.includes("coming soon")) throw new Error(err.message.includes("coming soon") ? err.message : "Connection timed out. Please verify credentials.");
                  await new Promise(res => setTimeout(res, 5000));
              }
          }

          const stdData = standardizeData(cleanParsedData);
          setRawJson(rawReportData);
          setParsedData(stdData);

          if (companyId) {
              const timestamp = new Date().getTime();
              const safeName = (stdData.client?.full_name || stdData.personal?.names?.[0] || stdData.personal_info?.name || "Unknown").replace(/[^a-zA-Z0-9]/g, "_");
              const storagePath = `quick_reports/${companyId}/${timestamp}_${safeName}_blueprint.json`;

              await supabase.storage.from("clients").upload(
                  storagePath,
                  new Blob([JSON.stringify(rawReportData, null, 2)], { type: "application/json" }),
                  { upsert: true }
              );

              const safeScores = extractScoresSafely(rawReportData, stdData);
              await supabase.from("company_quick_reports").insert([{
                  company_id: companyId,
                  client_name: stdData.client?.full_name || stdData.personal?.names?.[0] || stdData.personal_info?.name || "Unknown Client",
                  report_type: "FUNDING_BLUEPRINT",
                  scores: safeScores,
                  storage_path: storagePath
              }]);
          }

          setStep("results");
          if (onCheckCompleted) onCheckCompleted();
      } catch (err) {
          console.error("Import Error:", err);
          setErrorMsg(err.message || "Failed to pull credit report. Check your credentials.");
          setStep("connecting");
      } finally {
          setFetchingReport(false); setRetryCount(0);
      }
  };

  useEffect(() => {
    if (parsedData) {
      try {
        const analysis = calculateFundingEligibility(parsedData, settings);
        
        const anchorDate = parsedData.report_date ? new Date(parsedData.report_date) : new Date();
        const anchorYear = anchorDate.getFullYear();
        const anchorMonth = anchorDate.getMonth();

        let recentCount = 0;
        parsedData.inquiries.forEach(inq => { 
            if (inq.date && inq.date !== "Unknown") {
                const d = new Date(inq.date);
                if (!isNaN(d.getTime())) {
                    const monthDelta = (anchorYear - d.getFullYear()) * 12 + (anchorMonth - d.getMonth());
                    if (monthDelta >= 0 && monthDelta <= settings.inquiryMonths) {
                        recentCount++;
                    }
                }
            }
        });

        const negCount = parsedData.negatives?.length || 0;
        const prCount = parsedData.public_records?.length || 0;
        const totalDerogs = negCount + prCount;

        analysis.metrics.inquiries_total = parsedData.inquiries.length;
        analysis.metrics.inquiries_recent = recentCount;
        analysis.metrics.utilization = parsedData.trueUtilPct;
        analysis.metrics.revolving_accounts = parsedData.openRevolversCount;
        analysis.metrics.derogatories = totalDerogs; 

        const exactReasons = [];
        
        if (totalDerogs > 0) {
            exactReasons.push({ status: "RED", text: `Derogatory Marks Present (${negCount} negative accounts, ${prCount} public records). Automatic disqualification.` });
        } else {
            exactReasons.push({ status: "GREEN", text: `Clean payment history (0 derogatory items).` });
        }

        if (parsedData.trueUtilPct > settings.maxUtil) {
            exactReasons.push({ status: "RED", text: `High Utilization (${parsedData.trueUtilPct}% > ${settings.maxUtil}%)` });
        } else {
            exactReasons.push({ status: "GREEN", text: `Utilization Optimal (${parsedData.trueUtilPct}%)` });
        }

        if (parsedData.openRevolversCount < settings.minAccts) {
            exactReasons.push({ status: "RED", text: `Thin File (${parsedData.openRevolversCount} < ${settings.minAccts} primary open revolving accts)` });
        } else {
            exactReasons.push({ status: "GREEN", text: `Strong Account Depth (${parsedData.openRevolversCount} open revolving accts)` });
        }

        if (recentCount > settings.maxInqCount) {
            exactReasons.push({ status: "RED", text: `High Velocity (${recentCount} inquiries in last ${settings.inquiryMonths}mo). Max allowed: ${settings.maxInqCount}.` });
        } else {
            exactReasons.push({ status: "GREEN", text: `Inquiries within limits (${recentCount} in last ${settings.inquiryMonths}mo).` });
        }

        analysis.reasons = exactReasons;

        let newStatus = "GREEN";
        if (exactReasons.some(r => r.status === "RED")) newStatus = "RED";
        else if (exactReasons.some(r => r.status === "YELLOW")) newStatus = "YELLOW";
        analysis.status = newStatus;

        const redCount = exactReasons.filter(r => r.status === "RED").length;
        const score = Math.max(0, 100 - (redCount * 33));
        analysis.score = `${Math.round(score)}/100`;

        setResult(analysis);
        setAgeMetrics(calculateAgeMetrics(parsedData.accounts));
      } catch (e) { setErrorMsg("Underwriting Error: " + e.message); }
    }
  }, [parsedData, settings]);

  const detailedInquiriesLog = useMemo(() => {
    if (!parsedData?.inquiries) return [];
    const anchorDate = parsedData.report_date ? new Date(parsedData.report_date) : new Date();
    const anchorYear = anchorDate.getFullYear();
    const anchorMonth = anchorDate.getMonth();
    
    return parsedData.inquiries.map(iq => {
        let isRecent = false; 
        let displayAge = "";
        
        if (iq.date && iq.date !== "Unknown") {
            const d = new Date(iq.date);
            if (!isNaN(d.getTime())) {
                const monthDelta = (anchorYear - d.getFullYear()) * 12 + (anchorMonth - d.getMonth());
                isRecent = monthDelta >= 0 && monthDelta <= settings.inquiryMonths;
                displayAge = `${monthDelta}Mo`;
            }
        }
        return {
            creditor: iq.creditor,
            date: iq.date,
            bureau: iq.bureau,
            recent: isRecent,
            ageLabel: displayAge ? ` (${displayAge})` : ""
        };
    });
  }, [parsedData, settings.inquiryMonths]);

  const blueprintProps = useMemo(() => {
      if (!rawJson || !parsedData || !result || !ageMetrics) return null;
      try {
          const clientName = parsedData.client?.full_name || parsedData.personal?.names?.[0] || parsedData.personal_info?.name || "Client Name";
          const safeScores = extractScoresSafely(rawJson, parsedData);
          
          return {
              eligibilityResult: result,
              ageMetrics: ageMetrics,
              scores: safeScores,
              clientName: clientName,
              reportId: "HPC-QUICK-CHECK",

              companyName: companyProfile?.company_name || "HIDDEN PARTNER CLOUD",
              companyEmail: companyProfile?.contact_email || "INFO@HIDDENPARTNERCLOUD.COM",
              companyPhone: companyProfile?.phone || "(919) 300-5202",
              companyWebsite: companyProfile?.website || "HIDDENPARTNERCLOUD.COM",
              companyLogo: companyProfile?.logo_url || "https://storage.googleapis.com/msgsndr/rqr5oOzXxiHjh8wSS7T2/media/1923f793-9139-4710-acdf-be54468f86ab.png"
          };
      } catch (e) {
          console.error("Blueprint Mapping Error", e);
          return null;
      }
  }, [rawJson, parsedData, result, ageMetrics, companyProfile]);

  // ─── PDF RENDER ENGINE (DARK THEME) ───
  async function makePaginatedPages() {
    setRenderForStage(true);
    await delay(100); await waitForImages(stageRef.current);
    const printRoot = stageRef.current?.querySelector(".print-root");
    if (!printRoot) throw new Error("No .print-root found");
    const { portalEl, pages } = paginateFromPrintRoot(printRoot);
    return { portalEl, pages };
  }

  async function handleDownload() {
    if (!blueprintProps) return;
    setBusy(true); let portalEl;
    try {
      const built = await makePaginatedPages();
      portalEl = built.portalEl;
      built.pages.forEach(pageEl => { 
          // 👇 FIXED: Removed padding, set to dark slate to match chunks
          pageEl.style.backgroundColor = "#0f172a"; 
          pageEl.style.padding = "0px"; 
          pageEl.style.boxSizing = "border-box"; 
      });
      // 👇 FIXED: Updated background color for image builder
      const finalImages = await pagesToImages(built.pages, { scale: 2, backgroundColor: "#0f172a" });
      const pdf = imagesToPdf(finalImages, { marginMm: 0, orientation: "p", format: "a4", imageType: "JPEG", imageQuality: 1.0, docProps: { title: `Funding Blueprint - ${blueprintProps.clientName}` } });
      pdf.save(`Funding_Blueprint_${blueprintProps.clientName.replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
    } catch (e) { addToast({ title: "PDF Generation Failed", message: "Error generating PDF.", variant: "danger", icon: "bi-exclamation-triangle-fill" }); console.error(e); } finally {
      if (portalEl) destroyPaginatedPortal(portalEl);
      setRenderForStage(false); setBusy(false);
    }
  }

  const handleSettingChange = (key, val) => setSettings(prev => ({ ...prev, [key]: parseInt(val) }));

  const resetTool = () => {
      setStep("connecting"); setResult(null); setAgeMetrics(null); setParsedData(null); setRawJson(null);
      setUsername(""); setPassword(""); setSecurityWord(""); setErrorMsg(""); setKey("overview");
  };

  const getBannerStyles = (status) => {
    if (status === "GREEN") return { bg: "rgba(52, 211, 153, 0.15)", text: theme.success, border: theme.success, label: "ELIGIBLE FOR FUNDING" };
    if (status === "YELLOW") return { bg: "rgba(251, 191, 36, 0.15)", text: theme.warning, border: theme.warning, label: "NEEDS REVIEW" };
    return { bg: "rgba(248, 113, 113, 0.15)", text: theme.danger, border: theme.danger, label: "HIGH RISK / INELIGIBLE" };
  };

  const getLevel = (type, val) => {
    if (type === 'util') return val <= settings.maxUtil ? 'good' : 'bad';
    if (type === 'rev') return val >= settings.minAccts ? 'good' : 'warn';
    if (type === 'inq') return val <= settings.maxInqCount ? 'good' : 'bad';
    if (type === 'mtg') return val > 0 ? 'good' : 'warn';
    return 'bad';
  };

  const getCardStyle = (level) => {
    if (level === 'good') return { text: theme.success, badge: 'bg-success text-white', border: theme.success };
    if (level === 'warn') return { text: theme.warning, badge: 'bg-warning text-dark', border: theme.warning };
    return { text: theme.danger, badge: 'bg-danger text-white', border: theme.danger };
  };

  const utilStyle = result ? getCardStyle(getLevel('util', result.metrics.utilization)) : {};
  const revStyle = result ? getCardStyle(getLevel('rev', result.metrics.revolving_accounts)) : {};
  const inqStyle = result ? getCardStyle(getLevel('inq', result.metrics.inquiries_recent)) : {};
  const mtgStyle = result ? getCardStyle(getLevel('mtg', result.metrics.mortgage_seasoning)) : {};

  return (
    <Card className="quick-eligibility-checker-root border-0 shadow-lg rounded-4 overflow-hidden w-100 mx-auto" style={{ backgroundColor: theme.bgMain }}>
        <div className="text-white text-center py-3 px-3 border-bottom" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
            <h5 className="fw-bold mb-0"><i className="bi bi-bank2 me-2" style={{ color: theme.accentBlue }}></i> Quick Eligibility Checker</h5>
        </div>

        <Card.Body className="p-4" style={{ minHeight: '400px', backgroundColor: theme.bgCard }}>
          {errorMsg && <Alert variant="danger" className="fw-bold small"><i className="bi bi-exclamation-triangle-fill me-2"></i>{errorMsg}</Alert>}

          {step === "connecting" && (
            <div className="py-2 animate-fade-in">
              <Alert className="small fw-bold text-center mb-4" style={{ backgroundColor: "rgba(96, 165, 250, 0.1)", border: `1px solid ${theme.accentBlue}`, color: theme.accentBlue }}>
                <i className="bi bi-shield-check me-2"></i> Enter client credentials to instantly check funding status.
              </Alert>
              
              <Form onSubmit={submitCredentials}>
                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>Credit Monitoring Provider</Form.Label>
                      <Form.Select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={fetchingReport} className="dark-input shadow-sm">
                          <option value="SmartCredit">SmartCredit</option>
                          <option value="IdentityIQ">IdentityIQ</option>
                      </Form.Select>
                  </Form.Group>

                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>Username / Email</Form.Label>
                      <Form.Control type="text" required value={username} onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))} disabled={fetchingReport} className="dark-input shadow-sm"/>
                  </Form.Group>

                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>Password</Form.Label>
                      <Form.Control type="password" required value={password} onChange={(e) => setPassword(e.target.value.replace(/\s+/g, ""))} disabled={fetchingReport} className="dark-input shadow-sm"/>
                  </Form.Group>

                  {provider !== "SmartCredit" && (
                      <Form.Group className="mb-4">
                          <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>PIN</Form.Label>
                          <Form.Control type="text" value={securityWord} onChange={(e) => setSecurityWord(e.target.value)} disabled={fetchingReport} placeholder="If required" className="dark-input shadow-sm"/>
                      </Form.Group>
                  )}

                  <Button type="submit" variant="info" size="lg" className="w-100 fw-bold shadow-sm mt-3 text-white" disabled={fetchingReport || !username || !password} style={{ backgroundColor: theme.accentBlue, borderColor: theme.accentBlue }}>
                      {fetchingReport ? (
                          <>
                              <Spinner size="sm" className="me-2 text-white"/> 
                              {retryCount > 0 ? `Retrying... (Attempt ${retryCount + 1}/3)` : "Importing Report..."}
                          </>
                      ) : "Run Eligibility Check"}
                  </Button>
              </Form>
            </div>
          )}

          {step === "analyzing" && (
            <div className="text-center py-5 animate-fade-in d-flex flex-column align-items-center justify-content-center h-100">
              <Spinner animation="border" variant="info" style={{ width: '3rem', height: '3rem', color: theme.accentBlue }} />
              <h5 className="mt-4 fw-bold text-soft">Running Funding Algorithm...</h5>
              <p className="small" style={{ color: theme.textMuted }}>Checking utilization, inquiry counts, and equity signals.</p>
            </div>
          )}

          {step === "results" && result && parsedData && (
            <div className="animate-fade-in">
              <div className="text-center mb-4 p-4 rounded-4 shadow-sm border" style={{ backgroundColor: getBannerStyles(result.status).bg, color: getBannerStyles(result.status).text, borderColor: getBannerStyles(result.status).border }}>
                <h2 className="fw-bold mb-0" style={{ letterSpacing: '-1px' }}>
                  {result.status === "GREEN" && <i className="bi bi-check-circle-fill me-2"></i>}
                  {result.status === "YELLOW" && <i className="bi bi-exclamation-triangle-fill me-2"></i>}
                  {result.status === "RED" && <i className="bi bi-shield-x me-2"></i>}
                  {getBannerStyles(result.status).label}
                </h2>
                <div className="fw-bold text-uppercase mt-2" style={{ letterSpacing: '2px', opacity: 0.9, fontSize: '0.85rem' }}>System Verdict: {result.score}</div>
              </div>

              <Tabs id="quick-underwriting-tabs" activeKey={key} onSelect={(k) => setKey(k)} className="mb-4 font-monospace small fw-bold dark-funder-tabs">
                <Tab eventKey="overview" title="📋 Overview & Rules">
                  <Card className="border-0 shadow-sm rounded-4 p-4 mt-3" style={{ backgroundColor: theme.bgCard }}>
                      <Row className="g-3 mb-4">
                        <Col xs={6} md={3}>
                          <div className="p-3 border rounded-3 shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.headerBg, borderColor: utilStyle.border }}>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{fontSize:'0.65rem', color: theme.textMuted}}>Revolving Util.</span>
                              <i className="bi bi-pie-chart-fill fs-5" style={{ color: utilStyle.text }}></i>
                            </div>
                            <div>
                              <div className="fw-bold fs-3 mb-1" style={{ letterSpacing: '-1px', color: utilStyle.text }}>{result.metrics.utilization}%</div>
                              <Badge className={`${utilStyle.badge} shadow-sm w-100`}>{result.metrics.utilization > settings.maxUtil ? "Critical" : "Optimal"}</Badge>
                            </div>
                          </div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="p-3 border rounded-3 shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.headerBg, borderColor: revStyle.border }}>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{fontSize:'0.65rem', color: theme.textMuted}}>Revolving Cards</span>
                              <i className="bi bi-credit-card-2-front-fill fs-5" style={{ color: revStyle.text }}></i>
                            </div>
                            <div>
                              <div className="fw-bold fs-3 mb-1" style={{ letterSpacing: '-1px', color: revStyle.text }}>{result.metrics.revolving_accounts}</div>
                              <Badge className={`${revStyle.badge} shadow-sm w-100`}>{result.metrics.revolving_accounts < settings.minAccts ? "Thin File" : "Strong Depth"}</Badge>
                            </div>
                          </div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="p-3 border rounded-3 shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.headerBg, borderColor: inqStyle.border }}>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{fontSize:'0.65rem', color: theme.textMuted}}>Recent Inqs</span>
                              <i className="bi bi-search fs-5" style={{ color: inqStyle.text }}></i>
                            </div>
                            <div>
                              <div className="fw-bold fs-3 mb-1" style={{ letterSpacing: '-1px', color: inqStyle.text }}>{result.metrics.inquiries_recent}</div>
                              <Badge className={`${inqStyle.badge} shadow-sm w-100`}>{result.metrics.inquiries_recent > settings.maxInqCount ? "High Risk" : "Within Limit"}</Badge>
                            </div>
                          </div>
                        </Col>
                        <Col xs={6} md={3}>
                          <div className="p-3 border rounded-3 shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.headerBg, borderColor: mtgStyle.border }}>
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{fontSize:'0.65rem', color: theme.textMuted}}>Mortgage Depth</span>
                              <i className="bi bi-house-door-fill fs-5" style={{ color: mtgStyle.text }}></i>
                            </div>
                            <div>
                              <div className="fw-bold fs-3 mb-1" style={{ letterSpacing: '-1px', color: mtgStyle.text }}>{result.metrics.mortgage_seasoning > 0 ? `${result.metrics.mortgage_seasoning} Yr` : "None"}</div>
                              <Badge className={`${mtgStyle.badge} shadow-sm w-100`}>{result.metrics.mortgage_seasoning > 0 ? "Seasoned" : "No Equity"}</Badge>
                            </div>
                          </div>
                        </Col>
                      </Row>

                      <h6 className="fw-bold text-soft mb-3">Underwriting Feedback Rules Checked</h6>
                      <div className="border rounded-3 overflow-hidden mb-2" style={{ borderColor: theme.border }}>
                        <ul className="list-group list-group-flush mb-0">
                          {result.reasons.map((r, i) => (
                            <li key={i} className="list-group-item py-3 px-4 d-flex align-items-start gap-3" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
                              <i className={`bi bi-circle-fill fs-6 mt-1`} style={{ color: r.status === "GREEN" ? theme.success : r.status === "YELLOW" ? theme.warning : theme.danger }}></i>
                              <span className="fw-medium text-soft" style={{ fontSize: '0.9rem' }}>{r.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                  </Card>
                </Tab>

                <Tab eventKey="utilization" title="💳 Utilization Breakdown">
                  <Card className="border-0 shadow-sm rounded-4 p-0 overflow-hidden mt-2" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                    <div className="p-4 border-bottom" style={{ borderColor: theme.border, backgroundColor: theme.headerBg }}>
                      <h6 className="fw-bold text-soft mb-1">Revolving Limit Tally Diagnostic</h6>
                      <p className="mb-0 small" style={{ color: theme.textMuted }}>Accumulated balance parameters across open revolving lines matching algorithm conventions.</p>
                    </div>
                    <Table responsive hover className="dark-table align-middle text-start small">
                      <thead className="text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.7rem' }}>
                        <tr>
                          <th className="ps-4 py-3">Creditor/Account Name</th><th>Account Bureau</th><th>Credit Limit</th><th>Current Balance</th><th className="pe-4 text-center">Utilization</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedData.utilBreakdown.map((acc, idx) => (
                          <tr key={idx}>
                            <td className="ps-4 fw-bold text-soft">{acc.displayName}</td>
                            <td className="font-monospace text-uppercase" style={{ color: theme.textMuted }}>{acc.displayBureau}</td>
                            <td className="fw-semibold text-soft">${acc.parsedLimit.toLocaleString()}</td>
                            <td className="fw-semibold" style={{ color: theme.accentBlue }}>${acc.parsedBalance.toLocaleString()}</td>
                            <td className="pe-4 text-center">
                              <Badge bg={acc.calculatedUtil > settings.maxUtil ? "danger" : "success"} className="rounded-pill px-2 py-1">{acc.calculatedUtil}%</Badge>
                            </td>
                          </tr>
                        ))}
                        {parsedData.utilBreakdown.length === 0 && (
                          <tr><td colSpan={5} className="text-center py-4 small" style={{ color: theme.textMuted }}>No active open revolving lines processed.</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </Card>
                </Tab>

                <Tab eventKey="inquiries" title="🔎 Inquiry Velocity Log">
                  <Card className="border-0 shadow-sm rounded-4 p-0 overflow-hidden mt-2" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                    <div className="p-4 border-bottom" style={{ borderColor: theme.border, backgroundColor: theme.headerBg }}>
                      <h6 className="fw-bold text-soft mb-1">Bureau Inquiry Audit Roll</h6>
                      <p className="mb-0 small" style={{ color: theme.textMuted }}>Audit window filter metrics applying a strict <strong style={{ color: theme.accentBlue }}>{settings.inquiryMonths} Month</strong> velocity lookback corridor.</p>
                    </div>
                    <Table responsive hover className="dark-table align-middle text-start small">
                      <thead className="text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.7rem' }}>
                        <tr>
                          <th className="ps-4 py-3">Inbound Bureau Inquirer</th><th>Inquiry Date</th><th>Reporting Bureau</th><th className="pe-4 text-center">Window Target Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedInquiriesLog.map((inq, idx) => (
                          <tr key={idx}>
                            <td className="ps-4 fw-bold text-soft">{inq.creditor || "Unknown"}</td>
                            <td className="font-monospace" style={{ color: theme.textMuted }}>{inq.date || "Unknown"}</td>
                            <td className="fw-medium font-monospace text-uppercase text-soft">{inq.bureau || "Unknown"}</td>
                            <td className="pe-4 text-center">
                              <Badge bg={inq.recent ? "danger" : "secondary"} className="text-uppercase font-monospace" style={{fontSize:'0.65rem'}}>
                                {inq.recent ? `Recent${inq.ageLabel}` : "Historic"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                        {detailedInquiriesLog.length === 0 && (
                          <tr><td colSpan={4} className="text-center py-4 small" style={{ color: theme.textMuted }}>No hard inquiries identified inside file streams.</td></tr>
                        )}
                      </tbody>
                    </Table>
                  </Card>
                </Tab>

                <Tab eventKey="age" title="⏳ Credit Age Matrix">
                  {ageMetrics ? (
                    <Card className="border-0 shadow-sm rounded-4 p-4 mt-2 animate-fade-in" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                      <div className="border-bottom pb-3 mb-4 d-flex justify-content-between align-items-center" style={{ borderColor: theme.border }}>
                         <div>
                             <h5 className="fw-bold text-soft mb-0">File Maturity Breakdown</h5>
                             <small style={{ color: theme.textMuted }}>Calculates historical depth parameters across all reported tradelines (Open & Closed) per FICO standards</small>
                         </div>
                         <Badge bg="dark" className="px-3 py-2 border rounded-pill font-monospace fw-bold" style={{ borderColor: theme.border, backgroundColor: theme.headerBg }}>Oldest Opened Account: <span style={{ color: theme.accentBlue }}>{formatAge(ageMetrics.oldestMonths)}</span></Badge>
                      </div>

                      <Row className="g-4 align-items-center">
                        <Col lg={5}>
                           <div className="p-4 rounded-4 border text-center" style={{ backgroundColor: theme.headerBg, borderColor: theme.border }}>
                               <span className="small text-uppercase fw-bold font-monospace d-block mb-1" style={{ color: theme.textMuted }}>Average Portfolio File Age</span>
                               <h1 className="display-4 fw-bold text-soft mb-2" style={{letterSpacing:'-1px'}}>{formatAge(ageMetrics.averageMonths)}</h1>
                               <Badge bg={ageMetrics.rating === 'Excellent' || ageMetrics.rating === 'Good' ? 'success' : 'warning'} className="px-3 py-2 rounded-pill font-monospace small text-dark">
                                   {ageMetrics.rating.toUpperCase()} TIER SIGNAL
                               </Badge>
                           </div>
                        </Col>
                        <Col lg={7}>
                          <div className="position-relative mb-4 mt-3" style={{ height: '30px' }}>
                              <div className="position-absolute" style={{
                                  top: '-8px',
                                  left: `${Math.min(Math.max(getCaretPosition(ageMetrics.averageMonths), 2), 98)}%`,
                                  transform: 'translateX(-50%)',
                                  transition: 'left 0.5s ease',
                                  zIndex: 2
                              }}><i className="bi bi-caret-down-fill fs-4 text-soft" style={{lineHeight: 0}}></i></div>
                              <div className="d-flex w-100 position-absolute shadow-sm" style={{ bottom: '0', height: '14px', borderRadius: '4px', overflow: 'hidden' }}>
                                  <div style={{width: '25%', backgroundColor: theme.danger}} title="Needs Work (0-4 Yrs)"></div>
                                  <div style={{width: '25%', backgroundColor: theme.warning}} title="Fair (5-6 Yrs)"></div>
                                  <div style={{width: '25%', backgroundColor: theme.success, opacity: 0.8}} title="Good (7-8 Yrs)"></div>
                                  <div style={{width: '25%', backgroundColor: theme.success}} title="Excellent (9+ Yrs)"></div>
                              </div>
                          </div>
                          <div className="d-flex justify-content-between font-monospace text-uppercase" style={{fontSize: '0.65rem', color: theme.textMuted}}>
                              <span>Young File</span><span>Mature (9+ Years)</span>
                          </div>
                        </Col>
                      </Row>

                      <h6 className="fw-bold text-soft mt-4 mb-3"><i className="bi bi-clock me-2" style={{ color: theme.accentBlue }}></i>Account Vintage Tracking Log</h6>
                      <div style={{maxHeight: '220px', overflowY: 'auto',borderColor: theme.border}} className="border rounded-3 custom-scrollbar">
                          <Table responsive hover className="dark-table align-middle mb-0 text-start small">
                            <thead className="text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.65rem' }}>
                              <tr><th className="ps-4 py-2">Reported Tradeline</th><th className="pe-4 text-end">Account Age Duration</th></tr>
                            </thead>
                            <tbody>
                              {ageMetrics.accounts.map((acct, idx) => (
                                  <tr key={idx}>
                                      <td className="ps-4 text-soft fw-medium"><i className="bi bi-credit-card-2-front me-2" style={{ color: theme.textMuted }}></i>{acct.name}</td>
                                      <td className="pe-4 text-end font-monospace fw-bold" style={{ color: theme.accentBlue }}>{formatAge(acct.months)}</td>
                                  </tr>
                              ))}
                            </tbody>
                          </Table>
                      </div>
                    </Card>
                  ) : (
                    <div className="text-center py-4 border rounded-4 small" style={{ backgroundColor: theme.bgCard, borderColor: theme.border, color: theme.textMuted }}>No age matrices compiled yet.</div>
                  )}
                </Tab>
              </Tabs>

              <Accordion className="shadow-sm border rounded-3 overflow-hidden mt-4 dark-accordion" style={{ borderColor: theme.border }}>
                  <Accordion.Item eventKey="0" className="border-0">
                      <Accordion.Header><i className="bi bi-sliders me-2"></i> Adjust Risk Scoring Criteria Thresholds</Accordion.Header>
                      <Accordion.Body className="border-top" style={{ borderColor: theme.border }}>
                          <Row className="g-4">
                              <Col md={6}>
                                  <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>Inquiry Lookback Window: <span style={{ color: theme.accentBlue }}>{settings.inquiryMonths} Months</span></Form.Label>
                                  <Form.Range min={1} max={24} value={settings.inquiryMonths} onChange={(e) => handleSettingChange('inquiryMonths', e.target.value)} />
                              </Col>
                              <Col md={6}>
                                  <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>Max Allowed Inquiries: <span style={{ color: theme.accentBlue }}>{settings.maxInqCount}</span></Form.Label>
                                  <Form.Range min={0} max={10} value={settings.maxInqCount} onChange={(e) => handleSettingChange('maxInqCount', e.target.value)} />
                              </Col>
                              <Col md={6}>
                                  <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>Max Utilization Threshold: <span style={{ color: theme.accentBlue }}>{settings.maxUtil}%</span></Form.Label>
                                  <Form.Range min={10} max={100} step={5} value={settings.maxUtil} onChange={(e) => handleSettingChange('maxUtil', e.target.value)} />
                              </Col>
                              <Col md={6}>
                                  <Form.Label className="small fw-bold text-uppercase" style={{ color: theme.textMuted }}>Min Open Accounts Required: <span style={{ color: theme.accentBlue }}>{settings.minAccts}</span></Form.Label>
                                  <Form.Range min={1} max={10} value={settings.minAccts} onChange={(e) => handleSettingChange('minAccts', e.target.value)} />
                              </Col>
                          </Row>
                      </Accordion.Body>
                  </Accordion.Item>
              </Accordion>

              {/* ACTION BUTTONS */}
              <div className="d-flex flex-column flex-md-row gap-3 pt-4 mt-4 border-top" style={{ borderColor: theme.border }}>
                  <Button variant="outline-secondary" className="fw-bold shadow-sm flex-grow-1" onClick={resetTool} style={{ color: theme.textMuted, borderColor: theme.border }}>
                      <i className="bi bi-arrow-counterclockwise me-2"></i> Reset Check
                  </Button>
                  <Button onClick={() => setShowReportModal(true)} variant="info" className="fw-bold text-dark shadow-sm flex-grow-1" style={{ backgroundColor: theme.accentBlue, borderColor: theme.accentBlue }}>
                    <i className="bi bi-search me-2"></i> Preview Blueprint
                  </Button>
                  <Button onClick={handleDownload} disabled={busy} variant="primary" className="fw-bold shadow-sm text-dark flex-grow-1" style={{ backgroundColor: theme.success, borderColor: theme.success }}>
                    {busy ? <Spinner size="sm"/> : <><i className="bi bi-download me-2"></i> Download PDF</>}
                  </Button>
              </div>
            </div>
          )}
        </Card.Body>

        {/* 👇 NEW INTERACTIVE PREVIEW MODAL (DARK THEME) 👇 */}
        <Modal show={showReportModal} onHide={() => setShowReportModal(false)} size="xl" centered scrollable>
          <Modal.Header closeButton closeVariant="white" className="border-0 shadow-sm" style={{ backgroundColor: "#0f172a" }}>
            <Modal.Title className="fw-bold text-white">
              <i className="bi bi-file-earmark-text-fill me-2" style={{ color: theme.brightBlue }}></i> Funding Blueprint Preview
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-0 custom-scrollbar" style={{ backgroundColor: "#0B1121" }}>
             {blueprintProps && <FundingBlueprintReport {...blueprintProps} />}
          </Modal.Body>
          <Modal.Footer className="border-0" style={{ backgroundColor: "#0f172a" }}>
            <Button variant="outline-secondary" className="fw-bold text-white" style={{ borderColor: '#334155' }} onClick={() => setShowReportModal(false)}>Close Preview</Button>
            <Button variant="primary" className="fw-bold shadow-sm text-dark" style={{ backgroundColor: '#38bdf8', borderColor: '#38bdf8' }} onClick={handleDownload} disabled={busy}>
               {busy ? <Spinner size="sm" className="me-2" /> : <i className="bi bi-download me-2"></i>}
               Download PDF
            </Button>
          </Modal.Footer>
        </Modal>

        {/* 👇 HIDDEN PDF RENDER STAGE (DARK BACKGROUND FOR EDGE-TO-EDGE PDF) 👇 */}
        <div ref={stageRef} style={{ position: "absolute", left: "-99999px", top: 0, width: "794px", background: "#0f172a" }} aria-hidden>
          {renderForStage && blueprintProps && (
            <div className="print-root" style={{ width: 794, background: "#0f172a" }}> 
              {/* Added printMode={true} so the chunks break perfectly across pages */}
              <FundingBlueprintReport {...blueprintProps} printMode={true} />
            </div>
          )}
        </div>
      </Card>
  );
}