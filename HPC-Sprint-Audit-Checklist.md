# HPC Development Sprint — Audit Checklist

Reviewed against the current codebase (`src/`, `sql/`) on 2026-07-23. Each item is marked Done, Partial, or Not Started, with the file(s) that prove it (or the absence of any).

**Headline:** Priorities 2, 3, and 6 are essentially built — most of that work happened over the last several sessions and goes further than the original implementation plan scoped. Priority 1 (Authorization Protection) has zero backing implementation. Priority 4 (Billing Center) is the other major gap — billing exists today only as scattered modals inside the client profile, not as the unified section Bernard described. Priority 5 (Automations) is a clean slate.

---

## Priority 1 — Inquiry Authorization Protection: **NOT STARTED**

- [ ] Authorized / Actual / Additional-Needed inquiry counts displayed per client
- [ ] Lock additional inquiries once actual count exceeds authorized count
- [ ] Unlock via client approval, additional payment, payment plan approval, or manager override
- [ ] Manager override requires reason + initials + server-side timestamp, permanently logged
- [ ] Auto-generate an additional invoice when extra inquiries are approved

No `authorized_inquiries` column, no `authorization_holds`/`authorization_overrides` tables, no lock logic anywhere in the app. `utils/clientFlags.js`'s `authorizationHold` flag is a hardcoded `false` stub with a comment noting the backing table doesn't exist yet. This is the one priority with no partial progress — full build per the schema/logic already scoped in `HPC-Ops-Sprint-Implementation-Plan.md`.

---

## Priority 2 — AI Count Verification: **DONE**

- [x] AI performs the initial count (existing OCR/classification pipeline, untouched)
- [x] Employees can't manually edit counts — classification saves are gated behind the `approve_count_reviews` permission
- [x] Count Review Request with required reason — `count_review_requests` table, auto-created on every disputable classification save
- [x] Supervisor-only review, approval, and initials — `count_review_approvals` table, `CountReviewQueue.jsx`
- [x] Permanent history (original count, approved count, requester, approver, initials, reason, timestamps) — append-only tables, nothing overwritten
- [x] Large-difference warning + required second confirmation — `largeDiffConfirmed` in `CountReviewQueue.jsx`
- [x] Warn if a count changes after payment/invoice exists — `useCountReviews.js` checks for a paid invoice and `CountReviewQueue.jsx` surfaces an "affects pricing, review and reissue" nudge (deliberately manual, never auto-recalculates)

Only soft gap: the pricing-affected nudge links to the client profile rather than a one-click "regenerate invoice" action — that's arguably correct per the spec's "never automatically change billing," so treat this as done rather than partial.

---

## Priority 3 — Operations Dashboard: **DONE**

All pieces below are built and wired together in `AdminDashboard.jsx`:

- [x] Top KPIs (Active Partners, Active Clients, Files Processing, Ready to Complete, Completed This Month, New This Week) — `CompanySnapshot.jsx`, `DailyMetrics.jsx`, `utils/opsMetrics.js`
- [x] Aging Dashboard, colored circles (0–14 green / 15–19 yellow / 20–29 orange / 30+ red), click-through — `AgingDashboard.jsx`
- [x] Manager Attention ("Action Required") panel, first thing shown — `ActionRequired.jsx`, reading the shared filter registry so counts never drift from the filter chips
- [x] Live Activity Feed — `ActivityFeed.jsx`, `useActivityFeed.js`, `utils/activityFormatter.js`
- [x] Partner Dashboard (all partners at once, click into one) — `PartnerDashboard.jsx`, `computePartnerRollup`
- [x] Team Queue (assigned files, due today, over 30, waiting-on-employee, click into one employee) — `TeamQueue.jsx`, `utils/teamQueue.js`
- [x] Production Queue cards (name, partner, employee, EXP/TU/EQ counts, days in processing, status, action required, aging color) — `ProductionQueue.jsx`
- [x] Search by client / email / phone / partner / employee — `utils/searchClients.js`
- [x] Filters: My Files, Over 15/20/30 Days, Missing Documents, Missing Payment, Waiting EXP/TU/EQ, Internal Issues, Authorization Holds, Completed, Ready to Complete, plus Paused and per-service chips added this sprint — `utils/clientFlags.js`'s `FILTER_DEFINITIONS`

Two known gaps, both minor:
- [ ] "Authorization Holds" filter chip exists but always reads 0 — depends on Priority 1 shipping
- [ ] Role-based dashboard views (Admin / Supervisor / Employee seeing different slices) — not split out yet; every internal role currently sees the same `AdminDashboard.jsx`

---

## Priority 4 — Billing Center: **NOT STARTED**

