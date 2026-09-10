// src/components/admin/AdminNewLeads.jsx
//
// Platform-wide list of unpaid clients ("New Leads") — the admin
// counterpart to the company portal's NewLeadsList.jsx tab. Exists so
// AdminClientList.jsx (/clients) can default to paid clients only without
// unpaid ones simply disappearing from admin's view entirely — this is
// where they live instead, regardless of which company/portal they came
// from or whether a service has been assigned yet (most haven't — see
// NewLeadForm.jsx on the company side, which deliberately leaves
// dispute_method unassigned).
//
// Two actions live here that don't exist anywhere else in one place:
// assigning a service (so the client will show up in the right place once
// paid) and marking paid (utils/markClientPaid.js — the same logic
// ClientHeader.jsx's "Mark as Paid" button uses, not a shortcut that skips
// Document Routing enrollment/webhooks).
import { useEffect, useMemo, useState } from "react";
import { Table, Form, Button, Spinner, Alert, Badge, Row, Col, InputGroup } from "react-bootstrap";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { SERVICES, resolveServiceId } from "../../utils/services";
import { markClientPaid } from "../../utils/markClientPaid";
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";

export default function AdminNewLeads() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [savingId, setSavingId] = useState(null);
  const [pendingServiceById, setPendingServiceById] = useState({});
  // Amount paid, required before "Mark Paid" is enabled — see
  // markClientPaid.js's amount param, which auto-records this as income.
  const [pendingAmountById, setPendingAmountById] = useState({});

  const fetchLeads = async () => {
    setLoading(true);
    setError(null);
    try {
      // Not embedding companies(...) here on purpose — clients has more than
      // one FK relationship to companies, so PostgREST can't disambiguate an
      // embedded `companies ( company_name )` select and errors with
      // "more than one relationship was found for 'clients' and
      // 'companies'". useAdminClients.js hit the same thing and works around
      // it with a separate company lookup + client-side map; matching that
      // established pattern here instead of re-introducing the ambiguous join.
      const { data, error: fetchErr } = await supabase
        .from("clients")
        .select(`
          id, full_name, email, phone, created_at, dispute_method, service_id,
          agent, agent_id, admin_id, company_id, report_email
        `)
        .eq("is_paid", false)
        .order("created_at", { ascending: false });

      if (fetchErr) throw fetchErr;

      const ids = (data || []).map((c) => c.id);

      let uploadedIds = new Set();
      const companyIds = Array.from(new Set((data || []).map((c) => c.company_id).filter(Boolean)));
      const [docsRes, companiesRes] = await Promise.all([
        ids.length
          ? supabase.from("client_documents").select("client_id").eq("file_name", "credit_report_upload").in("client_id", ids)
          : Promise.resolve({ data: [] }),
        companyIds.length
          ? supabase.from("companies").select("id, company_name").in("id", companyIds)
          : Promise.resolve({ data: [] }),
      ]);
      uploadedIds = new Set((docsRes.data || []).map((d) => d.client_id));
      const companyMap = new Map((companiesRes.data || []).map((c) => [c.id, c.company_name]));

      setClients((data || []).map((c) => ({
        ...c,
        company_name: c.company_id ? companyMap.get(c.company_id) || "—" : "—",
        hasReport: !!c.report_email || uploadedIds.has(c.id),
      })));
    } catch (err) {
      console.error("Error fetching new leads:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

  const companyOptions = useMemo(() => {
    const names = new Set(clients.map((c) => c.company_name).filter((n) => n && n !== "—"));
    return Array.from(names).sort();
  }, [clients]);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (search && !(c.full_name || "").toLowerCase().includes(search.toLowerCase()) && !(c.email || "").toLowerCase().includes(search.toLowerCase())) return false;
      if (companyFilter !== "all" && c.company_name !== companyFilter) return false;
      return true;
    });
  }, [clients, search, companyFilter]);

  const serviceValueFor = (client) => pendingServiceById[client.id] ?? (resolveServiceId(client) || "");

  const handleServiceChange = (clientId, serviceId) => {
    setPendingServiceById((prev) => ({ ...prev, [clientId]: serviceId }));
  };

  const amountValueFor = (clientId) => pendingAmountById[clientId] ?? "";
  const handleAmountChange = (clientId, value) => {
    setPendingAmountById((prev) => ({ ...prev, [clientId]: value }));
  };
  const isAmountValid = (clientId) => {
    const n = Number(amountValueFor(clientId));
    return amountValueFor(clientId) !== "" && Number.isFinite(n) && n > 0;
  };

  const handleMarkPaid = async (client) => {
    const serviceId = serviceValueFor(client);
    if (!serviceId) {
      addToast({ title: "Service Required", message: "Choose a service before marking this client paid — otherwise it won't show up in any Client Management tab.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    if (!isAmountValid(client.id)) {
      addToast({ title: "Amount Required", message: "Enter how much this client paid before marking them paid.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    const amount = Number(amountValueFor(client.id));
    if (!(await confirm(`Mark ${client.full_name} as paid ($${amount.toFixed(2)})?`))) return;

    setSavingId(client.id);
    try {
      const service = SERVICES.find((s) => s.id === serviceId);
      // Assign the service first (if it changed) so the webhook/Document
      // Routing enrollment that markClientPaid fires already reflects it.
      if (resolveServiceId(client) !== serviceId) {
        const { error: svcErr } = await supabase
          .from("clients")
          .update({ dispute_method: service.disputeMethod, service_id: service.id })
          .eq("id", client.id);
        if (svcErr) throw svcErr;
      }

      const { error: paidErr } = await markClientPaid(client.id, { ...client, dispute_method: service.disputeMethod }, { amount });
      if (paidErr) throw paidErr;

      addToast({ title: "Marked Paid", message: `${client.full_name} moved to the ${service.label} list.`, variant: "success", icon: "bi-check-circle" });
      setClients((prev) => prev.filter((c) => c.id !== client.id));
    } catch (err) {
      console.error("Mark paid failed:", err);
      addToast({ title: "Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle" });
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="text-center p-5"><Spinner animation="border" /></div>;
  if (error) return <Alert variant="danger">Error: {error}</Alert>;

  return (
    <div className="p-3 p-md-4">
      <h4 className="fw-bold mb-1"><i className="bi bi-person-plus-fill me-2" />New Leads</h4>
      <p className="text-muted small mb-3">Unpaid clients across every partner, awaiting payment and a service assignment. Once marked paid, a client leaves this list and shows up in the Client List and its Client Management tab.</p>

      <Row className="mb-3 g-2">
        <Col md={4}>
          <InputGroup>
            <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
            <Form.Control placeholder="Search name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </InputGroup>
        </Col>
        <Col md={3}>
          <Form.Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
            <option value="all">All Companies</option>
            {companyOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </Form.Select>
        </Col>
        <Col className="d-flex align-items-center justify-content-end">
          <span className="text-muted small fw-bold">{filtered.length} lead{filtered.length !== 1 && "s"}</span>
        </Col>
      </Row>

      <Table hover responsive className="align-middle bg-white">
        <thead className="table-light">
          <tr>
            <th>Client</th>
            <th>Company / Agent</th>
            <th>Credit Report</th>
            <th>Service</th>
            <th>Amount Paid</th>
            <th>Submitted</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length > 0 ? (
            filtered.map((client) => (
              <tr key={client.id}>
                <td>
                  <Link to={`/clients/${client.id}`} className="fw-bold text-decoration-none">{client.full_name}</Link>
                  <div className="small text-muted">{client.email} · {client.phone}</div>
                </td>
                <td>
                  <div>{client.company_name}</div>
                  <div className="small text-muted">{client.agent || "Unassigned"}</div>
                </td>
                <td>
                  {client.hasReport ? <Badge bg="success">Provided</Badge> : <Badge bg="danger">Missing</Badge>}
                </td>
                <td style={{ minWidth: 180 }}>
                  <Form.Select size="sm" value={serviceValueFor(client)} onChange={(e) => handleServiceChange(client.id, e.target.value)}>
                    <option value="">Select a service</option>
                    {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </Form.Select>
                </td>
                <td style={{ minWidth: 110 }}>
                  <Form.Control
                    size="sm"
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={amountValueFor(client.id)}
                    onChange={(e) => handleAmountChange(client.id, e.target.value)}
                  />
                </td>
                <td className="small text-muted">{new Date(client.created_at).toLocaleDateString()}</td>
                <td>
                  <Button
                    size="sm"
                    variant="success"
                    className="fw-bold"
                    disabled={savingId === client.id || !isAmountValid(client.id) || !serviceValueFor(client)}
                    title={!isAmountValid(client.id) ? "Enter the amount paid first" : undefined}
                    onClick={() => handleMarkPaid(client)}
                  >
                    {savingId === client.id ? <Spinner size="sm" /> : "Mark Paid"}
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr><td colSpan="6" className="text-center text-muted py-4">No leads awaiting payment.</td></tr>
          )}
        </tbody>
      </Table>
    </div>
  );
}
