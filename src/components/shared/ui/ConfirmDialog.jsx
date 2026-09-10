// components/ConfirmDialog.jsx
//
// Replaces window.confirm() across the app with a real modal, matching
// ToastNotifier.jsx's provider pattern (a context + hook mounted once in
// App.jsx). window.confirm blocks the whole tab, can't be styled, can't
// collect anything beyond OK/Cancel, and — the immediate reason this
// exists — can't ask a question like "why are you pausing this client?"
// the way Pause Service needs to (see ClientHeader.jsx's togglePause).
//
// Usage — mirrors window.confirm's call-site shape as closely as possible
// so most existing `if (!window.confirm(msg)) return;` call sites convert
// with a one-line change to `if (!(await confirm(msg))) return;` (the
// enclosing handler already being async in virtually every case):
//
//   const { confirm } = useConfirm();
//   if (!(await confirm("Are you sure?"))) return;                 // plain
//   if (!(await confirm({ message: "...", variant: "danger" })))   // styled
//     return;
//   const reason = await confirm({ message: "...", requireReason: true });
//   if (!reason) return;                                           // reason-collecting
//
// confirm() resolves to `false` if cancelled/dismissed, `true` if
// confirmed with no reason requested, or the trimmed non-empty reason
// string if requireReason was set (the Confirm button stays disabled
// until the textarea is non-blank, so a truthy resolve is guaranteed
// non-empty — callers never need to separately check `.trim()`).
import { createContext, useContext, useState, useCallback, useRef } from "react";
import { Modal, Button, Form } from "react-bootstrap";

const ConfirmContext = createContext(null);

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within a ConfirmProvider");
  return context;
};

const VARIANT_ICON = {
  primary: "bi-question-circle-fill",
  danger: "bi-exclamation-octagon-fill",
  warning: "bi-exclamation-triangle-fill",
  success: "bi-check-circle-fill",
  info: "bi-info-circle-fill",
};

export default function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const resolveRef = useRef(null);

  const confirm = useCallback((options) => {
    const opts = typeof options === "string" ? { message: options } : (options || {});
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setReasonDraft(opts.initialReason || "");
      setState(opts);
    });
  }, []);

  const close = (result) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setState(null);
    setReasonDraft("");
    if (resolve) resolve(result);
  };

  const handleCancel = () => close(false);

  const handleConfirm = () => {
    if (!state) return;
    if (state.requireReason) {
      const trimmed = reasonDraft.trim();
      if (!trimmed) return; // guarded by the disabled button below too
      close(trimmed);
    } else {
      close(true);
    }
  };

  const canConfirm = !state?.requireReason || !!reasonDraft.trim();

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal show={!!state} onHide={handleCancel} centered backdrop="static">
        {state && (
          <>
            <Modal.Header closeButton>
              <Modal.Title className="h6 fw-bold d-flex align-items-center mb-0">
                <i className={`bi ${state.icon || VARIANT_ICON[state.variant || "primary"]} me-2 text-${state.variant || "primary"}`}></i>
                {state.title || "Please Confirm"}
              </Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <div className="mb-0">{state.message}</div>
              {state.requireReason && (
                <Form.Group className="mt-3">
                  <Form.Label className="small fw-bold">{state.reasonLabel || "Reason"}</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={2}
                    autoFocus
                    value={reasonDraft}
                    onChange={(e) => setReasonDraft(e.target.value)}
                    placeholder={state.reasonPlaceholder || "Explain why..."}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canConfirm) handleConfirm();
                    }}
                  />
                </Form.Group>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="outline-secondary" onClick={handleCancel}>{state.cancelText || "Cancel"}</Button>
              <Button variant={state.variant || "primary"} onClick={handleConfirm} disabled={!canConfirm}>
                {state.confirmText || "Confirm"}
              </Button>
            </Modal.Footer>
          </>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}
