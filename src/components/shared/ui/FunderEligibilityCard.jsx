import React, { useState, useEffect, useMemo } from "react";
import { Card, Badge, Row, Col, Button, Alert, Spinner, Form, Accordion, Tabs, Tab, Table, ProgressBar } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { calculateFundingEligibility } from "../../../utils/funderRules";
import { parseSmartCredit } from "../../../utils/parseSmartCredit"; // 👈 Import the master parser

const BUCKET_NAME = "clients"; 

// --- HELPER: FICO STANDARD CREDIT AGE CALCULATION ---
const calculateAgeMetrics = (accounts) => {
    if (!accounts || !accounts.length) return null;

    // FICO Standard: Include ALL standard tradelines (Open & Closed). 
    // We only filter out active collections as they are derogatory hazards, not standard credit lines.
    const ageAccts = accounts.filter(a => !a.is_active_collection);

    if (!ageAccts.length) return { averageMonths: 0, oldestMonths: 0, rating: "Needs work", impact: "High", accounts: [] };

    const now = new Date();
    let totalMonths = 0;
    let oldestMonths = 0;
    const validAccts = [];

    ageAccts.forEach(a => {
        const dateStr = a.opened || a.dateOpened;
        if (dateStr) {
            const opened = new Date(dateStr);
            if (!isNaN(opened.getTime())) {
                const months = (now.getFullYear() - opened.getFullYear()) * 12 + (now.getMonth() - opened.getMonth());
                const finalMonths = Math.max(0, months);
                totalMonths += finalMonths;
                if (finalMonths > oldestMonths) oldestMonths = finalMonths;
                
                // Add the Open/Closed status to the name so the underwriter can see it in the UI list
                const name = a.name || a.accountName || a.creditorName || a.creditor || "Unknown Account";
                const status = String(a.account_status || a.openClosed || "Unknown").toUpperCase();
                
                validAccts.push({ 
                    name: `${name} (${status})`, 
                    months: finalMonths 
                });
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
    if (y === 0) return m + " mos";
    return y + " yrs, " + m + " mos";
};

const getCaretPosition = (months) => {
    if (months < 60) return (months / 60) * 25;
    if (months < 84) return 25 + ((months - 60) / 24) * 25;
    if (months < 108) return 50 + ((months - 84) / 24) * 25;
    return 75 + (Math.min(months - 108, 48) / 48) * 25; 
};

export default function FunderEligibilityCard({ clientId }) {
  const [loading, setLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false); 
  const [rawJson, setRawJson] = useState(null); 
  const [clientName, setClientName] = useState("");
  const [result, setResult] = useState(null);
  const [ageMetrics, setAgeMetrics] = useState(null); 
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState(""); 
  const [key, setKey] = useState("overview"); 

  const [settings, setSettings] = useState({
    inquiryMonths: 6,
    maxInqCount: 2,
    maxUtil: 35,
    minAccts: 5
  });

  useEffect(() => {
    if (!clientId) return;
    const fetchBasic = async () => {
      setLoading(true);
      const { data } = await supabase.from('clients').select('full_name').eq('id', clientId).single();
      setClientName(data?.full_name || "Client");
      setLoading(false);
    };
    fetchBasic();
  }, [clientId]);

  const fetchReport = async () => {
    setLoading(true);
    setErrorMsg("");
    setSuccessMsg("");
    setRawJson(null);
    setResult(null);
    setAgeMetrics(null);

    try {
      const { data: files, error: listError } = await supabase
        .storage
        .from(BUCKET_NAME)
        .list(clientId, { limit: 20, sortBy: { column: 'created_at', order: 'desc' } });

      if (listError) throw listError;

      // Strictly target the raw report
      const jsonFile = files.find(f => f.name === 'raw_credit_report.json');
      if (!jsonFile) throw new Error("No raw_credit_report.json found in storage.");

      const { data: fileBlob, error: dlErr } = await supabase
        .storage
        .from(BUCKET_NAME)
        .download(`${clientId}/${jsonFile.name}`);

      if (dlErr) throw dlErr;

      const text = await fileBlob.text();
      setRawJson(JSON.parse(text)); 
    } catch (err) {
      console.error("Fetch Error:", err);
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 👇 Master Pipeline: Parse -> Pass to Engine -> Build Layout 👇
  const parsedData = useMemo(() => {
      if (!rawJson) return null;
      try {
          const root = Array.isArray(rawJson) ? rawJson[0] : rawJson;
          const isRaw = root.BundleComponents || root.report?.BundleComponents;
          return isRaw ? parseSmartCredit(root) : (rawJson.pdfData || rawJson);
      } catch (e) {
          console.error("Parser Error:", e);
          return null;
      }
  }, [rawJson]);

  useEffect(() => {
    if (parsedData) {
      try {
        // Send strictly structured data to the Funder Rules Engine
        const analysis = calculateFundingEligibility(parsedData, settings);
        
        // Recalculate dynamic inquiry windows based on slider settings
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - settings.inquiryMonths);
        
        let recentCount = 0;
        parsedData.inquiries.forEach(inq => {
            if (inq.date && new Date(inq.date) >= cutoffDate) recentCount++;
        });

        analysis.metrics.inquiries_total = parsedData.inquiries.length;
        analysis.metrics.inquiries_recent = recentCount;

        // Override status logic based on sliders
        let newStatus = "GREEN";
        if (analysis.metrics.utilization > settings.maxUtil) newStatus = "RED";
        if (analysis.metrics.revolving_accounts < settings.minAccts) newStatus = newStatus === "RED" ? "RED" : "YELLOW";
        if (analysis.metrics.inquiries_recent > settings.maxInqCount) newStatus = "RED";
        
        analysis.status = newStatus;
        analysis.reasons = analysis.reasons.filter(r => !r.text.toLowerCase().includes('inquir'));
        
        if (recentCount > settings.maxInqCount) {
            analysis.reasons.push({ status: "RED", text: `Too many recent inquiries (${recentCount} total across bureaus in last ${settings.inquiryMonths} months). Max allowed: ${settings.maxInqCount}.` });
        } else {
            analysis.reasons.push({ status: "GREEN", text: `Inquiries are within limits (${recentCount} total across bureaus in last ${settings.inquiryMonths} months).` });
        }

        setResult(analysis);
        setAgeMetrics(calculateAgeMetrics(parsedData.accounts));
      } catch (e) {
        setErrorMsg("Underwriting Error: " + e.message);
      }
    }
  }, [parsedData, settings]);

  // Read pre-compiled arrays directly from parseSmartCredit!
  const revolvingAccountsBreakdown = parsedData?.utilization_breakdown?.map(acc => ({
      displayName: acc.name,
      displayBureau: acc.bureau,
      parsedLimit: acc.limit,
      parsedBalance: acc.balance,
      calculatedUtil: acc.utilization_pct
  })) || [];

  const detailedInquiriesLog = useMemo(() => {
    if (!parsedData?.inquiries) return [];
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - settings.inquiryMonths);

    return parsedData.inquiries.map(iq => {
      const isRecent = iq.date ? (new Date(iq.date) >= cutoffDate) : true;
      return { creditor: iq.creditor, date: iq.date || "Unknown", bureau: iq.bureau, recent: isRecent };
    });
  }, [parsedData, settings.inquiryMonths]);


  const handleSaveStatus = async () => {
    if (!result || !clientId) return;
    setSavingStatus(true);
    setErrorMsg("");
    setSuccessMsg("");
    try {
      const { error } = await supabase.from('clients').update({ funding_status: result.status }).eq('id', clientId);
      if (error) throw error;
      setSuccessMsg(`Status successfully updated to ${result.status} on the client's profile!`);
    } catch (err) {
      setErrorMsg(`Failed to save status: ${err.message}`);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSettingChange = (key, val) => {
    setSettings(prev => ({ ...prev, [key]: parseInt(val) }));
  };

  const getBannerStyles = (status) => {
    if (status === "GREEN") return "bg-success text-white border-success";
    if (status === "YELLOW") return "bg-warning text-dark border-warning";
    return "bg-danger text-white border-danger";
  };

  const getStatusVariant = (s) => (s === "GREEN" ? "success" : s === "YELLOW" ? "warning" : "danger");

  return (
    <div className="h-100 d-flex flex-column bg-light" id="funder-eligibility-card-root">
      
      <div className="bg-white border-bottom p-4 d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3">
        <div>
          <h4 className="mb-1 fw-bold text-dark"><i className="bi bi-shield-check text-primary me-2"></i> Funding Underwriting Portal</h4>
          <span className="text-muted small">Target Analysis: <strong className="text-dark">{clientName}</strong></span>
        </div>
        
        <Button variant={rawJson ? "outline-primary" : "primary"} className="fw-bold px-4 shadow-sm" onClick={fetchReport} disabled={loading}>
          {loading ? <><Spinner size="sm" animation="border" className="me-2"/> Running Audits...</> : rawJson ? <><i className="bi bi-arrow-clockwise me-2"></i>Reload Data</> : "Load Client Report Data"}
        </Button>
      </div>

      <div className="p-4 flex-grow-1">
        {errorMsg && <Alert variant="danger" className="fw-bold shadow-sm border-0"><i className="bi bi-exclamation-triangle-fill me-2"></i>{errorMsg}</Alert>}
        {successMsg && <Alert variant="success" className="fw-bold shadow-sm border-0"><i className="bi bi-check-circle-fill me-2"></i>{successMsg}</Alert>}

        {!result && !errorMsg && !loading && (
          <div className="text-center py-5 my-3 bg-white rounded-4 border p-5 shadow-sm">
            <i className="bi bi-wallet2 display-3 text-muted opacity-25 d-block mb-3"></i>
            <h5 className="fw-bold text-dark mb-1">Underwriting Workspace Empty</h5>
            <p className="text-muted small mb-0 mx-auto" style={{maxWidth:'400px'}}>Click the button above to extract JSON report metrics and process matching evaluation paths.</p>
          </div>
        )}

        {loading && !result && (
          <div className="text-center py-5 bg-white rounded-4 border shadow-sm my-3">
            <Spinner animation="border" variant="primary" style={{width:'3rem', height:'3rem'}} />
            <p className="mt-3 text-muted fw-bold mb-0">Re-compiling profile structures...</p>
          </div>
        )}

        {result && (
          <div className="animate-fade-in">
            <div className={`text-center mb-4 p-4 rounded-4 border shadow-sm ${getBannerStyles(result.status)}`}>
              <h1 className="fw-bold mb-0 display-3" style={{ letterSpacing: '-2px' }}>
                {result.status === "GREEN" && <i className="bi bi-check-circle-fill me-3"></i>}
                {result.status === "YELLOW" && <i className="bi bi-exclamation-triangle-fill me-3"></i>}
                {result.status === "RED" && <i className="bi bi-shield-x me-3"></i>}
                {result.status}
              </h1>
              <div className="fw-bold text-uppercase mt-1" style={{ letterSpacing: '2px', opacity: 0.9, fontSize: '0.8rem' }}>{result.score}</div>

              <div className="mt-3">
                <Button variant={result.status === 'GREEN' ? "light" : "dark"} className="fw-bold px-4 shadow-sm py-2" onClick={handleSaveStatus} disabled={savingStatus}>
                    {savingStatus ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-cloud-arrow-up-fill me-2"></i>Lock Status to CRM Profile</>}
                </Button>
              </div>
            </div>

            <Tabs id="underwriting-breakdown-tabs" activeKey={key} onSelect={(k) => setKey(k)} className="mb-4 custom-nav-tabs font-monospace small fw-bold">
              <Tab eventKey="overview" title="📋 Overview & Rules">
                <Card className="border-0 shadow-sm rounded-4 p-4 bg-white mt-2">
                    <Row className="g-3 mb-4">
                      <Col xs={6} md={3}>
                        <div className="p-3 border rounded-3 bg-light h-100">
                          <small className="text-muted text-uppercase fw-bold font-monospace d-block mb-1" style={{fontSize:'0.65rem'}}>Utilization</small>
                          <h3 className={`fw-bold mb-0 text-${result.metrics.utilization > settings.maxUtil ? 'danger' : 'success'}`}>{result.metrics.utilization}%</h3>
                        </div>
                      </Col>
                      <Col xs={6} md={3}>
                        <div className="p-3 border rounded-3 bg-light h-100">
                          <small className="text-muted text-uppercase fw-bold font-monospace d-block mb-1" style={{fontSize:'0.65rem'}}>Revolving Cards</small>
                          <h3 className={`fw-bold mb-0 text-${result.metrics.revolving_accounts < settings.minAccts ? 'warning' : 'success'}`}>{result.metrics.revolving_accounts}</h3>
                        </div>
                      </Col>
                      <Col xs={6} md={3}>
                        <div className="p-3 border rounded-3 bg-light h-100">
                          <small className="text-muted text-uppercase fw-bold font-monospace d-block mb-1" style={{fontSize:'0.65rem'}}>Recent Inqs</small>
                          <h3 className={`fw-bold mb-0 text-${result.metrics.inquiries_recent > settings.maxInqCount ? 'danger' : 'success'}`}>{result.metrics.inquiries_recent}</h3>
                        </div>
                      </Col>
                      <Col xs={6} md={3}>
                        <div className="p-3 border rounded-3 bg-light h-100">
                          <small className="text-muted text-uppercase fw-bold font-monospace d-block mb-1" style={{fontSize:'0.65rem'}}>Mortgage Depth</small>
                          <h3 className="fw-bold mb-0 text-primary">{result.metrics.mortgage_seasoning > 0 ? `${result.metrics.mortgage_seasoning} Yr` : "None"}</h3>
                        </div>
                      </Col>
                    </Row>

                    <h6 className="fw-bold text-dark mb-3">Underwriting Feedback Rules Checked</h6>
                    <div className="border rounded-3 overflow-hidden mb-2">
                      <ul className="list-group list-group-flush mb-0">
                        {result.reasons.map((r, i) => (
                          <li key={i} className="list-group-item bg-white py-3 px-4 d-flex align-items-start gap-3">
                            <i className={`bi bi-check-square-fill text-${getStatusVariant(r.status)} mt-1`}></i>
                            <span className="fw-medium text-dark" style={{ fontSize: '0.9rem' }}>{r.text}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                </Card>
              </Tab>

              <Tab eventKey="utilization" title="💳 Utilization Breakdown">
                <Card className="border-0 shadow-sm rounded-4 p-0 overflow-hidden bg-white mt-2">
                  <div className="p-4 border-bottom bg-light bg-opacity-50">
                    <h6 className="fw-bold text-dark mb-1">Revolving Limit Tally Diagnostic</h6>
                    <p className="text-muted mb-0 small">Accumulated balance parameters across open revolving lines matching algorithm conventions.</p>
                  </div>
                  <Table responsive striped hover className="align-middle mb-0 text-start small">
                    <thead className="table-light text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.7rem' }}>
                      <tr>
                        <th className="ps-4 py-3">Creditor/Account Name</th>
                        <th>Account Bureau</th>
                        <th>Credit Limit</th>
                        <th>Current Balance</th>
                        <th className="pe-4 text-center">Utilization</th>
                      </tr>
                    </thead>
                    <tbody>
                      {revolvingAccountsBreakdown.map((acc, idx) => (
                        <tr key={idx}>
                          <td className="ps-4 fw-bold text-dark">{acc.displayName}</td>
                          <td className="font-monospace text-muted text-uppercase">{acc.displayBureau}</td>
                          <td className="fw-semibold">${acc.parsedLimit.toLocaleString()}</td>
                          <td className="fw-semibold text-primary">${acc.parsedBalance.toLocaleString()}</td>
                          <td className="pe-4 text-center">
                            <Badge bg={acc.calculatedUtil > settings.maxUtil ? "danger" : "success"} className="rounded-pill px-2 py-1">{acc.calculatedUtil}%</Badge>
                          </td>
                        </tr>
                      ))}
                      {revolvingAccountsBreakdown.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-4 text-muted small">No active open revolving lines processed.</td></tr>
                      )}
                    </tbody>
                  </Table>
                </Card>
              </Tab>

              <Tab eventKey="inquiries" title="🔎 Inquiry Velocity Log">
                <Card className="border-0 shadow-sm rounded-4 p-0 overflow-hidden bg-white mt-2">
                  <div className="p-4 border-bottom bg-light bg-opacity-50">
                    <h6 className="fw-bold text-dark mb-1">Bureau Inquiry Audit Roll</h6>
                    <p className="text-muted mb-0 small">Audit window filter metrics applying a strict <strong className="text-primary">{settings.inquiryMonths} Month</strong> velocity lookback corridor.</p>
                  </div>
                  <Table responsive striped hover className="align-middle mb-0 text-start small">
                    <thead className="table-light text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.7rem' }}>
                      <tr>
                        <th className="ps-4 py-3">Inbound Bureau Inquirer</th>
                        <th>Inquiry Date</th>
                        <th>Reporting Bureau</th>
                        <th className="pe-4 text-center">Window Target Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailedInquiriesLog.map((inq, idx) => (
                        <tr key={idx}>
                          <td className="ps-4 fw-bold text-dark">{inq.creditor}</td>
                          <td className="font-monospace text-muted">{inq.date}</td>
                          <td className="fw-medium font-monospace text-uppercase">{inq.bureau}</td>
                          <td className="pe-4 text-center">
                            <Badge bg={inq.recent ? "danger" : "secondary"} className="text-uppercase font-monospace" style={{fontSize:'0.65rem'}}>
                              {inq.recent ? `Recent (${settings.inquiryMonths}Mo)` : "Historic"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                      {detailedInquiriesLog.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-4 text-muted small">No hard inquiries identified inside file streams.</td></tr>
                      )}
                    </tbody>
                  </Table>
                </Card>
              </Tab>

              <Tab eventKey="age" title="⏳ Credit Age Matrix">
                {ageMetrics ? (
                  <Card className="border-0 shadow-sm rounded-4 p-4 bg-white mt-2 animate-fade-in">
                    <div className="border-bottom pb-3 mb-4 d-flex justify-content-between align-items-center">
                       <div>
                           <h5 className="fw-bold text-dark mb-0">File Maturity Breakdown</h5>
<small className="text-muted">Calculates historical depth parameters across all reported tradelines (Open & Closed) per FICO standards</small>                       </div>
                       <Badge bg="dark" className="px-3 py-2 rounded-pill font-monospace fw-bold">Oldest Opened Account: {formatAge(ageMetrics.oldestMonths)}</Badge>
                    </div>

                    <Row className="g-4 align-items-center">
                      <Col lg={5}>
                         <div className="p-4 bg-light rounded-4 border text-center">
                             <span className="small text-muted text-uppercase fw-bold font-monospace d-block mb-1">Average Portfolio File Age</span>
                             <h1 className="display-3 fw-black text-dark mb-2" style={{fontWeight:900, letterSpacing:'-2px'}}>{formatAge(ageMetrics.averageMonths)}</h1>
                             <Badge bg={ageMetrics.rating === 'Excellent' || ageMetrics.rating === 'Good' ? 'success' : 'warning'} className="px-3 py-2 rounded-pill font-monospace small">
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
                            }}><i className="bi bi-caret-down-fill fs-4 text-dark" style={{lineHeight: 0}}></i></div>
                            <div className="d-flex w-100 position-absolute shadow-sm" style={{ bottom: '0', height: '14px', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{width: '25%', backgroundColor: '#e05c2b'}} title="Needs Work (0-4 Yrs)"></div>
                                <div style={{width: '25%', backgroundColor: '#f2c94c'}} title="Fair (5-6 Yrs)"></div>
                                <div style={{width: '25%', backgroundColor: '#6fcf97'}} title="Good (7-8 Yrs)"></div>
                                <div style={{width: '25%', backgroundColor: '#219653'}} title="Excellent (9+ Yrs)"></div>
                            </div>
                        </div>
                        <div className="d-flex justify-content-between text-muted font-monospace text-uppercase" style={{fontSize: '0.65rem'}}>
                           <span>Young File</span><span>Mature (9+ Years)</span>
                        </div>
                      </Col>
                    </Row>

                    <h6 className="fw-bold text-dark mt-4 mb-3"><i className="bi bi-clock me-2"></i>Account Vintage Tracking Log</h6>
                    <div style={{maxHeight: '220px', overflowY: 'auto'}} className="border rounded-3 custom-scrollbar">
                        <Table responsive striped hover className="align-middle mb-0 text-start small">
                          <thead className="table-light text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.65rem' }}>
                            <tr>
<th className="ps-4 py-2">Reported Tradeline</th>                            </tr>
                          </thead>
                          <tbody>
                            {ageMetrics.accounts.map((acct, idx) => (
                                <tr key={idx}>
                                    <td className="ps-4 text-dark fw-medium"><i className="bi bi-credit-card-2-front text-muted me-2"></i>{acct.name}</td>
                                    <td className="pe-4 text-end font-monospace fw-bold text-secondary">{formatAge(acct.months)}</td>
                                </tr>
                            ))}
                          </tbody>
                        </Table>
                    </div>
                  </Card>
                ) : (
                  <div className="text-center py-4 bg-white border rounded-4 text-muted small">No age matrices compiled yet.</div>
                )}
              </Tab>
            </Tabs>

            <Accordion className="shadow-sm border rounded-3 overflow-hidden mt-4">
                <Accordion.Item eventKey="0" className="border-0">
                    <Accordion.Header className="bg-light"><span className="fw-bold text-secondary"><i className="bi bi-sliders me-2"></i> Adjust Risk Scoring Criteria Thresholds</span></Accordion.Header>
                    <Accordion.Body className="bg-white border-top">
                        <Row className="g-4">
                            <Col md={6}>
                                <Form.Label className="small fw-bold text-muted text-uppercase">Inquiry Lookback Window: <span className="text-primary">{settings.inquiryMonths} Months</span></Form.Label>
                                <Form.Range min={1} max={24} value={settings.inquiryMonths} onChange={(e) => handleSettingChange('inquiryMonths', e.target.value)} />
                            </Col>
                            <Col md={6}>
                                <Form.Label className="small fw-bold text-muted text-uppercase">Max Allowed Inquiries: <span className="text-primary">{settings.maxInqCount}</span></Form.Label>
                                <Form.Range min={0} max={10} value={settings.maxInqCount} onChange={(e) => handleSettingChange('maxInqCount', e.target.value)} />
                            </Col>
                            <Col md={6}>
                                <Form.Label className="small fw-bold text-muted text-uppercase">Max Utilization Threshold: <span className="text-primary">{settings.maxUtil}%</span></Form.Label>
                                <Form.Range min={10} max={100} step={5} value={settings.maxUtil} onChange={(e) => handleSettingChange('maxUtil', e.target.value)} />
                            </Col>
                            <Col md={6}>
                                <Form.Label className="small fw-bold text-muted text-uppercase">Min Open Accounts Required: <span className="text-primary">{settings.minAccts}</span></Form.Label>
                                <Form.Range min={1} max={10} value={settings.minAccts} onChange={(e) => handleSettingChange('minAccts', e.target.value)} />
                            </Col>
                        </Row>
                    </Accordion.Body>
                </Accordion.Item>
            </Accordion>
          </div>
        )}
      </div>
    </div>
  );
}