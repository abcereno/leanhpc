import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import useInquiriesThread from "../../../hooks/useInquiriesThread";
import useLogger from "../../../hooks/useLogger"; 
import AITrainingFeedback from "../AITrainingFeedback";
import AIAnalysisModal from "../AIAnalysisModal";
import LetterEditorModal from "./modals/LetterEditorModal";
import { useToast } from "../../shared/ui/ToastNotifier";
// 👇 Added Dropdown and ButtonGroup to the imports 👇
import { Col, Row, Card, Badge, ProgressBar, Spinner, Button, Modal, Form, Dropdown, ButtonGroup, Alert } from "react-bootstrap";
import { useState } from "react";

export default function InquiriesThread({ 
  clientId, 
  letterAssets, 
  readonly = false, 
  userId: propUserId, 
  isCompany = false,
  showGenerate = false,
  initialData = null,
  refreshKey, 
  onRefresh   
}) {
  const navigate = useNavigate();
  const { addToast } = useToast();

  // Permission-based (utils/permissions.js)
  const { userId: authUserId, adminName, hasPermission } = useAuth();
  const userId = propUserId || authUserId;

  // 2. Logic to determine if user has access to AI tools
  const canUseAI = hasPermission("count_inquiries");
  
  const [showTraining, setShowTraining] = useState(false);
  const [showAIAnalysis, setShowAIAnalysis] = useState(false); 

  // New states for the Smart Generation Engine
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [disputeRound, setDisputeRound] = useState(1);
  const [isFastResolution, setIsFastResolution] = useState(false);

  // In-house letter generator (LetterEditorModal.jsx) — a separate,
  // additional flow alongside the existing Standard Letters/Smart
  // Generation Engine above, which are untouched. Reuses the same
  // disputeRound state so "Round" stays consistent regardless of which
  // generation path staff picks.
  const [showLetterEditor, setShowLetterEditor] = useState(false);

  // Initialize the logger
  const logAction = useLogger();

  const {
    inquiries,
    setInquiries,
    accounts,
    setAccounts,
    counts,
    loading,
    saving,
    error,
    activeTab,
    setActiveTab,
    accountTab,
    setAccountTab,
    isGenerating,

    deletedCount,
    nonLinkedCount,
    deletedRatioPct,

    saveUpdatedThread,
    generateDisputeLetters,
    sendToWebhookAndDeleteClient,

    filterInquiries,
    filterAccounts,
    getTabCount,
    getAccountTabCount,

    handleClassificationChange,
    handleAddInquiry,
    handleDeleteInquiry,
    handleAddAccount,
    handleDeleteAccount,

    approvedCounts,

  } = useInquiriesThread({ clientId, userId, letterAssets, initialData, adminName: adminName, refreshKey });

  // --- HELPER: Get Name regardless of data source ---
  const getName = (item) => item.creditor || item.name || item.account_name || "";

  // --- HELPER: Get Date regardless of data source ---
  const getDate = (item) => item.date || item.dateOpened || "";

  // --- HELPER: Update Date safely ---
  const updateDate = (list, setList, index, newValue) => {
    const updated = [...list];
    const item = updated[index];
    
    if (item.date !== undefined) item.date = newValue;
    if (item.dateOpened !== undefined) item.dateOpened = newValue;
    
    if (item.date === undefined && item.dateOpened === undefined) {
        item.date = newValue;
    }
    
    setList(updated);
  };

  // Wrapper function to handle Save + Log Action + Open Modal
  const handleSaveAndTrain = async () => {
    const success = await saveUpdatedThread();
    if (success) {
      
      // LOG THE ACTION IN THE BACKGROUND
      logAction({
        action: "Counted Inquiries",
        targetId: clientId,
        details: `Saved inquiry classifications and account updates.`
      });

      addToast({ title: "Saved", message: "Inquiry classifications and account updates saved.", variant: "success", icon: "bi-check-circle-fill" });

      if (!isCompany) {
        setShowTraining(true);
      }
    }
  };

  // --- LOGIC: ROW COLORING ---
  const getRowClass = (classification) => {
    switch (classification) {
      case 'deleted': 
        return 'row-status-green'; // Green
      case 'linked':
      case 'dnd':
        return 'row-status-red';   // Red
      case 'non-linked':
      case 'dispute':
        return 'row-status-blue';  // Light Blue (Neon)
      case 'associated':
        return 'row-status-yellow'; // Yellow (Optional extra)
      default:
        return '';
    }
  };

  // Wrapper to safely pass parameters to the hook. generateDisputeLetters
  // itself (useInquiriesThread.js) is left untouched — awaiting it here
  // and refreshing afterward just makes the Documents tab pick up the
  // newly-saved letters without a manual reload, same as the in-house
  // generator already does via LetterEditorModal's onGenerated.
  const handleConfirmGeneration = async () => {
      setShowGenerateModal(false);
      await generateDisputeLetters(parseInt(disputeRound), isFastResolution);
      onRefresh && onRefresh();
  };

  const handleStandardLetters = async () => {
      await generateDisputeLetters(1, false);
      onRefresh && onRefresh();
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center my-5">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="my-4 border-danger">
        <Card.Body className="text-danger">
          <i className="bi bi-exclamation-triangle-fill me-2"></i>
          {error}
        </Card.Body>
      </Card>
    );
  }

  if (inquiries.length === 0 && accounts.length === 0 && readonly) {
    return (
      <Card className="my-4">
        <Card.Body className="text-center text-muted py-4">
          <i className="bi bi-inbox-fill fs-1"></i>
          <p className="mt-2 mb-0">No inquiry data available</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="mt-4">
      {/* 1. Review Progress & Stats */}
      {!readonly && (
        <>
          {/* HPC Ops Sprint Priority 2: the supervisor-approved "cleared to
              dispute" count per bureau — every save auto-queues a Count
              Review request for any bureau with Non-Linked/Associated/Dispute
              items (see useInquiriesThread.js's syncCountReviewRequests), and
              this reflects the last value a supervisor actually approved. */}
          {approvedCounts && (
            <Alert variant="info" className="d-flex flex-wrap align-items-center gap-3 mb-3 py-2">
              <strong><i className="bi bi-clipboard-check me-1"></i>Approved to Dispute:</strong>
              <span>Experian <Badge bg={approvedCounts.approved_exp_count != null ? "primary" : "secondary"} className="ms-1">{approvedCounts.approved_exp_count ?? "Pending"}</Badge></span>
              <span>TransUnion <Badge bg={approvedCounts.approved_tu_count != null ? "primary" : "secondary"} className="ms-1">{approvedCounts.approved_tu_count ?? "Pending"}</Badge></span>
              <span>Equifax <Badge bg={approvedCounts.approved_eq_count != null ? "primary" : "secondary"} className="ms-1">{approvedCounts.approved_eq_count ?? "Pending"}</Badge></span>
              <span className="text-muted small ms-auto">Updates once a supervisor reviews the Count Review queue.</span>
            </Alert>
          )}

          <Card className="mb-4 shadow-sm">
            <Card.Header className="bg-info text-white">
              <h5 className="mb-0"><i className="bi bi-clipboard2-check me-2"></i>Review Progress</h5>
            </Card.Header>
            <Card.Body>
              <Row>
                <Col>
                  <div className="mb-3">
                    <div className="d-flex justify-content-between mb-2">
                      <span><Badge bg={deletedRatioPct > 50 ? "warning" : "danger"} className="me-2">{deletedCount} / {nonLinkedCount}</Badge> Deleted / Disputables</span>
                      <span>{deletedRatioPct}% Deleted</span>
                    </div>
                    <ProgressBar now={deletedRatioPct} variant={deletedRatioPct > 50 ? "warning" : "danger"} striped />
                  </div>
                </Col>
              </Row>
            </Card.Body>
          </Card>

          <Row className="mb-4">
            <Col md={6} className="mb-3 mb-md-0">
              <Card className="h-100 shadow-sm">
                <Card.Header className="bg-info text-white"><h5 className="mb-0"><i className="bi bi-bar-chart me-2"></i>Inquiry Distribution</h5></Card.Header>
                <Card.Body>
                  <h6 className="mb-3">Total Inquiries: <Badge bg="primary">{counts.total}</Badge></h6>
                  {Object.entries(counts.perBureau).map(([bureau, count]) => (
                    <div key={bureau} className="mb-3">
                      <div className="d-flex justify-content-between mb-1">
                        <span><Badge bg="secondary" className="me-2">{bureau}</Badge>{count}</span>
                        <small>{counts.total ? Math.round((count / counts.total) * 100) : 0}%</small>
                      </div>
                      <ProgressBar now={counts.total ? (count / counts.total) * 100 : 0} variant={bureau === "Experian" ? "danger" : bureau === "TransUnion" ? "warning" : "success"} />
                    </div>
                  ))}
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card className="h-100 shadow-sm">
                <Card.Header className="bg-info text-white"><h5 className="mb-0"><i className="bi bi-tag me-2"></i>Classification Breakdown</h5></Card.Header>
                <Card.Body>
                  {Object.entries(counts.perClassification).map(([bureau, classifications]) => (
                    <div key={bureau} className="mb-3">
                      <h6 className="d-flex align-items-center"><Badge bg="secondary" className="me-2">{bureau}</Badge></h6>
                      <ul className="list-group list-group-flush">
                        {Object.entries(classifications).map(([classification, count]) => (
                          <li key={classification} className="list-group-item d-flex justify-content-between align-items-center py-2">
                            <span>{classification}</span>
                            <Badge bg="primary" pill>{count}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* 2. Accounts Table */}
      <Card className="shadow-sm mb-4">
        <Card.Header className="bg-primary text-white d-flex justify-content-start gap-2 align-items-center">
          <h5 className="mb-0"><i className="bi bi-credit-card me-2"></i>Credit Accounts</h5>
          <Badge bg="light" text="dark">{accounts.length}</Badge>
        </Card.Header>
        <Card.Body>
          <div className="mb-3 d-flex flex-wrap gap-2">
            {["All", "Revolving", "Installment", "Mortgage", "Open Account", "real-estate"].map((tab) => (
              <Button key={tab} variant={accountTab === tab ? "primary" : "outline-primary"} size="sm" onClick={() => setAccountTab(tab)} className="d-flex align-items-center">
                <span className="me-1">{tab}</span>
                <Badge bg="light" text="dark">{getAccountTabCount(tab)}</Badge>
              </Button>
            ))}
          </div>

          {accounts.length === 0 ? (
            <div className="text-center py-3 text-muted"><i className="bi bi-credit-card fs-3"></i><p>No accounts listed</p></div>
          ) : (
            <div style={{ maxHeight: "400px", overflow: "auto" }} className="table-responsive">
              <table className="table table-hover align-middle">
                <thead>
                  <tr>
                    <th>Creditor</th><th>Type</th><th>Date Opened</th><th>Status</th>{!readonly && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {filterAccounts().map((item) => (
                    <tr key={item._realIndex}>
                      <td>
                        {readonly ? (
                          <strong>{getName(item)}</strong>
                        ) : (
                          <input 
                            type="text" 
                            className="form-control form-control-sm" 
                            value={getName(item)} 
                            onChange={(e) => { 
                              const updated = [...accounts]; 
                              updated[item._realIndex].creditor = e.target.value; 
                              if(updated[item._realIndex].name) updated[item._realIndex].name = e.target.value;
                              setAccounts(updated); 
                            }} 
                          />
                        )}
                      </td>
                      <td>{readonly ? item.type : <select className="form-select form-select-sm" value={item.type} onChange={(e) => { const updated = [...accounts]; updated[item._realIndex].type = e.target.value; setAccounts(updated); }}><option value="">Select</option><option value="Revolving">Revolving</option><option value="Installment">Installment</option><option value="Mortgage">Mortgage</option><option value="Open Account">Open Account</option></select>}</td>
                      
                      <td>
                        {readonly ? (
                          getDate(item)
                        ) : (
                          <input 
                            type="text" 
                            className="form-control form-control-sm" 
                            value={getDate(item)} 
                            onChange={(e) => updateDate(accounts, setAccounts, item._realIndex, e.target.value)} 
                            placeholder="MM/DD/YYYY" 
                          />
                        )}
                      </td>

                      <td>{readonly ? <Badge bg={item.openClosed === "Closed" ? "secondary" : "success"}>{item.openClosed || "Open"}</Badge> : <select className="form-select form-select-sm" value={item.openClosed || ""} onChange={(e) => { const updated = [...accounts]; updated[item._realIndex].openClosed = e.target.value; setAccounts(updated); }}><option value="Open">Open</option><option value="Closed">Closed</option></select>}</td>
                      <td className="text-end">{!readonly && <button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteAccount(item._realIndex)}><i className="bi bi-trash"></i></button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!readonly && (<div className="d-flex justify-content-end gap-3 mt-3"><button className="btn btn-outline-secondary" onClick={handleAddAccount}><i className="bi bi-plus-circle me-1"></i> Add Account</button></div>)}
        </Card.Body>
      </Card>

      {/* 3. Inquiries Table */}
      <Card className="shadow-sm">
        <Card.Header className="bg-primary text-white">
          <h5 className="mb-0"><i className="bi bi-search me-2"></i>Detailed Inquiry Records</h5>
        </Card.Header>
        <Card.Body>
          <div className="table-responsive">
            <div className="mb-3 d-flex flex-wrap gap-2">
              {["All", "Experian", "TransUnion", "Equifax", ...(!readonly ? ["Linked", "Associated", "Non-Linked", "Deleted"] : [])].map((tab) => (
                <Button key={tab} variant={activeTab === tab ? "primary" : "outline-primary"} size="sm" onClick={() => setActiveTab(tab)} className="d-flex align-items-center">
                  <span className="me-1">{tab}</span><Badge bg="light" text="dark">{getTabCount(tab)}</Badge>
                </Button>
              ))}
            </div>

            <table className="table table-hover">
              <thead><tr><th>Creditor</th><th>Bureau</th><th>Date</th><th>Classification</th>{!readonly && <th></th>}</tr></thead>
              <tbody>
                {filterInquiries().map(({ item, index }) => (
                  <tr key={index} className={getRowClass(item.classification)}>
                    <td>
                      {readonly ? (
                        <strong>{getName(item)}</strong>
                      ) : (
                        <input 
                          type="text" 
                          className="form-control form-control-sm" 
                          value={getName(item)} 
                          onChange={(e) => { 
                            const updated = [...inquiries]; 
                            updated[index].creditor = e.target.value; 
                            if(updated[index].name) updated[index].name = e.target.value;
                            setInquiries(updated); 
                          }} 
                        />
                      )}
                    </td>
                    <td>{readonly ? <Badge bg={item.bureau === "Experian" ? "primary" : item.bureau === "TransUnion" ? "info" : "danger"}>{item.bureau}</Badge> : <select className="form-select form-select-sm" value={item.bureau} onChange={(e) => { const updated = [...inquiries]; updated[index].bureau = e.target.value; setInquiries(updated); }}><option value="Experian">Experian</option><option value="TransUnion">TransUnion</option><option value="Equifax">Equifax</option></select>}</td>
                    
                    <td>
                      {readonly ? (
                        getDate(item)
                      ) : (
                        <input 
                          type="text" 
                          className="form-control form-control-sm" 
                          value={getDate(item)} 
                          onChange={(e) => updateDate(inquiries, setInquiries, index, e.target.value)} 
                          placeholder="MM/DD/YYYY" 
                        />
                      )}
                    </td>

                    <td className="col-2">
                      {readonly ? (
                         <span className="text-muted small text-uppercase fw-bold">{item.classification || "-"}</span>
                      ) : (
                        <select className="form-select form-select-sm" value={item.classification || ""} onChange={(e) => handleClassificationChange(index, e.target.value)}>
                          <option value="">-- Select --</option>
                          <option value="linked">Linked</option>
                          <option value="non-linked">Non-Linked</option>
                          <option value="associated">Associated</option>
                          <option value="deleted">Deleted</option>
                          <option value="dispute">Dispute Requested</option>
                          <option value="dnd">Do not Dispute Requested</option>
                        </select>
                      )}
                    </td>
                    {!readonly && <td className="text-end"><Button variant="outline-danger" size="sm" onClick={() => handleDeleteInquiry(index)}><i className="bi bi-trash"></i></Button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. Action Buttons */}
          {(!readonly || showGenerate) && (
            <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
              {!readonly && (
                <>
                  {canUseAI && (
                    <Button variant="outline-primary" onClick={() => setShowAIAnalysis(true)}>
                      <i className="bi bi-robot me-1"></i> AI Analysis
                    </Button>
                  )}

                  <Button variant="outline-success" onClick={handleAddInquiry}>
                    <i className="bi bi-plus-circle me-1"></i> Add Inquiry
                  </Button>
                </>
              )}

              {/* 👇 FIX: Split Button for Standard vs Smart Generation 👇 */}
              {(showGenerate || (!isCompany && !readonly)) && (
                <Dropdown as={ButtonGroup} disabled={isGenerating}>
                  <Button variant="outline-info" onClick={handleStandardLetters}>
                    {isGenerating ? (
                      <>
                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" />{" "}
                        Generating...
                      </>
                    ) : (
                      <>
                        <i className="bi bi-file-earmark-text me-1"></i> Standard Letters
                      </>
                    )}
                  </Button>
                  
                  <Dropdown.Toggle split variant="outline-info" />
                  
                  <Dropdown.Menu align="end">
                    <Dropdown.Item onClick={() => setShowGenerateModal(true)}>
                      <i className="bi bi-cpu text-primary me-2"></i> Smart Generation Engine...
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown>
              )}

              {/* In-house letter generator — edit AI-generated wording
                  before the PDF is created/saved/downloaded, instead of
                  going straight to the Apps Script webhook above. */}
              {(showGenerate || (!isCompany && !readonly)) && (
                <Button variant="outline-warning" onClick={() => setShowLetterEditor(true)}>
                  <i className="bi bi-pencil-square me-1"></i> Generate Letter (In-House)
                </Button>
              )}

              {!readonly && (
                <Button variant="success" onClick={handleSaveAndTrain} disabled={saving}>
                 {saving ? "Saving..." : "Save Classification Changes"}
                </Button>
              )}

              {!readonly && !isCompany && deletedRatioPct === 100 && (
                <Button variant="danger" className="ms-2" onClick={async () => {
                  await sendToWebhookAndDeleteClient();
                  // Small delay so the "Client Deleted" toast is actually
                  // visible — ToastProvider clears all toasts on route
                  // change, which would otherwise happen instantly.
                  setTimeout(() => navigate("/clients"), 900);
                }}>
                  <i className="bi bi-trash3 me-2"></i> Finalize & Delete
                </Button>
              )}
            </div>
          )}
        </Card.Body>
      </Card>
      
      {/* --- ALL MODALS --- */}

      <Modal show={showGenerateModal} onHide={() => setShowGenerateModal(false)} centered>
          <Modal.Header closeButton className="bg-light">
              <Modal.Title className="fw-bold text-dark">
                  <i className="bi bi-cpu me-2 text-primary"></i> Smart Generation Engine
              </Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-white">
              <p className="text-muted small mb-4">
                  The system will automatically assign Metro 2 and Factual dispute reasons based on the options you select below.
              </p>
              <Form.Group className="mb-4">
                  <Form.Label className="fw-bold text-dark">Dispute Round</Form.Label>
                  <Form.Select value={disputeRound} onChange={(e) => setDisputeRound(e.target.value)} className="shadow-sm">
                      <option value={1}>Round 1 (Initial factual disputes)</option>
                      <option value={2}>Round 2 (Metro 2 / Validation demands)</option>
                      <option value={3}>Round 3 (FCRA Escalation)</option>
                  </Form.Select>
              </Form.Group>
              <Form.Group className="mb-2">
                  <Form.Check 
                      type="switch"
                      id="fast-res-switch"
                      label={<span className="fw-bold text-dark">Client Wants Fast Resolution</span>}
                      checked={isFastResolution}
                      onChange={(e) => setIsFastResolution(e.target.checked)}
                  />
                  <Form.Text className="text-muted small ms-5">
                      Check this if the client is willing to offer Pay-for-Delete settlements.
                  </Form.Text>
              </Form.Group>
          </Modal.Body>
          <Modal.Footer className="bg-light border-0">
              <Button variant="outline-secondary" className="fw-bold" onClick={() => setShowGenerateModal(false)}>Cancel</Button>
              <Button variant="primary" className="fw-bold shadow-sm px-4" onClick={handleConfirmGeneration}>
                  Start Generation <i className="bi bi-arrow-right ms-2"></i>
              </Button>
          </Modal.Footer>
      </Modal>

      <LetterEditorModal
        show={showLetterEditor}
        onClose={() => setShowLetterEditor(false)}
        clientId={clientId}
        letterAssets={letterAssets}
        inquiries={inquiries}
        round={parseInt(disputeRound) || 1}
        userId={userId}
        onGenerated={onRefresh}
      />

      <AITrainingFeedback
        show={showTraining}
        onClose={() => setShowTraining(false)} 
        inquiries={inquiries}
        clientId={clientId}
        userId={userId}
      />

      {canUseAI && (
        <AIAnalysisModal 
          show={showAIAnalysis} 
          onClose={() => setShowAIAnalysis(false)} 
          clientId={clientId}
          onUpdateSuccess={() => {
              if (onRefresh) {
                onRefresh();
              } else {
                window.location.reload(); 
              }
          }}
        />
      )}
    </div>
  );
}