import React, { useState, useEffect } from "react";
import { Container, Card, Form, Button, Table, Badge, Spinner, Row, Col, Modal } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../shared/ui/ToastNotifier";

const BUCKET = "clients";

// ==========================================
// 🧠 AI DETECTION ENGINE V2.1 (Fuzzy + Dates)
// ==========================================
const NOISE_WORDS = ["BANK", "NA", "N.A.", "LLC", "INC", "CORP", "CREDIT", "UNION", "USA", "CARD", "SERVICES", "THE", "OF", "AND", "FINANCIAL", "DEPT"];

const getValuableTokens = (name) => {
  if (!name) return [];
  let words = String(name).toUpperCase().replace(/[^A-Z0-9\s]/g, " ").split(/\s+/);
  return words.filter(word => word.length > 1 && !NOISE_WORDS.includes(word));
};

const calculateSimilarity = (inquiryName, accountName) => {
  const inquiryTokens = getValuableTokens(inquiryName);
  const accountTokens = getValuableTokens(accountName);

  if (inquiryTokens.length === 0 || accountTokens.length === 0) return 0;

  let matchCount = 0;

  for (const iToken of inquiryTokens) {
    for (const aToken of accountTokens) {
      if (aToken === iToken || aToken.startsWith(iToken) || iToken.startsWith(aToken)) {
        matchCount++;
        break; 
      }
    }
  }

  const maxTokens = Math.max(inquiryTokens.length, accountTokens.length);
  return matchCount / maxTokens; 
};

// NEW: Strict Date Window Logic
const isValidDateWindow = (inquiryDateStr, accountDateStr) => {
    if (!inquiryDateStr || !accountDateStr) return false;
    
    const inqDate = new Date(inquiryDateStr);
    const accDate = new Date(accountDateStr);
    
    const diffTime = accDate.getTime() - inqDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    
    // Valid if Account opened between 30 days BEFORE the inquiry (reporting lag)
    // and up to 180 days (6 months) AFTER the inquiry.
    return diffDays >= -30 && diffDays <= 180;
};
// ==========================================