- [ ] Dedicated Billing Center section — billing today only exists inside client-profile modals (`InvoiceGeneratorModal.jsx`, `AdminClientInvoices.jsx`, `ConsumerInvoices.jsx`, `GenerateInvoiceModal.jsx`) plus a standalone Zelle verification queue (`AdminPaymentVerifications.jsx`). Nothing rolls these up into one Payments Due / Overdue / Draft / Paid Today view.
- [ ] Single Client Billing Status field — doesn't exist; "is this client paid" is inferred ad hoc from `is_paid` + scattered `payment_verifications`/`invoices` rows, not one authoritative status
- [~] Partial — outside-payment recording exists, but narrowly: `UniversalPaymentModal.jsx` only supports Zelle-screenshot-plus-admin-verify. There's no method picker for Cash / Cash App / ACH / Check / Venmo / card-processed-outside-HPC, no reference-number field, no "create invoice after the fact and mark paid" flow, no receipt send from that path
- [~] Partial — payments through HPC exist via Stripe (`create-stripe-checkout` edge function). Nothing is Chase-hardcoded, so it's accidentally not-locked-in, but it's also not built as a genuinely swappable processor interface
- [~] Partial — "3 payments"/"6 payments" are hardcoded pricing-tier labels in `InvoiceGeneratorModal.jsx` with zero installment tracking behind them. No deposits, partial payments, splits, discounts, credits, refunds, or manager adjustments as real ledger entries
- [ ] Financial Timeline on the client profile — doesn't exist; closest analog is the generic Activity Thread (`comments` table), which isn't billing-specific
- [ ] Revenue Protection alerts (completed-but-not-invoiced, additional inquiries approved but not invoiced, paid-but-no-receipt, overdue invoice, invoice never sent) — nothing detects these automatically
- [ ] Revenue Dashboard (Ready to Invoice / Waiting on Payment / Overdue / Collected Today / Collected This Month / Potential Revenue Pending Authorization) — doesn't exist

This is the second-largest gap after Priority 1, and the two are related: Priority 1's "auto-invoice on approved additional inquiries" and Priority 4's "revenue protection" both assume a Billing Center that isn't there yet.

---

## Priority 5 — Billing Automations: **NOT STARTED**

- [ ] Invoice created → auto-send
- [ ] Payment received → auto-send receipt
- [ ] Payment received → notify assigned employee
- [ ] Payment received → notify management
- [ ] Payment received → unlock next workflow stage
- [ ] Reminders before/on/after due date, stopping immediately on payment
- [ ] Additional inquiries approved → auto-generate invoice
- [ ] Work completed with no invoice → notify management
- [ ] Invoice overdue → notify management
- [ ] Automation Settings area (reminder schedules, email/text templates, internal notification toggles, payment-advances-workflow toggle)

Some one-off webhooks already exist in the codebase (a "paid" onboarding webhook, a completion webhook, a credit-profile-change notification webhook), but none of them are the billing-reminder/automation engine described here. This entire priority is a clean slate and depends on Priority 4 existing first.

---

## Priority 6 — Operations Health: **DONE**

- [x] Operations Health Score (0–100), weighted penalties for files over 30 days, missing documents, internal issues, average processing time, and unassigned files — `utils/opsMetrics.js#computeHealthScore`, displayed via `HealthScoreBadge.jsx` in `AdminDashboard.jsx`

One open item carried over from the original implementation plan: the penalty weighting is a first-pass guess, not something Bernard has confirmed — worth a quick sign-off since it's easy to retune (each input is an isolated, named penalty).

---

## Future Enhancement — Bottleneck Analyzer: **FOUNDATION EXISTS, NOT BUILT FLEET-WIDE**

- [~] `DashboardOverview.jsx` (company portal) already computes a per-company `bottlenecks` array using SLA thresholds (3+ days awaiting docs/review, 35+ days stalled processing). This is scoped to one company at a time, not the fleet-wide automatic detector the spec describes (waiting on docs / Experian / count-review supervisors / client payment, across the whole business).

Bernard's own doc explicitly deprioritizes this, so "foundation ready, not yet generalized" is exactly on track — no action needed until this gets picked up.

---

## Suggested next order

1. **Priority 1** (Authorization Protection) — smallest schema footprint of the two big gaps, and directly prevents a repeat of the incident that prompted this sprint.
2. **Priority 4** (Billing Center) — needed before Priority 1's "auto-invoice additional inquiries" and Priority 5 (Automations) can be built on top of it.
3. **Priority 5** (Automations) — layers on once Priority 4 exists.
4. Round out Priority 3's two small gaps (Authorization Holds filter will just start working once Priority 1 ships; role-based dashboard views whenever there's appetite for it).
