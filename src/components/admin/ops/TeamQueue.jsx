import { Badge, Card, Table } from "react-bootstrap";
import { computeTeamQueue } from "../../../utils/teamQueue";

/**
 * "Team Queue" — one row per staff member: how many files are assigned,
 * how many are aging past 30 days, and how many are stalled waiting
 * specifically on that employee (as opposed to a bureau/payment/docs).
 * Admin/Supervisor only — see gating in AdminDashboard.jsx.
 */
export default function TeamQueue({ flaggedClients, staff, loading }) {
  const rows = computeTeamQueue(flaggedClients, staff);

  return (
    <Card className="border-0 shadow-sm">
      <Card.Header className="bg-transparent border-0 pt-3 pb-0">
        <h6 className="text-uppercase text-muted fw-bold small mb-0">Team Queue</h6>
      </Card.Header>
      <Card.Body className="pt-2">
        {loading ? (
          <div className="text-muted small">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="text-muted small text-center py-4">No assigned files.</div>
        ) : (
          <div className="table-responsive">
            <Table hover size="sm" className="align-middle mb-0">
              <thead className="table-light text-muted small text-uppercase">
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th className="text-center">Assigned Files</th>
                  <th className="text-center">Over 30 Days</th>
                  <th className="text-center">Waiting on Employee</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td className="fw-medium">{r.name}</td>
                    <td className="text-muted small text-capitalize">{r.role || "—"}</td>
                    <td className="text-center">
                      <Badge bg="secondary" pill>{r.assignedFiles}</Badge>
                    </td>
                    <td className="text-center">
                      <Badge bg={r.overThirtyDays > 0 ? "danger" : "secondary"} pill>{r.overThirtyDays}</Badge>
                    </td>
                    <td className="text-center">
                      <Badge bg={r.waitingOnEmployee > 0 ? "warning" : "secondary"} text={r.waitingOnEmployee > 0 ? "dark" : undefined} pill>
                        {r.waitingOnEmployee}
                      </Badge>
                    </td>
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
