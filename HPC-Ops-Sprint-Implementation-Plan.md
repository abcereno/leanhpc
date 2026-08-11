# HPC Operations Sprint — Implementation Plan

Based on a full review of the current schema (via `Supabase Snippet Public Schema Inventory/Functions.csv` and all `supabase.from(...)` call sites in `src/`) and the current frontend (`src/App.jsx`, `src/context/AuthContext.jsx`, all `*Dashboard.jsx` files, `useInquiriesThread.js`, `useAdminClients.js`). File and column names below are exact matches from the codebase; anything marked **NEW** does not exist yet.

## Where things stand today (the gaps this sprint has to close)

Inquiry counts are never stored as numbers. They live inside a JSON blob (`clients/{id}/thread.json` in Supabase Storage) and are recomputed in the browser by `updateCounts_()` in `src/hooks/useInquiriesThread.js`. The only DB trace is `clients.start_inquiries`, a free-text field like `"(TU 5, EXP 3, EQ 2)"` set once and editable as raw text. Nothing compares "authorized" vs "actual," and there is no `authorized_count` column, no lock, no override table anywhere — `grep -rni "authoriz" src` only turns up legal boilerplate and HTTP headers.

Count edits are unrestricted. `handleClassificationChange()` lets any employee with client access change an item's classification (and therefore the count) inline, and `saveUpdatedThread()` writes it straight to storage/DB with no approval step. There's a logging table, `ai_training_logs`, but it records corrections for ML-training purposes, not as an approval gate — it doesn't block the save.

Roles have no `supervisor`. `normalizeRole()` in `AuthContext.jsx` only recognizes `owner, admin, subadmin, developer, customer_service, caller, counter, callcount`. Route access is gated by `RoleGuard`, but every internal role that can reach `/admin-dashboard` sees the exact same `AdminDashboard.jsx` — there's no per-role dashboard content today, only per-route access.

