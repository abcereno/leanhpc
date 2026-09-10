import React, { useState, useEffect } from "react";
import { Modal, Button, Table, Badge, Spinner, Alert, Form } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";

// --- CONFIG & UTILS ---
const BUCKET = "clients";

// Simple UUID generator
const generateId = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);

export default function AIAnalysisModal({ show, onClose, clientId, onUpdateSuccess }) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { userId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzedData, setAnalyzedData] = useState([]); 
  const [originalJson, setOriginalJson] = useState(null); 
  const [stats, setStats] = useState({ total: 0, linked: 0 });

  // 1. Load Data & Ask the AI Model
  useEffect(() => {
    if (show && clientId) {
      runAnalysis();
    }
  }, [show, clientId]);

const runAnalysis = async () => {
    setLoading(true);
    try {
      const { data: fileData } = supabase.storage.from(BUCKET).getPublicUrl(`${clientId}/thread.json`);
      const res = await fetch(`${fileData.publicUrl}?t=${Date.now()}`);
      if (!res.ok) throw new Error("Could not fetch thread.json");
      
      let json = await res.json();

      const addId = (item) => ({ ...item, id: item.id || generateId() });
      json.accounts = (json.accounts || []).map(addId);
      json.experian = (json.experian || []).map(addId);
      json.transunion = (json.transunion || []).map(addId);
      json.equifax = (json.equifax || []).map(addId);
      
      setOriginalJson(json);

      const allInquiries = [
        ...json.experian.map(i => ({ ...i, bureau: 'Experian' })),
        ...json.transunion.map(i => ({ ...i, bureau: 'TransUnion' })),
        ...json.equifax.map(i => ({ ...i, bureau: 'Equifax' }))
      ];

      // 👇 THE FIX: Strip out all the heavy JSON fat before sending to the Edge Function
      const cleanInquiries = allInquiries.map(i => ({ id: i.id, creditor: i.creditor || i.name, date: i.date }));
      const cleanAccounts = json.accounts.map(a => ({ id: a.id, creditor: a.creditor || a.name, dateOpened: a.dateOpened }));

      const { data: aiResults, error: aiError } = await supabase.functions.invoke('analyze-inquiries', {
          body: { 
              inquiries: cleanInquiries, 
              accounts: cleanAccounts 
          }
      });

      if (aiError) {
          console.error("Full Edge Error:", aiError);
          throw new Error(`Edge Function Failed: ${aiError.message || "Check Supabase Logs"}`);
      }

      // Merge the optimized AI response back into your full data
      let linkedCount = 0;
      const processed = allInquiries.map(inq => {
        // If the AI didn't return it, it means it's not linked!
        const aiVerdict = (aiResults || []).find(r => r.inquiry_id === inq.id);
        
        const isLinked = !!aiVerdict;
        const bestAccount = isLinked ? json.accounts.find(a => a.id === aiVerdict.matched_account_id) : null;
        
        if (isLinked) linkedCount++;

        const currentStatus = (inq.classification || "non-linked").toLowerCase();
        const suggestedStatus = isLinked ? "linked" : "non-linked";

        return {
            ...inq,
            ai_score: isLinked ? aiVerdict.confidence_score : 0,
            ai_reasoning: isLinked ? aiVerdict.reasoning : "No clear link detected.",
            ai_suggestion: suggestedStatus,
            matched_account: bestAccount,
            new_status: currentStatus 
        };
      });

      setAnalyzedData(processed);
      setStats({ total: processed.length, linked: linkedCount });

    } catch (err) {
      console.error(err);
      addToast({ title: "Analysis Failed", message: "Error analyzing file: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  // 2. Handle User Actions
  const handleAcceptSuggestion = (id) => {
    setAnalyzedData(prev => prev.map(item => 
        item.id === id ? { ...item, new_status: item.ai_suggestion } : item
    ));
  };

  const handleForceStatus = (id, status) => {
    setAnalyzedData(prev => prev.map(item => 
        item.id === id ? { ...item, new_status: status } : item
    ));
  };

  const handleAcceptAll = async () => {
      if(!(await confirm("This will update all inquiries to match the AI suggestions. Continue?"))) return;
      setAnalyzedData(prev => prev.map(item => ({
          ...item,
          new_status: item.ai_suggestion
      })));
  };

  // 3. Save Changes to Supabase
  const saveChanges = async () => {
    if (!originalJson) return;
    setSaving(true);

    try {
        const updatedJson = { ...originalJson };
        
        const updateBureauArray = (bureauName) => {
            return (originalJson[bureauName] || []).map(originalItem => {
                const analyzedItem = analyzedData.find(a => a.id === originalItem.id);
                if (analyzedItem) {
                    return { ...originalItem, classification: analyzedItem.new_status };
                }
                return originalItem;
            });
        };

        updatedJson.experian = updateBureauArray('experian');
        updatedJson.transunion = updateBureauArray('transunion');
        updatedJson.equifax = updateBureauArray('equifax');

        const blob = new Blob([JSON.stringify(updatedJson, null, 2)], { type: "application/json" });
        const { error } = await supabase.storage
            .from(BUCKET)
            .upload(`${clientId}/thread.json`, blob, { upsert: true });

        if (error) throw error;

        addToast({ title: "Updated", message: "Thread updated successfully!", variant: "success", icon: "bi-check-circle-fill" });
        if (onUpdateSuccess) onUpdateSuccess();
        onClose();

    } catch (err) {
        addToast({ title: "Save Failed", message: "Error saving: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="xl" backdrop="static">
      <Modal.Header closeButton className="bg-light">
        <Modal.Title className="fw-bold text-primary">
            <i className="bi bi-robot me-2"></i>AI Thread Analysis
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="p-0">
        {loading ? (
            <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-2 text-muted">Running AI Pattern Recognition...</p>
            </div>
        ) : (
            <div className="d-flex flex-column h-100">
                {/* Stats Bar */}
                <div className="bg-light p-3 border-bottom d-flex justify-content-between align-items-center">
                    <div>
                        <span className="me-3"><strong>Total Inquiries:</strong> {stats.total}</span>
                        <span><strong>AI Found Linked:</strong> {stats.linked}</span>
                    </div>
                    <div>
                        <Button variant="outline-primary" size="sm" className="me-2" onClick={handleAcceptAll}>
                            Accept All Suggestions
                        </Button>
                    </div>
                </div>

                {/* Main Content Area */}
                <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
                    <Table striped hover responsive className="mb-0 align-middle">
                        <thead className="bg-white sticky-top shadow-sm">
                            <tr>
                                <th style={{width: "25%"}}>Inquiry</th>
                                <th style={{width: "35%"}}>AI Analysis & Reasoning</th>
                                <th style={{width: "15%"}}>Current Status</th>
                                <th style={{width: "15%"}}>New Status</th>
                                <th style={{width: "10%"}}>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {analyzedData.map(item => {
                                const isChange = item.new_status !== (item.classification || "non-linked");
                                const aiFoundMatch = item.ai_suggestion === 'linked';
                                
                                return (
                                    <tr key={item.id} className={isChange ? "table-warning" : ""}>
                                        <td>
                                            <div className="fw-bold">{item.creditor || item.name}</div>
                                            <div className="small text-muted">
                                                <Badge bg="secondary" className="me-1">{item.bureau.substring(0,3).toUpperCase()}</Badge>
                                                {item.date}
                                            </div>
                                        </td>

                                        <td>
                                            {aiFoundMatch ? (
                                                <div className="small">
                                                    <div className="text-success fw-bold">
                                                        <i className="bi bi-link-45deg me-1"></i>
                                                        Linked to: {item.matched_account?.creditor || "Unknown"}
                                                    </div>
                                                    <div className="text-muted fst-italic mt-1" style={{ fontSize: '0.8rem' }}>
                                                        "{item.ai_reasoning}" (Conf: {(item.ai_score * 100).toFixed(0)}%)
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-muted small">No link detected</span>
                                            )}
                                        </td>

                                        <td>
                                            <Badge bg="light" text="dark" className="border">
                                                {item.classification || "non-linked"}
                                            </Badge>
                                        </td>

                                        <td>
                                            <Badge bg={item.new_status === 'linked' ? 'danger' : 'success'}>
                                                {item.new_status}
                                            </Badge>
                                        </td>

                                        <td>
                                            {item.new_status !== item.ai_suggestion ? (
                                                <Button size="sm" variant="outline-primary" onClick={() => handleAcceptSuggestion(item.id)} title="Accept AI Suggestion">
                                                    Accept AI
                                                </Button>
                                            ) : (
                                                <div className="btn-group">
                                                    <Button size="sm" variant={item.new_status === 'linked' ? 'danger' : 'outline-secondary'} onClick={() => handleForceStatus(item.id, 'linked')}>
                                                        Link
                                                    </Button>
                                                    <Button size="sm" variant={item.new_status === 'non-linked' ? 'success' : 'outline-secondary'} onClick={() => handleForceStatus(item.id, 'non-linked')}>
                                                        Unlink
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </Table>
                </div>
            </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="primary" onClick={saveChanges} disabled={saving || loading}>
            {saving ? <Spinner size="sm" animation="border" /> : "Save Updates to Thread"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}