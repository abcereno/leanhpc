import { useEffect, useRef, useState } from "react";
import { Modal, Button, Form, InputGroup } from "react-bootstrap";
import { supabase } from "../../../../supabaseClient";
import useLogger from "../../../../hooks/useLogger"; // 1. Import Logger
import { useToast } from "../../../shared/ui/ToastNotifier";

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}
function fmtSSN(v) {
  const d = digitsOnly(v).slice(0, 9);
  const a = d.slice(0, 3);
  const b = d.slice(3, 5);
  const c = d.slice(5, 9);
  return [a, b, c].filter(Boolean).join("-");
}

export default function SSNManagerModal({ show, onClose, clientId, onSaved }) {
  const { addToast } = useToast();
  const [fullSSN, setFullSSN] = useState(""); // input for update
  const [saving, setSaving] = useState(false);

  const [revealed, setRevealed] = useState(""); // plaintext from server
  const [revealTimer, setRevealTimer] = useState(0);
  const [clientName, setClientName] = useState("Client"); // For logs
  
  const timerRef = useRef(null);
  
  // 2. Initialize Logger
  const logAction = useLogger();

  useEffect(() => {
    if (clientId) {
        // Fetch name for logging purposes
        supabase.from("clients").select("full_name").eq("id", clientId).single()
            .then(({ data }) => { if (data) setClientName(data.full_name); });
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [clientId]);

  const startRevealCountdown = (secs = 30) => {
    setRevealTimer(secs);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setRevealTimer((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          timerRef.current = null;
          setRevealed("");
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const handleUpdate = async () => {
    const clean = digitsOnly(fullSSN);
    if (clean.length !== 9) {
      addToast({ title: "Invalid SSN", message: "Please enter a valid SSN (9 digits).", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("upsert_client_ssn_full", {
        p_client_id: clientId,
        p_ssn: clean, 
      });
      if (error || !data?.success) {
        addToast({ title: "Save Failed", message: `Save failed: ${error?.message || data?.error || "unknown error"}`, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      } else {
        // [LOG UPDATE]
        await logAction({
            action: "update_ssn",
            targetId: clientId,
            targetName: clientName,
            details: `Updated/Saved SSN (Masked: ***-**-${data.last4})`
        });

        addToast({ title: "Saved", message: `Saved. Masked to ***-**-${data.last4}`, variant: "success", icon: "bi-check-circle-fill" });
        setFullSSN("");
        if (onSaved) onSaved();
      }
    } catch (e) {
      addToast({ title: "Save Failed", message: `Save failed: ${e.message || e}`, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSaving(false);
    }
  };

  const handleReveal = async () => {
    try {
      const { data, error } = await supabase.rpc("get_client_ssn_full", {
        p_client_id: clientId,
      });
      if (error) {
        addToast({ title: "Reveal Failed", message: `Reveal failed: ${error.message}`, variant: "danger", icon: "bi-exclamation-triangle-fill" });
        return;
      }
      if (!data) {
        addToast({ title: "No SSN", message: "No SSN on file.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
        return;
      }
      
      // [LOG REVEAL]
      await logAction({
        action: "reveal_ssn",
        targetId: clientId,
        targetName: clientName,
        details: "Revealed full SSN for viewing."
      });

      // data is 9 digits
      setRevealed(fmtSSN(data));
      startRevealCountdown(30);
    } catch (e) {
      addToast({ title: "Reveal Failed", message: `Reveal failed: ${e.message || e}`, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  const handleHide = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRevealed("");
    setRevealTimer(0);
  };

  return (
    <Modal show={show} onHide={onClose} size="md" centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>SSN — Update or View</Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Update section */}
        <div className="mb-4">
          <h6 className="text-muted">Save / Update SSN</h6>
          <InputGroup>
            <Form.Control
              type="text"
              inputMode="numeric"
              placeholder="123-45-6789"
              value={fmtSSN(fullSSN)}
              onChange={(e) => setFullSSN(e.target.value)}
              maxLength={11}
              autoComplete="off"
            />
            <Button variant="primary" disabled={saving || !fullSSN} onClick={handleUpdate}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </InputGroup>
        </div>

        <hr />

        {/* Reveal section */}
        <div>
          <h6 className="text-muted d-flex align-items-center justify-content-between">
            <span>Reveal Full SSN (30s)</span>
            {revealed ? <span className="badge bg-danger">Auto-hide in {revealTimer}s</span> : null}
          </h6>

          <div
            className="p-3 border rounded d-flex align-items-center justify-content-between"
            style={{
              minHeight: 58,
              background: revealed ? "transparent" : "transparent"
            }}
          >
            <span
              className="fw-bold"
              style={{
                filter: revealed ? "none" : "blur(6px)",
                textShadow: revealed ? "none" : "0 0 6px rgba(0,0,0,0.25)"
              }}
            >
              {revealed || "•••-••-••••"}
            </span>

            <div className="d-flex gap-2">
              {revealed ? (
                <Button variant="outline-danger" onClick={handleHide}>Hide</Button>
              ) : (
                <Button variant="outline-primary" onClick={handleReveal}>Reveal</Button>
              )}
            </div>
          </div>

          <Form.Text className="text-muted">
            Only authorized roles can reveal. Access is logged.
          </Form.Text>
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" onClick={() => { handleHide(); onClose(); }}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}