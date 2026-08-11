import React, { useState, useEffect, useMemo } from "react";
import { Container, Card, Button, Spinner, Row, Col, Alert, Form, InputGroup, Badge, Stack, Tabs, Tab, Table } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { calculateFundingEligibility } from "../../../utils/funderRules";
import { parseSmartCredit } from "../../../utils/parseSmartCredit";
import { deriveServiceId } from "../../../utils/services";

const BUCKET_NAME = "clients"; 

const generateId = () => Math.random().toString(36).substr(2, 9);
const addId = (item) => ({
    ...item,
    id: item.id || generateId(), 
    classification: item.classification || 'non-linked' 
});

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
        const dateStr = a.dateOpened || a.opened || a.openedDate;
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
    const y = Math.floor(months / 12);
    const m = months % 12;
    if (y === 0) return `${m} mos`;
    return `${y} yrs, ${m} mos`;
};

const getCaretPosition = (months) => {
    if (months < 60) return (months / 60) * 25;
    if (months < 84) return 25 + ((months - 60) / 24) * 25;
    if (months < 108) return 50 + ((months - 84) / 24) * 25;
    return 75 + (Math.min(months - 108, 48) / 48) * 25; 
};

// --- HELPER: DATA STANDARDIZATION & DEDUPLICATION ---
const standardizeData = (p) => {
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

export default function LeadEligibilityFunnel({ 
  companyId = "e33ef166-d381-458e-a5c8-ac77557d5ea2", 
  affiliateLink = "https://www.smartcredit.com/?PID=23400" 
}) {
  const [step, setStep] = useState("lead_capture"); 
  const [errorMsg, setErrorMsg] = useState("");
  const [key, setKey] = useState("overview");
  
  const [fullName, setFullName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingLead, setSavingLead] = useState(false);

  const [provider, setProvider] = useState("SmartCredit");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityWord, setSecurityWord] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  const [fetchingReport, setFetchingReport] = useState(false);
  const [retryCount, setRetryCount] = useState(0); 

  const [scrapedData, setScrapedData] = useState(null);
  const [parsedData, setParsedData] = useState(null); 
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [ageMetrics, setAgeMetrics] = useState(null); 
  const [isLockedPreview, setIsLockedPreview] = useState(false);

const [settings, setSettings] = useState({ inquiryMonths: 6, maxInqCount: 2, maxUtil: 35, minAccts: 5 });
  const handleLeadCapture = (e) => {
      e.preventDefault();
      if (!fullName || !userEmail || !phone) { setErrorMsg("Please fill out all fields."); return; }
      if (!companyId) { setErrorMsg("System Error: Missing Company ID."); return; }
      setErrorMsg("");
      setStep("has_account");
  };

  const submitCredentials = async (e) => {
      e.preventDefault();
      setFetchingReport(true);
      setErrorMsg("");
      setRetryCount(0);

      try {
          let cleanParsedData = null;
          let rawReportData = null;
          let success = false;
          let attempts = 0;
          const maxRetries = 3;

          while (attempts < maxRetries && !success) {
              try {
                  if (provider === "SmartCredit") {
                      const analysisRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/credit_analysis`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
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
                      cleanParsedData = isRaw ? parseSmartCredit(payload) : payload;

                  } else if (provider === "IdentityIQ") {
                      const res = await fetch("https://backend-4uir.onrender.com/loginidiq", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
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
                  attempts++;
                  setRetryCount(attempts);
                  if (attempts >= maxRetries || err.message.includes("coming soon")) {
                      throw new Error(err.message.includes("coming soon") ? err.message : "Connection timed out. Please verify your credentials.");
                  }
                  await new Promise(res => setTimeout(res, 5000));
              }
          }

          setStep("analyzing");
          await new Promise(r => setTimeout(r, 1000));

          const stdData = standardizeData(cleanParsedData);
          setScrapedData({ cleanParsedData: stdData, rawReportData });
          setParsedData(stdData);
          setStep("results_summary");

      } catch (err) {
          console.error("Import Error:", err);
          setErrorMsg(err.message || "Failed to pull credit report. Check your credentials.");
          setStep("credentials");
      } finally {
          setFetchingReport(false);
          setRetryCount(0);
      }
  };

useEffect(() => {
    if (parsedData) {
      try {
        const analysis = calculateFundingEligibility(parsedData, settings);
        
        // --- OVERRIDE METRICS WITH STANDARDIZED FICO MATH ---
        const anchorDate = parsedData.report_date ? new Date(parsedData.report_date) : new Date();
        const anchorYear = anchorDate.getFullYear();
        const anchorMonth = anchorDate.getMonth(); // 0-11

        let recentCount = 0;
        parsedData.inquiries.forEach(inq => { 
            if (inq.date && inq.date !== "Unknown") {
                const d = new Date(inq.date);
                if (!isNaN(d.getTime())) {
                    const monthDelta = (anchorYear - d.getFullYear()) * 12 + (anchorMonth - d.getMonth());
                    if (monthDelta >= 0 && monthDelta <= settings.inquiryMonths) recentCount++;
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

        // --- REBUILD REASONS LIST ---
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

        // --- ASSIGN FINAL VERDICT STATUS ---
        let newStatus = "GREEN";
        if (exactReasons.some(r => r.status === "RED")) newStatus = "RED";
        else if (exactReasons.some(r => r.status === "YELLOW")) newStatus = "YELLOW";
        analysis.status = newStatus;

        const redCount = exactReasons.filter(r => r.status === "RED").length;
        const score = Math.max(0, 100 - (redCount * 33));
        analysis.score = `${Math.round(score)}/100`;

        // 👇 FIXED HERE: Changed setResult to setEligibilityResult 👇
        setEligibilityResult(analysis);
        setAgeMetrics(calculateAgeMetrics(parsedData.accounts));
      } catch (e) { setErrorMsg("Underwriting Error: " + e.message); }
    }
  }, [parsedData, settings]);

  const saveLeadAndResults = async () => {
      setSavingLead(true);
      setErrorMsg("");

      try {
          const queryParams = new URLSearchParams(window.location.search);
          const contextualCompanyId = queryParams.get("partner") || companyId; 
          const cleanedEmail = userEmail.toLowerCase().trim();

          const { count: existingEmailRows, error: countError } = await supabase
              .from("company_leads")
              .select("*", { count: "exact", head: true })
              .eq("company_id", contextualCompanyId)
              .eq("email", cleanedEmail);

          if (countError) throw countError;

          const shouldLock = existingEmailRows >= 3;
          setIsLockedPreview(shouldLock);

          const leadPayload = {
              full_name: fullName,
              email: cleanedEmail,
              phone: phone,
              monitoring_username: username,
              computed_status: eligibilityResult?.status || "UNKNOWN",
              company_id: contextualCompanyId
          };

          const { error: dbError } = await supabase.from('company_leads').insert([leadPayload]);
          if (dbError) throw dbError;

          // Create User and Sync Files
          const tempPassword = Math.random().toString(36).slice(-12) + "A1!"; 
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
              body: JSON.stringify({ email: cleanedEmail, password: tempPassword, role: 'client', fullName: fullName })
          });

          const edgeData = await response.json().catch(() => ({}));

          if (!response.ok) {
              const errStr = (edgeData.error || edgeData.message || "").toLowerCase();
              if (response.status === 400 || errStr.includes("already") || errStr.includes("registered") || errStr.includes("exists")) {
                  throw new Error("This Email Has Already Completed A Funding Eligibility Review.");
              }
              throw new Error("Failed to securely register account. Please try again.");
          }

          if (!edgeData?.user?.id) throw new Error("System error: Missing user ID from response.");
          const authUserId = edgeData.user.id;

          const { data: clientRow, error: clientErr } = await supabase.from("clients").select("id").eq("auth_user_id", authUserId).single();
          if (clientErr || !clientRow) throw new Error("System is syncing your profile. Please check your email.");
          
          const newClientId = clientRow.id;

          const clientUpdatePayload = {
              company_id: contextualCompanyId, agent: "Unassigned", dispute_method: "inquiry deletion",
              service_id: deriveServiceId("inquiry deletion"), is_paid: false,
              funding_status: eligibilityResult?.status || "UNKNOWN", report_email: username, report_password: password,
              signup_type: 'individual', phone: phone
          };
          let { error: clientUpdateErr } = await supabase.from("clients").update(clientUpdatePayload).eq("id", newClientId);

          // Defensive: sql/add_services.sql may not have been run yet —
          // degrade gracefully rather than blocking this lead's signup.
          if (clientUpdateErr && /service_id/i.test(clientUpdateErr.message || "")) {
              const { service_id: _omit, ...withoutServiceId } = clientUpdatePayload;
              ({ error: clientUpdateErr } = await supabase.from("clients").update(withoutServiceId).eq("id", newClientId));
          }

          if (scrapedData) {
              const { cleanParsedData, rawReportData } = scrapedData;
              await supabase.storage.from(BUCKET_NAME).upload(`${newClientId}/client_audit_report.json`, new Blob([JSON.stringify(cleanParsedData, null, 2)], { type: "application/json" }), {upsert:true});
              await supabase.storage.from(BUCKET_NAME).upload(`${newClientId}/raw_credit_report.json`, new Blob([JSON.stringify(rawReportData, null, 2)], { type: "application/json" }), {upsert:true});
          }

          const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanedEmail, {
              redirectTo: `${window.location.origin}/update-password` 
          });
          if (resetError) console.error("Password reset email failed to send:", resetError);

          setStep("success");

      } catch (err) {
          console.error("Submission Error:", err);
          setErrorMsg(err.message || "Failed to save details. Please try again.");
      } finally {
          setSavingLead(false);
      }
  };

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

  const getStatusVariant = (s) => (s === "GREEN" ? "success" : s === "YELLOW" ? "warning" : "danger");

  return (
    <div className="lead-eligibility-funnel-root w-100 d-flex justify-content-center align-items-center p-2 p-md-3" style={{ minHeight: '100vh', backgroundColor: '#002855', fontFamily: 'system-ui, -apple-system, sans-serif' }}>

      {/* --- STEP 1: LEAD CAPTURE --- */}
      {step === "lead_capture" && (
        <Container style={{ maxWidth: '1100px' }}>
          <Row className="align-items-center g-5">
            <Col lg={6} className="text-white">
               <h1 className="fw-bold mb-3" style={{ fontSize: '3rem', letterSpacing: '-1px', lineHeight: '1.2' }}>
                 Check Your <br/>
                 <span style={{ color: '#7bbad1' }}>Funding Eligibility</span> <br/>
                 in Less Than 60 Seconds
               </h1>
            </Col>
            
            <Col lg={6}>
               <Card className="glass-card shadow-lg p-4 p-md-5">
                   <div className="text-center mb-4">
                       <h4 className="text-white fw-bold mb-2">Get Started – It's Fast & Free</h4>
                       <p style={{ color: '#a0b3c6' }} className="small mb-0">Enter your information to check eligibility.</p>
                   </div>
                   
                   {errorMsg && <Alert variant="danger" className="py-2 small fw-bold">{errorMsg}</Alert>}

                   <Form onSubmit={handleLeadCapture}>
                       <Row className="g-3 mb-3">
                           <Col md={6}>
                               <InputGroup className="custom-input-group">
                                   <InputGroup.Text><i className="bi bi-person"></i></InputGroup.Text>
                                   <Form.Control required placeholder="Your Full Name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                               </InputGroup>
                           </Col>
                           <Col md={6}>
                               <InputGroup className="custom-input-group">
                                   <InputGroup.Text><i className="bi bi-envelope"></i></InputGroup.Text>
                                   <Form.Control required type="email" placeholder="Email Address" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} />
                               </InputGroup>
                           </Col>
                       </Row>
                       
                       <InputGroup className="custom-input-group mb-4">
                           <InputGroup.Text><i className="bi bi-lock"></i></InputGroup.Text>
                           <Form.Control required type="tel" placeholder="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
                       </InputGroup>

                       <Button type="submit" size="lg" className="w-100 btn-vivid-blue shadow-sm d-flex align-items-center justify-content-center py-3">
                           Check My Eligibility Now <i className="bi bi-arrow-right ms-2"></i>
                       </Button>

                       <div className="text-center mt-3">
                           <small style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
                               <i className="bi bi-shield-lock me-1"></i> Your information is secure and will never be shared.
                           </small>
                       </div>
                   </Form>
               </Card>
            </Col>
          </Row>
        </Container>
      )}

      {/* --- ALL OTHER STEPS (Centered Card Style) --- */}
      {step !== "lead_capture" && (
        <Card 
            className="glass-card shadow-lg w-100 mx-auto" 
            style={{ 
                maxWidth: step.includes('results') ? '1200px' : '650px', 
                transition: 'max-width 0.4s ease-in-out' 
            }}
        >
          <Card.Body className="p-4 p-md-5" style={{ minHeight: '400px' }}>
            {errorMsg && <Alert variant="danger" className="fw-bold small py-2"><i className="bi bi-exclamation-triangle-fill me-2"></i>{errorMsg}</Alert>}

            {/* SCREEN 2: HAS ACCOUNT CHECK */}
            {step === "has_account" && (
              <div className="text-center py-3 animate-fade-in text-white">
                <i className="bi bi-shield-check text-success display-1 opacity-75 mb-3 d-block"></i>
                <h4 className="fw-bold mb-3">Do you already have an active credit monitoring account?</h4>
                <p style={{ color: '#a0b3c6' }} className="small mb-4">We need to securely connect to your credit profile to run the eligibility engine.</p>
                
                <div className="d-grid gap-3">
                  <Button variant="primary" size="lg" className="btn-vivid-blue py-3" onClick={() => setStep("credentials")}>
                    Yes, I have an account
                  </Button>
                  <Button variant="outline-light" className="fw-bold py-3" style={{ borderColor: 'rgba(255,255,255,0.2)' }} onClick={() => setStep("no_account")}>
                    No, I need to create one
                  </Button>
                </div>
              </div>
            )}

            {/* SCREEN 2.5: NO ACCOUNT */}
            {step === "no_account" && (
              <div className="text-center py-3 animate-fade-in text-white">
                <div className="p-4 rounded-3 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <h5 className="fw-bold text-white">Get Your Trial Account</h5>
                    <p style={{ color: '#a0b3c6' }} className="small mb-4">Please use our secure partner link below to register for a 7-day trial. Once registered, return here to connect your account.</p>
                    <Button variant="success" href={affiliateLink} target="_blank" className="fw-bold px-4 rounded-pill shadow-sm">
                        <i className="bi bi-box-arrow-up-right me-2"></i> Register Account
                    </Button>
                </div>
                
                <Button size="lg" className="w-100 btn-vivid-blue py-3" onClick={() => setStep("credentials")}>
                    I've registered, let's connect!
                </Button>
                <Button variant="link" className="small mt-3 fw-bold text-decoration-none" style={{ color: '#a0b3c6' }} onClick={() => setStep("has_account")}>
                    <i className="bi bi-arrow-left me-1"></i> Back
                </Button>
              </div>
            )}

            {/* SCREEN 3: INPUT CREDENTIALS */}
            {step === "credentials" && (
              <div className="py-2 animate-fade-in text-white">
                <Alert variant="info" className="small fw-bold border-0 text-center mb-4 text-white" style={{ backgroundColor: 'rgba(123, 186, 209, 0.2)' }}>
                  <i className="bi bi-shield-lock me-2"></i> Enter credentials to securely pull your report.
                </Alert>
                
                <Form onSubmit={submitCredentials}>
                    <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold" style={{ color: '#7bbad1' }}>Provider</Form.Label>
                        <Form.Select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={fetchingReport} className="custom-input-group">
                            <option value="SmartCredit">SmartCredit</option>
                            <option value="IdentityIQ">IdentityIQ</option>
                        </Form.Select>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold" style={{ color: '#7bbad1' }}>Username / Email</Form.Label>
                        <Form.Control type="text" required value={username} onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))} disabled={fetchingReport} className="custom-input-group"/>
                    </Form.Group>

                    <Form.Group className="mb-3">
                        <Form.Label className="small fw-bold" style={{ color: '#7bbad1' }}>Password</Form.Label>
                        <InputGroup className="custom-input-group">
                            <Form.Control 
                                type={showPassword ? "text" : "password"} 
                                required 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value.replace(/\s+/g, ""))} 
                                disabled={fetchingReport} 
                                placeholder="••••••••"
                            />
                            <Button 
                                variant="outline-secondary" 
                                className="border-0 bg-transparent text-white-50 px-3"
                                onClick={() => setShowPassword(!showPassword)}
                                tabIndex="-1"
                                type="button"
                            >
                                <i className={`bi ${showPassword ? 'bi-eye-slash' : 'bi-eye'}`}></i>
                            </Button>
                        </InputGroup>
                    </Form.Group>

                    {provider !== "SmartCredit" && (
                        <Form.Group className="mb-4">
                            <Form.Label className="small fw-bold" style={{ color: '#7bbad1' }}>PIN / Secret Word</Form.Label>
                            <Form.Control type="text" value={securityWord} onChange={(e) => setSecurityWord(e.target.value)} disabled={fetchingReport} placeholder="If required" className="custom-input-group"/>
                        </Form.Group>
                    )}

                    <Button type="submit" size="lg" className="w-100 btn-vivid-blue mt-3 py-3" disabled={fetchingReport || !username || !password}>
                        {fetchingReport ? (
                            <><Spinner size="sm" className="me-2"/> {retryCount > 0 ? `Retrying... (Attempt ${retryCount + 1}/3)` : "Importing Report..."}</>
                        ) : "Check My Funding Status"}
                    </Button>
                </Form>
              </div>
            )}

            {/* SCREEN 4: ANALYZING */}
            {step === "analyzing" && (
              <div className="text-center py-5 animate-fade-in d-flex flex-column align-items-center justify-content-center h-100 text-white">
                <Spinner animation="border" style={{ width: '3rem', height: '3rem', color: '#7bbad1' }} />
                <h4 className="mt-4 fw-bold">Analyzing Your Credit Profile...</h4>
                <p style={{ color: '#a0b3c6' }} className="small">Checking utilization, inquiry counts, and equity signals.</p>
              </div>
            )}

            {/* SCREEN 5: SUMMARY BANNER */}
            {step === "results_summary" && eligibilityResult && parsedData && (
              <div className="text-center animate-fade-in text-white">
                <div className="mb-4 p-4 rounded-4 shadow-sm" style={{ backgroundColor: eligibilityResult.status === "GREEN" ? "rgba(52, 211, 153, 0.15)" : eligibilityResult.status === "YELLOW" ? "rgba(251, 191, 36, 0.15)" : "rgba(248, 113, 113, 0.15)", border: `1px solid ${eligibilityResult.status === "GREEN" ? "#34d399" : eligibilityResult.status === "YELLOW" ? "#fbbf24" : "#f87171"}` }}>
                  <h2 className="fw-bold mb-2 display-6" style={{ letterSpacing: '-1px', color: eligibilityResult.status === "GREEN" ? "#34d399" : eligibilityResult.status === "YELLOW" ? "#fbbf24" : "#f87171" }}>
                    {eligibilityResult.status === "GREEN" && <i className="bi bi-check-circle-fill me-2"></i>}
                    {eligibilityResult.status === "YELLOW" && <i className="bi bi-exclamation-triangle-fill me-2"></i>}
                    {eligibilityResult.status === "RED" && <i className="bi bi-x-octagon-fill me-2"></i>}
                    {eligibilityResult.status === "GREEN" ? "ELIGIBLE" : eligibilityResult.status === "YELLOW" ? "REVIEW" : "HIGH RISK"}
                  </h2>
                  <div className="fw-bold opacity-75 mt-2 text-white" style={{ fontSize: '1rem' }}>
                    {eligibilityResult.status === "GREEN" 
                      ? "Congratulations! You are currently eligible for funding."
                      : eligibilityResult.status === "YELLOW"
                      ? "You are close, but a few items need review before funding."
                      : "Not currently funding ready. Action required."}
                  </div>
                </div>

                <div className="d-grid mt-4">
                    <Button size="lg" className="btn-vivid-blue py-3" onClick={() => setStep("results_breakdown")}>
                        View My Detailed Breakdown <i className="bi bi-arrow-right ms-1"></i>
                    </Button>
                </div>
              </div>
            )}

            {/* SCREEN 6: DETAILED RESULTS BREAKDOWN (Tabbed UI) */}
            {step === "results_breakdown" && eligibilityResult && parsedData && (
              <div className="animate-fade-in text-white position-relative">
                <h4 className="fw-bold text-center mb-4">Your Profile Breakdown</h4>
                
                <div style={{
                  filter: isLockedPreview ? "blur(7px)" : "none", opacity: isLockedPreview ? 0.3 : 1,
                  pointerEvents: isLockedPreview ? "none" : "auto", userSelect: isLockedPreview ? "none" : "auto",
                  transition: "all 0.3s ease"
                }}>

                  <Tabs id="lead-underwriting-tabs" activeKey={key} onSelect={(k) => setKey(k)} className="mb-4 font-monospace small fw-bold dark-funder-tabs">
                    {/* TAB: OVERVIEW */}
                    <Tab eventKey="overview" title="📋 Overview & Rules">
                      <Row className="g-3 mb-4 mt-2">
                        <Col xs={6}>
                          <div className="p-3 navy-metric-box h-100 d-flex flex-column justify-content-between">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{ color: '#a0b3c6', fontSize:'0.65rem' }}>Revolving Util.</span>
                              <i className={`bi bi-pie-chart-fill fs-5 ${eligibilityResult.metrics.utilization > settings.maxUtil ? 'text-danger' : 'text-success'}`}></i>
                            </div>
                            <div>
                              <div className={`fw-bold fs-3 mb-1 ${eligibilityResult.metrics.utilization > settings.maxUtil ? 'text-danger' : 'text-success'}`} style={{ letterSpacing: '-1px' }}>
                                {eligibilityResult.metrics.utilization}%
                              </div>
                              <Badge bg={eligibilityResult.metrics.utilization > settings.maxUtil ? "danger" : "success"} className="w-100">{eligibilityResult.metrics.utilization > settings.maxUtil ? "Critical" : "Optimal"}</Badge>
                            </div>
                          </div>
                        </Col>
                        
                        <Col xs={6}>
                          <div className="p-3 navy-metric-box h-100 d-flex flex-column justify-content-between">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{ color: '#a0b3c6', fontSize:'0.65rem' }}>Open Revolving</span>
                              <i className={`bi bi-credit-card-2-front-fill fs-5 ${eligibilityResult.metrics.revolving_accounts < settings.minAccts ? 'text-warning' : 'text-success'}`}></i>
                            </div>
                            <div>
                              <div className={`fw-bold fs-3 mb-1 ${eligibilityResult.metrics.revolving_accounts < settings.minAccts ? 'text-warning' : 'text-success'}`} style={{ letterSpacing: '-1px' }}>
                                {eligibilityResult.metrics.revolving_accounts}
                              </div>
                              <Badge bg={eligibilityResult.metrics.revolving_accounts < settings.minAccts ? "warning" : "success"} className={eligibilityResult.metrics.revolving_accounts < settings.minAccts ? "text-dark w-100" : "w-100"}>{eligibilityResult.metrics.revolving_accounts < settings.minAccts ? "Thin File" : "Strong Depth"}</Badge>
                            </div>
                          </div>
                        </Col>

                        <Col xs={6}>
                          <div className="p-3 navy-metric-box h-100 d-flex flex-column justify-content-between">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{ color: '#a0b3c6', fontSize:'0.65rem' }}>Inquiries</span>
                              <i className={`bi bi-search fs-5 ${eligibilityResult.metrics.inquiries_recent > settings.maxInqCount ? 'text-danger' : 'text-success'}`}></i>
                            </div>
                            <div>
                              <div className={`fw-bold fs-3 mb-1 ${eligibilityResult.metrics.inquiries_recent > settings.maxInqCount ? 'text-danger' : 'text-success'}`} style={{ letterSpacing: '-1px' }}>
                                {eligibilityResult.metrics.inquiries_recent}
                              </div>
                              <Badge bg={eligibilityResult.metrics.inquiries_recent > settings.maxInqCount ? "danger" : "success"} className="w-100">{eligibilityResult.metrics.inquiries_recent > settings.maxInqCount ? "High Risk" : "Within Limit"}</Badge>
                            </div>
                          </div>
                        </Col>

                        <Col xs={6}>
                          <div className="p-3 navy-metric-box h-100 d-flex flex-column justify-content-between">
                            <div className="d-flex justify-content-between align-items-center mb-2">
                              <span className="small fw-bold text-uppercase" style={{ color: '#a0b3c6', fontSize:'0.65rem' }}>Equity Signal</span>
                              <i className="bi bi-house-door-fill fs-5" style={{ color: '#7bbad1' }}></i>
                            </div>
                            <div>
                              <div className="fw-bold fs-3 mb-1" style={{ color: '#7bbad1', letterSpacing: '-1px' }}>
                                {eligibilityResult.metrics.mortgage_seasoning > 0 ? `${eligibilityResult.metrics.mortgage_seasoning} Yr` : "None"}
                              </div>
                              <Badge bg={eligibilityResult.metrics.mortgage_seasoning > 0 ? "info" : "secondary"} className="w-100 text-dark">{eligibilityResult.metrics.mortgage_seasoning > 0 ? "Seasoned" : "No Equity"}</Badge>
                            </div>
                          </div>
                        </Col>
                      </Row>

                      <h6 className="fw-bold mb-3 mt-4" style={{ color: '#7bbad1' }}><i className="bi bi-list-check me-2"></i>Detailed Feedback</h6>
                      <div className="border rounded-3 shadow-sm overflow-hidden mb-4" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                        <ul className="list-group list-group-flush mb-0">
                          {eligibilityResult.reasons.map((r, i) => (
                            <li key={i} className="list-group-item bg-transparent border-bottom py-3 px-3 d-flex align-items-start gap-2" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                              <i className={`bi bi-circle-fill text-${getStatusVariant(r.status)} mt-1`} style={{fontSize:'0.6rem'}}></i>
                              <span className="fw-medium text-white" style={{ fontSize: '0.85rem' }}>{r.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Tab>

                    {/* TAB: UTILIZATION BREAKDOWN */}
                    <Tab eventKey="utilization" title="💳 Utilization Breakdown">
                      <div className="border rounded-4 p-0 overflow-hidden mt-2 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.1)' }}>
                        <div className="p-3 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <h6 className="fw-bold text-white mb-1">Revolving Limit Diagnostic</h6>
                          <p className="mb-0 small" style={{ color: '#a0b3c6' }}>Accumulated balance parameters across open revolving lines.</p>
                        </div>
                        <Table responsive hover className="dark-table align-middle text-start small">
                          <thead className="text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.7rem' }}>
                            <tr>
                              <th className="ps-4 py-3">Account Name</th><th>Credit Limit</th><th>Current Balance</th><th className="pe-4 text-center">Utilization</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedData.utilBreakdown.map((acc, idx) => (
                              <tr key={idx}>
                                <td className="ps-4 fw-bold text-white">{acc.displayName}</td>
                                <td className="fw-semibold text-white">${acc.parsedLimit.toLocaleString()}</td>
                                <td className="fw-semibold" style={{ color: '#7bbad1' }}>${acc.parsedBalance.toLocaleString()}</td>
                                <td className="pe-4 text-center">
                                  <Badge bg={acc.calculatedUtil > settings.maxUtil ? "danger" : "success"} className="rounded-pill px-2 py-1">{acc.calculatedUtil}%</Badge>
                                </td>
                              </tr>
                            ))}
                            {parsedData.utilBreakdown.length === 0 && (
                              <tr><td colSpan={4} className="text-center py-4 small" style={{ color: '#a0b3c6' }}>No active open revolving lines processed.</td></tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Tab>

                    {/* TAB: INQUIRIES */}
                    <Tab eventKey="inquiries" title="🔎 Inquiry Velocity Log">
                      <div className="border rounded-4 p-0 overflow-hidden mt-2 mb-4" style={{ backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.1)' }}>
                        <div className="p-3 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                          <h6 className="fw-bold text-white mb-1">Bureau Inquiry Audit Roll</h6>
                          <p className="mb-0 small" style={{ color: '#a0b3c6' }}>Audit window applying a strict <strong style={{ color: '#7bbad1' }}>{settings.inquiryMonths} Month</strong> velocity corridor.</p>
                        </div>
                        <Table responsive hover className="dark-table align-middle text-start small">
                          <thead className="text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.7rem' }}>
                            <tr>
                              <th className="ps-4 py-3">Inbound Inquirer</th><th>Date</th><th>Bureau</th><th className="pe-4 text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailedInquiriesLog.map((inq, idx) => (
                              <tr key={idx}>
                                <td className="ps-4 fw-bold text-white">{inq.creditor || "Unknown"}</td>
                                <td className="font-monospace" style={{ color: '#a0b3c6' }}>{inq.date || "Unknown"}</td>
                                <td className="fw-medium font-monospace text-uppercase text-white">{inq.bureau || "Unknown"}</td>
                                <td className="pe-4 text-center">
                                  <Badge bg={inq.recent ? "danger" : "secondary"} className="text-uppercase font-monospace" style={{fontSize:'0.65rem'}}>
                                    {inq.recent ? `Recent${inq.ageLabel}` : "Historic"}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                            {detailedInquiriesLog.length === 0 && (
                              <tr><td colSpan={4} className="text-center py-4 small" style={{ color: '#a0b3c6' }}>No hard inquiries identified.</td></tr>
                            )}
                          </tbody>
                        </Table>
                      </div>
                    </Tab>

                    {/* TAB: CREDIT AGE */}
                    <Tab eventKey="age" title="⏳ Credit Age Matrix">
                      {ageMetrics ? (
                          <div className="mt-4 text-start">
                             <div className="d-flex align-items-center justify-content-between mb-3">
                                 <h6 className="fw-bold mb-0 text-white">Credit Age Details</h6>
                                 <Badge bg="light" className="text-dark shadow-sm px-3 py-2 rounded-pill">
                                     Oldest: {formatAge(ageMetrics.oldestMonths)}
                                 </Badge>
                             </div>
                             
                             <div className="rounded-3 shadow-sm overflow-hidden border mb-4" style={{ borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                                 <div className="p-4 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                                     <h6 className="fw-bold mb-1" style={{color: '#a0b3c6'}}><i className="bi bi-clock-history me-2"></i>Average Age</h6>
                                     <h2 className="fw-bolder mb-0 display-4 text-white" style={{letterSpacing: '-2px'}}>
                                         {formatAge(ageMetrics.averageMonths)}
                                     </h2>
                                     <p className="small mb-4" style={{color: '#a0b3c6'}}>Calculated across all FICO accounts (Open & Closed)</p>

                                     <div className="position-relative mb-4 mt-2" style={{ height: '30px' }}>
                                         <div className="position-absolute" style={{
                                             top: '-8px',
                                             left: `${Math.min(Math.max(getCaretPosition(ageMetrics.averageMonths), 2), 98)}%`,
                                             transform: 'translateX(-50%)',
                                             transition: 'left 0.5s ease',
                                             zIndex: 2
                                         }}>
                                             <i className="bi bi-caret-down-fill fs-4 text-white" style={{lineHeight: 0}}></i>
                                         </div>
                                         <div className="d-flex w-100 position-absolute shadow-sm" style={{ bottom: '0', height: '14px', borderRadius: '4px', overflow: 'hidden' }}>
                                             <div style={{width: '25%', backgroundColor: '#dc3545'}}></div>
                                             <div style={{width: '25%', backgroundColor: '#ffc107'}}></div>
                                             <div style={{width: '25%', backgroundColor: '#20c997'}}></div>
                                             <div style={{width: '25%', backgroundColor: '#198754'}}></div>
                                         </div>
                                     </div>

                                     <p className="small fw-bold mb-0 text-white text-center">
                                         {ageMetrics.rating} • {ageMetrics.impact} impact
                                     </p>
                                 </div>

                                 <div className="p-4 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.1) !important', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                                     <h6 className="fw-bold text-white mb-3">All Accounts ({ageMetrics.accounts.length})</h6>
                                     <div style={{maxHeight: '160px', overflowY: 'auto'}} className="pe-2 custom-scrollbar">
                                         {ageMetrics.accounts.map((acct, idx) => (
                                             <div key={idx} className="d-flex justify-content-between align-items-center py-2 border-bottom" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                                                 <span className="fw-bold small text-white text-truncate pe-3" style={{maxWidth: '70%'}}>
                                                    <i className="bi bi-credit-card-2-front text-muted me-2"></i>{acct.name}
                                                 </span>
                                                 <span className="small fw-bold text-white text-nowrap">{formatAge(acct.months)}</span>
                                             </div>
                                         ))}
                                         {ageMetrics.accounts.length === 0 && <span className="small text-muted">No accounts found.</span>}
                                     </div>
                                 </div>
                             </div>
                          </div>
                      ) : (
                        <div className="text-center py-4 border rounded-4 small mt-4" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)', color: '#a0b3c6' }}>No age matrices compiled yet.</div>
                      )}
                    </Tab>
                  </Tabs>

                  <div className="d-grid mt-4 pt-4 border-top" style={{ borderColor: 'rgba(255,255,255,0.1) !important' }}>
                      <Button size="lg" className="btn-vivid-blue py-3" onClick={saveLeadAndResults} disabled={savingLead}>
                          {savingLead ? <Spinner size="sm" className="me-2" /> : <i className="bi bi-hdd-network me-2"></i>}
                          {savingLead ? "Securing Your File..." : "Save My Results & Continue"}
                      </Button>
                  </div>
                </div>

                {/* OVERLAY FOR PAYWALL/LIMIT MET */}
                {isLockedPreview && (
                    <div className="position-absolute w-100 h-100 d-flex flex-column align-items-center justify-content-center text-center px-2" style={{ top: '0', zIndex: 10 }}>
                        <Card className="shadow-lg p-4 p-md-5 rounded-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', color: '#000000', maxWidth: '500px', boxShadow: '0 15px 45px rgba(0,0,0,0.12)' }}>
                            <h3 className="fw-bold mb-2" style={{ color: '#000000', letterSpacing: '-0.5px' }}>
                                🚀 Ready to Unlock Full Partner Access?
                            </h3>
                            <p className="small mb-4" style={{ color: '#333333', lineHeight: '1.6', fontWeight: '500' }}>
                                You've reached your preview limit. The HPC™ Funding Eligibility Scanner is designed for approved enterprise partners who require deep diagnostic reporting.
                            </p>
                            
                            <Stack gap={2}>
                                <Button 
                                    size="lg"
                                    className="fw-bold w-100 py-3 rounded-3 border-0 shadow-sm" 
                                    style={{ backgroundColor: '#002855', color: '#ffffff' }}
                                    onClick={() => window.open('https://web.hiddenpartnercloud.com/schedule-call', '_blank')}
                                >
                                    Apply for HPC™ Partner Access
                                </Button>
                            </Stack>
                        </Card>
                    </div>
                )}
              </div>
            )}

            {/* SCREEN 7: SUCCESS */}
            {step === "success" && (
              <div className="text-center py-5 animate-fade-in text-white">
                <i className="bi bi-check-circle-fill text-success display-1 mb-4 d-block shadow-sm"></i>
                <h3 className="fw-bold mb-3">You're All Set!</h3>
                <p style={{ color: '#a0b3c6' }}>Your details and eligibility report have been securely saved. Please check your email and mobile device for your access link and next steps.</p>
              </div>
            )}

          </Card.Body>
        </Card>
      )}
    </div>
  );
}