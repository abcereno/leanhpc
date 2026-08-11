import React, { useState } from "react";
import { Modal, Button, Alert, Form, Badge } from "react-bootstrap";
import { useToast } from "../../shared/ui/ToastNotifier";

export default function LetterSelectionModal({ show, onHide, candidates, onGenerate }) {
  const { addToast } = useToast();
  const [selectedIds, setSelectedIds] = useState(new Set());
  const MAX_ITEMS = 5;

  const toggleItem = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      if (next.size >= MAX_ITEMS) {
        addToast({ title: "Limit Reached", message: `You can only select up to ${MAX_ITEMS} items per letter.`, variant: "warning", icon: "bi-exclamation-triangle-fill" });
        return;
      }
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleGenerate = () => {
    const selectedItems = candidates.filter(c => selectedIds.has(c.id));
    onGenerate(selectedItems);
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Select Items to Dispute</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="info" className="small">
          <i className="bi bi-info-circle-fill me-2"></i>
          To ensure effectiveness, please select up to <strong>{MAX_ITEMS}</strong> items to include in this letter.
        </Alert>

        <div className="d-flex justify-content-between mb-2">
            <strong>Available Items ({candidates.length})</strong>
            <span className={selectedIds.size === MAX_ITEMS ? 'text-danger fw-bold' : 'text-muted'}>
                {selectedIds.size} / {MAX_ITEMS} Selected
            </span>
        </div>

        <div style={{ maxHeight: '400px', overflowY: 'auto', overflowX: 'auto' }} className="border rounded p-2">
            {candidates.length === 0 && <p className="text-center text-muted my-3">No negative items or inquiries found to dispute.</p>}

            {candidates.map((item) => (
                <div key={item.id}
                     className={`d-flex align-items-center p-2 border-bottom ${selectedIds.has(item.id) ? 'bg-primary bg-opacity-10' : ''}`}
                     onClick={() => toggleItem(item.id)}
                     style={{cursor: 'pointer', minWidth: '500px'}}
                >
                    <Form.Check
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => {}}
                        className="me-3"
                    />
                    <div className="flex-grow-1">
                        <div className="fw-bold text-truncate">{item.creditor}</div>
                        <div className="small text-muted text-nowrap">
                            <Badge bg={item.type === 'Account' ? 'danger' : 'secondary'} className="me-2">
                                {item.type}
                            </Badge>
                            {item.bureau} • {item.date || item.status || 'N/A'}
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button
            variant="primary"
            onClick={handleGenerate}
            disabled={selectedIds.size === 0}
        >
            Generate Letter ({selectedIds.size})
        </Button>
      </Modal.Footer>
    </Modal>
  );
}