// src/components/company/NewLeadsList.jsx
//
// "New Leads" tab (CompanyPortalDashboard.jsx) — every unpaid client for
// this company/agent. NewLeadForm.jsx now collects the service up front,
// so most rows here already have one; what actually keeps them out of the
// 4 Client Management service tabs (ServiceClientList.jsx /
// InquiryRemovalClientList.jsx) is is_paid, not the service assignment —
// both tabs require is_paid===true AND a matching service, so this is the
// only place an unpaid lead is visible until "Move Forward"
// (MoveForwardModal.jsx) marks it paid — at which point it disappears from
// here and shows up in its service tab automatically.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useCompanyAuth } from '../../context/CompanyAuthContext';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Spinner, Alert, Badge, Form, InputGroup, Row, Col } from 'react-bootstrap';
import MoveForwardModal from './MoveForwardModal';
import MarkPaidModal from './MarkPaidModal';
import FunderEligibilityModal from '../shared/ui/FunderEligibilityModal';
import { serviceLabel } from '../../utils/services';
import { fetchAgentLookupMap, resolveAgentName } from '../../utils/agentDisplay';

export default function NewLeadsList({ refreshKey, onMovedForward }) {
  const { companyId, isAgent, user, loading: companyLoading, error: companyError } = useCompanyAuth();
  const navigate = useNavigate();

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("all");
  const [moveForwardClient, setMoveForwardClient] = useState(null);
  const [markPaidClient, setMarkPaidClient] = useState(null);

  // Funding Eligibility Checker (same green bank-icon shortcut
  // BrokerClientList.jsx already uses) — a quick per-lead check without
  // having to leave this table and go through the header's "Quick Check"
  // (which requires searching for the client manually).
  const [eligibilityClient, setEligibilityClient] = useState(null);
  const [showEligibility, setShowEligibility] = useState(false);

  // Extracted (rather than inline in the effect) so MoveForwardModal's
  // onDone can trigger the exact same refetch a parent-driven refreshKey
  // bump would — a lead that's just been marked paid needs to disappear
  // from this list immediately, not wait on the next unrelated refresh.
  const fetchLeads = useCallback(async () => {
    if (companyLoading) { setLoading(false); return; }
    if (companyError || !companyId) {
      setError(companyError || "Company ID missing.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let q = supabase
        .from('clients')
        // dispute_method/service_id/dob/address/ssn are only needed for
        // MoveForwardModal's prefill + completeness checklist, not
        // rendered directly in this table.
        .select('id, full_name, email, phone, created_at, report_email, agent, agent_id, dispute_method, service_id, dob, address, ssn')
        .eq('company_id', companyId)
        .eq('is_paid', false)
        .order('created_at', { ascending: false });
      if (isAgent && user?.id) q = q.eq('agent_id', user.id);

      const [{ data, error: fetchErr }, agentLookupMap] = await Promise.all([
        q,
        fetchAgentLookupMap(supabase, companyId),
      ]);
      if (fetchErr) throw fetchErr;

      const ids = (data || []).map((c) => c.id);
      let uploadedIds = new Set();
      if (ids.length) {
        const { data: docs } = await supabase
          .from('client_documents')
          .select('client_id')
          .eq('file_name', 'credit_report_upload')
          .in('client_id', ids);
        uploadedIds = new Set((docs || []).map((d) => d.client_id));
      }

      setClients((data || []).map((c) => ({
        ...c,
        hasReport: !!c.report_email || uploadedIds.has(c.id),
        agentName: resolveAgentName(c, agentLookupMap),
      })));
    } catch (err) {
      console.error('Error fetching new leads:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [companyId, companyLoading, companyError, isAgent, user?.id]);

  useEffect(() => { fetchLeads(); }, [fetchLeads, refreshKey]);

  const handleMovedForward = () => {
    setMoveForwardClient(null);
    fetchLeads();
    onMovedForward?.();
  };

  const handleMarkedPaid = () => {
    setMarkPaidClient(null);
    fetchLeads();
    onMovedForward?.();
  };

  const filtered = useMemo(() => {
    let list = clients;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => (c.full_name || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
    }

    if (dateFilter !== "all") {
      const days = Number(dateFilter);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      list = list.filter((c) => new Date(c.created_at).getTime() >= cutoff);
    }

    return list;
  }, [clients, search, dateFilter]);

  if (loading || companyLoading) return <div className="text-center p-5"><Spinner animation="border" /></div>;
  if (error) return <Alert variant="danger">Error: {error}</Alert>;

  return (
    <div>
      <Row className="mb-3 g-2">
        <Col md={4}>
          <InputGroup>
            <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
            <Form.Control placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </InputGroup>
        </Col>
        <Col md={3}>
          <Form.Select size="sm" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
            <option value="all">All Time</option>
            <option value="7">Last 7 Days</option>
            <option value="14">Last 14 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
          </Form.Select>
        </Col>
        <Col className="d-flex align-items-center justify-content-end">
          <span className="text-muted small fw-bold">Showing {filtered.length} lead{filtered.length !== 1 && 's'} awaiting payment</span>
        </Col>
      </Row>
      <Alert variant="info" className="small mb-3">
        <i className="bi bi-info-circle-fill me-2" />
        These clients haven't been marked as paid yet. Once "Move Forward" marks one paid, it'll move to its service tab above automatically.
      </Alert>
      <Table hover responsive className="align-middle">
        <thead className="table-light">
          <tr>
            <th>Client Name</th>
            <th>Contact</th>
            <th>Agent</th>
            <th>Service</th>
            <th>Credit Report</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length > 0 ? (
            filtered.map((client) => (
              <tr key={client.id}>
                <td className="fw-bold">{client.full_name}</td>
                <td>
                  <div className="small">{client.email}</div>
                  <div className="small text-muted">{client.phone}</div>
                </td>
                <td>
                  <Badge bg={client.agentName === "N/A" ? "secondary" : "light"} text={client.agentName === "N/A" ? "white" : "dark"} className="border fw-normal">
                    {client.agentName}
                  </Badge>
                </td>
                <td>
                  {client.service_id || client.dispute_method
                    ? <Badge bg="secondary">{serviceLabel(client)}</Badge>
                    : <Badge bg="warning" text="dark">Unassigned</Badge>}
                </td>
                <td>
                  {client.hasReport
                    ? <Badge bg="success">Provided</Badge>
                    : <Badge bg="danger">Missing</Badge>}
                </td>
                <td>{new Date(client.created_at).toLocaleDateString()}</td>
                <td className="d-flex gap-2">
                  <Button variant="success" size="sm" className="fw-bold" onClick={() => setMoveForwardClient(client)}>
                    <i className="bi bi-arrow-right-circle-fill me-1" />Move Forward
                  </Button>
                  <Button variant="outline-success" size="sm" onClick={() => setMarkPaidClient(client)} title="Already paid? Skip the checklist and just flip the flag.">
                    <i className="bi bi-cash-coin me-1" />Mark Paid
                  </Button>
                  <Button variant="outline-primary" size="sm" onClick={() => navigate(`/company-portal/${companyId}/clients/${client.id}`)}>
                    Profile
                  </Button>
                  <Button
                    variant="outline-success"
                    size="sm"
                    className="rounded-pill"
                    onClick={() => { setEligibilityClient(client); setShowEligibility(true); }}
                    title="Check Funding Eligibility"
                  >
                    <i className="bi bi-bank2"></i>
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr><td colSpan="7" className="text-center text-muted py-4">No leads awaiting payment.</td></tr>
          )}
        </tbody>
      </Table>

      <MoveForwardModal
        show={!!moveForwardClient}
        handleClose={() => setMoveForwardClient(null)}
        client={moveForwardClient}
        onDone={handleMovedForward}
      />

      <MarkPaidModal
        show={!!markPaidClient}
        handleClose={() => setMarkPaidClient(null)}
        client={markPaidClient}
        onDone={handleMarkedPaid}
      />

      <FunderEligibilityModal
        show={showEligibility}
        onHide={() => setShowEligibility(false)}
        client={eligibilityClient}
      />
    </div>
  );
}
