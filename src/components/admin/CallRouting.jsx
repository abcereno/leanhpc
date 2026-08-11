import React, { useState, useEffect } from "react";
import { Container, Card, Table, Form, Badge, Button, Spinner, Alert, Modal } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";
import LogCallModal from "./client-profile/modals/LogCallModal";

const STATUS_OPTIONS = [
  { label: "NEW", color: "#f8d7da", textColor: "#721c24" },
  { label: "IN PROGRESS", color: "#fff3cd", textColor: "#856404" },
  { label: "COMPLETED", color: "#198754", textColor: "#fff" },
  { label: "DOCS SUBMITTED", color: "#e0cffc", textColor: "#3e0075" },
  { label: "UNABLE TO DISPUTE", color: "#dc3545", textColor: "#fff" },
  { label: "AWAITING FOR ID'S", color: "#0d6efd", textColor: "#fff" },
  { label: "NO DOCS YET", color: "#8B4513", textColor: "#fff" },
  { label: "FOR AUTHENTICATION", color: "#212529", textColor: "#fff" },
  { label: "N/A", color: "#e2e3e5", textColor: "#383d41" }
];

export default function CallRouting() {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState([]); 
  const [clientsList, setClientsList] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [refreshTrigger, setRefreshTrigger] = useState(0); 

  const [showModal, setShowModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newCall, setNewCall] = useState({ client_id: "", scheduled_date: selectedDate, assigned_admin_id: "" });
  const [processingId, setProcessingId] = useState(null);

  // Same "Log Call" pattern My Call Queue already uses (CallQueue.jsx) —
  // one consistent place a call outcome gets logged from, instead of this
  // screen's own separate status-dropdown + Done/Retry flow. LogCallModal
  // itself marks the call_routing row COMPLETED and (on "DOCUMENTS NOT YET
  // RECEIVED") re-queues a fresh document_routing round, so nothing else
  // here needs to duplicate that logic anymore. { clientId, taskId, bureau,
  // name } | null.
  const [activeCallLog, setActiveCallLog] = useState(null);

  useEffect(() => {
    const fetchLookups = async () => {
      const [profilesRes, clientsRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name').order('full_name'),
        supabase.from('clients').select('id, full_name').order('full_name')
      ]);
      if (profilesRes.data) setProfiles(profilesRes.data);
      if (clientsRes.data) setClientsList(clientsRes.data);
    };
    fetchLookups();
  }, []);

  useEffect(() => {
    const fetchRoutingList = async () => {
      setLoading(true);

      // Self-healing pass (sql/gate_exp_calls_on_docs_round.sql) — see
      // DocumentRouting.jsx for the same call. Ensures this list reflects
      // the shared EXP/TU/EQ docs-round + 7-day rule even if nobody has
      // been in either routing screen recently.
      const { error: syncErr } = await supabase.rpc('sync_all_workflow_queues');
      if (syncErr && !/does not exist/i.test(syncErr.message || '')) {
        console.warn('sync_all_workflow_queues failed (run sql/gate_exp_calls_on_docs_round.sql):', syncErr.message);
      }

      const { data, error } = await supabase
        .from('call_routing')
        .select(`
            id, scheduled_date, assigned_admin_id, status, client_id, bureau, round_count,
            clients (id, full_name, exp_status, tu_status, eq_status, admin_id, exp_completed, tu_completed, eq_completed)
        `)
        .eq('status', 'PENDING')
        .lte('scheduled_date', selectedDate)
        .order('scheduled_date', { ascending: true });

      if (error) console.error("Routing Fetch Error:", error);

      if (data) {
          // call_routing rows are now per-bureau (sql/add_bureau_call_routing.sql)
          // — a client can have an EXP row and a TU/EQ row pending at the
          // same time, so dedup must key on (client, bureau), not just
          // client, or one of the two would silently disappear from this
          // list. `bureau === null` (a legacy row from before that
          // migration) is its own "legacy" bucket, same as it always was.
          const seenKeys = new Set();
          const formatted = [];

          data.forEach(task => {
              const clientId = task.clients?.id || task.client_id;
              const bureau = task.bureau || null;
              const dedupeKey = `${clientId}:${bureau || 'legacy'}`;
              if (seenKeys.has(dedupeKey)) return; // Prevent dupes
              seenKeys.add(dedupeKey);

              formatted.push({
                  id: task.id,
                  clientId: clientId,
                  bureau,
                  roundCount: task.round_count || null,
                  name: task.clients?.full_name || "Unknown Client",
                  dueDate: task.scheduled_date,
                  assignedCallerId: task.assigned_admin_id || "",
                  docAdminId: task.clients?.admin_id || "",
                  exp: task.clients?.exp_status || "NEW",
                  tu: task.clients?.tu_status || "NEW",
                  eq: task.clients?.eq_status || "NEW",
                  expCompleted: task.clients?.exp_completed || false,
                  tuCompleted: task.clients?.tu_completed || false,
                  eqCompleted: task.clients?.eq_completed || false
              });
          });
          setRows(formatted);
      }
      setLoading(false);
    };
    fetchRoutingList();
  }, [selectedDate, refreshTrigger]);

  // --- ACTION 1: SEND TO CALL QUEUE ---
  const handleLocalCallerChange = (taskId, adminId) => {
      // Just updates the dropdown locally without saving to DB yet
      setRows(prev => prev.map(r => r.id === taskId ? { ...r, assignedCallerId: adminId } : r));
  };

  const handleSendToQueue = async (row) => {
      if (!row.assignedCallerId) return addToast({ title: "Missing Selection", message: "Please select an admin from the dropdown first.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      
      setProcessingId(row.id);
      const { error } = await supabase
          .from('call_routing')
          .update({ assigned_admin_id: row.assignedCallerId })
          .eq('id', row.id);
          
      setProcessingId(null);
      
      if (error) {
          addToast({ title: "Assignment Failed", message: "Error assigning caller: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      } else {
          addToast({ title: "Dispatched", message: `Client successfully dispatched to ${getProfileName(row.assignedCallerId)}'s Call Queue!`, variant: "success", icon: "bi-check-circle-fill" });
      }
  };

const handleAddCall = async () => {
      if (!newCall.client_id || !newCall.scheduled_date) return addToast({ title: "Missing Fields", message: "Please select a client and date.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      
      setAdding(true);

      // 1. STRICT DB CHECK: Prevent duplicate in Calls across ALL dates
      const { count: existingCalls } = await supabase
          .from('call_routing')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', newCall.client_id)
          .eq('status', 'PENDING');

      if (existingCalls > 0) {
          setAdding(false);
          return addToast({ title: "Cannot Add", message: "This client is already in the Call Routing queue (they may be scheduled for a different date).", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      }

      // 2. Prevent cross-contamination (Check if in Docs Queue)
      const { count: inDocs } = await supabase
          .from('document_routing')
          .select('*', { count: 'exact', head: true })
          .eq('client_id', newCall.client_id)
          .eq('status', 'PENDING');

      if (inDocs > 0) {
          setAdding(false);
          return addToast({ title: "Cannot Add", message: "This client is currently active in the Document Routing queue.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      }

      // 3. Insert the manual call task
      const { error } = await supabase.from('call_routing').insert([{
          client_id: newCall.client_id,
          scheduled_date: newCall.scheduled_date,
          assigned_admin_id: newCall.assigned_admin_id || null,
          status: 'PENDING'
      }]);
      
      setAdding(false);

      if (error) addToast({ title: "Add Failed", message: "Failed to add call. " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      else {
          setShowModal(false);
          setNewCall({ client_id: "", scheduled_date: selectedDate, assigned_admin_id: "" });
          setRefreshTrigger(prev => prev + 1); 
      }
  };
  // --- ACTION 2: LOG THE CALL (opens LogCallModal — same component/table
  // My Call Queue already logs into). Bureau-specific rows lock the modal
  // to that row's bureau; legacy bureau=null rows leave its dropdown
  // unlocked, same as CallQueue.jsx. LogCallModal handles marking this
  // call_routing row COMPLETED and, on "DOCUMENTS NOT YET RECEIVED",
  // re-queuing a fresh document_routing round — nothing else here
  // duplicates that anymore.
  const handleOpenLogCall = (row) => {
      setActiveCallLog({ clientId: row.clientId, taskId: row.id, bureau: row.bureau, name: row.name });
  };

  const handleCloseLogCall = () => {
      setActiveCallLog(null);
      setRefreshTrigger(prev => prev + 1); // pick up whatever the modal just changed
  };

  // --- ACTION 3: MARK DONE / REMOVE FROM QUEUE ---
  // Covers the stuck-row case: a bureau's result already shows something
  // definitive (COMPLETED/DELETED/etc — the read-only pills above) but this
  // call_routing row is still PENDING, because whatever set that status
  // (e.g. a manual status edit elsewhere, or a status that predates this
  // row) never went through Log Call to close the row out. Log Call always
  // requires a fresh phone/result/callback entry, so there was previously
  // no way to clear a row like that without fabricating a call that didn't
  // happen. This just closes the row — it never touches the client's
  // bureau status/completed flags, since those are presumably already
  // correct (that's the whole reason this row looks "done" already).
  const handleForceComplete = async (row) => {
      const confirmClose = window.confirm(
          `Remove ${row.name} from the Call Routing queue?\n\nUse this when the bureau status shown above is already resolved (e.g. COMPLETED/DELETED) and there's nothing left to actually call about. This won't change any bureau status — it only clears this queue entry.`
      );
      if (!confirmClose) return;

      setProcessingId(row.id);
      const { error } = await supabase
          .from('call_routing')
          .update({ status: 'COMPLETED' })
          .eq('id', row.id);
      setProcessingId(null);

      if (error) {
          addToast({ title: "Failed", message: "Could not remove from queue: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      } else {
          addToast({ title: "Removed", message: `${row.name} cleared from the Call Routing queue.`, variant: "success", icon: "bi-check-circle-fill" });
          setRefreshTrigger(prev => prev + 1);
      }
  };

  const getProfileName = (id) => {
      const profile = profiles.find(p => p.id === id);
      return profile ? profile.full_name : "Unassigned";
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
            <h2 className="mb-1 fw-bold">📞 Daily Call Routing</h2>
            <p className="text-muted mb-0">Assign callers and route back to docs.</p>
        </div>
        <div className="d-flex align-items-center gap-3">
            <Button variant="outline-primary" onClick={() => { setNewCall(prev => ({ ...prev, scheduled_date: selectedDate })); setShowModal(true); }}>
                <i className="bi bi-plus-circle me-1"></i> Add Call
            </Button>
            <Form.Group className="d-flex align-items-center gap-2 mb-0">
                <Form.Label className="mb-0 fw-bold text-muted text-nowrap">View Due By:</Form.Label>
                <Form.Control type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </Form.Group>
        </div>
      </div>

      {loading ? <div className="text-center p-5"><Spinner animation="border"/></div> : 
       rows.length === 0 ? <Alert variant="success" className="text-center">No calls due for {selectedDate}.</Alert> : (
        <Card className="shadow-sm border-0">
            <Card.Body className="p-0">
                <Table responsive hover className="mb-0 align-middle">
                    <thead className="bg-dark text-white">
                        <tr>
                            <th className="py-3 ps-4">Client Name</th>
                            <th className="py-3 text-center">Due Date</th>
                            <th className="py-3 text-center">Assign & Dispatch</th>
                            <th className="py-3 text-center">Experian</th>
                            <th className="py-3 text-center">TransUnion</th>
                            <th className="py-3 text-center">Equifax</th>
                            <th className="py-3 text-center">Log Call</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            return (
                            <tr key={row.id} style={{borderBottom: '1px solid #f0f0f0'}}>
                                <td className="ps-4 fw-bold text-uppercase text-secondary">
                                    {row.name}
                                    {row.bureau ? (
                                        <Badge bg={row.bureau === 'exp' ? 'dark' : 'info'} text={row.bureau === 'exp' ? undefined : 'dark'} className="ms-2 align-middle">
                                            {row.bureau.toUpperCase()}{row.roundCount ? ` R${row.roundCount}` : ''}
                                        </Badge>
                                    ) : (
                                        <Badge bg="secondary" className="ms-2 align-middle">ALL BUREAUS</Badge>
                                    )}
                                    <div className="text-muted small fw-normal mt-1"><i className="bi bi-person-workspace me-1"></i>Doc Admin: {getProfileName(row.docAdminId)}</div>
                                </td>
                                <td className="text-center">
                                    <Badge bg={row.dueDate < new Date().toISOString().split('T')[0] ? 'danger' : 'success'}>
                                        {row.dueDate}
                                    </Badge>
                                </td>

                                {/* ACTION 1: DISPATCH COLUMN */}
                                <td style={{width: "220px"}} className="px-3">
                                    <div className="d-flex flex-column gap-2">
                                        <Form.Select 
                                            size="sm" 
                                            value={row.assignedCallerId} 
                                            onChange={(e) => handleLocalCallerChange(row.id, e.target.value)}
                                            className="border-primary"
                                        >
                                            <option value="">-- Select Caller --</option>
                                            {profiles.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                                        </Form.Select>
                                        <Button 
                                            size="sm" 
                                            variant="outline-primary" 
                                            className="w-100 fw-bold shadow-sm"
                                            onClick={() => handleSendToQueue(row)}
                                            disabled={processingId === row.id || !row.assignedCallerId}
                                        >
                                            <i className="bi bi-send-check me-1"></i> Send to Queue
                                        </Button>
                                    </div>
                                </td>

                                {/* Bureau-specific rows (row.bureau set) only ever concern one
                                    of these three columns — the other two belong to whatever
                                    track that bureau is currently on (its own independent EXP
                                    row, or a separate TU/EQ row) and are shown dimmed here so
                                    this table doesn't imply editing them affects this task.
                                    Read-only now — Log Call (below) is the one place a status
                                    actually gets changed, same as My Call Queue. */}
                                <td className="p-1" style={row.bureau && row.bureau !== 'exp' ? { opacity: 0.35 } : undefined}>
                                    <StatusPill value={row.exp} />
                                </td>
                                <td className="p-1" style={row.bureau && row.bureau !== 'tu' ? { opacity: 0.35 } : undefined}>
                                    <StatusPill value={row.tu} />
                                </td>
                                <td className="p-1" style={row.bureau && row.bureau !== 'eq' ? { opacity: 0.35 } : undefined}>
                                    <StatusPill value={row.eq} />
                                </td>

                                {/* ACTION 2: LOG CALL — opens LogCallModal (see
                                    handleOpenLogCall above), locked to this row's bureau for
                                    bureau-specific rows, or left open to pick for legacy rows.
                                    ACTION 3: Mark Done — for a row that's stuck PENDING even
                                    though the pill(s) above already show a resolved status (see
                                    handleForceComplete). */}
                                <td className="text-center px-3" style={{width: "160px"}}>
                                    <div className="d-flex flex-column gap-1">
                                        <Button
                                            size="sm"
                                            variant="primary"
                                            onClick={() => handleOpenLogCall(row)}
                                            className="w-100 fw-bold shadow-sm py-2"
                                        >
                                            <i className="bi bi-telephone-plus me-1"></i> Log Call
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline-secondary"
                                            onClick={() => handleForceComplete(row)}
                                            disabled={processingId === row.id}
                                            className="w-100"
                                            title="Use this when the status above is already resolved and this row is just stuck in the queue"
                                        >
                                            <i className="bi bi-check2-circle me-1"></i> Mark Done
                                        </Button>
                                    </div>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </Table>
            </Card.Body>
        </Card>
      )}

      {/* Manual Add Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Manual Call Assignment</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Select Client <span className="text-danger">*</span></Form.Label>
            <Form.Select 
                value={newCall.client_id}
                onChange={(e) => setNewCall({...newCall, client_id: e.target.value})}
            >
                <option value="">-- Choose a Client --</option>
                {clientsList.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Scheduled Date <span className="text-danger">*</span></Form.Label>
            <Form.Control 
                type="date" 
                value={newCall.scheduled_date}
                onChange={(e) => setNewCall({...newCall, scheduled_date: e.target.value})}
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold text-primary">Assign a Caller (Optional)</Form.Label>
            <Form.Select 
                value={newCall.assigned_admin_id}
                onChange={(e) => setNewCall({...newCall, assigned_admin_id: e.target.value})}
            >
                <option value="">-- Unassigned --</option>
                {profiles.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)} disabled={adding}>Cancel</Button>
          <Button variant="primary" onClick={handleAddCall} disabled={adding}>
            {adding ? <Spinner size="sm" animation="border" /> : "Save Call Task"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Log Call Modal — same component My Call Queue (CallQueue.jsx) uses.
          routingTaskId + bureau let it mark the right call_routing row
          COMPLETED and preselect/lock the right bureau instead of only
          updating `clients` and leaving this row PENDING forever. */}
      {activeCallLog && (
          <LogCallModal
              show={true}
              onClose={handleCloseLogCall}
              clientId={activeCallLog.clientId}
              routingTaskId={activeCallLog.taskId}
              bureau={activeCallLog.bureau}
          />
      )}
    </Container>
  );
}

// Read-only replacement for the old editable StatusDropdown — Log Call
// (LogCallModal) is now the one place a bureau's status actually changes,
// so this is just for at-a-glance visibility of the current value.
function StatusPill({ value }) {
    const activeConfig = STATUS_OPTIONS.find(s => s.label === value) || {};
    return (
        <div
            className="text-center w-100 h-100 py-2 rounded"
            style={{
                backgroundColor: activeConfig.color || '#fff',
                color: activeConfig.textColor || '#000',
                fontWeight: '700',
                fontSize: '0.85rem'
            }}
        >
            {value || 'NEW'}
        </div>
    );
}