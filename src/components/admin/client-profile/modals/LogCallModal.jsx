import { useState, useRef, useEffect } from "react";
import { supabase } from "../../../../supabaseClient";
import autoAnimate from "@formkit/auto-animate";
import { useAuth } from "../../../../context/AuthContext";
import { getESTDate } from "../../../../utils/timezone";
import { useBureauWebhookDispatcher } from "../../../../hooks/useBureauWebhookDispatcher";
import { useClient } from "../../../../hooks/useClient";
import { useToast } from "../../../shared/ui/ToastNotifier";

const IS_DEFINITIVE_RESULT = ["DELETED", "DOCUMENTS NOT YET RECEIVED", "DISPUTED", "INVALID FTC", "STILL UNDER DISPUTE", "PARTLY DISPUTED"];

export default function LogCallModal({ show, onClose, clientId, routingTaskId = null, bureau = null }) {
  const { addToast } = useToast();
  const { user } = useAuth();
  const { client } = useClient(clientId);
  const { sendCall } = useBureauWebhookDispatcher();
  const [submitting, setSubmitting] = useState(false);
  // `bureau` (from a per-bureau call_routing row — see
  // sql/add_bureau_call_routing.sql) preselects and locks which bureau this
  // call is for, so it can't accidentally be logged against the wrong one.
  // Legacy callers that don't pass it (e.g. the old combined-row flow) keep
  // the original manual dropdown behavior.
  const [callLog, setCallLog] = useState({ phone_number: "", backlog: false, selectedBureau: bureau || "", reason: "" });
  const animateParent = useRef(null);

  useEffect(() => { if (animateParent.current) autoAnimate(animateParent.current); }, []);

  const handleWorkflowSideEffects = async (bureau, result) => {
    if (!clientId) return;
    const updates = { [`${bureau}_status`]: result };
    if (result === 'DELETED') updates[`${bureau}_completed`] = true;

    if (result === 'DOCUMENTS NOT YET RECEIVED') {
        // EXP now shares the exact same docs-round gate as TU/EQ (see
        // sql/gate_exp_calls_on_docs_round.sql) — it used to be an
        // independent, immediate-call track with no document_routing
        // round at all, which is why this branch used to special-case
        // `bureau === 'exp'` into just closing the call task. That's gone
        // now: whichever bureau's call this was, a fresh round is needed
        // before ANY bureau (EXP/TU/EQ share the same document_routing
        // row) can be called again.
        //
        // Round number comes from document_routing's own max round_count
        // for this client — NOT clients.doc_round_count. That column is
        // only ever written from this one spot, so it silently drifts from
        // reality the moment a round gets created any other way (Document
        // Routing's "Add Client to Loop", or a virtual-task materializing
        // on its first checkbox click — see DocumentRouting.jsx's
        // `maxRounds`/`ensureRealTask`, neither of which touches
        // doc_round_count). Reading the real table here is what
        // DocumentRouting.jsx itself does, so the new round can't collide
        // with or fall behind whatever's actually there. EXP going through
        // this branch for the first time (previously it never created a
        // round at all) is exactly what would have exposed a stale
        // doc_round_count value as a wrong/duplicate round number.
        const { data: latestRound } = await supabase
          .from('document_routing')
          .select('round_count')
          .eq('client_id', clientId)
          .order('round_count', { ascending: false })
          .limit(1)
          .maybeSingle();
        const nextRound = (latestRound?.round_count || 0) + 1;
        updates.doc_round_count = nextRound;
        updates.routing_status = 'NEEDS_DOCS';

        await supabase.from('document_routing').insert({
            client_id: clientId,
            round_count: nextRound,
            status: 'PENDING'
        });

        if (routingTaskId) await supabase.from('call_routing').update({ status: 'COMPLETED' }).eq('id', routingTaskId);
    }
    await supabase.from('clients').update(updates).eq('id', clientId);
  };

  const handleSubmit = async () => {
    const b = callLog.selectedBureau?.toLowerCase();
    if (!b || !callLog[`${b}_result`] || !callLog[`${b}_callback_date`] || !callLog.phone_number) {
        addToast({ title: "Missing Fields", message: "Please fill in all required fields (Phone, Bureau, Result, Callback Date).", variant: "warning", icon: "bi-exclamation-triangle-fill" });
        return;
    }

    setSubmitting(true);
    const { dateStr } = getESTDate();
    const payload = {
      employee_id: user?.id || null,
      client_id: clientId,
      call_date: dateStr,
      phone_number: callLog.phone_number,
      backlog: !!callLog.backlog,
      [`${b}_start_time`]: callLog[`${b}_start_time`] || null,
      [`${b}_call_length`]: callLog[`${b}_call_length`] || null,
      // Your backend logic historically only tracked auth for exp/eq, but we pass boolean here safely
      [`${b}_auth_required`]: !!callLog[`${b}_auth_required`],
      [`${b}_rep_name`]: callLog[`${b}_rep_name`] || null,
      [`${b}_supervisor_name`]: callLog[`${b}_supervisor_name`] || null,
      [`${b}_confirmation_number`]: callLog[`${b}_confirmation_number`] || null,
      [`${b}_result`]: callLog[`${b}_result`],
      [`${b}_callback_date`]: callLog[`${b}_callback_date`],
      reason: callLog.reason || null,
    };

    try {
      const { error } = await supabase.from("call_logs").insert([payload]);
      if (error) throw error;

      // --- METRICS TRACKING ---
      try {
        if (user?.id) {
          const resultString = String(callLog[`${b}_result`] || "").toUpperCase();

          const isDispute = resultString.includes("DISPUTE") ? 1 : 0;
          const isConfirmed = resultString === "DELETED" ? 1 : 0;
          const isUnable = (resultString.includes("UNABLE") || resultString.includes("INVALID")) ? 1 : 0;
          const isDisconnected = resultString.includes("DISCONNECTED") ? 1 : 0;

          await supabase.rpc("increment_call_metrics", {
            uid: user.id,
            ldate: dateStr, 
            total_calls: 1, 
            total_docs: 0, 
            total_disputes: isDispute,
            total_confirmed: isConfirmed,
            total_unable_to_dispute: isUnable,
            total_disconnected: isDisconnected,
            total_count: 0, 
          });
        }
      } catch (e) {
        console.error("Metrics error:", e);
      }
      // ------------------------------

      await handleWorkflowSideEffects(b, callLog[`${b}_result`]);

      if (routingTaskId && IS_DEFINITIVE_RESULT.includes(callLog[`${b}_result`]) && callLog[`${b}_result`] !== 'DOCUMENTS NOT YET RECEIVED') {
          await supabase.from('call_routing').update({ status: 'COMPLETED' }).eq('id', routingTaskId);
      }

      try { await sendCall(b, { ...payload, bureau: b, name: client?.full_name }); } catch (e) {}

      addToast({ title: "Logged", message: "Call logged & updated.", variant: "success", icon: "bi-telephone-fill" });
      onClose();
    } catch (err) {
      addToast({ title: "Error", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;
  const b = callLog.selectedBureau;

  return (
    <div className="modal fade show d-block" style={{ backgroundColor: "rgba(0,0,0,0.5)", overflowY: "auto" }}>
      <div className="modal-dialog modal-lg my-4">
        <div className="modal-content">
          <div className="modal-header bg-light">
            <h5 className="modal-title fw-bold">📞 Log Call for {client?.full_name || "Client"}</h5>
            <button className="btn-close" onClick={onClose}></button>
          </div>
          
          <div className="modal-body">
            {/* --- GENERAL INFO --- */}
<div className="mb-3 row">
  <div className="flex flex-wrap gap-6 px-3">
    <div>
      <span className="font-semibold">Equifax:</span> 
      <a href="tel:8882980081" className="ml-2 text-blue-600 hover:underline">(888) 298-0081</a>
    </div>
    <div>
      <span className="font-semibold">Experian:</span> 
      <a href="tel:8883973742" className="ml-2 text-blue-600 hover:underline">(888) 397-3742</a>
    </div>
    <div>
      <span className="font-semibold">TransUnion:</span> 
      <a href="tel:8009168800" className="ml-2 text-blue-600 hover:underline">(800) 916-8800</a>
    </div>
  </div>
</div>
            <div className="row mb-3">
              <div className="col-md-8">
                <label className="fw-bold small text-muted">Phone Used <span className="text-danger">*</span></label>
                <input className="form-control" placeholder="(555) 555-5555" value={callLog.phone_number} onChange={e=>setCallLog({...callLog, phone_number: e.target.value})} />
              </div>
              <div className="col-md-4 d-flex align-items-end">
                <div className="form-check mb-2">
                  <input className="form-check-input" type="checkbox" id="backlogCheck" checked={callLog.backlog} onChange={e=>setCallLog({...callLog, backlog: e.target.checked})} />
                  <label className="form-check-label fw-bold small text-muted" htmlFor="backlogCheck">Is Backlog?</label>
                </div>
              </div>
            </div>

            <div className="mb-4">
                <label className="fw-bold small text-muted">Bureau <span className="text-danger">*</span></label>
                <select className="form-select border-primary" value={callLog.selectedBureau} disabled={!!bureau} onChange={e=>setCallLog({...callLog, selectedBureau: e.target.value})}>
                    <option value="">-- Select Bureau --</option>
                    <option value="exp">Experian</option>
                    <option value="tu">TransUnion</option>
                    <option value="eq">Equifax</option>
                </select>
                {bureau && <div className="form-text">Locked to this bureau's call task.</div>}
            </div>
            
            {/* --- BUREAU SPECIFIC FIELDS (ANIMATED) --- */}
            <div ref={animateParent}>
                {b && (
                    <div className="bg-light p-3 rounded border mb-3">
                        <h6 className="fw-bold text-primary mb-3 text-uppercase">{b} Details</h6>
                        
                        <div className="row mb-3">
                            <div className="col-md-6">
                              <label className="small fw-bold text-muted">Rep Name</label>
                              <input type="text" className="form-control form-control-sm" placeholder="e.g. Mandy" value={callLog[`${b}_rep_name`] || ""} onChange={e=>setCallLog({...callLog, [`${b}_rep_name`]: e.target.value})} />
                            </div>
                            <div className="col-md-6">
                              <label className="small fw-bold text-muted">Supervisor Name</label>
                              <input type="text" className="form-control form-control-sm" placeholder="e.g. John Doe or N/A" value={callLog[`${b}_supervisor_name`] || ""} onChange={e=>setCallLog({...callLog, [`${b}_supervisor_name`]: e.target.value})} />
                            </div>
                        </div>

                        <div className="row mb-3">
                            <div className="col-md-4">
                              <label className="small fw-bold text-muted">Start Time</label>
                              <input type="time" className="form-control form-control-sm" value={callLog[`${b}_start_time`] || ""} onChange={e=>setCallLog({...callLog, [`${b}_start_time`]: e.target.value})} />
                            </div>
                            <div className="col-md-4">
                              <label className="small fw-bold text-muted">Call Length</label>
                              <input type="text" className="form-control form-control-sm" placeholder="e.g. 00:15" value={callLog[`${b}_call_length`] || ""} onChange={e=>setCallLog({...callLog, [`${b}_call_length`]: e.target.value})} />
                            </div>
                            <div className="col-md-4 d-flex align-items-end">
                              <div className="form-check mb-1">
                                <input className="form-check-input" type="checkbox" id={`${b}_authCheck`} checked={callLog[`${b}_auth_required`] || false} onChange={e=>setCallLog({...callLog, [`${b}_auth_required`]: e.target.checked})} />
                                <label className="form-check-label small fw-bold text-muted" htmlFor={`${b}_authCheck`}>Auth Required?</label>
                              </div>
                            </div>
                        </div>

                        <div className="row mb-3">
                            <div className="col-md-12">
                              <label className="small fw-bold text-muted">Confirmation Number</label>
                              <input type="text" className="form-control form-control-sm" placeholder="e.g. 123456789" value={callLog[`${b}_confirmation_number`] || ""} onChange={e=>setCallLog({...callLog, [`${b}_confirmation_number`]: e.target.value})} />
                            </div>
                        </div>

                        <hr />

                        <div className="row mb-2">
                            <div className="col-md-6">
                                <label className="small fw-bold text-muted">Result <span className="text-danger">*</span></label>
                                <select className="form-select form-select-sm" value={callLog[`${b}_result`] || ""} onChange={e=>setCallLog({...callLog, [`${b}_result`]: e.target.value})}>
                                    <option value="">Select...</option>
                                    <option value="DELETED">DELETED</option>
                                    <option value="DOCUMENTS NOT YET RECEIVED">DOCUMENTS NOT YET RECEIVED</option>
                                    <option value="DISPUTED">DISPUTED</option>
                                    <option value="INVALID FTC">INVALID FTC</option>
                                    <option value="CALL DISCONNECTED">CALL DISCONNECTED</option>
                                    <option value="STILL UNDER DISPUTE">STILL UNDER DISPUTE</option>
                                    <option value="PARTLY DISPUTED">PARTLY DISPUTED</option>
                                    <option value="UNABLE TO PASS AUTHENTICATION">UNABLE TO PASS AUTHENTICATION</option>
                                </select>
                            </div>
                            <div className="col-md-6">
                              <label className="small fw-bold text-muted">Callback Date <span className="text-danger">*</span></label>
                              <input type="date" className="form-control form-control-sm" value={callLog[`${b}_callback_date`] || ""} onChange={e=>setCallLog({...callLog, [`${b}_callback_date`]: e.target.value})} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* --- REASON / NOTES --- */}
            <div className="mb-2">
              <label className="fw-bold small text-muted">Reason / Additional Notes</label>
              <textarea 
                className="form-control" 
                rows="3" 
                placeholder="e.g. Unable to pass authentication, I have no access on email..."
                value={callLog.reason} 
                onChange={e=>setCallLog({...callLog, reason: e.target.value})}
              ></textarea>
            </div>

          </div>
          <div className="modal-footer bg-light">
            <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="btn btn-primary px-4 fw-bold" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Call Log'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}