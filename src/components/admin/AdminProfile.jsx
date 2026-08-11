// src/components/AdminProfile.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import {
  Container,
  Card,
  ListGroup,
  Badge,
  Spinner,
  Alert,
  Row,
  Col,
  ProgressBar,
  Form,
  Pagination,
  Tabs,
  Tab,
  Table,
  Modal,
  Button
} from "react-bootstrap";
import InquiryLoader from "../shared/ui/InquiryLoader";
import CommentsSection from "./client-profile/CommentsSection"; // [NEW IMPORT]

export default function AdminProfile() {
  const { adminid } = useParams();
  const { user, signOut } = useAuth(); 
  const navigate = useNavigate();

  const isOwnProfile = user?.id === adminid;

  const [clients, setClients] = useState([]);
  const [filteredClients, setFilteredClients] = useState([]);
  const [adminName, setAdminName] = useState("Loading...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [daysFilter, setDaysFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [statusMessage, setStatusMessage] = useState("");

  const [logState, setLogState] = useState({
    login_times: [],
    logout_times: [],
    breaks: [],
  });

  const [adminCallLogs, setAdminCallLogs] = useState([]);
  const [callLogsLoading, setCallLogsLoading] = useState(true);
  const [adminDocs, setAdminDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(true);

  // --- [UPDATED] STATE FOR COMMENTS MODAL ---
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [selectedClientForComments, setSelectedClientForComments] = useState(null);

  const isLoggedIn = logState.login_times.length > logState.logout_times.length;
  const isLoggedOut = !isLoggedIn;
  const isOnBreak =
    logState.breaks?.length > 0 &&
    logState.breaks[logState.breaks.length - 1]?.end === null;

  // ---------- Helpers ----------
  const getESTDate = () => {
    const now = new Date();
    const options = {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    };
    const formatter = new Intl.DateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(now).reduce((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});
    const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
    const timeStr = `${parts.hour}:${parts.minute}:${parts.second}`;
    return { dateStr, timeStr };
  };

  const formatDate = (isoDate) => {
    if (!isoDate) return "—";
    const date = new Date(isoDate);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // ---------- Action Handlers ----------
  const handleLogAction = async (actionType, opts = {}) => {
    if (!isOwnProfile) return; 

    const { alsoSignOut = false } = opts;
    try {
      setStatusMessage("");
      const { dateStr: today, timeStr } = getESTDate();

      const { data: existing, error: fetchErr } = await supabase
        .from("employee_logs")
        .select("id, login_times, logout_times, breaks, employee_id, log_date")
        .eq("employee_id", adminid)
        .eq("log_date", today)
        .single();

      if (fetchErr && fetchErr.code !== "PGRST116") {
        setStatusMessage(`❌ Error fetching log: ${fetchErr.message}`);
        return;
      }

      const base = existing || {
        employee_id: adminid,
        log_date: today,
        login_times: [],
        logout_times: [],
        breaks: [],
      };

      const next = {
        employee_id: base.employee_id,
        log_date: base.log_date,
        login_times: base.login_times ? [...base.login_times] : [],
        logout_times: base.logout_times ? [...base.logout_times] : [],
        breaks: base.breaks ? [...base.breaks] : [],
      };

      if (actionType === "login") {
        next.login_times.push(timeStr);
      } else if (actionType === "logout") {
        next.logout_times.push(timeStr);
      } else if (actionType === "break_start") {
        const last = next.breaks[next.breaks.length - 1];
        if (last && last.end == null) {
          setStatusMessage("⚠️ You already have an active break.");
          return;
        }
        next.breaks.push({ start: timeStr, end: null });
      } else if (actionType === "break_end") {
        const lastB = next.breaks[next.breaks.length - 1];
        if (!lastB || lastB.end != null) {
          setStatusMessage("⚠️ No active break to end.");
          return;
        }
        next.breaks[next.breaks.length - 1] = { start: lastB.start, end: timeStr };
      } else {
        setStatusMessage("❌ Unknown action.");
        return;
      }

      const write = existing
        ? supabase
            .from("employee_logs")
            .update({
              login_times: next.login_times,
              logout_times: next.logout_times,
              breaks: next.breaks,
            })
            .eq("id", existing.id)
        : supabase.from("employee_logs").insert([next]);

      const { error: writeErr } = await write;
      if (writeErr) {
        setStatusMessage(`❌ Failed to log ${actionType}: ${writeErr.message}`);
        return;
      }

      setLogState({
        login_times: next.login_times,
        logout_times: next.logout_times,
        breaks: next.breaks,
      });

      if (actionType === "logout" && alsoSignOut) {
        try {
          await signOut();
        } finally {
          navigate("/login");
        }
      }

      setStatusMessage(`✅ Logged ${actionType} at ${timeStr}`);
    } catch (e) {
      setStatusMessage(`❌ Unexpected error: ${e?.message || e}`);
    } finally {
      setTimeout(() => setStatusMessage(""), 4000);
    }
  };

  // --- [UPDATED] OPEN COMMENTS MODAL ---
  const handleOpenComments = (e, client) => {
    e.preventDefault(); 
    e.stopPropagation(); 
    
    setSelectedClientForComments(client);
    setShowCommentsModal(true);
  };

  // --- Render Documents Table with View Button ---
  const renderDocsTable = () => (
    <Table striped bordered hover responsive>
      <thead>
        <tr>
          <th>Submitted At</th>
          <th>Client</th>
          <th>Callback Date</th>
          <th>Note</th>
          <th className="text-center" style={{ width: '120px' }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {adminDocs.map((doc) => (
          <tr key={doc.id}>
            <td>{formatDate(doc.submitted_at)}</td>
            <td>
              {doc.clients?.full_name ? (
                <a href={`/clients/${doc.client_id}`} className="text-decoration-none">
                  {doc.clients.full_name}
                </a>
              ) : (
                "—"
              )}
            </td>
            <td>{formatDate(doc.callback_date)}</td>
            <td>{doc.note || "—"}</td>
            <td className="text-center">
                {/* [UPDATED] Button now opens Comments Modal */}
                <Button 
                    size="sm" 
                    variant="outline-primary"
                    onClick={(e) => handleOpenComments(e, { id: doc.client_id, full_name: doc.clients?.full_name })}
                >
                    <i className="bi bi-chat-text me-1"></i> Notes
                </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );

  // ---------- Data Loading ----------
  useEffect(() => {
    let alive = true;
    (async function run() {
      try {
        setLoading(true);
        setError("");
        setDocsLoading(true);
        setCallLogsLoading(true);

        // --- RBAC CHECK ---
        if (user) {
          const { data: userData, error: userError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

          if (!userError && userData) {
            if (userData.role === 'developer' && adminid !== user.id) {
              navigate('/dashboard'); 
              return;
            }
          }
        }

        const { dateStr: today } = getESTDate();

        const [profileRes, clientsRes, docsRes, callsRes, logRes] = await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", adminid).maybeSingle(),

          supabase
            .from("clients")
            .select("id, full_name, progress, created_at, paid_at")
            .eq("admin_id", adminid)
            .order("created_at", { ascending: false })
            .range(0, 99999),

          supabase
            .from("document_logs")
            .select("id, submitted_at, client_id, callback_date, note, clients(full_name)")
            .eq("admin_id", adminid)
            .order("submitted_at", { ascending: false })
            .range(0, 99999),

          supabase
            .from("call_logs")
            .select(`
              id,
              call_date,
              client_id,
              phone_number,
              reason, 
              exp_result, tu_result, eq_result,
              exp_rep_name, tu_rep_name, eq_rep_name,
              exp_supervisor_name, tu_supervisor_name, eq_supervisor_name,
              exp_start_time, tu_start_time, eq_start_time,
              clients(full_name)
            `)
            .eq("employee_id", adminid)
            .order("call_date", { ascending: false })
            .range(0, 99999),

          supabase
            .from("employee_logs")
            .select("login_times, logout_times, breaks")
            .eq("employee_id", adminid)
            .eq("log_date", today)
            .maybeSingle(),
        ]);

        if (!alive) return;

        // Profile Data
        if (profileRes.error) throw new Error("Admin profile not found.");
        setAdminName(profileRes.data?.full_name || "Unknown Admin");

        // Clients
        if (clientsRes.error) throw clientsRes.error;
        const enriched = (clientsRes.data || []).map((c) => {
          const paidAt = c.paid_at ? new Date(c.paid_at) : new Date(c.created_at);
          const runningDays = Math.ceil((Date.now() - paidAt.getTime()) / 86400000);
          return { ...c, runningDays };
        });
        setClients(enriched);
        setFilteredClients(enriched);

        // Document Logs
        if (!docsRes.error && docsRes.data) setAdminDocs(docsRes.data);
        setDocsLoading(false);

        // Call Logs
        if (!callsRes.error && callsRes.data) setAdminCallLogs(callsRes.data);
        setCallLogsLoading(false);

        // Employee Log
        if (!logRes.error && logRes.data) {
          setLogState({
            login_times: logRes.data.login_times || [],
            logout_times: logRes.data.logout_times || [],
            breaks: logRes.data.breaks || [],
          });
        }
      } catch (err) {
        setError(err?.message || "Something went wrong.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return function cleanup() {
      alive = false;
    };
  }, [adminid, user, navigate]);

  // ---------- Filtering & Pagination ----------
  useEffect(() => {
    const filtered = clients.filter((client) => {
      if (daysFilter === "1-15") return client.runningDays <= 15;
      if (daysFilter === "16-30") return client.runningDays > 15 && client.runningDays <= 30;
      if (daysFilter === "31+") return client.runningDays > 30;
      return true;
    });
    setFilteredClients(filtered);
    setCurrentPage(1);
  }, [daysFilter, clients]);

  // ---------- Time Calculations ----------
  const calculateTimeDiff = (start, end) => {
    if (!start || !end) return 0;
    const [sh, sm, ss] = start.split(":").map(Number);
    const [eh, em, es] = end.split(":").map(Number);
    const startDate = new Date(0, 0, 0, sh, sm, ss);
    const endDate = new Date(0, 0, 0, eh, em, es);
    const diffMs = endDate - startDate;
    return diffMs / (1000 * 60 * 60); 
  };

  const calculateTotalWorkHours = (logins = [], logouts = []) => {
    let total = 0;
    const len = Math.min(logins.length, logouts.length);
    for (let i = 0; i < len; i++) {
      total += calculateTimeDiff(logins[i], logouts[i]);
    }
    return total;
  };

  const totalHours = calculateTotalWorkHours(logState.login_times, logState.logout_times);

  const calculateTotalBreakHours = (breaks) => {
    if (!breaks || breaks.length === 0) return 0;
    return breaks.reduce((total, b) => {
      if (!b.start || !b.end) return total;
      const [sh, sm, ss] = b.start.split(":").map(Number);
      const [eh, em, es] = b.end.split(":").map(Number);
      const start = new Date(0, 0, 0, sh, sm, ss);
      const end = new Date(0, 0, 0, eh, em, es);
      return total + (end - start) / (1000 * 60 * 60);
    }, 0);
  };

  const breakHours = calculateTotalBreakHours(logState.breaks);

  // Pagination Logic
  const paginated = filteredClients.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const totalPages = Math.ceil(filteredClients.length / pageSize);

  // ---------- Views ----------
  if (loading) {
    return <InquiryLoader />;
  }

  if (error) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Error Loading Data</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

const renderCallLogTable = () => (
    <Table striped bordered hover responsive className="align-middle">
      <thead className="bg-light">
        <tr>
          <th>Date</th>
          <th className="text-center">Bureau</th>
          <th>Client</th>
          <th>Phone</th>
          <th>Rep</th>
          <th>Result</th>
          <th>Reason / Note</th>
        </tr>
      </thead>
      <tbody>
        {adminCallLogs.map((log) => {
          // Identify bureau by looking at the REQUIRED result fields instead of optional start times
          let bureau = "—";
          let prefix = "";
          
          if (log.exp_result) { bureau = "EXP"; prefix = "exp"; }
          else if (log.tu_result) { bureau = "TU"; prefix = "tu"; }
          else if (log.eq_result) { bureau = "EQ"; prefix = "eq"; }

          // Safely pull the data using the identified prefix
          const rep = prefix ? (log[`${prefix}_rep_name`] || "—") : "—";
          const result = prefix ? (log[`${prefix}_result`] || "—") : "—";
          const reason = log.reason || "—";

          return (
            <tr key={log.id}>
              <td>{formatDate(log.call_date)}</td>
              <td className="text-center">
                <Badge bg={bureau === 'EXP' ? 'primary' : bureau === 'TU' ? 'warning text-dark' : bureau === 'EQ' ? 'success' : 'secondary'}>
                    {bureau}
                </Badge>
              </td>
              <td className="fw-bold">
                {log.clients?.full_name ? (
                  <a href={`/clients/${log.client_id}`} className="text-decoration-none">
                    {log.clients.full_name}
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td>{log.phone_number || "—"}</td>
              <td>{rep}</td>
              <td>
                <span className={result === 'DELETED' ? 'text-success fw-bold' : ''}>
                    {result}
                </span>
              </td>
              <td>
                <small className="text-muted">{reason}</small>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );

  return (
    <Container className="py-4">
      
      {/* Time Tracker */}
      {isOwnProfile && (
        <Card className="mb-4 shadow-sm">
          <Card.Header className="bg-dark text-white">
            <h5 className="mb-0">⏱️ Employee Time Tracker</h5>

            {logState.login_times.length > 0 && logState.logout_times.length > 0 && (
              <>
                <p className="mt-2 mb-0">
                  ⏳ Total Work Hours: <strong>{totalHours.toFixed(2)}</strong> hrs
                </p>
                <ul className="mt-2 ps-3 small text-muted">
                  {logState.login_times.map((login, i) => (
                    <li key={i}>
                      Session {i + 1}: {login} – {logState.logout_times[i] || "—"}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {logState.breaks?.length > 0 && breakHours > 0 && (
              <p className="mb-0">
                ☕ Break Time: <strong>{breakHours.toFixed(2)}</strong> hrs
              </p>
            )}
            {logState.breaks?.length > 0 && (
              <ul className="mt-2 ps-3 small text-muted">
                {logState.breaks.map((b, i) => (
                  <li key={i} style={{ fontWeight: !b.end ? "bold" : "normal" }}>
                    Break {i + 1}: {b.start} - {b.end || "in progress"}
                  </li>
                ))}
              </ul>
            )}
          </Card.Header>
          <Card.Body>
            <div className="d-flex flex-wrap gap-2 mb-2">
              <button
                className="btn btn-success"
                onClick={() => handleLogAction("login")}
                disabled={isLoggedIn}
              >
                Log In
              </button>

              <button
                className="btn btn-danger"
                onClick={() => handleLogAction("logout", { alsoSignOut: true })}
                disabled={!isLoggedIn || isLoggedOut || isOnBreak}
              >
                Log Out
              </button>

              <button
                className="btn btn-warning"
                onClick={() => handleLogAction("break_start")}
                disabled={!isLoggedIn || isOnBreak || isLoggedOut}
              >
                Take Break
              </button>

              <button
                className="btn btn-primary"
                onClick={() => handleLogAction("break_end")}
                disabled={!isOnBreak}
              >
                Back from Break
              </button>
            </div>
            {statusMessage && <Alert variant="info">{statusMessage}</Alert>}
          </Card.Body>
        </Card>
      )}

      {/* Header Profile Name */}
      <Row className="mb-4">
        <Col>
          <Card className="shadow-sm">
            <Card.Header className="bg-primary text-white">
              <h4 className="mb-0">
                <i className="bi bi-person-badge me-2"></i>
                Admin Profile: {adminName}
              </h4>
            </Card.Header>
          </Card>
        </Col>
      </Row>

      <Tabs defaultActiveKey="profile" className="mb-4">
        <Tab eventKey="profile" title="Profile">
          <Row className="mt-3">
            <Col>
              <Card className="shadow-sm">
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="mb-0">
                      <i className="bi bi-people-fill me-2"></i>Paid Clients
                    </h5>
                    <Badge pill bg="success">
                      {filteredClients.length}
                    </Badge>
                  </div>

                  <Form.Group className="mb-3">
                    <Form.Label>Filter by Running Days</Form.Label>
                    <Form.Select value={daysFilter} onChange={(e) => setDaysFilter(e.target.value)}>
                      <option value="all">All Durations</option>
                      <option value="1-15">1-15 Days</option>
                      <option value="16-30">16-30 Days</option>
                      <option value="31+">31+ Days</option>
                    </Form.Select>
                  </Form.Group>

                  {filteredClients.length === 0 ? (
                    <Alert variant="info" className="text-center">
                      No paid clients match the selected filter.
                    </Alert>
                  ) : (
                    <>
                      <ListGroup variant="flush">
                        {paginated.map((client) => {
                          const rowClass =
                            client.runningDays > 30
                              ? "bg-danger text-white"
                              : client.runningDays > 20
                              ? "bg-warning text-dark"
                              : client.runningDays > 15
                              ? "bg-light"
                              : "";

                          return (
                            <ListGroup.Item
                              key={client.id}
                              action
                              as="a"
                              href={`/clients/${encodeURIComponent(client.id)}`}
                              className={`d-flex justify-content-between align-items-center py-3 ${rowClass}`}
                            >
                              <div style={{ flex: 1 }}>
                                <h6 className="mb-1">{client.full_name}</h6>
                                {typeof client.progress === "number" ? (
                                  <ProgressBar
                                    now={client.progress}
                                    label={`${client.progress}%`}
                                    variant={
                                      client.progress >= 75
                                        ? "success"
                                        : client.progress >= 50
                                        ? "warning"
                                        : "danger"
                                    }
                                  />
                                ) : (
                                  <small className="text-muted">No progress yet</small>
                                )}
                              </div>
                              <div className="text-end d-flex align-items-center gap-3" style={{ minWidth: "220px", justifyContent: 'flex-end' }}>
                                <div>
                                  <div className={client.runningDays > 30 ? "text-white" : ""}>
                                    <i className="bi bi-calendar-event me-1"></i>
                                    {formatDate(client.created_at)}
                                  </div>
                                  <small className={client.runningDays > 30 ? "text-white-50" : "text-muted"}>
                                    {client.runningDays} days
                                  </small>
                                </div>
                                <i className={`bi bi-chevron-right ms-2 ${client.runningDays > 30 ? "text-white" : "text-primary"}`}></i>
                              </div>
                            </ListGroup.Item>
                          );
                        })}
                      </ListGroup>

                      <div className="d-flex justify-content-center mt-3">
                        <Pagination>
                          {Array.from({ length: totalPages }, (_, i) => (
                            <Pagination.Item
                              key={i + 1}
                              active={i + 1 === currentPage}
                              onClick={() => setCurrentPage(i + 1)}
                            >
                              {i + 1}
                            </Pagination.Item>
                          ))}
                        </Pagination>
                      </div>
                    </>
                  )}
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Tab>

        <Tab eventKey="calllogs" title={`Call Logs (${adminCallLogs.length})`}>
          <Card className="shadow-sm">
            <Card.Body>
              {callLogsLoading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" variant="primary" />
                </div>
              ) : adminCallLogs.length === 0 ? (
                <Alert variant="info" className="text-center">
                  No call logs found for this admin.
                </Alert>
              ) : (
                renderCallLogTable()
              )}
            </Card.Body>
          </Card>
        </Tab>

        <Tab eventKey="docs" title={`Documents (${adminDocs.length})`}>
          <Card className="shadow-sm">
            <Card.Body>
              {docsLoading ? (
                <div className="text-center py-4">
                  <Spinner animation="border" variant="primary" />
                </div>
              ) : adminDocs.length === 0 ? (
                <Alert variant="info" className="text-center">
                  No document logs found for this admin.
                </Alert>
              ) : (
                renderDocsTable()
              )}
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      {/* --- COMMENTS MODAL --- */}
      <Modal show={showCommentsModal} onHide={() => setShowCommentsModal(false)} size="lg" centered>
        <Modal.Header closeButton>
            <Modal.Title>
                <i className="bi bi-chat-dots me-2"></i>
                Notes for {selectedClientForComments?.full_name}
            </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0">
            {selectedClientForComments?.id && (
                // Use your provided CommentsSection component
                <CommentsSection clientId={selectedClientForComments.id} />
            )}
        </Modal.Body>
        <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowCommentsModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>

    </Container>
  );
}