export default function AITestingPlayground() {
  const { addToast } = useToast();
  const { userId } = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [simulation, setSimulation] = useState(null); 
  const [accountsList, setAccountsList] = useState([]);
  
  const [rawThread, setRawThread] = useState(null);
  const [bureauFilter, setBureauFilter] = useState("All");

  const [correctionModal, setCorrectionModal] = useState({ show: false, item: null });
  const [correctionReason, setCorrectionReason] = useState("");
  const [processingId, setProcessingId] = useState(null); 

  useEffect(() => {
    const fetchClients = async () => {
      const { data } = await supabase.from("clients").select("id, full_name").order("full_name");
      if (data) setClients(data);
    };
    fetchClients();
  }, []);

  const runAISimulation = async () => {
    if (!selectedClientId) return;
    setLoading(true);
    setSimulation(null);
    setAccountsList([]);
    setRawThread(null);

    try {
      const { data: threadFile } = supabase.storage.from(BUCKET).getPublicUrl(`${selectedClientId}/thread.json`);
      const res = await fetch(`${threadFile.publicUrl}?t=${Date.now()}`);
      if (!res.ok) throw new Error("No data found for this client.");
      
      const json = await res.json();
      setRawThread(json); 
      
      const accounts = json.accounts || []; 
      setAccountsList(accounts);

      const allInquiries = [
        ...(json.experian || []).map(i => ({ ...i, bureau: 'Experian', id: Math.random().toString(36).substr(2, 9) })), 
        ...(json.transunion || []).map(i => ({ ...i, bureau: 'TransUnion', id: Math.random().toString(36).substr(2, 9) })),
        ...(json.equifax || []).map(i => ({ ...i, bureau: 'Equifax', id: Math.random().toString(36).substr(2, 9) }))
      ];

      let matchCount = 0;
      
      // BUMPED THRESHOLD: 55% prevents "AMERICAN" from matching "BK OF AMER"
      const SIMILARITY_THRESHOLD = 0.55; 
      
      const results = allInquiries.map(inq => {
        const inqName = inq.creditor || inq.name;
        
        let bestAccount = null;
        let highestScore = 0;

        accounts.forEach(acc => {
            const accName = acc.creditor || acc.name;
            const score = calculateSimilarity(inqName, accName);
            
            // NEW: Only consider it a match if the dates align logically!
            const validDate = isValidDateWindow(inq.date, acc.dateOpened);
            
            if (validDate && score > highestScore) {
                highestScore = score;
                bestAccount = acc;
            }
        });

        const isLinked = highestScore >= SIMILARITY_THRESHOLD;
        const aiPrediction = isLinked ? "linked" : "non-linked";
        const actualStatus = (inq.classification || "non-linked").toLowerCase();
        
        const effectiveActual = ["linked", "associated", "dnd"].includes(actualStatus) ? "linked" : "non-linked";
        const isCorrect = aiPrediction === effectiveActual;

        if (isCorrect) matchCount++;

        return {
            ...inq,
            ai_prediction: aiPrediction,
            ai_score: highestScore,
            actual_status: actualStatus,
            matched_account: isLinked && bestAccount ? { name: bestAccount.creditor || bestAccount.name, date: bestAccount.dateOpened } : null,
            is_correct: isCorrect,
            verified: false,
            verifiedCorrect: null
        };
      });

      setSimulation({
        results,
        accuracy: Math.round((matchCount / allInquiries.length) * 100)
      });

    } catch (err) {
      addToast({ title: "Error", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  const saveTrainingLog = async (item, isCorrect, explanation = "") => {
    setProcessingId(item.id);
    
    let finalClassification = item.ai_prediction;
    if (!isCorrect) {
        finalClassification = item.ai_prediction === "linked" ? "non-linked" : "linked";
    }

    try {
        await supabase.from("ai_training_logs").insert({
            client_id: selectedClientId,
            user_id: userId,
            creditor_name: item.creditor || item.name,
            bureau: item.bureau,
            ai_prediction: item.ai_prediction, 
            classification: finalClassification, 
            user_explanation: explanation || (isCorrect ? "Confirmed by user" : "User marked incorrect"),
            provider: "Playground_Review",
            is_reviewed: true,
            created_at: new Date().toISOString()
        });

        if (rawThread) {
            const updatedThread = { ...rawThread };
            const bureauKey = item.bureau.toLowerCase(); 
            
            if (updatedThread[bureauKey]) {
                const inqIndex = updatedThread[bureauKey].findIndex(i => 
                    (i.creditor === item.creditor || i.name === item.name) && i.date === item.date
                );

                if (inqIndex !== -1) {
                    updatedThread[bureauKey][inqIndex].classification = finalClassification;
                    
                    const blob = new Blob([JSON.stringify(updatedThread, null, 2)], { type: "application/json" });
                    const { error: uploadError } = await supabase.storage
                        .from(BUCKET)
                        .upload(`${selectedClientId}/thread.json`, blob, { upsert: true });

                    if (uploadError) throw new Error("Failed to update thread.json: " + uploadError.message);
                    
                    setRawThread(updatedThread); 
                }
            }
        }

        setSimulation(prev => ({
            ...prev,
            results: prev.results.map(r => r.id === item.id ? { 
                ...r, 
                actual_status: finalClassification, 
                is_correct: true, 
                verified: true, 
                verifiedCorrect: isCorrect 
            } : r)
        }));

        if (!isCorrect) closeCorrectionModal();

    } catch (err) {
        addToast({ title: "Save Failed", message: "Error saving: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setProcessingId(null);
    }
  };

  const undoVerification = (id) => {
    setSimulation(prev => ({
        ...prev,
        results: prev.results.map(r => r.id === id ? { ...r, verified: false, verifiedCorrect: null } : r)
    }));
  };

  const openCorrectionModal = (item) => {
    setCorrectionModal({ show: true, item });
    setCorrectionReason("");
  };
  const closeCorrectionModal = () => {
    setCorrectionModal({ show: false, item: null });
  };

  const filteredResults = simulation?.results.filter(r => 
    bureauFilter === "All" || r.bureau === bureauFilter
  );

  return (
    <Container fluid className="py-4">
      <h3 className="mb-4 fw-bold text-primary"><i className="bi bi-robot me-2"></i>AI Training Simulator</h3>

      <Card className="shadow-sm mb-4">
        <Card.Body>
            <Row className="align-items-end">
                <Col md={6}>
                    <Form.Label>Select Client</Form.Label>
                    <Form.Select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                        <option value="">-- Choose Client --</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </Form.Select>
                </Col>
                <Col md={3}>
                    <Button variant="primary" className="w-100" onClick={runAISimulation} disabled={!selectedClientId || loading}>
                        {loading ? <Spinner size="sm" animation="border"/> : "Run Analysis"}
                    </Button>
                </Col>
            </Row>
        </Card.Body>
      </Card>

      {simulation && (
        <div className="animate__animated animate__fadeIn">
            <Row>
                <Col md={4}>
                    <Card className="shadow-sm mb-4 border-success h-100">
                        <Card.Header className="bg-success text-white">
                            <h6 className="mb-0"><i className="bi bi-wallet2 me-2"></i>Open Accounts (Evidence)</h6>
                        </Card.Header>
                        <Card.Body className="p-0">
                            <div style={{ maxHeight: "600px", overflowY: "auto" }}>
                                <Table striped hover size="sm" className="mb-0 small">
                                    <thead className="table-light sticky-top">
                                        <tr><th className="px-3">Account Details</th></tr>
                                    </thead>
                                    <tbody>
                                        {accountsList.length === 0 ? <tr><td className="text-center p-3">No open accounts.</td></tr> : 
                                        accountsList.map((acc, idx) => (
                                            <tr key={idx}>
                                                <td className="p-3 border-bottom">
                                                    <div className="fw-bold text-truncate" style={{maxWidth: "280px"}} title={acc.creditor || acc.name}>{acc.creditor || acc.name}</div>
                                                    <div className="text-muted small mt-1"><i className="bi bi-calendar-event me-1"></i>{acc.dateOpened}</div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </div>
                        </Card.Body>
                    </Card>
                </Col>

                <Col md={8}>
                    <Card className="shadow-sm mb-4 h-100">
                        <Card.Header className="bg-white d-flex justify-content-between align-items-center">
                            <h5 className="mb-0">
                                AI Predictions 
                                <Badge bg={simulation.accuracy >= 80 ? "success" : "warning"} className="ms-3 fs-6">
                                    {simulation.accuracy}% Accurate
                                </Badge>
                            </h5>
                            
                            <Form.Select 
                                size="sm" 
                                style={{ width: "150px" }} 
                                value={bureauFilter} 
                                onChange={(e) => setBureauFilter(e.target.value)}
                            >
                                <option value="All">All Bureaus</option>
                                <option value="Experian">Experian</option>
                                <option value="TransUnion">TransUnion</option>
                                <option value="Equifax">Equifax</option>
                            </Form.Select>
                        </Card.Header>
                        
                        <div style={{ maxHeight: "600px", overflowY: "auto" }}>
                            <Table responsive hover className="mb-0 align-middle">
                                <thead className="bg-light sticky-top">
                                    <tr>
                                        <th style={{ width: "40%" }} className="px-3">Inquiry Details</th> 
                                        <th style={{ width: "40%" }}>AI Prediction & Reasoning</th>
                                        <th style={{ width: "20%" }}>Verify</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredResults.map((row) => (
                                        <tr key={row.id} className={row.verified ? "table-secondary" : ""}>
                                            <td className="px-3">
                                                <div className="d-flex align-items-center mb-1">
                                                    <Badge bg={
                                                        row.bureau === 'Experian' ? 'primary' : 
                                                        row.bureau === 'TransUnion' ? 'info text-dark' : 'danger'
                                                    } className="me-2" style={{fontSize: "0.65rem"}}>
                                                        {row.bureau.substring(0,3).toUpperCase()}
                                                    </Badge>
                                                    <span className="fw-bold text-wrap lh-sm">{row.creditor || row.name}</span>
                                                </div>
                                                <div className="text-muted small ps-1 mt-1">
                                                    <i className="bi bi-calendar3 me-1"></i>{row.date}
                                                </div>
                                            </td>
                                            
                                            <td>
                                                <div className="d-flex flex-column align-items-start">
                                                    <Badge bg={row.ai_prediction === 'linked' ? 'danger' : 'success'} className="mb-2">
                                                        {row.ai_prediction.toUpperCase()}
                                                    </Badge>
                                                    
                                                    {row.ai_prediction === 'linked' && row.matched_account ? (
                                                        <div className="small lh-sm bg-light p-2 rounded border w-100">
                                                            <div className="text-danger fw-bold mb-1" style={{fontSize: "0.8rem"}}>
                                                                <i className="bi bi-check-circle me-1"></i>Matches Open Account ({(row.ai_score * 100).toFixed(0)}% Score):
                                                            </div>
                                                            <div className="text-dark fw-bold text-wrap mb-1">
                                                                "{row.matched_account.name}"
                                                            </div>
                                                            <div className="text-muted" style={{fontSize: "0.8rem"}}>
                                                                <i className="bi bi-calendar-event me-1"></i>{row.matched_account.date}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-muted small">
                                                            No matching open account found. (Highest match: {(row.ai_score * 100).toFixed(0)}%)
                                                        </div>
                                                    )}

                                                    {!row.is_correct && (
                                                        <div className="mt-2 text-danger small w-100">
                                                            <i className="bi bi-exclamation-triangle me-1"></i>
                                                            <strong>Conflict:</strong> File says "{row.actual_status}"
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            <td>
                                                {row.verified ? (
                                                    <div className="d-flex flex-column align-items-start gap-1">
                                                        <span className={`badge ${row.verifiedCorrect ? 'bg-success' : 'bg-danger'}`}>
                                                            {row.verifiedCorrect ? "VERIFIED" : "CORRECTED"}
                                                        </span>
                                                        <Button 
                                                            variant="link" 
                                                            size="sm" 
                                                            className="p-0 text-muted text-decoration-none" 
                                                            onClick={() => undoVerification(row.id)} 
                                                            title="Undo and edit"
                                                        >
                                                            <i className="bi bi-arrow-counterclockwise me-1"></i> Undo
                                                        </Button>
                                                    </div>
                                                ) : processingId === row.id ? (
                                                    <Spinner size="sm" animation="border" />
                                                ) : (
                                                    <div className="d-flex gap-2">
                                                        <Button 
                                                            variant="outline-success" 
                                                            size="sm" 
                                                            onClick={() => saveTrainingLog(row, true)}
                                                            title="Correct Prediction"
                                                        >
                                                            <i className="bi bi-check-lg"></i>
                                                        </Button>
                                                        <Button 
                                                            variant="outline-danger" 
                                                            size="sm" 
                                                            onClick={() => openCorrectionModal(row)}
                                                            title="Incorrect Prediction"
                                                        >
                                                            <i className="bi bi-x-lg"></i>
                                                        </Button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </Table>
                        </div>
                    </Card>
                </Col>
            </Row>
        </div>
      )}

      <Modal show={correctionModal.show} onHide={closeCorrectionModal} centered>
        <Modal.Header closeButton>
            <Modal.Title>Correction Note</Modal.Title>
        </Modal.Header>
        <Modal.Body>
            <p>You marked the AI's prediction (<strong>{correctionModal.item?.ai_prediction}</strong>) as incorrect.</p>
            <p>Please explain why, so the AI can learn (e.g., "Closed account", "Fraud", "Authorized User"):</p>
            <Form.Control 
                as="textarea" 
                rows={3} 
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Reason..."
            />
        </Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" onClick={closeCorrectionModal}>Cancel</Button>
            <Button 
                variant="primary" 
                disabled={!correctionReason.trim()}
                onClick={() => saveTrainingLog(correctionModal.item, false, correctionReason)}
            >
                Save Correction
            </Button>
        </Modal.Footer>
      </Modal>

    </Container>
  );
}