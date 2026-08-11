import React, { useState, useEffect } from "react";
import { Modal, Button, Row, Col, ListGroup, Badge, Spinner } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { computeDisputePendingCounts, computeBureauProgress } from "../../utils/inquiryCounts";
import { syncCountReviewRequests } from "../../utils/countReviewSync";

export default function InquirySelectionModal({ show, onHide, clientId, onConfirm }) {
  const { addToast } = useToast();
  const { userId: companyUserId } = useCompanyAuth();
  const [originalData, setOriginalData] = useState({});
  const [accounts, setAccounts] = useState([]);   // 👈 NEW: State to hold the accounts
  const [available, setAvailable] = useState([]); // Left: Do Not Dispute
  const [selected, setSelected] = useState([]);   // Right: To Be Disputed
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (show && clientId) {
      fetchThreadInquiries();
    }
  }, [show, clientId]);

  const fetchThreadInquiries = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: threadFile } = supabase.storage
        .from('clients')
        .getPublicUrl(`${clientId}/thread.json`);

      const res = await fetch(`${threadFile.publicUrl}?cacheBust=${Date.now()}`);
      if (!res.ok) throw new Error("thread.json not found");

      const parsedData = await res.json();
      setOriginalData(parsedData); 
      
      // 👇 NEW: Extract accounts for the reference panel
      setAccounts(parsedData.accounts || []);
      
      // IMITATING THE HOOK: Ensure 'bureau' and 'classification' exist 
      const processBureau = (arr, bureauName) => (arr || []).map((i) => ({ 
          ...i, 
          bureau: bureauName, 
          classification: i.classification || "non-linked" 
      }));

      const ex = processBureau(parsedData.experian, "Experian");
      const tu = processBureau(parsedData.transunion, "TransUnion");
      const eq = processBureau(parsedData.equifax, "Equifax");
      
      const allInqs = [...ex, ...tu, ...eq];
      const leftDND = [];
      const rightDispute = [];

      allInqs.forEach(inq => {
        const c = (inq.classification || "").toLowerCase();
        if (['dispute', 'non-linked', 'associated'].includes(c)) {
          rightDispute.push({ ...inq, classification: 'dispute' });
        } else {
          leftDND.push({ ...inq, classification: 'dnd' });
        }
      });
      
      setAvailable(leftDND);
      setSelected(rightDispute);
      
    } catch (err) {
      console.error("❌ Error fetching thread.json:", err);
      setError("Could not load inquiries. Please ensure you have imported a report first.");
      setAvailable([]);
      setSelected([]);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  const moveToRight = (index) => {
    const item = { ...available[index], classification: 'dispute' };
    setAvailable(available.filter((_, i) => i !== index));
    setSelected([...selected, item]);
  };

  const moveToLeft = (index) => {
    const item = { ...selected[index], classification: 'dnd' };
    setSelected(selected.filter((_, i) => i !== index));
    setAvailable([...available, item]);
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const allInqs = [...available, ...selected];
      
      const sanitizedInquiries = allInqs.map(i => ({ 
          ...i, 
          classification: i.classification || "non-linked" 
      }));
      
      const newThread = {
        ...originalData, 
        accounts: originalData.accounts || [], // Preserves accounts perfectly
        experian: sanitizedInquiries.filter((i) => i.bureau === "Experian"),
        transunion: sanitizedInquiries.filter((i) => i.bureau === "TransUnion"),
        equifax: sanitizedInquiries.filter((i) => i.bureau === "Equifax"),
      };

      const blob = new Blob([JSON.stringify(newThread, null, 2)], { type: "application/json" });
      const { error: uploadErr } = await supabase.storage.from("clients").upload(`${clientId}/thread.json`, blob, { upsert: true });

      if (uploadErr) throw uploadErr;

      // This modal used to only write thread.json — clients.progress/
      // exp_completed/tu_completed/eq_completed/exp_na/tu_na/eq_na went
      // completely stale after a partner used it, since nothing here ever
      // recomputed them (they'd only catch up whenever someone next opened
      // the admin thread editor and hit Save). Same shared function
      // useInquiriesThread.js's saveUpdatedThread uses, computed against
      // both the prior and new thread so completed_at only gets set/reset
      // on an actual transition, matching that hook's own behavior.
      try {
        const prevProgress = computeBureauProgress(originalData);
        const newProgress = computeBureauProgress(newThread);

        const progressPayload = {
          progress: newProgress.progress,
          exp_completed: newProgress.exp_completed,
          tu_completed: newProgress.tu_completed,
          eq_completed: newProgress.eq_completed,
          exp_na: newProgress.exp_na,
          tu_na: newProgress.tu_na,
          eq_na: newProgress.eq_na,
        };
        if (newProgress.isFullyCompleted && !prevProgress.isFullyCompleted) {
          progressPayload.completed_at = new Date().toISOString();
        } else if (!newProgress.isFullyCompleted) {
          progressPayload.completed_at = null;
        }

        const { error: progressErr } = await supabase.from("clients").update(progressPayload).eq("id", clientId);
        if (progressErr) throw progressErr;
      } catch (progressUpdateErr) {
        console.warn("Could not update progress/completion after selection save:", progressUpdateErr);
      }

      // Same "queue a supervisor count review" flow admin/individual saves
      // go through (see utils/countReviewSync.js) — this is the company
      // portal's own separate save path (writes thread.json directly rather
      // than going through useInquiriesThread.js), so it needs to opt in
      // explicitly. A company user is never an approver, so this only ever
      // queues a request — it never writes clients.approved_*_count
      // directly; that stays supervisor-controlled. Best-effort: a problem
      // here should never block the partner's selections from actually
      // being saved.
      try {
        const disputeCounts = computeDisputePendingCounts(newThread);
        await syncCountReviewRequests(clientId, disputeCounts, companyUserId);
      } catch (reviewSyncErr) {
        console.warn("Could not sync count review requests:", reviewSyncErr);
      }

      if (onConfirm) onConfirm(selected);
      addToast({ title: "Selections Saved", message: `${selected.length} inquiry(ies) marked to dispute.`, variant: "success", icon: "bi-check-circle-fill" });
      onHide();
    } catch (err) {
      console.error("Error saving selections:", err);
      addToast({ title: "Save Failed", message: "Please try again.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="xl" centered backdrop="static">
      <Modal.Header closeButton className="bg-light">
        <Modal.Title className="fw-bold">
          <i className="bi bi-arrow-left-right text-primary me-2"></i>
          Select Inquiries to Dispute
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="bg-white">
        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" />
            <p className="text-muted mt-3">Processing...</p>
          </div>
        ) : error ? (
          <div className="text-center py-5 text-danger">
            <i className="bi bi-exclamation-triangle display-4 mb-3 d-block"></i>
            <p>{error}</p>
          </div>
        ) : (
          <>
            {/* 👇 NEW: ACCOUNTS REFERENCE PANEL 👇 */}
            {accounts.length > 0 && (
              <Row className="mb-4">
                <Col>
                  <div className="p-3 bg-light border rounded shadow-sm">
                    <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                      <h6 className="fw-bold text-dark mb-0">
                        <i className="bi bi-bank me-2 text-primary"></i> Existing Credit Accounts (For Reference)
                      </h6>
                      <Badge bg="secondary">{accounts.length} Accounts</Badge>
                    </div>
                    
                    <div style={{ maxHeight: '180px', overflowY: 'auto' }} className="pe-2">
                      <ListGroup variant="flush" className="bg-white border rounded">
                        {accounts.map((acc, idx) => {
                          const isOpen = (acc.openClosed || "").toLowerCase() === 'open';
                          return (
                            <ListGroup.Item key={idx} className="d-flex justify-content-between align-items-center py-2">
                              <div>
                                <span className="fw-bold text-dark" style={{ fontSize: '0.95rem' }}>
                                  {acc.creditor || acc.name || "Unknown Creditor"}
                                </span>
                                <div className="text-muted small">
                                  Type: {acc.type || "Unknown"} • Opened: {acc.dateOpened || "N/A"}
                                </div>
                              </div>
                              <Badge bg={isOpen ? "success" : "secondary"}>
                                {acc.openClosed || "Unknown"}
                              </Badge>
                            </ListGroup.Item>
                          );
                        })}
                      </ListGroup>
                    </div>
                  </div>
                </Col>
              </Row>
            )}

            <Row className="g-4">
              {/* LEFT COLUMN: Do Not Dispute */}
              <Col md={6}>
                <div className="p-3 bg-light border rounded h-100">
                  <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                    <h5 className="fw-bold text-secondary mb-0">Do Not Dispute</h5>
                    <Badge bg="secondary">{available.length}</Badge>
                  </div>
                  
                  {available.length === 0 ? (
                    <p className="text-muted text-center mt-4">No remaining inquiries.</p>
                  ) : (
                    <ListGroup variant="flush" className="bg-white border rounded shadow-sm" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {available.map((inq, idx) => (
                        <ListGroup.Item key={idx} className="d-flex justify-content-between align-items-center py-3">
                          <div>
                            <div className="fw-bold text-dark">{inq.creditor || inq.name || "Unknown Creditor"}</div>
                            <div className="text-muted small mt-1">
                              {inq.date || inq.dateOpened} • <Badge bg="light" text="dark" className="border">{inq.bureau}</Badge>
                            </div>
                          </div>
                          <Button variant="outline-primary" size="sm" onClick={() => moveToRight(idx)}>
                            Select <i className="bi bi-chevron-right"></i>
                          </Button>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  )}
                </div>
              </Col>

              {/* RIGHT COLUMN: To Be Disputed */}
              <Col md={6}>
                <div className="p-3 border border-primary rounded h-100" style={{ backgroundColor: '#eff6ff' }}>
                  <div className="d-flex justify-content-between align-items-center border-bottom border-primary border-opacity-25 pb-2 mb-3">
                    <h5 className="fw-bold text-primary mb-0">To Be Disputed</h5>
                    <Badge bg="primary">{selected.length}</Badge>
                  </div>
                  
                  {selected.length === 0 ? (
                    <p className="text-muted text-center mt-4">Select inquiries from the left column to add them here.</p>
                  ) : (
                    <ListGroup variant="flush" className="bg-white border border-primary border-opacity-25 rounded shadow-sm" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {selected.map((inq, idx) => (
                        <ListGroup.Item key={idx} className="d-flex justify-content-between align-items-center py-3">
                          <Button variant="outline-danger" size="sm" onClick={() => moveToLeft(idx)}>
                            <i className="bi bi-chevron-left"></i> Remove
                          </Button>
                          <div className="text-end">
                            <div className="fw-bold text-dark">{inq.creditor || inq.name || "Unknown Creditor"}</div>
                            <div className="text-muted small mt-1">
                               <Badge bg="light" text="dark" className="border ms-2">{inq.bureau}</Badge> • {inq.date || inq.dateOpened}
                            </div>
                          </div>
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  )}
                </div>
              </Col>
            </Row>
          </>
        )}
      </Modal.Body>
      
      <Modal.Footer className="bg-light">
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button 
          variant="primary" 
          onClick={handleConfirm} 
          disabled={selected.length === 0 || loading || !!error}
          className="fw-bold px-4"
        >
          Confirm & Save {selected.length} Inquiries
        </Button>
      </Modal.Footer>
    </Modal>
  );
}