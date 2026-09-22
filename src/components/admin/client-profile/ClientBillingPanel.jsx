// src/components/admin/client-profile/ClientBillingPanel.jsx
//
// Consolidated "Billing & Payment Plan" card for the client profile —
// requested as one spot to see payment amount, next due date, split-plan
// progress (how many payments required and how much per month), and the
// Case Management report last/next-update dates, instead of scattered
// badges only. Rendered from ClientHeader.jsx, right after the existing
// Personal Info / Company Info row.
//
// Fields split by source, same "derive don't duplicate" reasoning as the
// rest of this codebase (see sql/add_payment_plan.sql):
//  - total_amount_due / payment_plan_installments / payment_plan_amount /
//    next_payment_due_at — plain staff-set fields on `clients`, edited via
//    EditPaymentPlanModal.jsx.
//  - amount paid so far / # payments made — derived live from the
//    `incomes` table (utils/clientPayments.js), never manually tracked, so
//    it can't drift out of sync with what was actually recorded paid.
//  - last/next report update — the existing Case Management re-import
//    countdown (utils/aging.js#getCaseManagementCountdown), passed in as
//    `reimportCountdown` so this panel doesn't recompute service-gating
//    logic ClientHeader.jsx already owns.
import { useEffect, useState } from "react";
import { Badge, Button, ProgressBar, Spinner } from "react-bootstrap";
import { fetchClientPaymentSummary } from "../../../utils/clientPayments";

function money(n) {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return "—";
  const parsed = new Date(d.length <= 10 ? `${d}T00:00:00` : d);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleDateString();
}

export default function ClientBillingPanel({ client, paymentDue, reimportCountdown, onEdit, refreshKey }) {
  const [summary, setSummary] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingSummary(true);
    fetchClientPaymentSummary(client?.id).then((s) => {
      if (active) { setSummary(s); setLoadingSummary(false); }
    });
    return () => { active = false; };
  }, [client?.id, refreshKey]);

  const hasPlan = !!(client?.total_amount_due || client?.payment_plan_installments || client?.payment_plan_amount);
  const paidSoFar = summary?.totalPaid ?? 0;
  const totalDue = client?.total_amount_due;
  const pctPaid = totalDue ? Math.min(100, Math.round((paidSoFar / totalDue) * 100)) : null;
  const installmentsMade = client?.payment_plan_amount ? Math.round(paidSoFar / client.payment_plan_amount) : summary?.paymentsCount ?? 0;

  return (
    <div className="card shadow-sm border-0 mb-4">
      <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
        <h6 className="text-muted fw-bold text-uppercase tracking-wide mb-0">
          <i className="bi bi-cash-stack me-2" />Billing & Payment Plan
        </h6>
        {onEdit && (
          <Button size="sm" variant="outline-primary" className="fw-bold" onClick={onEdit}>
            <i className="bi bi-pencil-square me-1" />Edit
          </Button>
        )}
      </div>
      <div className="card-body">
        <div className="row g-4">
          {/* Amount */}
          <div className="col-md-4">
            <div className="text-muted small text-uppercase fw-bold mb-1">Payment Amount</div>
            <div className="fs-5 fw-bold">
              {hasPlan ? money(totalDue) : summary?.lastPaymentAmount ? money(summary.lastPaymentAmount) : "—"}
            </div>
            {loadingSummary ? (
              <div className="small text-muted"><Spinner animation="border" size="sm" className="me-1" />Loading payments…</div>
            ) : (
              <div className="small text-muted">
                Paid to date: <span className="fw-semibold text-dark">{money(paidSoFar)}</span>
                {summary?.paymentsCount ? ` (${summary.paymentsCount} payment${summary.paymentsCount === 1 ? "" : "s"})` : ""}
              </div>
            )}
            {pctPaid != null && (
              <ProgressBar now={pctPaid} label={`${pctPaid}%`} className="mt-2" style={{ height: "0.9rem" }} />
            )}
          </div>

          {/* Plan */}
          <div className="col-md-4">
            <div className="text-muted small text-uppercase fw-bold mb-1">Split Payment Plan</div>
            {client?.payment_plan_installments || client?.payment_plan_amount ? (
              <>
                <div className="fw-bold">
                  {client.payment_plan_installments ? `${client.payment_plan_installments} payments` : "Plan"}
                  {client.payment_plan_amount ? ` of ${money(client.payment_plan_amount)}` : ""}
                </div>
                <div className="small text-muted">
                  {client.payment_plan_installments
                    ? `${Math.min(installmentsMade, client.payment_plan_installments)} of ${client.payment_plan_installments} completed`
                    : `${installmentsMade} made so far`}
                </div>
              </>
            ) : (
              <div className="text-muted">Not on a payment plan</div>
            )}
            {paymentDue && (
              <Badge
                bg={paymentDue.isOverdue ? "danger" : "info"}
                text={paymentDue.isOverdue ? undefined : "dark"}
                className="mt-2 shadow-sm"
              >
                <i className="bi bi-calendar-event me-1" />
                Next Due {formatDate(client.next_payment_due_at)} ({paymentDue.isOverdue ? `overdue ${Math.abs(paymentDue.daysLeft)}d` : `${paymentDue.daysLeft}d`})
              </Badge>
            )}
          </div>

          {/* Report update */}
          <div className="col-md-4">
            <div className="text-muted small text-uppercase fw-bold mb-1">Report Update</div>
            <div className="small text-muted">
              Last Update: <span className="fw-semibold text-dark">{formatDate(client?.last_report_update_at)}</span>
            </div>
            {reimportCountdown ? (
              <div className="small text-muted">
                Next Update Due:{" "}
                <span className={`fw-semibold ${reimportCountdown.isOverdue ? "text-danger" : "text-dark"}`}>
                  {reimportCountdown.isOverdue ? `Overdue ${Math.abs(reimportCountdown.daysLeft)}d` : `In ${reimportCountdown.daysLeft}d`}
                </span>
              </div>
            ) : (
              <div className="small text-muted">Next Update Due: —</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
