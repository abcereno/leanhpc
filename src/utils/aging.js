// src/utils/aging.js
//
// Single source of truth for the "aging bucket" bands used across the
// Operations Dashboard (Priority 3 of the Bernard ops sprint). Colored
// circles + click-through filters should all read from this file so the
// bucket boundaries never drift out of sync between views.

export const AGING_BUCKETS = [
  { key: "d0_14", label: "0–14 Days", emoji: "🟢", color: "#22c55e", bg: "#dcfce7", min: 0, max: 14 },
  { key: "d15_19", label: "15–19 Days", emoji: "🟡", color: "#eab308", bg: "#fef9c3", min: 15, max: 19 },
  { key: "d20_29", label: "20–29 Days", emoji: "🟠", color: "#f97316", bg: "#ffedd5", min: 20, max: 29 },
  { key: "d30plus", label: "30+ Days", emoji: "🔴", color: "#ef4444", bg: "#fee2e2", min: 30, max: Infinity },
];

export function getAgingBucket(days) {
  const d = Number(days) || 0;
  return (
    AGING_BUCKETS.find((b) => d >= b.min && d <= b.max) ||
    AGING_BUCKETS[AGING_BUCKETS.length - 1]
  );
}

/**
 * A client's "current stage" aging, in business days: how long the file
 * has been sitting in production once paid (paidRunningDays), or how long
 * it's been waiting on payment before that (createdRunningDays). Both
 * fields come from utils/clientsData.js's enrichClientRows(). Centralized
 * here so Team Queue, Production Queue, and the Aging Dashboard all agree
 * on what "days processing" means for a given file.
 */
export function getCurrentAgingDays(client) {
  return client?.is_paid ? client.paidRunningDays ?? 0 : client.createdRunningDays ?? 0;
}

const CASE_MANAGEMENT_COUNTDOWN_DAYS = 30;

/**
 * Case Management ("credit repair" service — see utils/services.js) doesn't
 * track bureau completion the way Inquiry Deletion does, so there's no
 * "days until done" figure for it. Instead ops needs a reminder to check
 * back in on the client periodically — specifically, to pull a fresh report
 * via SmartCredit/IdentityIQ's "Update Existing" flow.
 *
 * Prefers `last_report_update_at` (set by utils/reportStorage.js's
 * saveUpdateAudit every time that Update flow runs — see
 * sql/add_last_report_update.sql) as the real source of truth for "when do
 * they need the next check-in." Falls back to `paid_at` (how long they've
 * been a paying client) for anyone who hasn't had an Update yet, or if the
 * migration hasn't been run — same additive-fallback pattern used
 * throughout this codebase (service_id, dispute_round, etc.).
 *
 * Counts plain calendar days (not business days via calculateBusinessDays —
 * this is a "haven't touched this file in a while" nudge, not a
 * processing-time SLA like the aging buckets above).
 *
 * Returns null if there's neither a last_report_update_at nor a paid_at to
 * count down from.
 */
export function getCaseManagementCountdown(client) {
  const anchor = client?.last_report_update_at || client?.paid_at;
  if (!anchor) return null;
  const start = new Date(anchor);
  if (Number.isNaN(start.getTime())) return null;
  const elapsedDays = Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000));
  const daysLeft = CASE_MANAGEMENT_COUNTDOWN_DAYS - elapsedDays;
  return { daysLeft, isOverdue: daysLeft < 0 };
}
