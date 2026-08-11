import { Button, Spinner } from "react-bootstrap";

/**
 * Full-lock screen shown in place of a portal's normal content when the
 * underlying account (company or individual) hasn't paid its platform
 * subscription. Deliberately renders instead of the dashboard rather than
 * redirecting to a separate route, so RequireCompanyAuth.jsx / IndividualLayout.jsx
 * can each swap it in with a single early-return.
 *
 * Visual style mirrors RoleGuard.jsx's "Access Denied" screen (same dark
 * background/card colors) so the two "you can't get in" states feel like
 * one consistent pattern instead of two competing designs.
 *
 * `onAction`/`actionLabel` are optional — the individual portal already has
 * a working "Request Admin Help" flow (notifications insert + webhook) that
 * this screen reuses instead of duplicating; the company side currently has
 * no equivalent flow, so it renders without an action button.
 */
export default function SubscriptionLocked({
  title = "Subscription Required",
  message = "This account's subscription is currently inactive. Please contact your administrator to reactivate access.",
  actionLabel,
  onAction,
  actionLoading = false,
  actionDone = false,
  actionDoneLabel = "Request Sent",
  secondaryActionLabel,
  onSecondaryAction,
  onLogout,
}) {
  return (
    <div
      className="d-flex flex-column align-items-center justify-content-center vh-100"
      style={{ backgroundColor: "#0B1121", color: "#f8fafc" }}
    >
      <div
        className="text-center p-5 rounded-4 shadow-lg border"
        style={{ backgroundColor: "#131b2f", borderColor: "#1e293b", maxWidth: "500px" }}
      >
        <i className="bi bi-lock-fill text-warning display-1 mb-3"></i>
        <h2 className="fw-bold text-white mb-3">{title}</h2>
        <p className="text-muted mb-4">{message}</p>

        {onAction && (
          <Button
            variant={actionDone ? "outline-light" : "primary"}
            className="fw-bold px-4 py-2 w-100"
            onClick={onAction}
            disabled={actionLoading || actionDone}
          >
            {actionLoading ? (
              <Spinner size="sm" className="me-2" />
            ) : actionDone ? (
              <i className="bi bi-check-circle-fill text-success me-2"></i>
            ) : (
              <i className="bi bi-headset me-2"></i>
            )}
            {actionDone ? actionDoneLabel : actionLabel}
          </Button>
        )}

        {onSecondaryAction && (
          <Button
            variant="outline-light"
            className="fw-bold px-4 py-2 w-100 mt-2"
            onClick={onSecondaryAction}
          >
            <i className="bi bi-receipt me-2"></i>
            {secondaryActionLabel}
          </Button>
        )}

        {onLogout && (
          <Button
            variant="link"
            className="text-muted text-decoration-none mt-3 p-0"
            onClick={onLogout}
          >
            <i className="bi bi-box-arrow-right me-1"></i> Log Out
          </Button>
        )}
      </div>
    </div>
  );
}
