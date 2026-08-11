import React, { useState } from "react";
import { Card, Button, Spinner, ProgressBar, Row, Col, Alert, Form, Badge, Stack } from "react-bootstrap";
import { calculateFundingEligibility } from "../../../utils/funderRules";
import { parseSmartCredit } from "../../../utils/parseSmartCredit"; 
import { supabase } from "../../../supabaseClient";
import { useToast } from "../ui/ToastNotifier";

const generateId = () => Math.random().toString(36).substr(2, 9);
const addId = (item) => ({
    ...item,
    id: item.id || generateId(), 
    classification: item.classification || 'non-linked' 
});

// --- HELPER: FICO STANDARD CREDIT AGE CALCULATION ---
const calculateAgeMetrics = (accounts) => {
    if (!accounts || !accounts.length) return null;

    // FICO Standard: Include ALL standard tradelines (Open & Closed)
    const ageAccts = accounts.filter(a => !a.is_active_collection);

    if (!ageAccts.length) return { averageMonths: 0, oldestMonths: 0, rating: "Needs work", impact: "High", accounts: [] };

    const now = new Date();
    let totalMonths = 0;
    let oldestMonths = 0;
    const validAccts = [];

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
                validAccts.push({ name: name, months: finalMonths });
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

// 👇 FIXED: Added the missing caret position calculator back in! 👇
const getCaretPosition = (months) => {
    if (months < 60) return (months / 60) * 25;
    if (months < 84) return 25 + ((months - 60) / 24) * 25;
    if (months < 108) return 50 + ((months - 84) / 24) * 25;
    return 75 + (Math.min(months - 108, 48) / 48) * 25; 
};

export default function EmbeddableEligibilityChecker() {
  const { addToast } = useToast();
  const [step, setStep] = useState("connecting"); 
  const [errorMsg, setErrorMsg] = useState("");
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [ageMetrics, setAgeMetrics] = useState(null); 

  const [provider, setProvider] = useState("SmartCredit");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [securityWord, setSecurityWord] = useState("");
  
  const [fetchingReport, setFetchingReport] = useState(false);
  const [retryCount, setRetryCount] = useState(0); 

  const [isLockedPreview, setIsLockedPreview] = useState(false);

  // --- Lead Form State ---
  const [leadName, setLeadName] = useState("");
  const [leadEmail, setLeadEmail] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const [submittingLead, setSubmittingLead] = useState(false);

  const settings = { inquiryMonths: 6, maxInqCount: 2, maxUtil: 35, minAccts: 5 };

  // --- FETCH & ANALYZE ---
  const submitCredentials = async (e) => {
      e.preventDefault();
      setFetchingReport(true);
      setErrorMsg("");
      setRetryCount(0);

      try {
          let cleanParsedData = null;
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

                      const root = Array.isArray(anJson) ? anJson[0] : anJson;
                      const isRaw = root.BundleComponents || root.report?.BundleComponents;

                      if (isRaw) {
                          cleanParsedData = parseSmartCredit(root);
                      } else {
                          cleanParsedData = root.pdfData || root;

                          let inqs = cleanParsedData.inquiries || cleanParsedData.Inquiries || [];
                          if (!Array.isArray(inqs)) {
                              inqs = [ ...(inqs.EX || []), ...(inqs.TU || []), ...(inqs.EQ || []) ];
                          }
                          cleanParsedData.inquiries = inqs;
                          
                          cleanParsedData.negatives = cleanParsedData.negatives || [];
                          cleanParsedData.public_records = cleanParsedData.public_records || [];
                          cleanParsedData.summary = cleanParsedData.summary || { utilization_pct: cleanParsedData.utilization || 0 };
                          cleanParsedData.accounts = (cleanParsedData.accounts || []).map(a => ({
                              ...a,
                              is_au: a.is_au || false,
                              is_revolving: a.is_revolving || String(a.type || "").toLowerCase().includes("revolving")
                          }));
                      }

                  } else if (provider === "IdentityIQ") {
                      const res = await fetch("https://backend-4uir.onrender.com/loginidiq", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ email: username, password, pin: securityWord, ssn: "" }),
                      });

                      const json = await res.json();
                      if (!res.ok || !json.success) throw new Error(json.error || `${provider} connection failed.`);
                      
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
                      throw new Error(err.message.includes("coming soon") ? err.message : "Connection timed out. Please verify credentials.");
                  }
                  await new Promise(res => setTimeout(res, 5000));
              }
          }

          setStep("analyzing");
          await new Promise(r => setTimeout(r, 1000));

          // Run Engine on Cleaned Data
          const analysis = calculateFundingEligibility(cleanParsedData, settings);
          const ageCalculations = calculateAgeMetrics(cleanParsedData.accounts);

          // Calculate Dynamic Inquiries Based on Settings
          const cutoffDate = new Date();
          cutoffDate.setMonth(cutoffDate.getMonth() - settings.inquiryMonths);
          let recentCount = 0;
          (cleanParsedData.inquiries || []).forEach(inq => {
              if (inq.date && new Date(inq.date) >= cutoffDate) recentCount++;
          });

          analysis.metrics.inquiries_total = (cleanParsedData.inquiries || []).length;
          analysis.metrics.inquiries_recent = recentCount;

          // Override status logic based on sliders/settings
          let newStatus = "GREEN";
          if (analysis.metrics.utilization > settings.maxUtil) newStatus = "RED";
          if (analysis.metrics.revolving_accounts < settings.minAccts) newStatus = newStatus === "RED" ? "RED" : "YELLOW";
          if (recentCount > settings.maxInqCount) newStatus = "RED";
          
          analysis.status = newStatus;
          analysis.reasons = analysis.reasons.filter(r => !r.text.toLowerCase().includes('inquir'));
          
          if (recentCount > settings.maxInqCount) {
              analysis.reasons.push({ status: "RED", text: `Too many recent inquiries (${recentCount} total across bureaus in last ${settings.inquiryMonths} months). Max allowed: ${settings.maxInqCount}.` });
          } else {
              analysis.reasons.push({ status: "GREEN", text: `Inquiries are within limits (${recentCount} total across bureaus in last ${settings.inquiryMonths} months).` });
          }

          setEligibilityResult(analysis);
          setAgeMetrics(ageCalculations);

          setStep("lead_capture");

      } catch (err) {
          console.error("Import Error:", err);
          setErrorMsg(err.message || "Failed to pull credit report. Check your credentials.");
          setStep("connecting");
      } finally {
          setFetchingReport(false);
          setRetryCount(0);
      }
  };

  // --- SAVE LEAD DETAILS TO DATABASE ---
  const submitLeadForm = async (e) => {
      e.preventDefault();
      setSubmittingLead(true);
      setErrorMsg("");

      try {
          const queryParams = new URLSearchParams(window.location.search);
          const contextualCompanyId = queryParams.get("partner") || "e33ef166-d381-458e-a5c8-ac77557d5ea2"; 
          const cleanedEmail = leadEmail.toLowerCase().trim();

          const { count: existingEmailRows, error: countError } = await supabase
              .from("company_leads")
              .select("*", { count: "exact", head: true })
              .eq("company_id", contextualCompanyId)
              .eq("email", cleanedEmail);

          if (countError) throw countError;

          const shouldLock = existingEmailRows >= 3;
          setIsLockedPreview(shouldLock);

          const leadPayload = {
              full_name: leadName,
              email: cleanedEmail,
              phone: leadPhone,
              monitoring_username: username,
              computed_status: eligibilityResult?.status || "UNKNOWN",
              company_id: contextualCompanyId
          };

          const { error: dbError } = await supabase
              .from('company_leads')
              .insert([leadPayload]);

          if (dbError) throw dbError;

          setStep("results");
      } catch (err) {
          console.error("Lead submission error:", err);
          setErrorMsg("Failed to submit details. Please try again.");
          addToast({ title: "Submission Failed", message: "Please try again.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      } finally {
          setSubmittingLead(false);
      }
  };

  const handleResetRequest = () => {
      if (isLockedPreview) {
          addToast({ title: "Preview Locked", message: "Activate your full corporate partner profile access panel to continue pulling custom files.", variant: "warning", icon: "bi-lock-fill" });
      } else {
          resetTool();
      }
  };

  const resetTool = () => {
      setStep("connecting");
      setEligibilityResult(null);
      setAgeMetrics(null);
      setUsername("");
      setPassword("");
      setSecurityWord("");
      setErrorMsg("");
  };

  return (
    <div id="standalone-eligibility-checker" className="w-100 d-flex justify-content-center align-items-center p-2 p-md-3" style={{ minHeight: '100vh', backgroundColor: '#ffffff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      <Card className="shadow-lg w-100 mx-auto custom-checker-card" style={{ maxWidth: '650px', position: "relative" }}>
        
        <div className="text-center py-4 px-3 border-bottom" style={{ borderColor: 'rgba(123, 186, 209, 0.2)' }}>
            <h5 className="fw-bold mb-0 primary-text">
                <i className="bi bi-bank2 me-2 accent-text"></i> Quick Eligibility Checker
            </h5>
        </div>

        <Card.Body className="p-4 p-md-5" style={{ minHeight: '400px' }}>
          {errorMsg && (
            <div className="custom-alert p-3 rounded-3 mb-4 fw-bold small text-center">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>{errorMsg}
            </div>
          )}

          {/* SCREEN 1: INPUT CREDENTIALS */}
          {step === "connecting" && (
            <div className="py-2 animate-fade-in">
              <div className="custom-alert p-3 rounded-3 text-center mb-4 small fw-bold">
                <i className="bi bi-shield-lock me-2 accent-text"></i> Enter client credentials to securely check funding status.
              </div>
              
              <Form onSubmit={submitCredentials}>
                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold primary-text text-uppercase tracking-wider">Provider</Form.Label>
                      <Form.Select value={provider} onChange={(e) => setProvider(e.target.value)} disabled={fetchingReport} className="custom-input shadow-sm py-2">
                          <option value="SmartCredit">SmartCredit</option>
                          <option value="IdentityIQ">IdentityIQ</option>
                      </Form.Select>
                  </Form.Group>

                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold primary-text text-uppercase tracking-wider">Username / Email</Form.Label>
                      <Form.Control type="text" required value={username} onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))} disabled={fetchingReport} className="custom-input shadow-sm py-2" placeholder="Client's email address" />
                  </Form.Group>

                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold primary-text text-uppercase tracking-wider">Password</Form.Label>
                      <Form.Control type="password" required value={password} onChange={(e) => setPassword(e.target.value.replace(/\s+/g, ""))} disabled={fetchingReport} className="custom-input shadow-sm py-2" placeholder="••••••••"/>
                  </Form.Group>

                  {provider !== "SmartCredit" && (
                      <Form.Group className="mb-4">
                          <Form.Label className="small fw-bold primary-text text-uppercase tracking-wider">PIN / Secret Word</Form.Label>
                          <Form.Control type="text" value={securityWord} onChange={(e) => setSecurityWord(e.target.value)} disabled={fetchingReport} placeholder="If required by provider" className="custom-input shadow-sm py-2" />
                      </Form.Group>
                  )}

                  <Button type="submit" size="lg" className="w-100 btn-custom mt-4 py-3 shadow-sm" disabled={fetchingReport || !username || !password}>
                      {fetchingReport ? (
                          <><Spinner size="sm" className="me-2" /> {retryCount > 0 ? `Retrying... (Attempt ${retryCount + 1}/3)` : "Importing Report..."}</>
                      ) : "Run Eligibility Check"}
                  </Button>
              </Form>
            </div>
          )}

          {/* SCREEN 2: ANALYZING */}
          {step === "analyzing" && (
            <div className="text-center py-5 animate-fade-in d-flex flex-column align-items-center justify-content-center h-100">
              <Spinner animation="border" style={{ width: '3rem', height: '3rem', color: '#002855' }} />
              <h5 className="mt-4 fw-bold primary-text">Running Funding Algorithm...</h5>
              <p className="small muted-primary">Checking utilization, inquiry counts, and equity signals.</p>
            </div>
          )}

          {/* SCREEN 3: LEAD CAPTURE INTERCEPT FORM */}
          {step === "lead_capture" && (
            <div className="py-2 animate-fade-in">
              <div className="custom-alert p-3 rounded-3 text-center mb-4 small fw-bold">
                  <i className="bi bi-person-badge me-2 accent-text"></i> Analysis Complete! Enter your details below to view the results.
              </div>
              
              <Form onSubmit={submitLeadForm}>
                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold primary-text text-uppercase tracking-wider">Full Name</Form.Label>
                      <Form.Control type="text" required value={leadName} onChange={(e) => setLeadName(e.target.value)} className="custom-input shadow-sm py-2" placeholder="Your name" />
                  </Form.Group>

                  <Form.Group className="mb-3">
                      <Form.Label className="small fw-bold primary-text text-uppercase tracking-wider">Email Address</Form.Label>
                      <Form.Control type="email" required value={leadEmail} onChange={(e) => setLeadEmail(e.target.value)} className="custom-input shadow-sm py-2" placeholder="your@email.com" />
                  </Form.Group>

                  <Form.Group className="mb-4">
                      <Form.Label className="small fw-bold primary-text text-uppercase tracking-wider">Phone Number</Form.Label>
                      <Form.Control type="tel" required value={leadPhone} onChange={(e) => setLeadPhone(e.target.value)} className="custom-input shadow-sm py-2" placeholder="(555) 555-5555" />
                  </Form.Group>

                  <Button type="submit" size="lg" className="w-100 btn-custom py-3 shadow-sm" disabled={submittingLead}>
                      {submittingLead ? <Spinner size="sm" /> : "Submit Details"}
                  </Button>
              </Form>
            </div>
          )}

          {/* SCREEN 4: COMBINED RESULTS */}
          {step === "results" && eligibilityResult && (
            <div className="animate-fade-in position-relative">
              
              <div className="text-center mb-4 p-4 rounded-4 shadow-sm" style={{ border: '1px solid #7bbad1', backgroundColor: 'rgba(123, 186, 209, 0.1)' }}>
                <h3 className="fw-bold mb-1 primary-text" style={{ letterSpacing: '-0.5px' }}>
                  {eligibilityResult.status === "GREEN" && <i className="bi bi-check-circle-fill me-2 text-success"></i>}
                  {eligibilityResult.status === "YELLOW" && <i className="bi bi-exclamation-triangle-fill me-2 text-warning"></i>}
                  {eligibilityResult.status === "RED" && <i className="bi bi-shield-lock-fill me-2 text-danger"></i>}
                  {eligibilityResult.status === "GREEN" ? "ELIGIBLE FOR FUNDING" : eligibilityResult.status === "YELLOW" ? "NEEDS REVIEW" : "INELIGIBLE / HIGH RISK"}
                </h3>
              </div>

              <div style={{
                  filter: isLockedPreview ? "blur(7px)" : "none",
                  opacity: isLockedPreview ? 0.2 : 1,
                  pointerEvents: isLockedPreview ? "none" : "auto",
                  userSelect: isLockedPreview ? "none" : "auto",
                  transition: "all 0.3s ease"
              }}>
                <h6 className="fw-bold mb-3 primary-text">Profile Breakdown</h6>
                <Row className="g-3 mb-4">
                  <Col xs={6}>
                    <div className="p-3 metric-box h-100 d-flex flex-column justify-content-between">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="small fw-bold text-uppercase muted-primary">Revolving Util.</span>
                        <i className={`bi bi-pie-chart-fill fs-5 ${eligibilityResult.metrics.utilization > settings.maxUtil ? 'text-danger' : 'accent-text'}`}></i>
                      </div>
                      <div>
                        <div className={`fw-bold fs-3 mb-1 ${eligibilityResult.metrics.utilization > settings.maxUtil ? 'text-danger' : 'primary-text'}`} style={{ letterSpacing: '-1px' }}>
                          {eligibilityResult.metrics.utilization}%
                        </div>
                        <div className="custom-progress-bg" style={{ height: '4px' }}>
                          <div className="custom-progress-bar" style={{ width: `${Math.min(eligibilityResult.metrics.utilization, 100)}%`, backgroundColor: eligibilityResult.metrics.utilization > settings.maxUtil ? '#dc3545' : '#7bbad1' }}></div>
                        </div>
                      </div>
                    </div>
                  </Col>
                  
                  <Col xs={6}>
                    <div className="p-3 metric-box h-100 d-flex flex-column justify-content-between">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="small fw-bold text-uppercase muted-primary">Open Revolving</span>
                        <i className={`bi bi-credit-card-2-front-fill fs-5 ${eligibilityResult.metrics.revolving_accounts < settings.minAccts ? 'text-warning' : 'accent-text'}`}></i>
                      </div>
                      <div>
                        <div className={`fw-bold fs-3 mb-1 ${eligibilityResult.metrics.revolving_accounts < settings.minAccts ? 'text-warning' : 'primary-text'}`} style={{ letterSpacing: '-1px' }}>
                          {eligibilityResult.metrics.revolving_accounts}
                        </div>
                        <small className="fw-medium muted-primary" style={{fontSize:'0.7rem'}}>Active Accounts</small>
                      </div>
                    </div>
                  </Col>

                  <Col xs={6}>
                    <div className="p-3 metric-box h-100 d-flex flex-column justify-content-between">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="small fw-bold text-uppercase muted-primary">Inquiries</span>
                        <i className={`bi bi-search fs-5 ${eligibilityResult.metrics.inquiries_recent > settings.maxInqCount ? 'text-danger' : 'accent-text'}`}></i>
                      </div>
                      <div>
                        <div className={`fw-bold fs-3 mb-1 ${eligibilityResult.metrics.inquiries_recent > settings.maxInqCount ? 'text-danger' : 'primary-text'}`} style={{ letterSpacing: '-1px' }}>
                          {eligibilityResult.metrics.inquiries_recent}
                        </div>
                        <small className="fw-medium muted-primary" style={{fontSize:'0.7rem'}}>Last {settings.inquiryMonths} months</small>
                      </div>
                    </div>
                  </Col>

                  <Col xs={6}>
                    <div className="p-3 metric-box h-100 d-flex flex-column justify-content-between">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <span className="small fw-bold text-uppercase muted-primary">Equity Signal</span>
                        <i className="bi bi-house-door-fill fs-5 accent-text"></i>
                      </div>
                      <div>
                        <div className="fw-bold fs-3 primary-text mb-1" style={{ letterSpacing: '-1px' }}>
                          {eligibilityResult.metrics.mortgage_seasoning > 0 ? `${eligibilityResult.metrics.mortgage_seasoning} Yr` : "None"}
                        </div>
                        <small className="fw-medium muted-primary" style={{fontSize:'0.7rem'}}>Mortgage Seasoning</small>
                      </div>
                    </div>
                  </Col>
                </Row>

                <h6 className="fw-bold primary-text mb-3">Detailed Feedback</h6>
                <div className="metric-box overflow-hidden mb-4">
                  <ul className="list-group list-group-flush mb-0">
                    {eligibilityResult.reasons.map((r, i) => {
                      let statusColorClass = "accent-text";
                      if(r.status === "RED") statusColorClass = "text-danger";
                      if(r.status === "YELLOW") statusColorClass = "text-warning";
                      if(r.status === "GREEN") statusColorClass = "text-success";

                      return (
                        <li key={i} className="list-group-item bg-transparent py-3 px-3 d-flex align-items-start gap-3" style={{ borderBottom: i !== eligibilityResult.reasons.length - 1 ? '1px solid rgba(123, 186, 209, 0.2)' : 'none' }}>
                          <i className={`bi bi-record-circle-fill ${statusColorClass} mt-1`} style={{fontSize:'0.6rem'}}></i>
                          <span className="fw-medium primary-text" style={{ fontSize: '0.85rem' }}>{r.text}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                {ageMetrics && (
                  <div className="mt-5 text-start">
                     <div className="d-flex align-items-center justify-content-between mb-3">
                         <h6 className="fw-bold mb-0 primary-text">Credit Age Details</h6>
                         <Badge bg="light" className="text-dark border shadow-sm px-3 py-2 rounded-pill">
                             Oldest: {formatAge(ageMetrics.oldestMonths)}
                         </Badge>
                     </div>
                     
                     <div className="metric-box mb-3 overflow-hidden">
                         <div className="p-4 border-bottom" style={{ borderColor: 'rgba(123, 186, 209, 0.3) !important' }}>
                             <h6 className="fw-bold muted-primary mb-1"><i className="bi bi-clock-history me-2"></i>Credit Age</h6>
                             <h2 className="fw-bolder mb-0 display-4" style={{letterSpacing: '-2px', color: '#002855'}}>
                                 {formatAge(ageMetrics.averageMonths)}
                             </h2>
                             <p className="small muted-primary mb-4">Average age of open accounts</p>

                             <div className="position-relative mb-4 mt-2" style={{ height: '30px' }}>
                                 <div className="position-absolute" style={{
                                     top: '-8px',
                                     left: `${Math.min(Math.max(getCaretPosition(ageMetrics.averageMonths), 2), 98)}%`,
                                     transform: 'translateX(-50%)',
                                     transition: 'left 0.5s ease',
                                     zIndex: 2
                                 }}>
                                     <i className="bi bi-caret-down-fill fs-4" style={{color: '#002855', lineHeight: 0}}></i>
                                 </div>
                                 <div className="d-flex w-100 position-absolute shadow-sm" style={{ bottom: '0', height: '14px', borderRadius: '4px', overflow: 'hidden' }}>
                                     <div style={{width: '25%', backgroundColor: '#e05c2b'}}></div>
                                     <div style={{width: '25%', backgroundColor: '#f2c94c'}}></div>
                                     <div style={{width: '25%', backgroundColor: '#6fcf97'}}></div>
                                     <div style={{width: '25%', backgroundColor: '#219653'}}></div>
                                 </div>
                             </div>

                             <p className="small fw-bold mb-3" style={{color: '#002855'}}>
                                 {ageMetrics.rating} • {ageMetrics.impact} impact
                             </p>

                             <div className="small muted-primary mb-2">
                                 <div className="d-flex justify-content-between mb-2"><span className="d-flex align-items-center"><span style={{width:'10px', height:'10px', borderRadius:'50%', backgroundColor:'#219653'}} className="me-2"></span>Excellent</span> <span>9+ years</span></div>
                                 <div className="d-flex justify-content-between mb-2"><span className="d-flex align-items-center"><span style={{width:'10px', height:'10px', borderRadius:'50%', backgroundColor:'#6fcf97'}} className="me-2"></span>Good</span> <span>7-8 years</span></div>
                                 <div className="d-flex justify-content-between mb-2"><span className="d-flex align-items-center"><span style={{width:'10px', height:'10px', borderRadius:'50%', backgroundColor:'#f2c94c'}} className="me-2"></span>Fair</span> <span>5-6 years</span></div>
                                 <div className="d-flex justify-content-between mb-0"><span className="d-flex align-items-center"><span style={{width:'10px', height:'10px', borderRadius:'50%', backgroundColor:'#e05c2b'}} className="me-2"></span>Needs work</span> <span>0-4 years</span></div>
                             </div>
                         </div>

                         <div className="p-4 border-bottom" style={{ borderColor: 'rgba(123, 186, 209, 0.3) !important' }}>
                             <h6 className="fw-bold primary-text mb-3">Open Accounts ({ageMetrics.accounts.length})</h6>
                             <div style={{maxHeight: '160px', overflowY: 'auto'}} className="pe-2">
                                 {ageMetrics.accounts.map((acct, idx) => (
                                     <div key={idx} className="d-flex justify-content-between align-items-center py-2 border-bottom border-light">
                                         <span className="fw-bold small primary-text text-truncate pe-3" style={{maxWidth: '70%'}}>
                                            <i className="bi bi-credit-card-2-front text-muted me-2"></i>{acct.name}
                                         </span>
                                         <span className="small fw-bold primary-text text-nowrap">{formatAge(acct.months)}</span>
                                     </div>
                                 ))}
                             </div>
                         </div>

                         <div className="p-4 bg-white">
                             <h6 className="fw-bold primary-text mb-3">What to know</h6>
                             <ol className="small muted-primary ps-3 mb-0" style={{lineHeight: '1.6'}}>
                                 <li className="mb-2">If you're paring down your accounts, <strong>don't close your oldest credit card</strong> — it's what gives you a long credit history.</li>
                                 <li>Sometimes issuers will close an old account that never gets used. Use an old card occasionally to prevent a potential score drop.</li>
                             </ol>
                         </div>
                     </div>
                  </div>
                )}
              </div>

              {isLockedPreview && (
                  <div className="position-absolute w-100 d-flex flex-column align-items-center justify-content-center text-center px-2" style={{ top: '60px', zIndex: 10, minHeight: '340px' }}>
                      <Card className="shadow-lg p-4 rounded-4" style={{ backgroundColor: '#ffffff', border: '1px solid #e0e0e0', color: '#000000', maxWidth: '480px', boxShadow: '0 15px 45px rgba(0,0,0,0.12)' }}>
                          <h4 className="fw-bold mb-2" style={{ color: '#000000', letterSpacing: '-0.3px' }}>
                              🚀 Ready to Unlock Full Partner Access?
                          </h4>
                          <p className="small mb-4" style={{ color: '#333333', lineHeight: '1.5', fontWeight: '400' }}>
                              You've reached your preview limit. The HPC™ Funding Eligibility Scanner is designed for approved enterprise partners who require deep diagnostic reporting.
                          </p>
                          
                          <Row className="g-2 text-start small mb-4 px-1" style={{ color: '#000000', fontWeight: '600' }}>
                              <Col xs={6}><i className="bi bi-check-circle-fill me-2" style={{ color: '#000000' }}></i> Exact Bureau Data</Col>
                              <Col xs={6}><i className="bi bi-check-circle-fill me-2" style={{ color: '#000000' }}></i> Funding Pathways</Col>
                              <Col xs={6}><i className="bi bi-check-circle-fill me-2" style={{ color: '#000000' }}></i> Action Sequences</Col>
                              <Col xs={6}><i className="bi bi-check-circle-fill me-2" style={{ color: '#000000' }}></i> White-Label Access</Col>
                          </Row>

                          <Stack gap={2}>
                              <Button 
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

              {/* LOWER TOOL CONTROL BAR */}
              {!isLockedPreview && (
                  <div className="d-grid pt-2">
                      <Button className="btn-custom-outline py-3 shadow-sm" onClick={handleResetRequest}>
                          <i className="bi bi-arrow-counterclockwise me-2"></i> Check Another Client
                      </Button>
                  </div>
              )}
            </div>
          )}

        </Card.Body>
      </Card>
    </div>
  );
}