import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useCompanyAuth } from '../../context/CompanyAuthContext';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Spinner, Alert, Badge, ProgressBar, Form, InputGroup, Row, Col } from 'react-bootstrap';
// [NEW] Import Summary Modal
import ClientSummaryModal from '../admin/client-profile/modals/ClientSummaryModal';
import { resolveServiceId, serviceLabel } from '../../utils/services';

// --- HELPER: Standardize empty/unassigned agents ---
const standardizeAgentName = (name) => {
  if (!name) return "N/A";
  const lowerName = name.trim().toLowerCase();
  if (["n/a", "na", "-", "—", "unassigned", "null", ""].includes(lowerName)) {
    return "N/A";
  }
  return name.trim();
};

export default function InquiryRemovalClientList({ refreshKey, onCheckEligibility }) {
  const { companyId, isAgent, user, loading: companyLoading, error: companyError } = useCompanyAuth();
  const navigate = useNavigate();
  
  const [clients, setClients] = useState([]);
  const [dbAgents, setDbAgents] = useState([]); // Store official company agents
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  // Summary Modal State
  const [showSummary, setShowSummary] = useState(false);
  const [summaryClient, setSummaryClient] = useState(null);

  const handleOpenSummary = (client) => {
    setSummaryClient(client);
    setShowSummary(true);
  };

  const handleCloseSummary = () => {
    setShowSummary(false);
    setSummaryClient(null);
  };

  useEffect(() => {
    if (companyLoading) { setLoading(false); return; }
    if (companyError || !companyId) {
        setError(companyError || "Company ID missing.");
        setLoading(false);
        return;
    }

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. FETCH CLIENTS
        // Filtered by service client-side (below, via resolveServiceId) rather
        // than a DB-side `.eq('dispute_method', 'inquiry deletion')` — that
        // exact-match filter silently dropped rows whose dispute_method casing
        // didn't match exactly. See utils/services.js.
        const CLIENT_FIELDS = `
            id, full_name, email, status_stage, created_at,
            dispute_method, service_id, counter, start_inquiries, start_date,
            is_paid, paid_at, date_completed, is_paused,
            exp_na, tu_na, eq_na,
            exp_completed, tu_completed, eq_completed,
            agent,
            agent_id,
            progress,
            funding_status,
            company_tasks (
                id, is_completed
            )
          `;
        const buildClientQuery = (fields) => {
          let q = supabase.from('clients').select(fields).eq('company_id', companyId);
          if (isAgent && user?.id) q = q.eq('agent_id', user.id);
          return q.order('created_at', { ascending: false });
        };

        // 2. FETCH OFFICIAL AGENTS LIST
        const agentQuery = supabase
          .from('company_user_profiles')
          .select('id, full_name')
          .eq('company_id', companyId)
          .in('role', ['agent', 'company_agent']);

        // Run both queries simultaneously
        let [clientRes, agentRes] = await Promise.all([
            buildClientQuery(CLIENT_FIELDS),
            agentQuery
        ]);

        // Defensive: sql/add_services.sql may not have been run yet — degrade
        // gracefully rather than blanking out this whole list.
        if (clientRes.error && /service_id/i.test(clientRes.error.message || "")) {
          console.warn("clients.service_id not found (run sql/add_services.sql) — falling back without it.");
          clientRes = await buildClientQuery(CLIENT_FIELDS.replace(/,\s*service_id/, ""));
        }

        if (clientRes.error) throw clientRes.error;

        // 3. BUILD THE AGENT LOOKUP DICTIONARY
        const agentLookupMap = {};
        if (agentRes.error && agentRes.error.code !== 'PGRST116') {
            console.warn("Could not fetch agents list:", agentRes.error);
        } else if (agentRes.data) {
            agentRes.data.forEach(a => {
                agentLookupMap[a.id] = a.full_name;
            });
            setDbAgents(agentRes.data.map(a => a.full_name));
        }

        // 4. ENRICH AND STANDARDIZE CLIENT DATA
        // Service filter happens here (client-side) instead of in the query
        // above — see the buildClientQuery comment. Also paid-only: unpaid
        // leads live on the "New Leads" tab (NewLeadsList.jsx) instead, so
        // this list isn't cluttered with pre-payment clients.
        const enrichedData = (clientRes.data || [])
          .filter(client => client.is_paid && resolveServiceId(client) === 'inquiry_deletion')
          .map(client => {
            const pendingCount = client.company_tasks 
                ? client.company_tasks.filter(t => !t.is_completed).length 
                : 0;
            const completedCount = client.company_tasks 
                ? client.company_tasks.filter(t => t.is_completed).length 
                : 0;

            const pScore = client.progress ? Math.round(Number(client.progress) * 100) : 0;
            const rawAgentName = client.agent || agentLookupMap[client.agent_id] || "N/A";

            return {
                ...client,
                agentName: standardizeAgentName(rawAgentName), 
                pendingCount,
                completedCount,
                progress: pScore
            };
        });

        enrichedData.sort((a, b) => {
            if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        setClients(enrichedData);
      } catch (err) {
        console.error('Error fetching data:', err.message);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, companyLoading, companyError, refreshKey, isAgent, user?.id]);

  // --- DYNAMIC AGENTS LIST FOR DROPDOWN ---
  const uniqueAgents = useMemo(() => {
      const agents = new Set(dbAgents);
      let hasNA = false;

      clients.forEach(c => {
          if (c.agentName === "N/A") {
              hasNA = true;
          } else {
              agents.add(c.agentName);
          }
      });

      const sortedAgents = Array.from(agents).sort();
      
      if (hasNA) {
          sortedAgents.push("N/A"); // Always put N/A at the bottom of the list
      }

      return sortedAgents;
  }, [clients, dbAgents]);

  // --- FILTERING LOGIC ---
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      if (search && !c.full_name.toLowerCase().includes(search.toLowerCase())) return false;
      const allCompleted = !!(c.exp_completed && c.tu_completed && c.eq_completed);

      // No "paid"/"unpaid" options anymore — every row here is already
      // paid (see the fetch filter above), unpaid leads are on New Leads.
      if (filterStatus === "completed" && !allCompleted) return false;
      if (filterStatus === "paused" && !c.is_paused) return false;
      
      if (taskFilter === "pending" && c.pendingCount === 0) return false;
      if (taskFilter === "resolved" && c.completedCount === 0) return false;
      if (taskFilter === "any" && (c.pendingCount === 0 && c.completedCount === 0)) return false;
      
      if (agentFilter !== "all" && c.agentName !== agentFilter) return false;
      
      return true;
    });
  }, [clients, search, filterStatus, taskFilter, agentFilter]);

  if (loading || companyLoading) return <div className="text-center p-5"><Spinner animation="border" /></div>;
  if (error) return <Alert variant="danger">Error: {error}</Alert>;

  return (
    <div>
      <Row className="mb-3 g-2">
        <Col md={3}>
          <InputGroup>
            <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
            <Form.Control placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </InputGroup>
        </Col>
        <Col md={2}>
          <Form.Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
          </Form.Select>
        </Col>
        <Col md={2}>
          <Form.Select value={taskFilter} onChange={e => setTaskFilter(e.target.value)} className={taskFilter === 'pending' ? 'border-warning fw-bold text-warning' : ''}>
            <option value="all">All Tasks</option>
            <option value="pending">⚠ Action Required</option>
            <option value="resolved">✔ Resolved Tasks</option>
            <option value="any">All Task History</option>
          </Form.Select>
        </Col>
        {!isAgent && (
            <Col md={2}>
            <Form.Select value={agentFilter} onChange={e => setAgentFilter(e.target.value)}>
                <option value="all">All Agents</option>
                {uniqueAgents.map(agent => <option key={agent} value={agent}>{agent}</option>)}
            </Form.Select>
            </Col>
        )}
        <Col md={isAgent ? 5 : 3} className="d-flex align-items-center justify-content-end">
            <span className="text-muted small fw-bold">Showing {filteredClients.length} result{filteredClients.length !== 1 && 's'}</span>
        </Col>
      </Row>
      <Table hover responsive className="align-middle">
        <thead className="table-light">
          <tr>
            <th>Client Name</th>
            <th>Agent</th>
            <th>Status & Badges</th>
            <th>Funding</th>
            <th>Progress</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredClients.length > 0 ? (
            filteredClients.map((client) => {
              const progressPercent = client.progress || 0;
              const allCompleted = !!(client.exp_completed && client.tu_completed && client.eq_completed);
              return (
                <tr key={client.id} className={allCompleted ? "table-success" : ""}>
                  <td>
                    <div className="d-flex flex-column">
                      <div className="d-flex align-items-center">
                        <span className="fw-bold">{client.full_name}</span>
                        {client.pendingCount > 0 && <Badge bg="danger" pill className="ms-2"><i className="bi bi-bell-fill"></i> {client.pendingCount}</Badge>}
                      </div>
                      <small className="text-muted">{serviceLabel(client)} • Inq: {client.start_inquiries || "N/A"}</small>
                    </div>
                  </td>
                  <td>
                    <Badge 
                        bg={client.agentName === "N/A" ? "secondary" : "light"} 
                        text={client.agentName === "N/A" ? "white" : "dark"} 
                        className="border fw-normal"
                    >
                        {client.agentName}
                    </Badge>
                  </td>
                  <td>
                    <div className="d-flex flex-wrap gap-1">
                      {client.status_stage && <Badge bg="primary">{client.status_stage}</Badge>}
                      {client.is_paid && <Badge bg="success">Paid</Badge>}
                      {/* 👇 NEW: Paused Badge added here 👇 */}
                      {client.is_paused && <Badge bg="warning" text="dark" className="shadow-sm"><i className="bi bi-pause-fill me-1"></i>PAUSED</Badge>}
                    </div>
                  </td>

                  <td>
                    {client.funding_status === 'GREEN' ? (
                        <Badge bg="success" className="shadow-sm"><i className="bi bi-check-circle-fill me-1"></i>Eligible</Badge>
                    ) : client.funding_status === 'YELLOW' ? (
                        <Badge bg="warning" text="dark" className="shadow-sm"><i className="bi bi-exclamation-triangle-fill me-1"></i>Review</Badge>
                    ) : client.funding_status === 'RED' ? (
                        <Badge bg="danger" className="shadow-sm"><i className="bi bi-x-octagon-fill me-1"></i>High Risk</Badge>
                    ) : (
                        <Badge bg="light" text="muted" className="border shadow-sm"><i className="bi bi-dash"></i> Pending</Badge>
                    )}
                  </td>

                  <td style={{ minWidth: "150px" }}>
                    <div className="progress-wrapper">
                        <ProgressBar 
                            now={progressPercent} 
                            variant={progressPercent >= 75 ? "success" : "warning"} 
                        />
                        <span className="progress-overlay-text">
                            {progressPercent}%
                        </span>
                    </div>
                  </td>
                  <td>{new Date(client.created_at).toLocaleDateString()}</td>
                  
                  <td>
                    <div className="d-flex align-items-center gap-2">
                        <Button variant="outline-primary" size="sm" onClick={() => navigate(`/company-portal/${companyId}/clients/${client.id}`)}>
                            Profile
                        </Button>

                        <Button 
                            variant="outline-secondary" 
                            size="sm" 
                            title="Client Summary"
                            onClick={() => handleOpenSummary(client)}
                        >
                            <i className="bi bi-card-text"></i>
                        </Button>

                        <button 
                            className="btn btn-sm btn-outline-success" 
                            title="Check Funding"
                            onClick={() => onCheckEligibility(client)}
                        >
                            <i className="bi bi-bank2"></i>
                        </button>
                    </div>
                  </td>

                </tr>
              );
            })
          ) : (
            <tr><td colSpan="7" className="text-center text-muted py-4">No clients found matching filters.</td></tr>
          )}
        </tbody>
      </Table>

      <ClientSummaryModal 
        show={showSummary} 
        onClose={handleCloseSummary} 
        client={summaryClient} 
      />
    </div>
  );
}