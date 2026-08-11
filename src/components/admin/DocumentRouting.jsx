import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Container, Card, Table, Form, Button, Badge, Spinner, Modal } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";
import LogDocumentModal from "./client-profile/modals/LogDocumentModal";
import LogChecklistItemModal from "./client-profile/modals/LogChecklistItemModal";

// Matches sql/gate_exp_calls_on_docs_round.sql's own 7-day gate — a round
// past this age that still isn't fully submitted will never auto-queue an
// EXP, TU, or EQ call on its own, so it needs a person to actually finish
// it rather than just waiting it out further.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export default function DocumentRouting() {
  const { addToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [clientsList, setClientsList] = useState([]); 
  const [clientRounds, setClientRounds] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null); 
  const [refreshTrigger, setRefreshTrigger] = useState(0); 

  const [showModal, setShowModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTask, setNewTask] = useState({ client_id: "", round_count: 1, assigned_admin_id: "" });

  // Checking (not unchecking) EXP/TU/EQ "submitted" opens Log Document
  // instead of silently flipping the box — that checkbox means "docs went
  // out to this bureau," which is exactly what Log Document is for
  // (webhook + note + clears the docs reminder). { task, bureau, field } | null.
  const [logDocsFor, setLogDocsFor] = useState(null);

  // Same "checking opens a log prompt instead of instant-toggling" pattern
  // as logDocsFor above, but for the four generic checklist checkboxes
  // (FTC, CFPB, Postalocity, Certified Postalocity) — these log into the
  // client's Activity Thread (comments table) via LogChecklistItemModal
  // instead of document_logs, since there's no per-bureau webhook/reminder
  // to clear for them. { task, field, label } | null.
  const [logChecklistFor, setLogChecklistFor] = useState(null);

  // 1. SMART FETCH DATA
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Self-healing pass (sql/gate_exp_calls_on_docs_round.sql) — auto-
      // queues EXP/TU/EQ calls once 7 days have passed since the latest
      // docs round was created AND FTC/CFPB/that bureau's own submitted
      // checkbox are all checked, so this list is correct even if nobody
      // has opened Document/Call Routing in a while. Missing-function
      // failure (migration not run yet) just means no auto-healing this
      // load — everything below still works off whatever rows already
      // exist.
      const { error: syncErr } = await supabase.rpc('sync_all_workflow_queues');
      if (syncErr && !/does not exist/i.test(syncErr.message || '')) {
        console.warn('sync_all_workflow_queues failed (run sql/gate_exp_calls_on_docs_round.sql):', syncErr.message);
      }

      const [adminRes, clientRes, callRes, docRes, allDocsRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name').order('full_name'),
          supabase.from('clients').select('id, full_name, is_paid, exp_completed, tu_completed, eq_completed, admin_id').order('full_name', { ascending: true }),
          supabase.from('call_routing').select('client_id').eq('status', 'PENDING'),
          supabase.from('document_routing').select('*, profiles:assigned_admin_id (full_name)').eq('status', 'PENDING'),
          supabase.from('document_routing').select('client_id, round_count') 
      ]);

      if (adminRes.data) setAdmins(adminRes.data);

      const allClients = clientRes.data || [];
      setClientsList(allClients); 

      const activeCalls = callRes.data || [];
      const activeDocs = docRes.data || [];
      const allDocs = allDocsRes.data || [];
      
      const maxRounds = {};
      allDocs.forEach(doc => {
          if (!maxRounds[doc.client_id] || doc.round_count > maxRounds[doc.client_id]) {
              maxRounds[doc.client_id] = doc.round_count;
          }
      });
      setClientRounds(maxRounds);

      let formattedTasks = [];
      const existingDocClientIds = new Set();
      
      // A. Process Existing Pending Doc Tasks
      activeDocs.forEach(t => {
          if (existingDocClientIds.has(t.client_id)) return; 

          const c = allClients.find(client => client.id === t.client_id);
          if (c) {
             const isFullyDone = c.exp_completed && c.tu_completed && c.eq_completed;
             const inCallQueue = activeCalls.some(call => call.client_id === c.id);
             if (isFullyDone || inCallQueue) return; 
          }

          existingDocClientIds.add(t.client_id);
          const d = new Date(t.created_at || new Date());
          d.setDate(d.getDate() + 7);
          
          formattedTasks.push({
             ...t,
             targetDate: t.targetDate || d.toISOString().split('T')[0],
             clients: c || { full_name: "Unknown Client", exp_completed: false, tu_completed: false, eq_completed: false }
          });
      });

      // B. Create Virtual Tasks
      allClients.forEach(c => {
          if (!c.is_paid) return; 

          const isFullyDone = c.exp_completed && c.tu_completed && c.eq_completed;
          const inCallQueue = activeCalls.some(call => call.client_id === c.id);

          if (!isFullyDone && !inCallQueue && !existingDocClientIds.has(c.id)) {
              existingDocClientIds.add(c.id); 
              const nextRound = (maxRounds[c.id] || 0) + 1;
              const d = new Date();
              d.setDate(d.getDate() + 7);
              
              formattedTasks.push({
                 id: `virtual-${c.id}`, 
                 is_virtual: true,
                 client_id: c.id,
                 round_count: nextRound,
                 status: 'PENDING',
                 ftc_completed: false,
                 cfpb_completed: false,
                 postalocity_completed: false,
                 certified_postalocity_completed: false,
                 exp_submitted: false,
                 tu_submitted: false,
                 eq_submitted: false,
                 assigned_admin_id: c.admin_id || null,
                 targetDate: d.toISOString().split('T')[0],
                 clients: c
              });
          }
      });

      formattedTasks.sort((a, b) => new Date(a.targetDate) - new Date(b.targetDate));
      setTasks(formattedTasks);
      setLoading(false);
    };
    
    fetchData();
  }, [refreshTrigger]);

  // 2. VIRTUAL TASK MATERIALIZER
  const ensureRealTask = async (task) => {
      if (!task.is_virtual) return task.id;
      
      const { data, error } = await supabase.from('document_routing').insert({
          client_id: task.client_id,
          round_count: task.round_count,
          status: 'PENDING',
          assigned_admin_id: task.assigned_admin_id,
          ftc_completed: task.ftc_completed,
          cfpb_completed: task.cfpb_completed,
          postalocity_completed: task.postalocity_completed,
          certified_postalocity_completed: task.certified_postalocity_completed,
          exp_submitted: task.exp_submitted,
          tu_submitted: task.tu_submitted,
          eq_submitted: task.eq_submitted
      }).select().single();
      
      if (error) throw error;
      
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...data, is_virtual: false } : t));
      return data.id;
  };

  const updateTaskLocal = (id, field, value) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const saveAssignment = async (task, adminId) => {
      setSavingId(task.id);
      updateTaskLocal(task.id, 'assigned_admin_id', adminId);
      try {
          const realId = await ensureRealTask(task);
          await supabase.from('document_routing').update({ assigned_admin_id: adminId || null }).eq('id', realId);
      } catch (error) {
          addToast({ title: "Assignment Failed", message: "Error assigning admin: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      }
      setSavingId(null);
  };

  const toggleCheck = async (task, field) => {
      if (savingId === task.id) return;
      setSavingId(task.id);

      const currentVal = task[field];
      const nextVal = !currentVal;
      updateTaskLocal(task.id, field, nextVal);

      try {
          // Pass the already-flipped value into ensureRealTask, not the
          // stale `task` snapshot — a still-virtual task's very first
          // checkbox toggle materializes the row here, and ensureRealTask's
          // own setTasks() merges its insert response (`data`) back over
          // local state. If that insert were built from the pre-toggle
          // `task` object, `data[field]` would still be the OLD value and
          // this merge would silently clobber the optimistic flip above
          // back to unchecked, even though the DB write below is correct —
          // the checkbox would visually revert right after being checked.
          const realId = await ensureRealTask({ ...task, [field]: nextVal });
          await supabase.from('document_routing').update({ [field]: nextVal }).eq('id', realId);
      } catch (err) {
          updateTaskLocal(task.id, field, currentVal);
          addToast({ title: "Save Failed", message: "Error saving: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      }
      setSavingId(null);
  };

  // 3. SUBMIT TO CALL ROUTING
  const handleSubmit = async (task) => {
    if (!task.ftc_completed || !task.cfpb_completed) {
        if(!window.confirm("Checklist incomplete. Proceed anyway?")) return;
    }
    setSavingId(task.id);

    try {
        const { data: userData } = await supabase.auth.getUser();

        const bureauSummary = [
            task.exp_submitted ? 'EXP' : '',
            task.tu_submitted ? 'TU' : '',
            task.eq_submitted ? 'EQ' : ''
        ].filter(Boolean).join(', ');

        const logNote = `Round ${task.round_count} Docs Submitted (${bureauSummary || 'None'}). Scheduled for ${task.targetDate}`;
        const realId = await ensureRealTask(task);

        const { error } = await supabase.rpc('process_docs_to_calls', {
            p_doc_task_id: realId,
            p_client_id: task.client_id,
            p_target_date: task.targetDate,
            p_admin_id: userData.user.id,
            p_log_note: logNote,
            p_exp_update: (task.exp_submitted && !task.clients?.exp_completed) ? 'DOCS SUBMITTED' : null,
            p_tu_update: (task.tu_submitted && !task.clients?.tu_completed) ? 'DOCS SUBMITTED' : null,
            p_eq_update: (task.eq_submitted && !task.clients?.eq_completed) ? 'DOCS SUBMITTED' : null
        });

        if (error) throw error;

        setTasks(prev => prev.filter(t => t.id !== task.id));
        addToast({ title: "Submitted", message: "Documents Submitted & Sent to Call Queue", variant: "success", icon: "bi-check-circle-fill" });

    } catch (err) {
        console.error("RPC Error:", err);
        addToast({ title: "Error", message: "Error: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setSavingId(null);
    }
  };

  // 👇 NEW: DELETE TASK FROM BOTH QUEUES 👇
  const handleDeleteTask = async (task) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to completely remove ${task.clients?.full_name || 'this client'} from the queues?\n\nThis will delete their active routing tasks and mark their bureaus as completed to stop them from auto-queueing.`
    );
    if (!confirmDelete) return;

    setSavingId(task.id);
    try {
        // 1. Delete from document_routing
        await supabase.from('document_routing').delete().eq('client_id', task.client_id).eq('status', 'PENDING');
        
        // 2. Delete from call_routing
        await supabase.from('call_routing').delete().eq('client_id', task.client_id).eq('status', 'PENDING');

        // 3. Complete the bureaus in the clients table so the Virtual Task logic doesn't instantly pull them back in
        await supabase.from('clients').update({
            exp_completed: true,
            tu_completed: true,
            eq_completed: true
        }).eq('id', task.client_id);

        setRefreshTrigger(prev => prev + 1); // Refresh the UI
    } catch (err) {
        console.error("Delete Error:", err);
        addToast({ title: "Delete Failed", message: "Failed to delete task: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setSavingId(null);
    }
  };

  // 4. MANUAL ADD: DROPS A CLIENT BACK INTO THE LOOP
  const handleAddDocTask = async () => {
    if (!newTask.client_id || !newTask.round_count) return addToast({ title: "Missing Fields", message: "Please select a client and round.", variant: "warning", icon: "bi-exclamation-triangle-fill" });

    const isAlreadyInQueue = tasks.some(t => t.client_id === newTask.client_id);
    if (isAlreadyInQueue) {
        return addToast({ title: "Already Queued", message: "This client is already active in the Document Routing queue!", variant: "warning", icon: "bi-exclamation-triangle-fill" });
    }

    setAdding(true);

    const { count: inCalls } = await supabase
        .from('call_routing')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', newTask.client_id)
        .eq('status', 'PENDING');

    if (inCalls > 0) {
        setAdding(false);
        return addToast({ title: "Cannot Add", message: "This client is currently active in the Call Routing queue. They must finish calls first.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
    }

    await supabase.from('clients').update({
        exp_completed: false,
        tu_completed: false,
        eq_completed: false,
        exp_status: 'NEW',
        tu_status: 'NEW',
        eq_status: 'NEW'
    }).eq('id', newTask.client_id);

    const { error } = await supabase.from('document_routing').insert([{
        client_id: newTask.client_id,
        round_count: newTask.round_count,
        assigned_admin_id: newTask.assigned_admin_id || null,
        status: 'PENDING',
        ftc_completed: false,
        cfpb_completed: false,
        postalocity_completed: false,
        certified_postalocity_completed: false,
        exp_submitted: false,
        tu_submitted: false,
        eq_submitted: false
    }]);
    
    setAdding(false);

    if (error) addToast({ title: "Add Failed", message: "Failed to add task: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    else {
        setShowModal(false);
        setNewTask({ client_id: "", round_count: 1, assigned_admin_id: "" });
        setRefreshTrigger(prev => prev + 1); 
    }
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <h3 className="mb-0 fw-bold text-primary"><i className="bi bi-file-earmark-text me-2"></i>Document Routing</h3>
        <Button variant="outline-primary" onClick={() => setShowModal(true)}>
            <i className="bi bi-arrow-repeat me-1"></i> Add Client to Loop
        </Button>
      </div>

      {loading ? <Spinner animation="border" /> : (
        <Card className="shadow-sm border-0">
          <Table responsive hover className="align-middle mb-0">
            <thead className="bg-light">
              <tr>
                <th className="py-3 ps-3">Client</th>
                <th className="py-3 text-center">Round</th>
                <th className="py-3">Doc Admin (You)</th>
                <th className="py-3 text-center">FTC</th>
                <th className="py-3 text-center">CFPB</th>
                <th className="py-3 text-center">Postalocity</th>
                <th className="py-3 text-center">Certified Postalocity</th>
                <th className="py-3 text-center table-primary">EXP</th>
                <th className="py-3 text-center table-warning">TU</th>
                <th className="py-3 text-center table-success">EQ</th>
                <th className="py-3">Schedule Call</th>
                <th className="py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 ? <tr><td colSpan="12" className="text-center p-4">No pending documents.</td></tr> :
              tasks.map(task => {
                const isExpDone = task.clients?.exp_completed;
                const isTuDone = task.clients?.tu_completed;
                const isEqDone = task.clients?.eq_completed;

                // A draft (virtual) row has no real round yet, so it can't
                // be overdue — only a real, still-PENDING round whose 7-day
                // window has passed without FTC/CFPB/every still-pending
                // bureau's checkbox ever getting checked. A bureau already
                // completed/N-A for this client doesn't need this round's
                // checkbox at all, so it's excluded rather than counted
                // against the round (isExpDone/isTuDone/isEqDone above).
                const isOverdue = !task.is_virtual && task.created_at &&
                    (Date.now() - new Date(task.created_at).getTime() >= SEVEN_DAYS_MS) &&
                    !(
                      task.ftc_completed && task.cfpb_completed &&
                      (isExpDone || task.exp_submitted) &&
                      (isTuDone || task.tu_submitted) &&
                      (isEqDone || task.eq_submitted)
                    );

                return (
                <tr key={task.id} className={isOverdue ? "table-danger" : undefined}>
                  <td className="fw-bold ps-3 text-uppercase">
                      {task.clients?.full_name ? (
                        <Link to={`/clients/${task.client_id}`} className="text-decoration-none text-secondary" title="Open this client's profile">
                          {task.clients.full_name}
                        </Link>
                      ) : (
                        // No matching clients row — an orphaned routing row
                        // left over from a deleted client (see
                        // sql/fix_orphaned_routing_rows.sql), so there's no
                        // profile to link to.
                        <span className="text-secondary" title="This client record no longer exists — run sql/fix_orphaned_routing_rows.sql to clean these up">Unknown</span>
                      )}
                      {task.is_virtual && <span className="ms-2 badge bg-light text-muted border" style={{fontSize:'0.65rem'}}>Draft</span>}
                      {isOverdue && (
                        <span
                          className="ms-2 badge bg-danger"
                          style={{fontSize:'0.65rem'}}
                          title="Past 7 days and still not fully submitted — this round won't auto-queue a call for any still-pending bureau until FTC, CFPB, and that bureau's checkbox are checked."
                        >
                          <i className="bi bi-exclamation-triangle-fill me-1"></i>OVERDUE
                        </span>
                      )}
                  </td>
                  <td className="text-center"><Badge bg="info">R{task.round_count}</Badge></td>
                  
                  <td style={{width: "200px"}}>
                    <div className="d-flex align-items-center gap-2">
                        <Form.Select 
                            size="sm" 
                            value={task.assigned_admin_id || ""} 
                            className="border-primary"
                            onChange={(e) => saveAssignment(task, e.target.value)}
                        >
                            <option value="">-- Claim Client --</option>
                            {admins.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                        </Form.Select>
                    </div>
                  </td>

                  <td className="text-center">
                    <Form.Check
                      checked={task.ftc_completed}
                      onChange={() =>
                        task.ftc_completed
                          ? toggleCheck(task, 'ftc_completed')
                          : setLogChecklistFor({ task, field: 'ftc_completed', label: 'FTC Complaint' })
                      }
                    />
                  </td>
                  <td className="text-center">
                    <Form.Check
                      checked={task.cfpb_completed}
                      onChange={() =>
                        task.cfpb_completed
                          ? toggleCheck(task, 'cfpb_completed')
                          : setLogChecklistFor({ task, field: 'cfpb_completed', label: 'CFPB Complaint' })
                      }
                    />
                  </td>
                  <td className="text-center">
                    <Form.Check
                      checked={task.postalocity_completed}
                      onChange={() =>
                        task.postalocity_completed
                          ? toggleCheck(task, 'postalocity_completed')
                          : setLogChecklistFor({ task, field: 'postalocity_completed', label: 'Postalocity' })
                      }
                    />
                  </td>
                  <td className="text-center">
                    <Form.Check
                      checked={task.certified_postalocity_completed}
                      onChange={() =>
                        task.certified_postalocity_completed
                          ? toggleCheck(task, 'certified_postalocity_completed')
                          : setLogChecklistFor({ task, field: 'certified_postalocity_completed', label: 'Certified Postalocity' })
                      }
                    />
                  </td>

                  <td className={`text-center ${isExpDone ? "bg-light text-muted" : "table-primary bg-opacity-10"}`}>
                      {isExpDone ? <i className="bi bi-check-circle-fill text-success"></i> :
                      <Form.Check
                          checked={task.exp_submitted}
                          onChange={() =>
                              task.exp_submitted
                                  ? toggleCheck(task, 'exp_submitted')
                                  : setLogDocsFor({ task, bureau: 'EXP', field: 'exp_submitted' })
                          }
                      />}
                  </td>
                  <td className={`text-center ${isTuDone ? "bg-light text-muted" : "table-warning bg-opacity-10"}`}>
                      {isTuDone ? <i className="bi bi-check-circle-fill text-success"></i> :
                      <Form.Check
                          checked={task.tu_submitted}
                          onChange={() =>
                              task.tu_submitted
                                  ? toggleCheck(task, 'tu_submitted')
                                  : setLogDocsFor({ task, bureau: 'TU', field: 'tu_submitted' })
                          }
                      />}
                  </td>
                  <td className={`text-center ${isEqDone ? "bg-light text-muted" : "table-success bg-opacity-10"}`}>
                      {isEqDone ? <i className="bi bi-check-circle-fill text-success"></i> :
                      <Form.Check
                          checked={task.eq_submitted}
                          onChange={() =>
                              task.eq_submitted
                                  ? toggleCheck(task, 'eq_submitted')
                                  : setLogDocsFor({ task, bureau: 'EQ', field: 'eq_submitted' })
                          }
                      />}
                  </td>
                  
                  <td>
                    <Form.Control type="date" size="sm" value={task.targetDate} onChange={(e) => updateTaskLocal(task.id, 'targetDate', e.target.value)} />
                  </td>
                  
                  {/* 👇 UPDATED ACTION COLUMN WITH DELETE BUTTON 👇 */}
                  <td className="text-center">
                    <div className="d-flex justify-content-center gap-2">
                        <Button size="sm" variant="success" onClick={() => handleSubmit(task)} disabled={savingId === task.id}>
                            {savingId === task.id ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-arrow-right me-1"></i> Send</>}
                        </Button>
                        <Button size="sm" variant="outline-danger" onClick={() => handleDeleteTask(task)} disabled={savingId === task.id} title="Remove from Queues">
                            <i className="bi bi-trash"></i>
                        </Button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Manual Add / Loop Client Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title><i className="bi bi-arrow-repeat me-2"></i>Loop Client into Docs</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Select Client <span className="text-danger">*</span></Form.Label>
            <Form.Select 
                value={newTask.client_id}
                onChange={(e) => {
                    const cid = e.target.value;
                    const nextRound = (clientRounds[cid] || 0) + 1;
                    setNewTask({...newTask, client_id: cid, round_count: nextRound});
                }}
            >
                <option value="">-- Search & Choose a Client --</option>
                {clientsList.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Dispute Round <span className="text-danger">*</span></Form.Label>
            <Form.Control 
                type="number" 
                min="1"
                value={newTask.round_count}
                onChange={(e) => setNewTask({...newTask, round_count: parseInt(e.target.value) || 1})}
            />
            <Form.Text className="text-muted small">Auto-filled based on client's history.</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold text-primary">Assign Doc Admin (Optional)</Form.Label>
            <Form.Select 
                value={newTask.assigned_admin_id}
                onChange={(e) => setNewTask({...newTask, assigned_admin_id: e.target.value})}
            >
                <option value="">-- Unassigned --</option>
                {admins.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)} disabled={adding}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAddDocTask} disabled={adding}>
            {adding ? <Spinner size="sm" animation="border" /> : "Save & Add to Queue"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Log Document Modal — opened from an EXP/TU/EQ "submitted"
          checkbox above. Fully unmounts when logDocsFor is null so each
          open gets a fresh initialBureaus/state (see LogDocumentModal's own
          useState initializer). */}
      {logDocsFor && (
        <LogDocumentModal
          show={true}
          onClose={() => setLogDocsFor(null)}
          clientId={logDocsFor.task.client_id}
          initialBureaus={{ [logDocsFor.bureau]: true }}
          onLogged={() => toggleCheck(logDocsFor.task, logDocsFor.field)}
        />
      )}

      {/* Log Checklist Item Modal — opened from FTC/CFPB/Postalocity/
          Certified Postalocity "completed" checkboxes above. Posts to the
          client's Activity Thread (comments table) instead of
          document_logs, then flips the checkbox via the same toggleCheck
          used everywhere else in this file. */}
      {logChecklistFor && (
        <LogChecklistItemModal
          show={true}
          onClose={() => setLogChecklistFor(null)}
          clientId={logChecklistFor.task.client_id}
          label={logChecklistFor.label}
          roundCount={logChecklistFor.task.round_count}
          onLogged={() => toggleCheck(logChecklistFor.task, logChecklistFor.field)}
        />
      )}

    </Container>
  );
}