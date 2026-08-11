import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Table, Card, Badge, Spinner, Form, Row, Col, Button, Container } from "react-bootstrap";

export default function ManagementLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState("all");

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    // Keep the filter logic in case you still want to toggle views
    if (filterRole !== "all") {
      query = query.eq("user_role", filterRole);
    }

    const { data, error } = await query;
    
    if (error) {
      console.error("Error fetching logs:", error);
    } else {
      setLogs(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLogs();
  }, [filterRole]);

  // Visual Helpers
  const formatTime = (ts) => new Date(ts).toLocaleString();

  const getActionColor = (action) => {
    if (action.includes('delete')) return 'text-danger fw-bold';
    if (action.includes('create') || action.includes('grab')) return 'text-success fw-bold';
    return 'text-dark';
  };

  return (
    <Container className="mt-4">
      <Card className="shadow-lg border-0">
        <Card.Header className="bg-white py-3 d-flex justify-content-between align-items-center">
          <div>
            <h4 className="mb-0 text-primary"><i className="bi bi-shield-lock-fill me-2"></i>Audit Logs</h4>
            <small className="text-muted">Track team activity and client updates</small>
          </div>
          <Button variant="outline-primary" size="sm" onClick={fetchLogs}>
            <i className="bi bi-arrow-clockwise me-1"></i> Refresh
          </Button>
        </Card.Header>
        
        <Card.Body>
          {/* Filters */}
          <Row className="mb-3 g-2">
            <Col md={3}>
              <Form.Select value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                <option value="all">All Roles</option>
                <option value="owner">Owners Only</option>
                <option value="admin">Admins Only</option>
              </Form.Select>
            </Col>
          </Row>

          {loading ? (
            <div className="text-center py-5">
              <Spinner animation="border" variant="primary" />
              <p className="mt-2 text-muted">Loading history...</p>
            </div>
          ) : (
            <div className="table-responsive">
              <Table hover className="align-middle">
                <thead className="bg-light">
                  <tr>
                    <th style={{width: '180px'}}>Timestamp</th>
                    <th style={{width: '180px'}}>Admin User</th>
                    <th style={{width: '150px'}}>Action</th>
                    <th style={{width: '200px'}}>Client Name</th> 
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-4 text-muted">
                        No activity logs found.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        {/* Timestamp */}
                        <td className="small text-muted">{formatTime(log.created_at)}</td>
                        
                        {/* Admin Name */}
                        <td>
                            <div className="d-flex align-items-center">
                                <div className="bg-light rounded-circle d-flex align-items-center justify-content-center me-2" style={{width:'32px', height:'32px'}}>
                                    <i className="bi bi-person-fill text-secondary"></i>
                                </div>
                                <span className="fw-semibold text-dark">{log.user_name || "Unknown"}</span>
                            </div>
                        </td>
                        
                        {/* Action Type */}
                        <td className={getActionColor(log.action_type)}>
                          {log.action_type.replace(/_/g, " ").toUpperCase()}
                        </td>
                        
                        {/* Client Name (Target) */}
                        <td>
                          {log.target_name ? (
                            <div className="d-flex align-items-center">
                                <i className="bi bi-person-vcard text-primary me-2 fs-5"></i>
                                <span className="fw-bold text-dark">{log.target_name}</span>
                            </div>
                          ) : (
                            <span className="text-muted small fst-italic">-</span>
                          )}
                        </td>

                        {/* Details */}
                        <td className="small text-secondary">{log.details}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
}