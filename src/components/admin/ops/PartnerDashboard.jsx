import { Badge, Card, Table } from "react-bootstrap";
import { computePartnerRollup } from "../../../utils/opsMetrics";

/**
 * Internal, all-partners-at-once rollup (companies + affiliates combined).
 * Distinct from the partner-facing CompanyPortalDashboard.jsx /
 * BrokerDashboard.jsx / AffiliatePortalDashboard.jsx, which each show one
 * partner their own data — this is the internal fleet-wide view across all
 * of them. Admin/Supervisor only — see gating in AdminDashboard.jsx.
 */
export default function PartnerDashboard({ clients, companies, affiliates, loading }) {
  const rows = computePartnerRollup(clients, companies, affiliates);

  return (
    <Card className="border-0 shadow-sm">
      <Card.Header className="bg-transparent border-0 pt-3 pb-0">
        <h6 className="text-uppercase text-muted fw-bold small mb-0">Partner Dashboard</h6>
      </Card.Header>
      <Card.Body className="pt-2">
        {loading ? (
          <div className="text-muted small">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-muted small text-center py-4">No active partners.</div>
        ) : (
          <div className="table-responsive">
            <Table hover size="sm" className="align-middle mb-0">
              <thead className="table-light text-muted small text-uppercase">
                <tr>
                  <th>Partner</th>
                  <th>Type</th>
                  <th className="text-center">Active Clients</th>
                  <th className="text-center">Waiting Payment</th>
                  <th className="text-center">Processing</th>
                  <th className="text-center">Completed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.type}-${r.id}`}>
                    <td className="fw-medium">{r.name}</td>
                    <td>
                      <Badge bg={r.type === "company" ? "primary" : "info"} className="text-capitalize">{r.type}</Badge>
                    </td>
                    <td className="text-center">{r.activeClients}</td>
                    <td className="text-center">{r.waitingPayment}</td>
                    <td className="text-center">{r.processing}</td>
                    <td className="text-center">{r.completed}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
