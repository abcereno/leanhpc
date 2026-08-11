import { Card } from "react-bootstrap";
import useActivityFeed from "../../../hooks/useActivityFeed";
import { formatActivityEvent } from "../../../utils/activityFormatter";

function timeAgo(iso) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

/**
 * Live Activity Feed — subscribes to activity_logs via useActivityFeed()
 * (realtime) and renders each row through
 * utils/activityFormatter.js#formatActivityEvent.
 */
export default function ActivityFeed({ limit = 25 }) {
  const { events, loading, error } = useActivityFeed({ limit });

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="bg-transparent border-0 pt-3 pb-0">
        <h6 className="text-uppercase text-muted fw-bold small mb-0">
          <i className="bi bi-broadcast me-2"></i>Live Activity
        </h6>
      </Card.Header>
      <Card.Body className="pt-2" style={{ maxHeight: 420, overflowY: "auto" }}>
        {loading ? (
          <div className="text-muted small">Loading…</div>
        ) : error ? (
          <div className="text-danger small">{error}</div>
        ) : events.length === 0 ? (
          <div className="text-muted small text-center py-4">
            <i className="bi bi-broadcast fs-3 d-block mb-2 opacity-50"></i>
            No recent activity.
          </div>
        ) : (
          <div className="d-flex flex-column gap-2">
            {events.map((row) => {
              const { emoji, text } = formatActivityEvent(row);
              return (
                <div key={row.id} className="d-flex align-items-start gap-2 small border-bottom pb-2">
                  <span>{emoji}</span>
                  <div className="flex-grow-1">
                    <div>{text}</div>
                    <div className="text-muted" style={{ fontSize: "0.75rem" }}>{timeAgo(row.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
