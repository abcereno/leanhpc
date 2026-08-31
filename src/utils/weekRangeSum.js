// src/utils/weekRangeSum.js
//
// Shared "does this dated row fall inside this payroll week's
// [week_start, week_end] range" logic. Pulled out of FinancialDashboard.jsx
// (where it started life as a bonus-only helper) so any other financial
// table keyed by a plain `date` column — incomes, expenses — can be
// bucketed into the same payroll weeks without re-implementing the same
// UTC-midnight date-compare logic in a second place.

// Normalizes any date/ISO value to a midnight-UTC timestamp so date-only
// strings ('YYYY-MM-DD') compare correctly regardless of local timezone.
export const dayTS = (v) =>
  v ? Date.parse(String(v).slice(0, 10) + "T00:00:00Z") : NaN;

// Sums `amountKey` off `rows` whose `dateKey` falls within
// [weekStart, weekEnd] inclusive. Returns 0 for an invalid/missing range
// rather than throwing, so callers can pass through payroll rows that may
// be missing a week_end without extra guarding.
export function sumInWeek(rows, { dateKey = "date", amountKey = "amount", weekStart, weekEnd }) {
  const s = dayTS(weekStart);
  const e = dayTS(weekEnd);
  if (!Number.isFinite(s) || !Number.isFinite(e)) return 0;
  return (rows || []).reduce((sum, row) => {
    const ts = dayTS(row?.[dateKey]);
    if (!Number.isFinite(ts) || ts < s || ts > e) return sum;
    return sum + Number(row?.[amountKey] || 0);
  }, 0);
}
