import React, { useState, useEffect } from "react";
import { Modal, Button, Form, Table, Badge, Alert, Spinner } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";

export default function AITrainingFeedback({ show, onClose, inquiries = [], clientId, userId }) {
  const { addToast } = useToast();
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Filter for critical items
  const criticalItems = inquiries.filter(i => 
    ["linked", "associated", "dnd"].includes((i.classification || "").toLowerCase())
  );

  useEffect(() => {
    if (show && criticalItems.length === 0) {
      onClose();
    }
  }, [show, criticalItems.length, onClose]);

  if (!show || criticalItems.length === 0) return null;

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
        // PREPARE BATCH UPSERT
        const rowsToUpsert = criticalItems.map(item => ({
            client_id: clientId,
            user_id: userId,
            admin_id: userId, // Legacy support
            creditor_name: item.creditor || item.name,
            bureau: item.bureau,
            inquiry_date: item.date || "Unknown", // 👈 NEW: Passing the date
            classification: item.classification,
            ai_prediction: "Manual_Verify", 
            user_explanation: feedback || "User verified as critical/linked",
            provider: "Human_Verification",
            is_reviewed: true,
            created_at: new Date().toISOString()
        }));

        // Deduplicate based on the NEW constraint
        const uniqueRowsToUpsert = Array.from(
          new Map(
            rowsToUpsert.map(row => [
              `${row.client_id}-${row.creditor_name}-${row.bureau}-${row.inquiry_date}`, // 👈 NEW: Added date to the unique key
              row
            ])
          ).values()
        );

        // Send to Supabase using the NEW conflict rules
        const { error } = await supabase
            .from("ai_training_logs")
            .upsert(uniqueRowsToUpsert, { 
                onConflict: 'client_id, creditor_name, bureau, inquiry_date' // 👈 NEW: Added date to conflict check
            });

        if (error) throw error;

        setFeedback("");
        addToast({ title: "Verified", message: `Verified ${uniqueRowsToUpsert.length} items. Training logs updated.`, variant: "success", icon: "bi-check-circle-fill" });
        onClose();
    } catch (err) {
        console.error("Training log error:", err);
        addToast({ title: "Warning", message: "Could not save training logs, but your classifications were kept. " + err.message, variant: "warning", icon: "bi-exclamation-triangle-fill", timeout: 8000 });
        onClose();
    } finally {
        setSubmitting(false);
    }
  };

  return (
    <Modal show={true} onHide={onClose} size="lg" centered backdrop="static" style={{ zIndex: 1055 }}>
      <Modal.Header closeButton className="bg-warning text-dark">
        <Modal.Title><i className="bi bi-shield-lock-fill me-2"></i>Safety Clarification</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info">
            <i className="bi bi-info-circle-fill me-2"></i>
            The AI detected <strong>{criticalItems.length}</strong> items marked as <strong>Linked</strong> or <strong>Associated</strong>. 
        </Alert>
        <div style={{ maxHeight: "300px", overflowY: "auto", border: "1px solid #dee2e6", borderRadius: "4px" }}>
            <Table striped bordered hover size="sm" className="mb-0">
                <thead className="table-light sticky-top">
                    <tr><th>Creditor</th><th>Bureau</th><th>Date</th><th>Classification</th></tr>
                </thead>
                <tbody>
                    {criticalItems.map((item, idx) => (
                        <tr key={idx}>
                            <td>{item.creditor || item.name}</td>
                            <td>{item.bureau}</td>
                            <td>{item.date}</td>
                            <td>
                                <Badge bg={item.classification.toLowerCase() === 'linked' ? 'danger' : 'warning'} text="dark">
                                    {item.classification.toUpperCase()}
                                </Badge>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </Table>
        </div>
        <Form.Group className="mt-3">
            <Form.Label><strong>Add a Note for the AI (Optional):</strong></Form.Label>
            <Form.Control 
                as="textarea" rows={2} 
                placeholder="e.g., 'Capital One is an open auto loan, do not touch.'"
                value={feedback} onChange={(e) => setFeedback(e.target.value)}
            />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel / Edit</Button>
        <Button variant="success" onClick={handleConfirm} disabled={submitting}>
            {submitting ? <Spinner size="sm" animation="border"/> : "Confirm & Train AI"}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}