Some strong patterns already exist and should be reused rather than reinvented:
- `alerts_log` — a live, clearable alert queue (`alert_type`, `cleared_at`, `delivered_channels` with `HOD:`/`MANAGER:`/`OWNER:` escalation prefixes), currently driving `IntakeDashboard.jsx`. This is the right foundation for "Authorization Holds" and most of "Action Required."
- `client_service_requests` — a request → status → realtime-subscribed queue (`AdminServiceOrders.jsx`). Closest existing shape to a "Count Review" request queue.
- `activity_logs` + `useLogger.js` — a generic `logAction()` audit helper called from dozens of places. Good base for the Live Activity Feed, but not currently rendered as a feed anywhere, and not tamper-evident (rows can be updated/deleted at the app layer, which Priority 1 & 2's "permanent, never overwritten" requirement need to close off).
- `DashboardOverview.jsx` (company portal) — already has a 5-stage pipeline bar and an SLA-based `bottlenecks` array (e.g., `daysActive >= 35` flags a stalled file). It's scoped to one company only, but the logic is the template for the fleet-wide Aging Dashboard and the future Bottleneck Analyzer.
- `useAdminClients.js` already computes business-day aging (`createdRunningDays`, `paidRunningDays`) and has bucketed day filters — just not rendered as colored circles yet.

---

## Phase 0 — Shared foundations (do first, everything else depends on it)

**Persist bureau counts as real numbers.** Add to `clients`: `ai_exp_count`, `ai_tu_count`, `ai_eq_count` (int, set automatically whenever `thread.json` is written — hook into `UploadReportForm.jsx`'s `handleSave()` and `SmartIdiQModal.jsx`'s save path) and `approved_exp_count`, `approved_tu_count`, `approved_eq_count` (int, default to the AI value; only a supervisor approval — Phase 2 — changes these). `ai_exp_count + ai_tu_count + ai_eq_count` becomes "Actual Inquiries Found"; the `approved_*` sum is what pricing and downstream stages should reference. This single change is what makes SQL-level dashboard queries, filters, and the Production Queue possible at all — right now nothing outside the browser can see a count.

**Add `supervisor` to the role model.** Extend `normalizeRole()` in `src/context/AuthContext.jsx` and update the relevant `is_admin_staff()` / `is_privileged()` SQL functions and `RoleGuard allowedRoles` lists. Decide who gets migrated to it (likely a subset of current `admin`/`subadmin` users).

**Add an assigned-employee concept for Team Queue.** `clients.admin_id` already functions as "who's currently assigned" (joined to `profiles.full_name` in `useAdminClients.js`) — reuse it rather than adding a new column. Confirm with Bernard whether `admin_id` should be renamed/repurposed as `assigned_employee_id` for clarity, or left as-is (recommend leaving it — renaming touches ~15+ call sites for no functional gain).

---

## Priority 1 — Inquiry Authorization Protection

### Schema (NEW)

| Table/Column | Type | Purpose |
|---|---|---|
| `clients.authorized_inquiries` | int, nullable | "Authorized to Process" — set by staff/manager when the client engagement is scoped |
| `clients.authorization_status` | text: `ok` \| `hold` \| `override_active` | Drives the lock UI; recomputed whenever counts or `authorized_inquiries` change |
| `authorization_holds` (table) | `id, client_id, opened_at, closed_at, close_reason (client_approved_more \| payment_collected \| payment_plan_approved \| manager_override), closed_by` | One row per hold episode — append-only, never deleted, so history survives auto-unlock |
| `authorization_overrides` (table) | `id, client_id, hold_id, reason, manager_id, manager_initials, created_at` | Permanent log required by the spec — insert-only, no update/delete grants at the RLS level |

Reuse `alerts_log` for the live dashboard count instead of a new table: insert `alert_type = 'AUTHORIZATION_HOLD'` when a hold opens, set `cleared_at` when it closes. This gets you the "Authorization Holds (Live Count)" badge and click-through list for free using the exact pattern `IntakeDashboard.jsx` already uses.

### Logic

Compute `actual = ai_exp_count + ai_tu_count + ai_eq_count` (Phase 0) whenever a report is (re)parsed. If `actual > authorized_inquiries`, open a row in `authorization_holds` (if one isn't already open) and set `clients.authorization_status = 'hold'`.

Gate processing at the actual choke point: `saveUpdatedThread()` and `markAllNonLinkedAsDeleted()` in `useInquiriesThread.js` are where classification changes are currently written un-gated — this is where the block belongs (there's no single "Process" button today per the code search, so the lock has to wrap these functions, not a UI element that doesn't exist yet). Show the specified banner and disable the relevant save actions until `authorization_status !== 'hold'`.

Manager Override: a modal requiring `reason`, `manager_initials`, and using `now()` for the timestamp (don't let the user type the date/time — pull it server-side to keep the log trustworthy). Writes to `authorization_overrides` and closes the hold with `close_reason = 'manager_override'`. Gate the modal itself on `role === 'owner' || role === 'admin' || role === 'subadmin'` (or the new `supervisor`, per Bernard's call on who counts as "manager").

Auto-unlock: a trigger (or client-side check right after) on `clients` — when `authorized_inquiries` is raised to ≥ `actual`, or when a new `payment_verifications` row lands for that client, close the open `authorization_holds` row and flip `authorization_status` back to `ok`. Payment-plan approval needs its own small flag since **no payment-plan table exists at all today** (only two hardcoded pricing-tier labels in `InvoiceGeneratorModal.jsx` — "Full File Processing (3 Payments)" / "(6 Payments)" — with no installment tracking); minimally, add `clients.payment_plan_approved_at` for this to close a hold against.

---

## Priority 2 — AI Count Quality Control

### Schema (NEW)

| Table/Column | Type | Purpose |
|---|---|---|
| `count_review_requests` | `id, client_id, bureau, ai_count, employee_id, reason (ocr_error \| linked_inquiries \| duplicate_inquiries \| updated_report \| other), reason_detail, status (pending\|approved\|denied), created_at` | The employee-facing request — insert-only from the employee side |
| `count_review_approvals` | `id, review_request_id, supervisor_id, supervisor_initials, approved_count, large_diff_confirmed (bool), created_at` | Separate append-only decision table, so the original AI count and request are never touched even on approval — satisfies "never overwrite history" more strongly than adding approval columns onto the request row |

### Logic

Block direct edits for non-supervisors: `handleClassificationChange()` / `saveUpdatedThread()` currently let anyone change classification inline with no gate. For non-supervisor roles, redirect that action to open a "Request Count Review" modal (reason required, from the fixed list) instead of writing the change — insert into `count_review_requests`, leave `ai_exp_count`/etc. untouched.

Supervisor approval UI: a queue (reuse the `AdminServiceOrders.jsx` realtime-subscribed request-queue pattern) listing pending `count_review_requests`, where a supervisor enters the new count, their initials, and submits — writes `count_review_approvals`, updates `clients.approved_{bureau}_count`, sets the request `status = 'approved'`.

Large-difference warning: compare `approved_count` (what the supervisor is about to enter) against `ai_count` on the request. Pick a threshold with Bernard (the spec's own example, 5 → 77, is a >10x jump — a reasonable starting rule is "difference > 5 or > 50%, whichever is smaller trigger"). Show the warning and require a second explicit confirmation checkbox before the approval submits — store that as `large_diff_confirmed`.

Pricing protection: after an approval changes `approved_*_count` on a client that already has an `invoices` row with `payment_status = 'Paid'`, show the "Count change affects pricing — Recalculate Invoice? YES/NO" modal. **Important existing gap:** `invoices.total_inquiries` today is a manually-typed number at invoice-creation time with zero link back to actual counts (confirmed — no code path re-reads it). "Recalculate Invoice" therefore needs to be built as a new explicit action (pre-fill a new invoice draft from `approved_*_count` via `InvoiceGeneratorModal.jsx`, still requiring staff to review/submit) rather than an automatic recompute — matches the spec's "never automatically change billing."

---

## Priority 3 — New Operations Dashboard

This is the largest piece; recommend building it as a new route (e.g. `/ops`) rather than replacing `AdminDashboard.jsx` in place, so the existing call-metrics dashboard keeps working while the new one is built incrementally.

### Role-based shell (the architectural recommendation Bernard flagged)

Four top-level components, all reading the same underlying data hooks but rendering different slices:
- `AdminOpsDashboard` — everything below.
- `SupervisorOpsDashboard` — Team Queue, Count Review approvals, Authorization Hold approvals, no company-wide financials.
- `EmployeeOpsDashboard` — Production Queue filtered to `admin_id = currentUser`, their own due-today/over-30 counts.
- Partner-facing view — largely already exists as `CompanyPortalDashboard.jsx` / `BrokerDashboard.jsx`; the "Partner Dashboard" section of the *internal* ops dashboard (showing all partners at once) is new and separate from that.

Wire these through `RoleGuard` the same way `App.jsx` already branches other portals — this is additive to the existing pattern, not a rewrite of it.

### Section-by-section build notes

**Company Snapshot / Daily Metrics** — straightforward aggregate queries against `clients`, `call_logs`, `document_logs`, `payment_verifications`, `count_review_requests` (Phase 2) filtered to today/this-month. No new schema needed beyond what's above.

**Aging Dashboard (colored circles)** — extend the bucket logic already in `useAdminClients.js` (`createdRunningDays`/`paidRunningDays`, existing `daysFilter`/`paidDaysFilter` buckets) to the spec's four bands (0–14 / 15–19 / 20–29 / 30+) and render as colored circles instead of the current filter chips. Same underlying data, new presentation.

**Manager Attention / Action Required** — extend the `alerts_log` + view pattern from `IntakeDashboard.jsx` (`vw_call_timers`, `vw_docs_timers`, `vw_followup_timers`) with new alert types: `AUTHORIZATION_HOLD` (Phase 1), `COUNT_REVIEW_PENDING` (Phase 2), plus existing doc/payment/bureau-wait states already tracked via `exp_completed/tu_completed/eq_completed` and `exp_na/tu_na/eq_na`. "Ready to Complete" and "Missing Documents/Payment" can mostly be derived from existing `clients` boolean columns without new tables.

**Live Activity Feed** — `activity_logs` already captures the right events via `useLogger.js`'s `logAction()`; nothing writes a human-readable feed today. Build a component that subscribes to `activity_logs` via Supabase Realtime and maps `action_type` to the emoji/phrasing in the spec (e.g. "🟢 {user_name} uploaded {n} new clients").

**Partner Dashboard (internal, all-partners view)** — new component aggregating `companies`/`affiliates` + their `clients`, similar rollup to what `AffiliatePortalDashboard.jsx` already computes per-affiliate, but as a table across all partners.

**Team Queue** — replaces "Employee Workload" concept (which doesn't exist yet either — confirmed no hits for "workload" anywhere). Build from `clients.admin_id` grouped by employee, with due-today/over-30/waiting-on-employee computed the same way `AdminDashboard.jsx`'s per-employee tabs already group by `call_metrics.employee_id` — same shape, different underlying table.

**Production Queue** — card-per-client view surfacing `ai_exp_count/ai_tu_count/ai_eq_count` (or `approved_*` once reviewed), `processing_duration`, `status_stage`, aging color, and an "Action Required" chip. This is essentially `AdminClientList.jsx`'s data re-rendered as cards instead of a table — reuse its query/filter logic rather than rebuilding it.

**Search & Filters** — `AdminClientList.jsx` already has name/search and day-bucket filters; extend the search to email/phone/partner/employee (fields already on `clients`/`profiles`/`companies`) and add filter chips for the new states (Authorization Holds, Count Reviews, etc.) introduced in Phases 1–2.

**Quick Actions** — mostly wiring buttons to flows that already exist: New Client (`AddClientSidebar`), Upload Credit Report / Run AI Count (`UploadReportForm.jsx`, `SmartIdiQModal.jsx` — "Run AI Count" is literally re-triggering the existing OCR pipeline), Upload Documents (`ClientDocumentsDashboard.jsx` upload), Add Partner (`AddAffiliateForm.jsx` / `AddCompanyForm.jsx`), Assign Employee (update `clients.admin_id`).

**Manager Notes (internal/partner/client/pinned)** — the existing `comments` table (flat, single-type, rendered as "Activity Thread") and `clients.special_instructions_notes` (single append-only text blob) don't support typed/pinned notes. Recommend a **new** `client_notes` table: `id, client_id, note_type (internal|partner|client), is_pinned, author, text, created_at`, rather than overloading `comments` — keeps `comments`'s existing "Activity Thread" usage intact while giving notes real structure. RLS should exclude `note_type = 'internal'` from any partner/affiliate-portal query.

**Operations Health Score** — a computed value (not stored, or stored as a daily snapshot if trending matters) from a weighted formula over: count of files >30 days, missing-docs count, internal-issues count, average `processing_duration`, and unassigned (`admin_id IS NULL`) files. All five inputs already exist or are produced by the sections above — this is a rollup, not new data collection. Confirm the weighting with Bernard before building since the spec doesn't specify one.

**Bottleneck Analyzer (future)** — explicitly deprioritized in the spec; noting that `DashboardOverview.jsx`'s existing `bottlenecks` array (SLA thresholds like `daysActive >= 35`) is most of the way there already and should be generalized fleet-wide when this gets picked up.

---

## Suggested build order

1. Phase 0 (persisted counts + `supervisor` role) — everything else reads these.
2. Priority 1 (Authorization lock) — smallest scope, directly prevents repeat of the 77-vs-25 incident, and its `alerts_log`/hold pattern is reused by Priority 3.
3. Priority 2 (Count QC) — depends on Phase 0's persisted counts; the review-request queue UI can share code with Priority 1's override queue.
4. Priority 3 — build incrementally at `/ops`, in the order: Action Required (reuses Priority 1/2 alerts) → Aging Dashboard → Production Queue/Search/Filters → Team Queue → Live Activity Feed → Partner Dashboard/Daily Metrics/Quick Actions → Manager Notes → Health Score → role-based shell split last (once content exists, splitting it by role is comparatively quick).

## Open questions for Bernard before starting

- Who exactly counts as "Manager" for override authority — current `owner/admin/subadmin`, or only the new `supervisor` role?
- Large-count-difference threshold for the second-confirmation warning.
- Operations Health Score weighting.
- Whether `clients.admin_id` can stay as the "assigned employee" field (recommended) or needs a dedicated rename for clarity.
- Payment-plan approval currently has zero backing data (only pricing-tier labels) — confirm `payment_plan_approved_at` as a minimal flag is enough for this sprint, versus building real installment tracking now.
