import React from "react";
import { Container, Row, Col, Stack, Badge, Card } from "react-bootstrap";

export default function FundingBlueprintReport({ 
  eligibilityResult, 
  ageMetrics, 
  scores, 
  clientName = "SAMPLE CLIENT", 
  reportId = "HPC-99412",
  companyName = "HIDDEN PARTNER CLOUD",
  companyPhone = "(919) 300-5202",
  companyEmail = "INFO@HIDDENPARTNERCLOUD.COM",
  companyWebsite = "HIDDENPARTNERCLOUD.COM",
  companyLogo = null,
  printMode = false // 👈 NEW PROP ALLOWS PDF ENGINE TO PAGINATE
}) {
  const status = eligibilityResult?.status || "RED"; 
  const utilization = eligibilityResult?.metrics?.utilization || 0;
  const recentInquiries = eligibilityResult?.metrics?.inquiries_recent || 0;
  
  const derogatories = (eligibilityResult?.metrics?.derogatories || 0) + (eligibilityResult?.metrics?.bankruptcies || 0);
  const revolvingAccounts = eligibilityResult?.metrics?.revolving_accounts || 0;
  
  const totalAccounts = ageMetrics?.accounts?.length || 0;
  const avgAgeMonths = ageMetrics?.averageMonths || 0;
  const oldestAgeMonths = ageMetrics?.oldestMonths || 0;

  const expScore = scores?.exp || "N/A";
  const tuScore = scores?.tu || "N/A";
  const eqScore = scores?.eq || "N/A";

  const runTradelineEngine = () => {
    let needAU = false;
    let needPrimary = false;
    let auAgeNeeded = "5+ years";
    let auLimitNeeded = "$10,000+";
    let auQuantity = 0;
    
    const reasons = [];
    const avgAgeYears = avgAgeMonths / 12;

    if (avgAgeYears < 2) {
      needAU = true; auAgeNeeded = "5+ years"; auQuantity = 2;
      reasons.push("Average account age is under 2 years.");
    } else if (avgAgeYears >= 2 && avgAgeYears <= 4) {
      needAU = true; auAgeNeeded = "7+ years"; auQuantity = 1;
      reasons.push("Average account age falls within the restricted 2–4 year window.");
    } else if (avgAgeYears > 4 && avgAgeYears <= 7 && revolvingAccounts < 4) {
      needAU = true; auAgeNeeded = "10+ years"; auQuantity = 1;
      reasons.push("Average account age is 4–7 years, but the profile has thin account characteristics.");
    } else if (avgAgeYears > 7 && revolvingAccounts < 3) {
      needAU = true; auAgeNeeded = "10+ years"; auQuantity = 1;
      reasons.push("File history is mature, but the client has very few active revolving accounts.");
    }

    if (revolvingAccounts < 4) {
      needPrimary = true;
      reasons.push("Client has fewer than 4 primary open revolving accounts on file.");
    }
    if (totalAccounts < 3) {
      needPrimary = true;
      reasons.push("Client has fewer than 3 total historical accounts established.");
    }

    let prioritizationNote = "";
    if (utilization > 30) {
      prioritizationNote = `Prioritize revolving balance payoffs immediately. High utilization (${utilization}%) acts as a major obstacle to underwriting access.`;
      reasons.push(`Utilization is critical at ${utilization}%. Balance reduction must take priority before adding lines.`);
    } else if (utilization > 10 && utilization <= 30) {
      prioritizationNote = `Recommend reducing outstanding balances beneath a 10% threshold before initiating funding applications.`;
    }

    const inquiryLimit = eligibilityResult?.criteria?.maxInqCount || 2;
    if (recentInquiries > inquiryLimit) {
      reasons.push(`Excessive velocity detected with ${recentInquiries} inquiries. Halt new applications and clear inquiries first.`);
    }

    if (derogatories > 0) {
      reasons.push(`${derogatories} active derogatory items or public markers are present, limiting immediate funding readiness.`);
    }

    let recommendationType = "None";
    if (needAU && needPrimary) recommendationType = "Both";
    else if (needAU) recommendationType = "AU";
    else if (needPrimary) recommendationType = "Primary";

    return {
      type: recommendationType,
      reasons: reasons.length ? reasons : ["Profile satisfies structural account depth benchmarks."],
      prioritizationNote,
      auCriteria: {
        age: auAgeNeeded, limit: auLimitNeeded, utilization: "Under 10%", history: "100% On-Time Payments", quantity: auQuantity
      }
    };
  };

  const tradeEngine = runTradelineEngine();
  const finalClientName = clientName !== "SAMPLE CLIENT" ? clientName : (eligibilityResult?.full_name || "SAMPLE CLIENT");

  const formatAgeText = (totalMonths) => {
    const yrs = Math.floor(totalMonths / 12);
    const mos = totalMonths % 12;
    if (yrs === 0) return `${mos} Mo`;
    return `${yrs} Yr ${mos} Mo`;
  };

  const getStatusConfig = () => {
    if (status === "GREEN") {
      return { 
        label: "LOW RISK", color: "#10b981", alertLabel: "EXCELLENT POSITION",
        summary: "Your credit application profile is optimally positioned for institutional funding paths due to low utilization thresholds, conservative inquiry velocity, and an established mix of primary accounts."
      };
    }
    if (status === "YELLOW") {
      return { 
        label: "MODERATE RISK", color: "#f59e0b", alertLabel: "NEEDS REVIEW",
        summary: "Your credit profile exhibits good foundational elements but contains structural parameters that require refinement. Minor elevated leverage thresholds or a thin primary history profile should be optimized."
      }; 
    }
    return { 
      label: "HIGH RISK", color: "#ef4444", alertLabel: "HIGH RISK",
      summary: `Your profile is not currently positioned for major capital allocations due to an elevated revolving utilization index of ${utilization}%, intense short-term inquiry velocities (${recentInquiries} application checks), or major derogatory items.`
    };
  };
  const statusConfig = getStatusConfig();

  const theme = {
    bgMain: "transparent",
    bgCard: "#1e293b",       
    headerBg: "#0f172a",     
    border: "#334155",       
    textMain: "#e2e8f0",     
    textMuted: "#94a3b8",    
    brightBlue: "#60a5fa",   
    success: "#34d399",      
    warning: "#fbbf24",      
    danger: "#f87171",       
  };

  // 👇 TELLS THE PDF RENDERER WHERE TO SPLIT THE PAGES 👇
  const blockAttr = printMode ? { "data-block": "true" } : {};

  return (
    <div id="hpc-funding-blueprint-report" className={`blueprint-report-root w-100 ${printMode ? 'p-0' : 'p-0 p-md-3'}`} style={{ backgroundColor: theme.bgMain, color: theme.textMain }}>
      {/* If printMode is active, we drop the outer border so chunks sit flushly on pages */}
      <Container fluid className={`blueprint-container p-0 ${printMode ? 'border-0' : 'border rounded shadow-sm'}`} style={{ borderColor: theme.border, backgroundColor: theme.bgMain }}>
        
        {/* ========================================== */}
        {/* CHUNK 1: HEADER & EXECUTIVE SUMMARY        */}
        {/* ========================================== */}
        <div {...blockAttr} className="print-chunk" style={{ pageBreakInside: "avoid" }}>
          
          <div className="blueprint-header p-3 d-flex flex-column flex-md-row justify-content-between align-items-center gap-2" style={{ backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
            <div className="d-flex align-items-center gap-3">
              {companyLogo && companyLogo !== "https://default-logo-url.png" ? (
                  <img src={companyLogo} alt="Company Logo" style={{ maxHeight: '45px', maxWidth: '200px', objectFit: 'contain' }} />
              ) : (
                  <i className="bi bi-cloud-check-fill blueprint-header-icon fs-1" style={{ color: theme.brightBlue }}></i>
              )}
              <div>
                <h4 className="blueprint-header-title fw-bold m-0 tracking-tight text-white text-uppercase">{companyName}</h4>
                <small className="blueprint-header-subtitle text-uppercase font-monospace tracking-widest d-block fw-bold" style={{ fontSize: "0.65rem", color: theme.textMuted }}>Automated Infrastructure System</small>
              </div>
            </div>
            <div className="text-center text-md-end">
              <h3 className="blueprint-header-right-title fw-bold m-0 text-white">FUNDING BLUEPRINT™</h3>
              <span className="blueprint-header-right-subtitle small tracking-wider d-block fw-bold" style={{ color: theme.textMuted }}>CREDIT ANALYSIS • FUNDING READINESS • ACTION PLAN</span>
            </div>
          </div>

          <div className="blueprint-meta-row px-4 py-2 d-flex flex-wrap justify-content-between align-items-center gap-2 text-uppercase font-monospace fw-bolder" style={{ fontSize: "0.8rem", backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.border}`, color: theme.textMuted }}>
            <div className="blueprint-meta-item"><i className="bi bi-person-fill me-1"></i> Client: <span className="text-white">{finalClientName}</span></div>
            <div className="blueprint-meta-item"><i className="bi bi-calendar3 me-1"></i> Date: <span className="text-white">{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span></div>
            <div className="blueprint-meta-item"><i className="bi bi-file-earmark-text-fill me-1"></i> Report ID: <span className="text-white">{reportId}</span></div>
          </div>

          <div className="blueprint-section-block p-3 p-md-4" style={{ borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.bgMain }}>
            <Row className="g-4">
              <Col lg={4} className="blueprint-right-divider border-end" style={{ borderColor: `${theme.border} !important` }}>
                <div className="section-title fw-bold text-uppercase mb-3" style={{ color: theme.brightBlue, fontSize: "1rem", letterSpacing: "1px" }}>Executive Snapshot</div>
                <div className="blueprint-snapshot-banner text-center p-3 rounded-3 mb-3 fw-bold d-flex flex-column align-items-center justify-content-center text-white shadow-sm" style={{ backgroundColor: statusConfig.color, color: status === "YELLOW" ? "#0f172a" : "#ffffff", minHeight: "110px" }}>
                  <i className="bi bi-shield-exclamation fs-2 mb-1"></i>
                  <div className="blueprint-snapshot-alert-lbl fw-bold fs-5">{statusConfig.alertLabel}</div>
                </div>
                <p className="blueprint-snapshot-desc small mb-0 lh-base fw-bold" style={{ fontSize: "0.85rem", color: theme.textMain }}>
                  {statusConfig.summary}
                </p>
              </Col>

              <Col lg={8}>
                <div className="section-title fw-bold text-uppercase mb-3" style={{ color: theme.brightBlue, fontSize: "1rem", letterSpacing: "1px" }}>Profile Overview</div>
                <Row className="g-2 mb-4 align-items-stretch">
                  <Col>
                    <div className="metric-card-box p-2 text-center border rounded shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                      <div className="metric-card-lbl small text-uppercase fw-bolder" style={{ fontSize: "0.65rem", color: theme.textMuted }}>Credit Scores</div>
                      <div className="d-flex justify-content-around align-items-center my-1 w-100 px-1">
                        <div className="text-center">
                          <div className="fw-bold text-white" style={{ fontSize: "0.95rem" }}>{expScore}</div>
                          <div style={{fontSize: "0.55rem", color: theme.textMuted}} className="fw-bold">EXP</div>
                        </div>
                        <div className="text-center">
                          <div className="fw-bold text-white" style={{ fontSize: "0.95rem" }}>{tuScore}</div>
                          <div style={{fontSize: "0.55rem", color: theme.textMuted}} className="fw-bold">TU</div>
                        </div>
                        <div className="text-center">
                          <div className="fw-bold text-white" style={{ fontSize: "0.95rem" }}>{eqScore}</div>
                          <div style={{fontSize: "0.55rem", color: theme.textMuted}} className="fw-bold">EQ</div>
                        </div>
                      </div>
                      <Badge bg="dark" className="font-monospace text-muted border w-100" style={{ fontSize: "0.6rem", borderColor: theme.border, backgroundColor: theme.headerBg }}>Actual</Badge>
                    </div>
                  </Col>
                  <Col>
                    <div className="metric-card-box p-2 text-center border rounded shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                      <div className="metric-card-lbl small text-uppercase fw-bolder" style={{ fontSize: "0.65rem", color: theme.textMuted }}>Utilization</div>
                      <div className="fw-bold fs-5 my-1" style={{ color: utilization > 35 ? theme.danger : theme.success }}>{utilization}%</div>
                      <Badge bg="dark" className="font-monospace text-muted border w-100" style={{ fontSize: "0.6rem", borderColor: theme.border, backgroundColor: theme.headerBg }}>{utilization > 35 ? "Critical" : "Optimal"}</Badge>
                    </div>
                  </Col>
                  <Col>
                    <div className="metric-card-box p-2 text-center border rounded shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                      <div className="metric-card-lbl small text-uppercase fw-bolder" style={{ fontSize: "0.65rem", color: theme.textMuted }}>Recent Inqs</div>
                      <div className="fw-bold fs-5 my-1" style={{ color: recentInquiries > 2 ? theme.danger : theme.success }}>{recentInquiries}</div>
                      <Badge bg="dark" className="font-monospace text-muted border w-100" style={{ fontSize: "0.6rem", borderColor: theme.border, backgroundColor: theme.headerBg }}>{recentInquiries > 2 ? "High Risk" : "Within Limit"}</Badge>
                    </div>
                  </Col>
                  <Col>
                    <div className="metric-card-box p-2 text-center border rounded shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                      <div className="metric-card-lbl small text-uppercase fw-bolder" style={{ fontSize: "0.65rem", color: theme.textMuted }}>Average Age</div>
                      <div className="metric-card-val fw-bold fs-5 my-1 text-white">{formatAgeText(avgAgeMonths)}</div>
                      <Badge bg="dark" className="font-monospace text-muted border w-100" style={{ fontSize: "0.6rem", borderColor: theme.border, backgroundColor: theme.headerBg }}>{avgAgeMonths < 60 ? "Young File" : "Mature"}</Badge>
                    </div>
                  </Col>
                  <Col>
                    <div className="metric-card-box p-2 text-center border rounded shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                      <div className="metric-card-lbl small text-uppercase fw-bolder" style={{ fontSize: "0.65rem", color: theme.textMuted }}>Total Accts</div>
                      <div className="metric-card-val fw-bold fs-5 my-1 text-white">{totalAccounts}</div>
                      <Badge bg="dark" className="font-monospace text-muted border w-100" style={{ fontSize: "0.6rem", borderColor: theme.border, backgroundColor: theme.headerBg }}>{totalAccounts >= 5 ? "Strong Depth" : "Thin File"}</Badge>
                    </div>
                  </Col>
                </Row>

                <div className="blueprint-scale-box p-3 rounded-3 border text-center shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <div className="blueprint-scale-title small text-uppercase fw-bold mb-2 font-monospace" style={{ color: theme.textMuted }}>Funding Readiness Scale Indicator</div>
                  <div className="d-flex align-items-center justify-content-between px-4 position-relative my-3">
                    <div className="position-absolute" style={{ height: "2px", left: "10%", right: "10%", zIndex: 1, backgroundColor: theme.border }}></div>
                    
                    <div className="blueprint-scale-node d-flex flex-column align-items-center" style={{ zIndex: 2 }}>
                      <div className={`scale-dot rounded-circle border border-dark border-2 ${status === "RED" ? "active shadow-lg" : ""}`} style={{ width: "16px", height: "16px", backgroundColor: theme.danger, transform: status === "RED" ? "scale(1.4)" : "scale(1)" }}></div>
                      <small className={`scale-dot-lbl fw-bold mt-2 font-monospace ${status === "RED" ? "text-danger" : ""}`} style={{ fontSize: "0.7rem", color: status === "RED" ? theme.danger : theme.border }}>HIGH RISK</small>
                    </div>
                    <div className="blueprint-scale-node d-flex flex-column align-items-center" style={{ zIndex: 2 }}>
                      <div className={`scale-dot rounded-circle border border-dark border-2 ${status === "YELLOW" ? "active shadow-lg" : ""}`} style={{ width: "16px", height: "16px", backgroundColor: theme.warning, transform: status === "YELLOW" ? "scale(1.4)" : "scale(1)" }}></div>
                      <small className={`scale-dot-lbl fw-bold mt-2 font-monospace ${status === "YELLOW" ? "text-warning" : ""}`} style={{ fontSize: "0.7rem", color: status === "YELLOW" ? theme.warning : theme.border }}>MODERATE</small>
                    </div>
                    <div className="blueprint-scale-node d-flex flex-column align-items-center" style={{ zIndex: 2 }}>
                      <div className={`scale-dot rounded-circle border border-dark border-2 ${status === "GREEN" ? "active shadow-lg" : ""}`} style={{ width: "16px", height: "16px", backgroundColor: theme.success, transform: status === "GREEN" ? "scale(1.4)" : "scale(1)" }}></div>
                      <small className={`scale-dot-lbl fw-bold mt-2 font-monospace ${status === "GREEN" ? "text-success" : ""}`} style={{ fontSize: "0.7rem", color: status === "GREEN" ? theme.success : theme.border }}>LOW RISK</small>
                    </div>
                  </div>
                </div>
              </Col>
            </Row>
          </div>
        </div>

        {/* ========================================== */}
        {/* CHUNK 2: PROFILE STRENGTHS & RISKS         */}
        {/* ========================================== */}
        <div {...blockAttr} className="print-chunk blueprint-section-block p-3 p-md-4" style={{ borderBottom: `1px solid ${theme.border}`, pageBreakInside: "avoid" }}>
          <Row className="g-4">
            <Col lg={4} className="blueprint-right-divider border-end" style={{ borderColor: `${theme.border} !important` }}>
              <div className="section-title fw-bold text-uppercase mb-3" style={{ color: theme.brightBlue, fontSize: "1rem", letterSpacing: "1px" }}>Profile Strengths</div>
              <Stack gap={2}>
                <div className="strength-row-item p-2 d-flex align-items-center gap-2 rounded shadow-sm border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <i className="bi bi-shield-check text-success fs-5"></i>
                  <div>
                    <div className="fw-bold small text-uppercase text-white">Account Depth Layer</div>
                    <small className="d-block" style={{ fontSize: "0.75rem", fontWeight: "500", color: theme.textMuted }}>Your file holds {totalAccounts} dynamic reported accounts, creating data balance diversity.</small>
                  </div>
                </div>
                <div className="strength-row-item p-2 d-flex align-items-center gap-2 rounded shadow-sm border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <i className="bi bi-shield-check text-success fs-5"></i>
                  <div>
                    <div className="fw-bold small text-uppercase text-white">Public Records</div>
                    <small className="d-block" style={{ fontSize: "0.75rem", fontWeight: "500", color: theme.textMuted }}>
                      {eligibilityResult?.metrics?.bankruptcies > 0 ? "Bankruptcies present, requiring aging strategies." : "No active statutory bankruptcies or tax liens were discovered."}
                    </small>
                  </div>
                </div>
                <div className="strength-row-item p-2 d-flex align-items-center gap-2 rounded shadow-sm border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <i className="bi bi-shield-check text-success fs-5"></i>
                  <div>
                    <div className="fw-bold small text-uppercase text-white">Collections Log</div>
                    <small className="d-block" style={{ fontSize: "0.75rem", fontWeight: "500", color: theme.textMuted }}>Clear of third-party outstanding collection entries across reporting fields.</small>
                  </div>
                </div>
                <div className="strength-row-item p-2 d-flex align-items-center gap-2 rounded shadow-sm border" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <i className="bi bi-shield-check text-success fs-5"></i>
                  <div>
                    <div className="fw-bold small text-uppercase text-white">Payment Foundation</div>
                    <small className="d-block" style={{ fontSize: "0.75rem", fontWeight: "500", color: theme.textMuted }}>Primary open trade paths demonstrate clear payment structure records.</small>
                  </div>
                </div>
              </Stack>
            </Col>

            <Col lg={8}>
              <div className="section-title fw-bold text-uppercase mb-3" style={{ color: theme.brightBlue, fontSize: "1rem", letterSpacing: "1px" }}>Key Risk Factors Breakdown</div>
              <Stack gap={3}>
                
                <div className="d-flex align-items-start gap-3 p-3 border rounded shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <div className="risk-circle-indicator fw-bold rounded d-flex align-items-center justify-content-center" style={{ minWidth: "50px", minHeight: "50px", fontSize: "1rem", backgroundColor: utilization > 35 ? "rgba(248, 113, 113, 0.15)" : "rgba(52, 211, 153, 0.15)", color: utilization > 35 ? theme.danger : theme.success, border: `1px solid ${utilization > 35 ? theme.danger : theme.success}` }}>
                    {utilization}%
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="risk-title fw-bold m-0 text-uppercase text-white">Utilization Constraints</h6>
                    <p className="risk-desc small m-0 lh-base mt-1" style={{ fontWeight: "500", color: theme.textMuted }}>
                      {utilization > 35 
                        ? `Your current balances utilize ${utilization}% of your limits. Underwriters require this to contract below a 35% cap (ideally below 10%) to lower default indicators.`
                        : `Your revolving utilization matches target parameter ceilings at ${utilization}%, supporting baseline calculation variables.`
                      }
                    </p>
                  </div>
                </div>

                <div className="d-flex align-items-start gap-3 p-3 border rounded shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <div className="risk-circle-indicator fw-bold rounded d-flex align-items-center justify-content-center" style={{ minWidth: "50px", minHeight: "50px", fontSize: "1rem", backgroundColor: recentInquiries > 2 ? "rgba(248, 113, 113, 0.15)" : "rgba(52, 211, 153, 0.15)", color: recentInquiries > 2 ? theme.danger : theme.success, border: `1px solid ${recentInquiries > 2 ? theme.danger : theme.success}` }}>
                    {recentInquiries}
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="risk-title fw-bold m-0 text-uppercase text-white">Inquiry Velocity</h6>
                    <p className="risk-desc small m-0 lh-base mt-1" style={{ fontWeight: "500", color: theme.textMuted }}>
                      {recentInquiries > 2
                        ? `We captured ${recentInquiries} hard application checks inside your lookback window. Intense inquiry densities indicate credit-seeking actions to institutional lenders.`
                        : `Inquiry footprints remain clear with only ${recentInquiries} lookup checks logged across matching bureau histories.`
                      }
                    </p>
                  </div>
                </div>

                <div className="d-flex align-items-start gap-3 p-3 border rounded shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <div className="risk-circle-indicator fw-bold rounded d-flex align-items-center justify-content-center" style={{ minWidth: "50px", minHeight: "50px", fontSize: "1rem", backgroundColor: avgAgeMonths < 60 ? "rgba(248, 113, 113, 0.15)" : "rgba(52, 211, 153, 0.15)", color: avgAgeMonths < 60 ? theme.danger : theme.success, border: `1px solid ${avgAgeMonths < 60 ? theme.danger : theme.success}` }}>
                    Age
                  </div>
                  <div className="flex-grow-1">
                    <h6 className="risk-title fw-bold m-0 text-uppercase text-white">Credit Maturity</h6>
                    <p className="risk-desc small m-0 lh-base mt-1" style={{ fontWeight: "500", color: theme.textMuted }}>
                      Your profiles indicate an average seasoning timeline depth of {formatAgeText(avgAgeMonths)} against an oldest account lifecycle point of {formatAgeText(oldestAgeMonths)}. {avgAgeMonths < 60 ? "Portfolio configurations favor established histories above a 5-year mark." : "Your credit history is robust enough for standard underwriting."}
                    </p>
                  </div>
                </div>

              </Stack>
            </Col>
          </Row>
        </div>

        {/* ========================================== */}
        {/* CHUNK 3: TRADELINE RECOMMENDATIONS ENGINE  */}
        {/* ========================================== */}
        <div {...blockAttr} className="print-chunk blueprint-section-block p-3 p-md-4" style={{ borderBottom: `1px solid ${theme.border}`, pageBreakInside: "avoid" }}>
          <div className="section-title fw-bold text-uppercase mb-3" style={{ color: theme.brightBlue, fontSize: "1rem", letterSpacing: "1px" }}>
            <i className="bi bi-cpu-fill me-2" style={{ color: theme.brightBlue }}></i> Tradeline Recommendations Engine
          </div>
          
          <Row className="g-4">
            <Col lg={4} className="border-end pr-3" style={{ borderColor: `${theme.border} !important` }}>
              <div className="p-3 border rounded-4 shadow-sm h-100 d-flex flex-column justify-content-between" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                <div>
                  <small className="text-uppercase font-monospace fw-bold d-block mb-1" style={{ fontSize: "0.75rem", color: theme.textMuted }}>Recommendation Type</small>
                  <h3 className="fw-bold mb-3 pb-2" style={{ color: theme.brightBlue, borderBottom: `1px solid ${theme.border}` }}>{tradeEngine.type.toUpperCase()}</h3>
                  
                  <div className="small fw-bold mb-2 text-white">Evaluation Summary Basis:</div>
                  <ul className="ps-3 mb-0 small fw-bold" style={{ lineHeight: "1.6", color: theme.textMain }}>
                    {tradeEngine.reasons.map((reason, i) => (
                      <li key={i} className="mb-1">{reason}</li>
                    ))}
                  </ul>
                </div>
                
                {tradeEngine.prioritizationNote && (
                  <div className="mt-3 p-2 fw-bold rounded small shadow-sm" style={{ backgroundColor: "rgba(248, 113, 113, 0.15)", border: `1px solid ${theme.danger}`, color: theme.danger }}>
                    <i className="bi bi-exclamation-octagon-fill me-2"></i> {tradeEngine.prioritizationNote}
                  </div>
                )}
              </div>
            </Col>

            <Col lg={8}>
              <Row className="g-3">
                <Col md={6}>
                  <Card className="h-100 shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: tradeEngine.type === "AU" || tradeEngine.type === "Both" ? theme.brightBlue : theme.border, borderWidth: tradeEngine.type === "AU" || tradeEngine.type === "Both" ? "2px" : "1px", opacity: tradeEngine.type === "Primary" || tradeEngine.type === "None" ? 0.7 : 1 }}>
                    <Card.Header className="text-white text-uppercase fw-bold text-center py-2" style={{ fontSize: "0.85rem", letterSpacing: "1px", backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
                      Suggested AU Tradeline Criteria
                    </Card.Header>
                    <Card.Body className="p-3 small text-white">
                      <Stack gap={2} className="font-monospace fw-bold mb-3" style={{ fontSize: "0.85rem" }}>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-calendar-check me-2" style={{ color: theme.textMuted }}></i> Age Needed:</span> <span style={{ color: theme.brightBlue }}>{tradeEngine.auCriteria.age}</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-cash-stack me-2" style={{ color: theme.textMuted }}></i> Limit Needed:</span> <span style={{ color: theme.brightBlue }}>{tradeEngine.auCriteria.limit}</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-pie-chart me-2" style={{ color: theme.textMuted }}></i> Util. Target:</span> <span style={{ color: theme.brightBlue }}>{tradeEngine.auCriteria.utilization}</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-check2-circle me-2" style={{ color: theme.textMuted }}></i> History:</span> <span style={{ color: theme.brightBlue }}>100% On-Time</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-layers me-2" style={{ color: theme.textMuted }}></i> Quantity Rec:</span> <span style={{ color: theme.brightBlue }}>{tradeEngine.auCriteria.quantity}</span></div>
                      </Stack>
                      <div className="p-2 rounded small" style={{ backgroundColor: theme.headerBg, border: `1px solid ${theme.border}`, color: theme.textMain, fontSize: "0.75rem", lineHeight: "1.4" }}>
                        <strong className="text-white">Underwriting Focus:</strong> AU deployment is structural to back-up system average history weight definitions safely.
                      </div>
                    </Card.Body>
                  </Card>
                </Col>

                <Col md={6}>
                  <Card className="h-100 shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: tradeEngine.type === "Primary" || tradeEngine.type === "Both" ? theme.brightBlue : theme.border, borderWidth: tradeEngine.type === "Primary" || tradeEngine.type === "Both" ? "2px" : "1px", opacity: tradeEngine.type === "AU" || tradeEngine.type === "None" ? 0.7 : 1 }}>
                    <Card.Header className="text-white text-uppercase fw-bold text-center py-2" style={{ fontSize: "0.85rem", letterSpacing: "1px", backgroundColor: theme.headerBg, borderBottom: `1px solid ${theme.border}` }}>
                      Suggested Primary Tradeline Criteria
                    </Card.Header>
                    <Card.Body className="p-3 small text-white">
                      <Stack gap={2} className="font-monospace fw-bold mb-3" style={{ fontSize: "0.85rem" }}>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-bank me-2" style={{ color: theme.textMuted }}></i> Account Type:</span> <span style={{ color: theme.brightBlue }} className="text-end ms-2">Major Bank / CU Card</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-graph-up me-2" style={{ color: theme.textMuted }}></i> Primary Goal:</span> <span style={{ color: theme.brightBlue }} className="text-end ms-2">Build Revolving History</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-percent me-2" style={{ color: theme.textMuted }}></i> Util. Ceiling:</span> <span style={{ color: theme.brightBlue }} className="text-end ms-2">Strictly Under 10%</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-shield-check me-2" style={{ color: theme.textMuted }}></i> Payment Ledger:</span> <span style={{ color: theme.brightBlue }} className="text-end ms-2">100% On-Time</span></div>
                        <div className="d-flex justify-content-between pb-1" style={{ borderBottom: `1px solid ${theme.border}` }}><span><i className="bi bi-plus-circle me-2" style={{ color: theme.textMuted }}></i> Account Mix:</span> <span style={{ color: theme.brightBlue }} className="text-end ms-2">Credit-Builder Installment</span></div>
                      </Stack>
                      <div className="p-2 rounded small" style={{ backgroundColor: theme.headerBg, border: `1px solid ${theme.border}`, color: theme.textMain, fontSize: "0.75rem", lineHeight: "1.4" }}>
                        <strong className="text-white">Underwriting Focus:</strong> Establishes standalone borrowing depth to enhance long-term portfolio performance benchmarks.
                      </div>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Col>
          </Row>
        </div>

        {/* ========================================== */}
        {/* CHUNK 4: ACTION PLAN & FOOTER              */}
        {/* ========================================== */}
        <div {...blockAttr} className="print-chunk" style={{ pageBreakInside: "avoid" }}>
          
          <div className="blueprint-section-block p-3 p-md-4">
            <Row className="g-4">
              <Col lg={6} className="blueprint-right-divider border-end" style={{ borderColor: `${theme.border} !important` }}>
                <div className="section-title fw-bold text-uppercase mb-3" style={{ color: theme.brightBlue, fontSize: "1rem", letterSpacing: "1px" }}>30–90 Day Action Sequence Plan</div>
                <Stack gap={3}>
                  <div className="d-flex align-items-center gap-3 text-start">
                    <div className="action-number-badge font-monospace rounded shadow-sm text-white d-flex align-items-center justify-content-center fw-bold fs-5" style={{ width: "35px", height: "35px", backgroundColor: theme.bgCard, border: `1px solid ${theme.border}` }}>1</div>
                    <div className="action-step-text small fw-bold" style={{ color: theme.textMuted }}>
                      {utilization > 10 
                        ? <span><strong className="text-white">Optimize Utilization Ceilings:</strong> Systematically clear outstanding statement line balances to push your {utilization}% metric below the 10% optimal threshold.</span>
                        : <span><strong className="text-white">Maintain Utilization Ceilings:</strong> Continue keeping your revolving balances strictly managed (currently at {utilization}%) to protect your funding eligibility.</span>
                      }
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-3 text-start">
                    <div className="action-number-badge font-monospace rounded shadow-sm text-white d-flex align-items-center justify-content-center fw-bold fs-5" style={{ width: "35px", height: "35px", backgroundColor: theme.bgCard, border: `1px solid ${theme.border}` }}>2</div>
                    <div className="action-step-text small fw-bold" style={{ color: theme.textMuted }}>
                      {recentInquiries > 2
                        ? <span><strong className="text-white">Halt Inbound Applications:</strong> Enforce strict inquiry cooling parameters. Stop outbound credit checks to let your {recentInquiries} recent inquiries age off.</span>
                        : <span><strong className="text-white">Protect Inquiry Velocity:</strong> Continue your credit freeze strategy. Avoid outbound credit checks to protect your clear inquiry record ({recentInquiries} recent checks).</span>
                      }
                    </div>
                  </div>

                  {derogatories > 0 && (
                    <div className="d-flex align-items-center gap-3 text-start">
                      <div className="action-number-badge font-monospace rounded shadow-sm text-white d-flex align-items-center justify-content-center fw-bold fs-5" style={{ width: "35px", height: "35px", backgroundColor: theme.bgCard, border: `1px solid ${theme.border}` }}>3</div>
                      <div className="action-step-text small fw-bold" style={{ color: theme.textMuted }}>
                        <strong className="text-white">Resolve Derogatory Hazards:</strong> Engage dispute or settlement strategies to address the {derogatories} negative items actively suppressing your funding tiers.
                      </div>
                    </div>
                  )}

                  {(tradeEngine.type === "AU" || tradeEngine.type === "Primary" || tradeEngine.type === "Both") && (
                    <div className="d-flex align-items-center gap-3 text-start">
                      <div className="action-number-badge font-monospace rounded shadow-sm text-white d-flex align-items-center justify-content-center fw-bold fs-5" style={{ width: "35px", height: "35px", backgroundColor: theme.bgCard, border: `1px solid ${theme.border}` }}>{derogatories > 0 ? "4" : "3"}</div>
                      <div className="action-step-text small fw-bold" style={{ color: theme.textMuted }}>
                        {tradeEngine.type === "AU" || tradeEngine.type === "Both" 
                          ? <span><strong className="text-white">Deploy Seasoned AUs:</strong> Mount high-limit authorized user components to expand your {formatAgeText(avgAgeMonths)} average length marker.</span>
                          : <span><strong className="text-white">Establish Primary Lines:</strong> Introduce structured primary accounts to complement your existing {totalAccounts} accounts and build foundational depth.</span>
                        }
                      </div>
                    </div>
                  )}

                  <div className="d-flex align-items-center gap-3 text-start">
                    <div className="action-number-badge font-monospace rounded shadow-sm text-white d-flex align-items-center justify-content-center fw-bold fs-5" style={{ width: "35px", height: "35px", backgroundColor: theme.success, border: `1px solid ${theme.success}` }}><i className="bi bi-check-lg"></i></div>
                    <div className="action-step-text small fw-bold" style={{ color: theme.textMuted }}><strong className="text-white">Re-Run Systems Underwriting:</strong> Cycle automated eligibility checks again once updates refresh to finalize file funding validation.</div>
                  </div>
                </Stack>
              </Col>

              <Col lg={6}>
                <div className="section-title fw-bold text-uppercase mb-3" style={{ color: theme.brightBlue, fontSize: "1rem", letterSpacing: "1px" }}>Projected Profile Funding Position</div>
                <div className="projection-scale-box p-3 rounded-3 border mb-4 d-flex align-items-center justify-content-around shadow-sm" style={{ backgroundColor: theme.bgCard, borderColor: theme.border }}>
                  <div className="text-center">
                    <small className="projection-lbl text-uppercase fw-bold font-monospace d-block mb-2" style={{ color: theme.textMuted }}>Current Position</small>
                    <span className="projection-badge badge p-2 shadow-sm fw-bold fs-6" style={{ backgroundColor: statusConfig.color, color: status === "YELLOW" ? "#0f172a" : "#fff" }}>
                      {statusConfig.label}
                    </span>
                  </div>
                  <i className="projection-arrow bi bi-arrow-right-square-fill fs-1 fw-bold" style={{ color: theme.border }}></i>
                  <div className="text-center">
                    <small className="projection-lbl text-uppercase fw-bold font-monospace d-block mb-2" style={{ color: theme.textMuted }}>Projected Position</small>
                    <span className="projection-badge badge p-2 text-white shadow-sm fw-bold fs-6" style={{ backgroundColor: theme.success }}>READY / LOW RISK</span>
                  </div>
                </div>

                <Row className="checkpoints-grid g-3 text-start font-monospace fw-bold" style={{ fontSize: "0.9rem", color: theme.textMain }}>
                  <Col xs={6} className="d-flex align-items-center"><i className="bi bi-check-square-fill fs-4 me-2" style={{ color: theme.brightBlue }}></i> Stronger Bank Profile</Col>
                  <Col xs={6} className="d-flex align-items-center"><i className="bi bi-check-square-fill fs-4 me-2" style={{ color: theme.brightBlue }}></i> Expanded Debt Limits</Col>
                  <Col xs={6} className="d-flex align-items-center"><i className="bi bi-check-square-fill fs-4 me-2" style={{ color: theme.brightBlue }}></i> Enhanced Approval Odds</Col>
                  <Col xs={6} className="d-flex align-items-center"><i className="bi bi-check-square-fill fs-4 me-2" style={{ color: theme.brightBlue }}></i> Compressed Risk Weights</Col>
                </Row>
              </Col>
            </Row>
          </div>

          <div className="blueprint-footer p-3 text-center text-uppercase font-monospace d-flex flex-column flex-md-row justify-content-between align-items-center gap-2 text-white fw-bold" style={{ backgroundColor: theme.headerBg, borderTop: `1px solid ${theme.border}` }}>
            <div><i className="bi bi-shield-lock-fill me-1" style={{ color: theme.brightBlue }}></i> {companyWebsite}</div>
            <div><i className="bi bi-telephone-fill me-1" style={{ color: theme.brightBlue }}></i> {companyPhone}</div>
            <div><i className="bi bi-envelope-fill me-1" style={{ color: theme.brightBlue }}></i> {companyEmail}</div>
          </div>

        </div>

      </Container>
    </div>
  );
}