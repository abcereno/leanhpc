import React, { useState, useEffect, useMemo } from "react";
import { Container, Row, Col, Card, Button, Form, Nav, Badge, InputGroup, ListGroup, Spinner, Alert, Navbar } from "react-bootstrap";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { parseSmartCredit } from "../../utils/parseSmartCredit";
import { calculateFundingEligibility } from "../../utils/funderRules";

// Presentation Layer Views
import CreditAuditLayout from "../shared/client-pages/CreditAuditLayout";
import FunderEligibilityCard from "../shared/ui/FunderEligibilityCard";
import FundingBlueprintReport from "../shared/client-pages/FundingBlueprintReport";

const BUCKET_NAME = "clients";

export default function CreditReportWorkspace({ clientId: propClientId }) {
  // 👇 BULLETPROOF FIX: Capture any router key definition format used in App.jsx 👇
  const params = useParams();
  const navigate = useNavigate();

  // Fallback chain dynamically maps to whichever route variable key token is active
  const activeClientId = propClientId || params.clientId || params.urlClientId || params.id || null;

  // --- Core State Machine ---
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [activeView, setActiveView] = useState("underwriter");

  // Normalized data object maps
  const [parsedReport, setParsedReport] = useState(null);
  const [eligibilityResult, setEligibilityResult] = useState(null);
  const [ageMetrics, setAgeMetrics] = useState(null);

  // Standalone Search Control State
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);

  const [settings] = useState({
    inquiryMonths: 6,
    maxInqCount: 2,
    maxUtil: 35,
    minAccts: 5
  });

  // --- Fetch Client Profile Metadata Name ---
  useEffect(() => {
    if (!activeClientId) {
      setClientName("");
      setParsedReport(null);
      setEligibilityResult(null);
      setAgeMetrics(null);
      return;
    }

    async function fetchBasicProfile() {
      try {
        const { data, error } = await supabase
          .from("clients")
          .select("full_name")
          .eq("id", activeClientId)
          .single();
        if (!error && data) {
          setClientName(data.full_name);
        }
      } catch (e) {
        console.error("Failed to fetch name footprint: ", e);
      }
    }
    fetchBasicProfile();
  }, [activeClientId]);

  // --- Core Processing Pass Engine ---
  const loadAndProcessReport = async () => {
    if (!activeClientId) return;
    setLoading(true);
    setErrorMsg("");
    setParsedReport(null);
    setEligibilityResult(null);
    setAgeMetrics(null);

    try {
      // 1. Locate credit documents inside the storage structure
      const { data: files, error: listError } = await supabase
        .storage
        .from(BUCKET_NAME)
        .list(activeClientId, { limit: 10, sortBy: { column: "created_at", order: "desc" } });

      if (listError) throw listError;

      const targetFile = files.find(f => f.name.endsWith(".json") && f.name !== "thread.json");

      if (!targetFile) {
        throw new Error("No credit report file (.json) could be located for this user.");
      }

      // 2. Stream byte buffers off the cloud storage bucket
      const { data: fileBlob, error: downloadError } = await supabase
        .storage
        .from(BUCKET_NAME)
        .download(activeClientId + "/" + targetFile.name);

      if (downloadError) throw downloadError;

      const rawText = await fileBlob.text();
      const rawJsonData = JSON.parse(rawText);

      const normalizedAudit = parseSmartCredit(rawJsonData);
      setParsedReport(normalizedAudit);

      const rulesAnalysis = calculateFundingEligibility(normalizedAudit, settings);
      setEligibilityResult(rulesAnalysis);

      const openAccounts = (normalizedAudit.accounts || []).filter(function(a) {
        var statusStr = String(a.account_status || a.openClosed || "").toLowerCase();
        return statusStr.includes("open") && !String(a.type || "").toLowerCase().includes("collection");
      });

      const now = new Date();
      let totalMonths = 0;
      let oldestMonths = 0;
      const validAccountsList = [];

      openAccounts.forEach(function(a) {
        if (a.opened) {
          var openDate = new Date(a.opened);
          if (!isNaN(openDate.getTime())) {
            var diff = (now.getFullYear() - openDate.getFullYear()) * 12 + (now.getMonth() - openDate.getMonth());
            var finalMonths = Math.max(0, diff);
            totalMonths += finalMonths;
            if (finalMonths > oldestMonths) oldestMonths = finalMonths;
            validAccountsList.push({ name: a.name || "Tradeline", months: finalMonths });
          }
        }
      });

      validAccountsList.sort((a, b) => b.months - a.months);
      const avgMonths = validAccountsList.length ? Math.round(totalMonths / validAccountsList.length) : 0;
      
      let rating = "Needs work";
      if (avgMonths >= 108) rating = "Excellent";
      else if (avgMonths >= 84) rating = "Good";
      else if (avgMonths >= 60) rating = "Fair";

      setAgeMetrics({
        averageMonths: avgMonths,
        oldestMonths: oldestMonths,
        rating: rating,
        accounts: validAccountsList
      });

    } catch (err) {
      console.error("Workspace Engine Intercept Error: ", err);
      setErrorMsg(err.message || "Failed to process target workspace calculations.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeClientId) {
      loadAndProcessReport();
    }
  }, [activeClientId]);

  // --- Action Handlers: Inline Client Search Lookups ---
  const handleSearchLookup = async (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    if (val.length < 2) { setSearchResults([]); return; }

    const { data } = await supabase
      .from("clients")
      .select("id, full_name")
      .ilike("full_name", "%" + val + "%")
      .limit(5);

    setSearchResults(data || []);
    setShowResults(true);
  };

  const handleSelectClient = (selectedId) => {
    setSearchTerm("");
    setShowResults(false);
    navigate("/funding-workspace/" + selectedId);
  };

  // --- Dynamic Prop Transformation Adapter for the Print Layout View ---
  const auditLayoutProps = useMemo(() => {
    if (!parsedReport) return null;

    var flattenedInquiries = [];
    if (parsedReport.inquiries && typeof parsedReport.inquiries === "object" && !Array.isArray(parsedReport.inquiries)) {
      Object.keys(parsedReport.inquiries).forEach(function(bureauKey) {
        var list = parsedReport.inquiries[bureauKey];
        if (Array.isArray(list)) {
          list.forEach(function(iq) {
            flattenedInquiries.push({
              creditor: iq.creditor || "Unknown Inquirer",
              date: iq.date || "",
              bureau: bureauKey === "EX" ? "Experian" : bureauKey === "TU" ? "TransUnion" : "Equifax"
            });
          });
        }
      });
    } else if (Array.isArray(parsedReport.inquiries)) {
      flattenedInquiries = parsedReport.inquiries;
    }

    var formattedSummaries = Object.keys(parsedReport.bureau_stats || {}).map(function(key) {
      var stats = parsedReport.bureau_stats[key];
      return {
        bureau: key === "EX" ? "Experian" : key === "TU" ? "TransUnion" : "Equifax",
        accounts: (Number(stats.open || 0) + Number(stats.closed || 0)) || 0,
        inquiries: stats.inquiries_2y || stats.inquiry_count || 0,
        publicRecords: 0,
        collections: stats.collections || 0,
        positive: stats.positive || 0,
        negative: stats.derogatory || 0
      };
    });

    return {
      clientName: parsedReport.personal?.full_name || clientName,
      clientAddress: parsedReport.personal?.address || "",
      clientDob: parsedReport.personal?.dob || "",
      clientSsnLast4: parsedReport.personal?.ssn_last4 || "",
      scores: {
        exp: parsedReport.scores?.EX ?? "—",
        tu: parsedReport.scores?.TU ?? "—",
        eq: parsedReport.scores?.EQ ?? "—",
        avg: parsedReport.scores?.avg ?? "—"
      },
      utilization: {
        percent: parsedReport.summary ? (parsedReport.summary.utilization_pct + "%") : "0%",
        balance: parsedReport.summary ? ("$" + Number(parsedReport.summary.total_revolving_debt).toLocaleString()) : "$0",
        available: parsedReport.summary ? ("$" + Number(parsedReport.summary.total_available).toLocaleString()) : "$0"
      },
      bureauSummaries: formattedSummaries,
      derogatorySummary: {
        counts: {
          delinquent: { Equifax: parsedReport.bureau_stats?.EQ?.derogatory || 0, TransUnion: parsedReport.bureau_stats?.TU?.derogatory || 0, Experian: parsedReport.bureau_stats?.EX?.derogatory || 0 },
          derogatory: { Equifax: parsedReport.bureau_stats?.EQ?.derogatory || 0, TransUnion: parsedReport.bureau_stats?.TU?.derogatory || 0, Experian: parsedReport.bureau_stats?.EX?.derogatory || 0 },
          collection: { Equifax: parsedReport.bureau_stats?.EQ?.collections || 0, TransUnion: parsedReport.bureau_stats?.TU?.collections || 0, Experian: parsedReport.bureau_stats?.EX?.collections || 0 },
          publicRecords: { Equifax: 0, TransUnion: 0, Experian: 0 },
          inquiries2yr: { Equifax: parsedReport.bureau_stats?.EQ?.inquiries_2y || 0, TransUnion: parsedReport.bureau_stats?.TU?.inquiries_2y || 0, Experian: parsedReport.bureau_stats?.EX?.inquiries_2y || 0 }
        },
        items: (parsedReport.negatives || []).map(function(item) {
          return {
            accountName: item.account || item.name || "Unknown Account",
            bureaus: item.reported_to || item.bureaus || [item.bureau],
            issue: (item.issue || item.reason) + " (" + (item.notes || item.remarks || "") + ")"
          };
        })
      },
      inquiries: flattenedInquiries.map(function(iq) {
        return { name: iq.creditor, date: iq.date, bureau: iq.bureau, label: "Hard Inquiry" };
      }),
      scoreFactors: (parsedReport.scoreFactors || []).map(function(f) {
        return { question: f.bureau + " " + f.type + " Factor:", note: f.factor };
      })
    };
  }, [parsedReport, clientName]);

  return (
    <div className="w-100 bg-light min-vh-100 d-flex flex-column" id="master-funding-workspace-root">
      
      <Navbar bg="white" className="border-bottom px-4 py-3 shadow-sm sticky-top" style={{ zIndex: 1020 }}>
        <Container fluid className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 p-0">
          <div>
            <h5 className="mb-0 fw-bold text-dark">
              Funding Dashboard Workspace 
              {clientName && <><span className="text-muted fw-normal mx-2">/</span><span className="text-primary">{clientName}</span></>}
            </h5>
            <small className="text-muted small font-monospace">Unified Data Standardization Pass Core Environment</small>
          </div>

          <div style={{ width: "320px", position: "relative" }}>
            <InputGroup size="sm">
              <InputGroup.Text className="bg-white border-end-0 text-muted"><i className="bi bi-person-zoom"></i></InputGroup.Text>
              <Form.Control
                placeholder="Search and change client profile..."
                className="border-start-0 ps-1"
                value={searchTerm}
                onChange={handleSearchLookup}
                onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                onBlur={() => setTimeout(() => setShowResults(false), 250)}
              />
            </InputGroup>
            {showResults && searchResults.length > 0 && (
              <ListGroup className="position-absolute w-100 shadow-lg mt-1" style={{ zIndex: 2000 }}>
                {searchResults.map(res => (
                  <ListGroup.Item key={res.id} action onClick={() => handleSelectClient(res.id)}>
                    <i className="bi bi-person-fill me-2 text-primary"></i>{res.full_name}
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </div>
        </Container>
      </Navbar>

      {activeClientId && (
        <div className="bg-white border-bottom shadow-sm py-2 px-4 d-flex justify-content-start flex-wrap gap-2 flex-shrink-0">
          <Nav variant="pills" activeKey={activeView} onSelect={(v) => setActiveView(v)} className="font-monospace small fw-bold">
            <Nav.Item>
              <Nav.Link eventKey="underwriter"><i className="bi bi-shield-check me-1"></i> 1. Underwriter Dashboard</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="blueprint" disabled={!eligibilityResult}><i className="bi bi-map me-1"></i> 2. Funding Blueprint</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="audit" disabled={!parsedReport}><i className="bi bi-file-earmark-bar-graph me-1"></i> 3. Client Audit Layout</Nav.Link>
            </Nav.Item>
          </Nav>
        </div>
      )}

      <div className="flex-grow-1 p-4 d-flex flex-column align-items-center overflow-auto" style={{ maxHeight: "calc(100vh - 135px)" }}>
        {errorMsg && <Alert variant="danger" className="w-100 max-w-4xl shadow-sm border-0 font-monospace mb-4">{errorMsg}</Alert>}

        {loading && (
          <div className="text-center my-auto py-5">
            <Spinner animation="border" variant="primary" style={{ width: "3.5rem", height: "3.5rem" }} className="mb-3" />
            <h5 className="text-secondary font-monospace fw-bold">Running Data Models pass...</h5>
          </div>
        )}

        {!activeClientId && !loading && (
          <Card className="text-center p-5 rounded-4 border shadow-sm my-auto bg-white max-w-md">
            <Card.Body>
              <i className="bi bi-people display-2 text-muted opacity-25 mb-3 d-block"></i>
              <h5 className="fw-bold text-dark">No Client Selected</h5>
              <p className="text-muted small mb-0">Use the lookup selector bar on the upper right side to find a client profile and run audits.</p>
            </Card.Body>
          </Card>
        )}

        {!loading && parsedReport && (
          <div className="w-100 h-100 d-flex justify-content-center animate-fade-in">
            {activeView === "underwriter" && (
              <div className="w-100">
                <FunderEligibilityCard clientId={activeClientId} reportOverride={parsedReport} analysisOverride={eligibilityResult} ageOverride={ageMetrics} />
              </div>
            )}
            {activeView === "blueprint" && eligibilityResult && (
              <div className="w-100 bg-white rounded shadow-sm border p-2">
                <FundingBlueprintReport eligibilityResult={eligibilityResult} ageMetrics={ageMetrics} clientName={parsedReport.personal.full_name} />
              </div>
            )}
            {activeView === "audit" && auditLayoutProps && (
              <div className="p-2 rounded shadow border bg-white overflow-x-auto max-w-4xl">
                <CreditAuditLayout {...auditLayoutProps} printMode={false} />
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}