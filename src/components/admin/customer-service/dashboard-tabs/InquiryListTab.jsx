import React from 'react';
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../context/AuthContext";
import useInquiriesThread from "../../../../hooks/useInquiriesThread";
import { Col, Row, Card, Badge, ProgressBar, Spinner, Button } from "react-bootstrap";

export default function InquiryListTab({ 
  clientId, 
  letterAssets, 
  readonly = true, // Default to true for the dashboard view
  userId: propUserId, 
  isCompany = false,
  showGenerate = false,
  initialData = null
}) {
  const navigate = useNavigate();
  const { userId: authUserId } = useAuth();
  const userId = propUserId || authUserId;

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
  } = useInquiriesThread({ clientId, userId, letterAssets, initialData });

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

  // --- LOGIC: ROW COLORING & BADGES ---
  const getBadgeVariant = (classification) => {
    switch (classification) {
      case 'deleted': return 'success'; // Green
      case 'linked':
      case 'dnd': return 'danger';      // Red
      case 'non-linked':
      case 'dispute': return 'primary'; // Blue
      case 'associated': return 'warning'; // Yellow
      default: return 'secondary';
    }
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
      <Card className="my-4 shadow-sm border-0">
        <Card.Body className="text-center text-muted py-5">
          <i className="bi bi-inbox-fill fs-1 opacity-25"></i>
          <p className="mt-3 mb-0 fw-bold">No inquiry data available yet.</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="mt-2">
      {/* 1. Review Progress & Stats (Only show if NOT readonly) */}
      {!readonly && (
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
      )}

      {/* 2. Accounts Table */}
      {accounts.length > 0 && (
      <Card className="shadow-sm mb-4 border-0">
        <Card.Header className="bg-light text-dark d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-bold"><i className="bi bi-credit-card me-2 text-primary"></i>Credit Accounts</h6>
          <Badge bg="secondary" pill>{accounts.length}</Badge>
        </Card.Header>
        <Card.Body>
          <div className="mb-3 d-flex flex-wrap gap-2">
            {["All", "Revolving", "Installment", "Mortgage", "Open Account", "real-estate"].map((tab) => (
              <Button key={tab} variant={accountTab === tab ? "primary" : "outline-secondary"} size="sm" onClick={() => setAccountTab(tab)} className="d-flex align-items-center" style={{fontSize: '0.75rem'}}>
                <span className="me-1">{tab}</span>
                <Badge bg={accountTab === tab ? "light" : "secondary"} text={accountTab === tab ? "dark" : "light"} pill>{getAccountTabCount(tab)}</Badge>
              </Button>
            ))}
          </div>

          <div style={{ maxHeight: "400px", overflow: "auto" }} className="table-responsive">
            <table className="table table-hover align-middle small">
              <thead className="table-light sticky-top">
                <tr>
                  <th>Creditor</th><th>Type</th><th>Date Opened</th><th>Status</th>{!readonly && <th></th>}
                </tr>
              </thead>
              <tbody>
                {filterAccounts().map((item) => (
                  <tr key={item._realIndex}>
                    <td className="fw-bold">
                        {readonly ? getName(item) : (
                            <input 
                                type="text" className="form-control form-control-sm" 
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
                    <td>{item.type}</td>
                    <td>
                        {readonly ? getDate(item) : (
                            <input 
                                type="text" className="form-control form-control-sm" 
                                value={getDate(item)} 
                                onChange={(e) => updateDate(accounts, setAccounts, item._realIndex, e.target.value)} 
                            />
                        )}
                    </td>
                    <td>
                        {readonly ? (
                            <Badge bg={item.openClosed === "Closed" ? "secondary" : "success"}>{item.openClosed || "Open"}</Badge>
                        ) : (
                            <select className="form-select form-select-sm" value={item.openClosed || ""} onChange={(e) => { const updated = [...accounts]; updated[item._realIndex].openClosed = e.target.value; setAccounts(updated); }}><option value="Open">Open</option><option value="Closed">Closed</option></select>
                        )}
                    </td>
                    {!readonly && <td className="text-end"><button className="btn btn-outline-danger btn-sm" onClick={() => handleDeleteAccount(item._realIndex)}><i className="bi bi-trash"></i></button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!readonly && (<div className="d-flex justify-content-end gap-3 mt-3"><button className="btn btn-outline-secondary btn-sm" onClick={handleAddAccount}><i className="bi bi-plus-circle me-1"></i> Add Account</button></div>)}
        </Card.Body>
      </Card>
      )}

      {/* 3. Inquiries Table */}
      <Card className="shadow-sm border-0">
        <Card.Header className="bg-light text-dark d-flex justify-content-between align-items-center">
          <h6 className="mb-0 fw-bold"><i className="bi bi-search me-2 text-primary"></i>Disputable Inquiries</h6>
          <Badge bg="secondary" pill>{inquiries.length}</Badge>
        </Card.Header>
        <Card.Body>
          <div className="table-responsive">
            <div className="mb-3 d-flex flex-wrap gap-2">
              {["All", "Experian", "TransUnion", "Equifax", ...(!readonly ? ["Linked", "Associated", "Non-Linked", "Deleted"] : [])].map((tab) => (
                <Button key={tab} variant={activeTab === tab ? "primary" : "outline-secondary"} size="sm" onClick={() => setActiveTab(tab)} className="d-flex align-items-center" style={{fontSize: '0.75rem'}}>
                  <span className="me-1">{tab}</span>
                  <Badge bg={activeTab === tab ? "light" : "secondary"} text={activeTab === tab ? "dark" : "light"} pill>{getTabCount(tab)}</Badge>
                </Button>
              ))}
            </div>

            <table className="table table-hover small align-middle">
              <thead className="table-light sticky-top"><tr><th>Creditor</th><th>Bureau</th><th>Date</th><th>Classification</th>{!readonly && <th></th>}</tr></thead>
              <tbody>
                {filterInquiries().map(({ item, index }) => (
                  <tr key={index}>
                    <td className="fw-bold">
                        {readonly ? getName(item) : (
                            <input 
                                type="text" className="form-control form-control-sm" 
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
                    <td><Badge bg={item.bureau === "Experian" ? "primary" : item.bureau === "TransUnion" ? "info" : "danger"}>{item.bureau}</Badge></td>
                    <td>
                        {readonly ? getDate(item) : (
                            <input 
                                type="text" className="form-control form-control-sm" 
                                value={getDate(item)} 
                                onChange={(e) => updateDate(inquiries, setInquiries, index, e.target.value)} 
                            />
                        )}
                    </td>
                    <td>
                      {readonly ? (
                         <Badge bg={getBadgeVariant(item.classification)} className="text-uppercase">
                            {item.classification || "Pending"}
                         </Badge>
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

          {/* 4. Action Buttons (Hidden in Readonly) */}
          {!readonly && (
            <div className="d-flex flex-wrap justify-content-end gap-2 mt-3">
               <Button variant="outline-success" onClick={handleAddInquiry}>
                 <i className="bi bi-plus-circle me-1"></i> Add Inquiry
               </Button>
               <Button variant="success" onClick={saveUpdatedThread} disabled={saving}>
                 {saving ? "Saving..." : "Save Changes"}
               </Button>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}