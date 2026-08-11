import { Button, Form } from "react-bootstrap";

/**
 * Reusable From/To/Clear date-range control. Same visual pattern as the
 * (pre-existing) Call Metrics tab's own date picker in AdminDashboard.jsx —
 * reused here rather than reinvented so every date filter on this dashboard
 * looks and behaves the same way.
 *
 * Backed by hooks/useDateRange.js. Purely presentational otherwise.
 */
export default function DateRangeFilter({ from, to, setFrom, setTo, onClear, label = "Date Range" }) {
  return (
    <div className="d-flex flex-wrap gap-3 mb-3 align-items-end">
      <Form.Group>
        <Form.Label className="small fw-bold text-muted mb-1">{label} — From</Form.Label>
        <Form.Control type="date" size="sm" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Form.Group>
      <Form.Group>
        <Form.Label className="small fw-bold text-muted mb-1">To</Form.Label>
        <Form.Control type="date" size="sm" value={to} onChange={(e) => setTo(e.target.value)} />
      </Form.Group>
      <Button size="sm" variant="outline-light" className="cmd-btn" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
