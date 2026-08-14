// src/components/admin/OutstandingClients.jsx
//
// "Paid, not fully done" — every Case Management client still missing at
// least one bureau completion, REGARDLESS of which queue they're
// currently sitting in (or whether they're in a queue at all). Document
// Routing and Call Routing are shown as two separate pages so staff
// working either one only see what's actionable for them right now, but
// that means neither page alone answers "who's still open, period" — this
// page answers that directly by reading each client's already-computed
// workflowStage (utils/workflowStage.js, via
// utils/clientsData.js#fetchEnrichedClients) rather than re-deriving queue
// membership itself, so it can never disagree with what Document Routing/
// Call Routing/Production Queue already show — a client shows up here in
// whatever stage (Docs, 7-Day Wait, Ready, or Calls) they actually happen
// to be in right now.
//
// Scoped to Case Management (credit_repair) clients only, same as
// DocumentRouting.jsx/CallRouting.jsx — the EXP/TU/EQ bureau-completion
// cycle this reads is that service's own process; Inquiry Deletion/Fraud
// Alert Removal/Personal Identifiers clients don't go through it.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Container, Card, Table, Form, Badge, Spinner, Button } from "react-bootstrap";
import useOpsSummary from "../../hooks/useOpsSummary";
import { STAGE_BADGE_STYLE } from "../../utils/workflowStage";
import { matchesClientSearch } from "../../utils/searchClients";
import { resolveServiceId } from "../../utils/services";

export default function OutstandingClients() {
  const { clients, companies, loading, error, reload } = useOpsSummary();
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");

  const sortedCompanies = useMemo(
    () => [...(companies || [])].sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "")),
    [companies]
  );

  // A lane (exp / tuEq) is null once it's individually done (see
  // computeExpStage/computeTuEqStage) — `completed` is only set once EVERY
  // bureau is done/N-A. Filtering on `!workflowStage?.completed` is what
  // makes this list include clients currently in Call Routing (type
  // "calls") too, not just ones still sitting in Docs.
  const outstanding = useMemo(() => {
    return (clients || [])
      .filter((c) => c.is_paid && !c.workflowStage?.completed)
      .filter((c) => resolveServiceId(c) === "credit_repair")
      .filter((c) => companyFilter === "all" || String(c.company_id) === String(companyFilter))
      .filter((c) => matchesClientSearch(c, search))
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [clients, companyFilter, search]);

  return (
    <Container fluid className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <h3 className="mb-0 fw-bold text-primary">
          <i className="bi bi-hourglass-split me-2"></i>Outstanding Paid Clients
        </h3>
        <Button variant="outline-secondary" size="sm" onClick={reload} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-1"></i> Refresh
        </Button>
      </div>

      <div className="d-flex flex-wrap align-items-end gap-3 mb-3">
        <Form.Group>
          <Form.Label className="small fw-bold text-muted mb-1">Search</Form.Label>
          <Form.Control
            size="sm"
            style={{ minWidth: 240 }}
            placeholder="Name, email, phone, partner…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Form.Group>
        {sortedCompanies.length > 0 && (
          <Form.Group>
            <Form.Label className="small fw-bold text-muted mb-1">Company</Form.Label>
            <Form.Select size="sm" style={{ minWidth: 200 }} value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
              <option value="all">All Companies</option>
              {sortedCompanies.map((co) => (
                <option key={co.id} value={co.id}>{co.company_name}</option>
              ))}
            </Form.Select>
          </Form.Group>
        )}
        <span className="text-muted small ms-auto">{outstanding.length} client(s)</span>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <Card className="shadow-sm border-0">
          <Table responsive hover className="align-middle mb-0">
            <thead className="bg-light">
              <tr>
                <th className="py-3 ps-3">Client</th>
                <th className="py-3">Company</th>
                <th className="py-3">Admin</th>
                <th className="py-3">EXP</th>
                <th className="py-3">TU / EQ</th>
              </tr>
            </thead>
            <tbody>
              {outstanding.length === 0 ? (
                <tr><td colSpan="5" className="text-center p-4 text-muted">No outstanding paid clients right now.</td></tr>
              ) : outstanding.map((c) => (
                <tr key={c.id}>
                  <td className="fw-bold ps-3">
                    <Link to={`/clients/${c.id}`} className="text-decoration-none" title="Open this client's profile">
                      {c.full_name}
                    </Link>
                  </td>
                  <td>{c.company_name || "—"}</td>
                  <td>{c.admin_full_name || "Unassigned"}</td>
                  <td><StageBadge stage={c.workflowStage?.exp} /></td>
                  <td><StageBadge stage={c.workflowStage?.tuEq} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </Container>
  );
}

// Same STAGE_BADGE_STYLE map Production Queue/Pipeline badges use, so a
// "Calls" badge here is the exact same color/icon as everywhere else in
// the app instead of a fourth copy of this mapping drifting out of sync.
function StageBadge({ stage }) {
  if (!stage) {
    return (
      <span className="text-success small">
        <i className="bi bi-check-circle-fill me-1"></i>Done
      </span>
    );
  }
  const style = STAGE_BADGE_STYLE[stage.type] || {};
  return (
    <Badge bg={style.bg || "secondary"} title={stage.tooltip}>
      <i className={`bi ${style.icon || "bi-circle"} me-1`}></i>
      {stage.label}
    </Badge>
  );
}
