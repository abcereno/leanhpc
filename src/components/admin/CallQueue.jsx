import React, { useState, useEffect } from "react";
import { Container, Card, Table, Badge, Spinner, Alert, Button, Modal } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";

// Imports based on your existing structure
import LogCallModal from "./client-profile/modals/LogCallModal"; 
import CommentsSection from "./client-profile/CommentsSection"; 

export default function MyCallQueue() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- MODAL STATE ---
  const [activeModal, setActiveModal] = useState(null); // 'logCall' or 'activity'
  const [selectedClient, setSelectedClient] = useState(null); // Store whole client object for title

  useEffect(() => {
    const fetchMyCalls = async () => {
      if (!user?.id) return;
      
      setLoading(true);

      // Self-healing pass (sql/gate_exp_calls_on_docs_round.sql) — same
      // call as DocumentRouting.jsx/CallRouting.jsx, so "My Call Queue"
      // reflects the shared EXP/TU/EQ docs-round + 7-day rule too.
      const { error: syncErr } = await supabase.rpc('sync_all_workflow_queues');
      if (syncErr && !/does not exist/i.test(syncErr.message || '')) {
        console.warn('sync_all_workflow_queues failed (run sql/gate_exp_calls_on_docs_round.sql):', syncErr.message);
      }

      const { data, error } = await supabase
        .from('call_routing')
        .select(`
            id, scheduled_date, status, client_id, assigned_admin_id, bureau, round_count,
            clients (id, full_name),
            profiles:assigned_admin_id (full_name)
        `)
        .eq('status', 'PENDING')
        .eq('assigned_admin_id', user.id) // <--- ONLY FETCH MY ASSIGNED CALLS
        .order('scheduled_date', { ascending: true });

      if (error) {
          console.error("Fetch My Calls Error:", error);
      } else if (data) {
          const formatted = data.map(task => ({
              id: task.id,
              clientId: task.clients?.id || task.client_id,
              bureau: task.bureau || null,
              roundCount: task.round_count || null,
              name: task.clients?.full_name || "Unknown Client",
              dueDate: task.scheduled_date,
              callerName: task.profiles?.full_name || "You"
          }));
          setRows(formatted);
      }
      setLoading(false);
    };

    fetchMyCalls();
  }, [user]);

  // --- MODAL HANDLERS ---
  const handleOpenModal = (modalType, row) => {
      // Carries taskId + bureau through so LogCallModal can mark the right
      // call_routing row COMPLETED and preselect the right bureau, instead
      // of only ever updating `clients` directly and leaving this row
      // PENDING forever (which would also block the self-healing sync from
      // ever queuing this bureau's next round, since it'd look like this
      // one never finished).
      setSelectedClient({ id: row.clientId, name: row.name, taskId: row.id, bureau: row.bureau });
      setActiveModal(modalType);
  };

  const handleCloseModal = () => {
      setActiveModal(null);
      setSelectedClient(null);
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h2 className="mb-1 fw-bold text-primary"><i className="bi bi-headset me-2"></i>My Call Queue</h2>
            <p className="text-muted mb-0">Clients currently assigned to you for follow-up.</p>
        </div>
      </div>

      {loading ? (
          <div className="text-center p-5"><Spinner animation="border"/></div>
      ) : rows.length === 0 ? (
          <Alert variant="success" className="text-center shadow-sm py-4">
              <i className="bi bi-check-circle-fill display-4 d-block mb-3 text-success"></i>
              <h4 className="fw-bold">You're all caught up!</h4>
              <p className="mb-0">You currently have no clients assigned to your call queue.</p>
          </Alert>
      ) : (
        <Card className="shadow-sm border-0">
            <Card.Body className="p-0">
                <Table responsive hover className="mb-0 align-middle">
                    <thead className="bg-light text-dark">
                        <tr>
                            <th className="py-3 ps-4" style={{ width: '35%' }}>Client Name</th>
                            <th className="py-3 text-center" style={{ width: '20%' }}>Due Date</th>
                            <th className="py-3 text-center" style={{ width: '20%' }}>Assigned Caller</th>
                            <th className="py-3 text-center" style={{ width: '25%' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const isOverdue = new Date(row.dueDate) < new Date(new Date().setHours(0,0,0,0));

                            return (
                            <tr key={row.id} style={{borderBottom: '1px solid #f0f0f0'}}>
                                <td className="ps-4 py-3">
                                    <div 
                                        className="fw-bold text-uppercase text-primary fs-6 mb-1" 
                                        style={{cursor: 'pointer', textDecoration: 'none'}} 
                                        onClick={() => navigate(`/clients/${row.clientId}`)}
                                        title="Click to open full profile"
                                    >
                                        {row.name}
                                        {row.bureau ? (
                                            <Badge bg={row.bureau === 'exp' ? 'dark' : 'info'} text={row.bureau === 'exp' ? undefined : 'dark'} className="ms-2 align-middle">
                                                {row.bureau.toUpperCase()}{row.roundCount ? ` R${row.roundCount}` : ''}
                                            </Badge>
                                        ) : (
                                            <Badge bg="secondary" className="ms-2 align-middle">ALL BUREAUS</Badge>
                                        )}
                                    </div>
                                    <small className="text-muted" style={{ cursor: 'pointer' }} onClick={() => navigate(`/clients/${row.clientId}`)}>
                                        <i className="bi bi-box-arrow-up-right me-1"></i>Open Full Profile
                                    </small>
                                </td>
                                <td className="text-center">
                                    <Badge bg={isOverdue ? 'danger' : 'success'} className="px-3 py-2 shadow-sm fs-6">
                                        {isOverdue && <i className="bi bi-exclamation-circle me-1"></i>}
                                        {row.dueDate}
                                    </Badge>
                                </td>
                                
                                <td className="text-center">
                                    <Badge bg="info" text="dark" className="px-3 py-2 shadow-sm border border-info border-opacity-25 fs-6">
                                        <i className="bi bi-person-badge me-1"></i>
                                        {row.callerName}
                                    </Badge>
                                </td>

                                <td className="text-center">
                                    <div className="d-flex justify-content-center gap-2">
                                        <Button 
                                            variant="outline-primary" 
                                            size="sm" 
                                            className="fw-bold shadow-sm"
                                            onClick={() => handleOpenModal('logCall', row)}
                                        >
                                            <i className="bi bi-telephone-plus me-1"></i> Log Call
                                        </Button>
                                        <Button 
                                            variant="outline-secondary" 
                                            size="sm" 
                                            className="fw-bold shadow-sm"
                                            onClick={() => handleOpenModal('activity', row)}
                                        >
                                            <i className="bi bi-chat-text me-1"></i> Notes
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

      {/* --- LOG CALL MODAL --- */}
      {activeModal === 'logCall' && selectedClient && (
          <LogCallModal
              show={true}
              onClose={handleCloseModal}
              clientId={selectedClient.id}
              routingTaskId={selectedClient.taskId}
              bureau={selectedClient.bureau}
          />
      )}

      {/* --- COMMENTS / ACTIVITY MODAL --- */}
      <Modal show={activeModal === 'activity'} onHide={handleCloseModal} size="lg" centered>
        <Modal.Header closeButton>
            <Modal.Title>
                <i className="bi bi-chat-dots me-2"></i>
                Activity & Notes for {selectedClient?.name}
            </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
            {selectedClient?.id && (
                <CommentsSection clientId={selectedClient.id} />
            )}
        </Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" onClick={handleCloseModal}>Close</Button>
        </Modal.Footer>
      </Modal>

    </Container>
  );
}