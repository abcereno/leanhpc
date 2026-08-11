import { useNavigate } from "react-router-dom";
import { Button, OverlayTrigger, Tooltip } from "react-bootstrap";
import { QUICK_ACTIONS } from "../../../utils/quickActions";

/**
 * Ops Dashboard "Quick Actions" button row. Every button just navigates to
 * an existing route/flow (see utils/quickActions.js) — this component adds
 * no new functionality, it's a thin wiring layer.
 */
export default function QuickActions() {
  const navigate = useNavigate();

  return (
    <div className="d-flex flex-wrap gap-2 mb-4">
      {QUICK_ACTIONS.map((a) => {
        const btn = (
          <Button
            key={a.key}
            variant="outline-light"
            size="sm"
            className="cmd-btn shadow-sm"
            onClick={() => navigate(a.to)}
          >
            <i className={`bi ${a.icon} me-2`}></i>
            {a.label}
          </Button>
        );

        if (!a.note) return btn;

        return (
          <OverlayTrigger key={a.key} placement="top" overlay={<Tooltip>{a.note}</Tooltip>}>
            {btn}
          </OverlayTrigger>
        );
      })}
    </div>
  );
}
