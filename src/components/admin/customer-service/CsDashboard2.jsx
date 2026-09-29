// src/components/admin/customer-service/CsDashboard2.jsx
//
// Preview build of the "revamped" CS dashboard, per the pasted GHL-style
// call-log mockup (call-log-dashboard-ghl.html). Deliberately a SEPARATE
// route/component (/cs-dashboard2) from the live ClientDocumentDashboard.jsx
// (/cs-dashboard) — nothing here touches that file or its route, so the
// live dashboard staff already use every day is completely unaffected
// while this is reviewed.
//
// Scope: LTOS only (companies.id "e33ef166-d381-458e-a5c8-ac77557d5ea2",
// see LTOS_COMPANY_ID below) — per explicit product decision, this is a
// dashboard for one company's CS team, not a platform-wide tool. Every
// query here filters to that company_id.
//
// Data covers THREE contact buckets, from two tables:
//   - Paying clients: clients.company_id = LTOS, is_paid = true — the
//     original scope of this dashboard.
//   - Unpaid/signup clients: clients.company_id = LTOS, is_paid = false —
//     includes anyone who signed up via the login page's "Individual" tab
//     (handle_new_user()'s INDIVIDUAL CLIENT ROUTING branch + the
//     IndividualLayout.jsx/IndividualDashboard.jsx client-side self-heal
//     paths all set company_id = LTOS on these rows now — see
//     sql/add_individual_signup_company.sql and src/utils/companies.js).
//     These are still `clients` rows (they already have a client_id), so
//     cs_call_log ties to them the same way as paying clients — NOT via
//     lead_id. Shown in the Leads tab (CS still needs to call/convert
//     them) but kept in their own bucket from company_leads below since
//     they're a different table with different fields (no funder
//     eligibility status).
//   - Leads: raw prospects captured by the public funding-eligibility
//     widget (company_leads, see EmbeddableEligibilityChecker.jsx#
//     submitLeadForm — every lead from that widget is hardcoded to
//     LTOS's company_id since it's the only company running that funnel).
//     These are NOT rows in `clients` — a lead has no client_id until
//     someone manually converts/adds them as a client — so cs_call_log
//     can be tied to EITHER a client_id OR a lead_id (see
//     sql/add_cs_call_log_leads.sql), never both. `contactType` on each
//     derived record below ("client" | "lead") tracks which table a call
//     was logged against; the Leads tab's `source` field ("Funding
//     Widget" | "Client Signup") tracks which of the two prospect
//     sources a row displayed there came from.
//
// Backed by sql/add_cs_call_log.sql (`cs_call_log` table) — a NEW table,
// not the existing `call_logs` (bureau dispute calls, EXP/TU/EQ with
// DELETED/DISPUTED-style results — see CallLogs.jsx/LogCallModal.jsx).
// This dashboard's outcome vocabulary (Interested/Follow Up/Called/Not
// Interested/Appointment Set) is a different, CS-relationship taxonomy
// that has nothing to do with bureau dispute results, so overloading
// `call_logs` would have meant two unrelated status vocabularies sharing
// one column. See that SQL file's header comment for the full reasoning.
//
// Styling: every class name here is prefixed `csd2-` and scoped under
// `.csd2-root` — see CsDashboard2.css's header comment for why (src/
// index.css applies global !important dark-theme overrides to plain
// Bootstrap class names like .card/.btn/.text-muted, which would repaint
// this light GHL-style design the moment it reused those names — the
// exact bug ClassicReportPage.jsx had before it was scoped the same way).
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../shared/ui/ToastNotifier";
import SearchableSelect from "../../shared/ui/SearchableSelect";
import { LTOS_COMPANY_ID } from "../../../utils/companies";
import { deriveServiceId } from "../../../utils/services";
import {
  fetchIdentityDocsForClients,
  computeIdentityStatus,
  computePaymentStatus,
  computeFileBucket,
} from "../../../utils/fileReadiness";
import "./CsDashboard2.css";

const OUTCOMES = ["Interested", "Follow Up", "Called", "Not Interested", "Appointment Set"];

// File Status sub-tabs — see utils/fileReadiness.js#computeFileBucket for
// exactly how a client lands in one of these.
const FILE_STATUS_TABS = [
  { key: "new_leads", label: "New Leads" },
  { key: "missing_docs", label: "Missing Docs" },
  { key: "payment_pending", label: "Payment Pending" },
  { key: "ready", label: "Ready for Roselle" },
  { key: "all", label: "All files" },
];
// Buckets that still need work — this is what the File Status nav badge
// and the QUEUES sidebar section count against, matching the reviewed
// reference design (Ready for Roselle files are done, so they're excluded
// from the "needs attention" badge but still get their own queue link).
const FILE_STATUS_OPEN_BUCKETS = ["new_leads", "missing_docs", "payment_pending"];

// Stable color per referral partner name, independent of insertion order
// or id (a simple string hash into the fixed csd2-chip-0..5 palette in
// CsDashboard2.css) — "Direct" always gets its own neutral chip instead.
function sourceChipClass(name) {
  if (!name || name === "Direct") return "csd2-chip-direct";
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `csd2-chip-${hash % 6}`;
}

function docStatusLabel(status) {
  if (status === "verified") return "Verified";
  if (status === "uploaded") return "Uploaded";
  return "Missing";
}
function docStatusClass(status) {
  if (status === "verified") return "csd2-status-green";
  if (status === "uploaded") return "csd2-status-yellow";
  return "csd2-status-red";
}
function paymentStatusClass(status) {
  if (status === "verified") return "csd2-status-green";
  if (status === "pending") return "csd2-status-yellow";
  return "csd2-status-unknown";
}
function bucketStatusClass(bucket) {
  if (bucket === "ready") return "csd2-status-green";
  if (bucket === "new_leads") return "csd2-status-unknown";
  return "csd2-status-yellow"; // missing_docs, payment_pending
}

// See the file header comment — every query in this dashboard is scoped
// to this one company (src/utils/companies.js#LTOS_COMPANY_ID).

const NAV_ITEMS = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "call-log", icon: "📞", label: "Call Log" },
  { key: "leads", icon: "👤", label: "Leads" },
  { key: "file-status", icon: "📁", label: "File Status" },
  { key: "follow-ups", icon: "🗓️", label: "Follow Ups" },
  { key: "tasks", icon: "✅", label: "Tasks" },
  { key: "calendar", icon: "📅", label: "Calendar" },
  { key: "clients", icon: "👥", label: "Clients" },
  { key: "partners", icon: "🤝", label: "Partners" },
  { key: "reports", icon: "📊", label: "Reports" },
  { key: "team", icon: "👨‍💼", label: "Team" },
];

function initialsFromName(name) {
  return (
    String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "?"
  );
}

function badgeClass(outcome) {
  return "csd2-" + String(outcome || "Called").toLowerCase().replace(/\s+/g, "-");
}

// company_leads.computed_status is GREEN/YELLOW/RED/UNKNOWN (see
// CompanyLeadsList.jsx's getStatusBadge for the same vocabulary) — maps
// onto the same green/yellow/red CSS vars the outcome badges above
// already use, plus a neutral gray for UNKNOWN.
function statusBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "GREEN") return "csd2-status-green";
  if (s === "YELLOW") return "csd2-status-yellow";
  if (s === "RED") return "csd2-status-red";
  return "csd2-status-unknown";
}

function statusLabel(status) {
  const s = String(status || "").toUpperCase();
  if (s === "GREEN") return "Green / Ready";
  if (s === "YELLOW") return "Yellow / Review";
  if (s === "RED") return "Red / High Risk";
  return "Unknown";
}

function todayIsoDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDateForDisplay(dateString) {
  if (!dateString) return "—";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimeForDisplay(timeString) {
  if (!timeString) return "—";
  const [hourText = "0", minuteText = "0"] = String(timeString).split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return timeString;
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function compareIsoDates(a, b) {
  return String(a || "").localeCompare(String(b || ""));
}

function groupCounts(items, getKey) {
  const counts = new Map();
  items.forEach((item) => {
    const key = getKey(item) || "—";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function EmptyState({ title, message }) {
  return (
    <div className="csd2-empty-state">
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}

// Runs a `clients`/`company_leads` select tolerant of optional columns whose
// migration hasn't been run yet (total_amount_due from sql/add_payment_plan.sql,
// referral_partner_id from sql/add_referral_partners.sql, invoice_sent_at from
// sql/add_invoice_sent_tracking.sql — each landed independently, so any subset
// of them can be missing on a given database). Rather than hard-coding a
// per-column fallback for every optional field this dashboard reads, this
// strips whichever column PostgREST reports missing and retries, one column
// at a time, until the query succeeds or every optional column is exhausted.
// `applyFilters` chains .eq()/.order() etc. onto the base select.
async function selectResilient(table, columns, applyFilters) {
  let cols = [...columns];
  for (let attempt = 0; attempt < columns.length + 1; attempt++) {
    const { data, error } = await applyFilters(supabase.from(table).select(cols.join(", ")));
    if (!error) return { data: data || [], missingColumns: columns.filter((c) => !cols.includes(c)) };
    const match = /column .*\.(\w+) does not exist/i.exec(error.message || "");
    if (match && cols.includes(match[1])) {
      cols = cols.filter((c) => c !== match[1]);
      continue;
    }
    throw error;
  }
  throw new Error(`Could not load ${table}: too many missing columns`);
}

export default function CsDashboard2() {
  const { user, fullName, signOut } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // Same pattern as AdminNavbar.jsx's handleLogout — this dashboard has no
  // shared navbar of its own (it's a standalone shell, see the file header
  // comment), so it didn't get a logout button at all until now.
  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };

  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [calls, setCalls] = useState([]);
  const [payingClients, setPayingClients] = useState([]);
  // Unpaid LTOS clients — includes anyone who signed up as an individual
  // (see the file header comment). These are `clients` rows, not
  // `company_leads` rows, but are treated as prospects in the Leads tab
  // since they haven't converted to paying clients yet.
  const [unpaidClients, setUnpaidClients] = useState([]);
  const [leads, setLeads] = useState([]);
  // Admin-managed list backing both the Leads "Source" picker and File
  // Status's Source column — see sql/add_referral_partners.sql.
  const [referralPartners, setReferralPartners] = useState([]);
  // clientId -> { license, poa } client_documents rows — the File Status
  // readiness pipeline's document half (see utils/fileReadiness.js).
  const [identityDocsByClient, setIdentityDocsByClient] = useState(new Map());
  // adminId -> full_name, for the File Status "Assigned To" column.
  const [adminNamesById, setAdminNamesById] = useState(new Map());
  const [activeSection, setActiveSection] = useState("call-log");
  const [activeFileStatusTab, setActiveFileStatusTab] = useState("new_leads");
  const [saving, setSaving] = useState(false);
  const [sendingInvoiceFor, setSendingInvoiceFor] = useState(null);

  const [showAddLeadModal, setShowAddLeadModal] = useState(false);
  const [showOnboardClientModal, setShowOnboardClientModal] = useState(false);
  const [showOnboardPartnerModal, setShowOnboardPartnerModal] = useState(false);

  const [selectedCallId, setSelectedCallId] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState("details");

  const [showLogModal, setShowLogModal] = useState(false);
  // Set right before opening the modal from a specific lead/client row's
  // own "Log Call" button, so SearchableSelect (mount-only defaultValue —
  // see its own header comment) opens pre-selected instead of blank.
  // Cleared on close so the next "+ Log New Call" (no row context) opens
  // blank again.
  const [prefillContactValue, setPrefillContactValue] = useState("");
  const formRef = useRef(null);

  // Filters (Call Log section)
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const displayName = fullName || "Staff";

  const loadData = async () => {
    setLoading(true);
    try {
      const [callsRes, clientsResult, leadsResult, partnersRes] = await Promise.all([
        supabase
          .from("cs_call_log")
          // `leads:` aliases the company_leads embed so it doesn't collide
          // with the `clients` embed — a call row has exactly one of the
          // two populated (see sql/add_cs_call_log_leads.sql's xor check).
          .select("*, clients ( id, full_name, phone, email ), leads:company_leads ( id, full_name, phone, email, computed_status )")
          .order("created_at", { ascending: false }),
        // One query for every LTOS client, split client-side into paid vs
        // unpaid below — cheaper than two separate round trips and keeps
        // "what counts as an LTOS client" defined in exactly one place.
        // Also pulls in everything the File Status pipeline needs
        // (utils/fileReadiness.js) so that view doesn't need its own
        // separate client fetch. total_amount_due/referral_partner_id are
        // each from their own optional migration — see selectResilient().
        selectResilient(
          "clients",
          ["id", "full_name", "phone", "email", "is_paid", "invoice_sent_at", "admin_id", "total_amount_due", "referral_partner_id", "created_at"],
          (q) => q.eq("company_id", LTOS_COMPANY_ID).order("full_name", { ascending: true })
        ),
        selectResilient(
          "company_leads",
          ["id", "full_name", "phone", "email", "monitoring_username", "computed_status", "company_id", "referral_partner_id", "created_at"],
          (q) => q.eq("company_id", LTOS_COMPANY_ID).order("created_at", { ascending: false })
        ),
        supabase
          .from("referral_partners")
          .select("id, name, active")
          .eq("company_id", LTOS_COMPANY_ID)
          .order("name", { ascending: true }),
      ]);

      if (callsRes.error) {
        // Migration not run yet (sql/add_cs_call_log.sql, or the lead_id
        // follow-up sql/add_cs_call_log_leads.sql) — fail soft with a
        // visible notice instead of a blank/broken page, same pattern
        // useAlignmentDocs.js and others in this codebase already use for
        // optional-migration tables.
        if (/cs_call_log|company_leads/i.test(callsRes.error.message || "")) {
          setMigrationMissing(true);
          setCalls([]);
        } else {
          throw callsRes.error;
        }
      } else {
        setCalls(callsRes.data || []);
        setMigrationMissing(false);
      }

      const allLtosClients = clientsResult.data;
      setPayingClients(allLtosClients.filter((c) => c.is_paid));
      setUnpaidClients(allLtosClients.filter((c) => !c.is_paid));

      setLeads(leadsResult.data);

      setReferralPartners(partnersRes.error ? [] : partnersRes.data || []);

      // File Status doc statuses + Assigned To names — every LTOS client
      // regardless of paid/unpaid, since either can be mid-pipeline.
      const allClientIds = allLtosClients.map((c) => c.id);
      const docsMap = await fetchIdentityDocsForClients(allClientIds);
      setIdentityDocsByClient(docsMap);

      const adminIds = Array.from(new Set(allLtosClients.map((c) => c.admin_id).filter(Boolean)));
      if (adminIds.length > 0) {
        const { data: adminRows } = await supabase.from("profiles").select("id, full_name").in("id", adminIds);
        setAdminNamesById(new Map((adminRows || []).map((a) => [a.id, a.full_name])));
      } else {
        setAdminNamesById(new Map());
      }
    } catch (err) {
      console.error("CsDashboard2 load error:", err);
      addToast({ title: "Load Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Normalizes each raw cs_call_log row (joined with its client OR lead —
  // see the file header comment) into the flat shape every section below
  // renders from — same role the pasted mockup's own `records` array
  // played, just sourced from Supabase instead of an in-memory array.
  // contactType tracks which relation was actually populated so the UI
  // (badges, the details drawer, Leads vs Clients grouping) never has to
  // re-derive it from clientId/leadId being null/non-null itself.
  const records = useMemo(
    () =>
      calls.map((c) => ({
        id: c.id,
        clientId: c.client_id,
        leadId: c.lead_id,
        contactType: c.lead_id ? "lead" : "client",
        name: c.clients?.full_name || c.leads?.full_name || "Unknown Contact",
        phone: c.phone || c.clients?.phone || c.leads?.phone || "",
        callDateIso: c.call_date,
        followUpIso: c.follow_up_date || "",
        date: formatDateForDisplay(c.call_date),
        time: formatTimeForDisplay(c.call_time),
        outcome: c.outcome || "Called",
        followUp: c.follow_up_date ? formatDateForDisplay(c.follow_up_date) : "—",
        calledBy: c.called_by_name || "—",
        source: c.source || "—",
        leadStatus: c.lead_status || "—",
        summary: c.summary || "",
        notes: c.internal_notes ? c.internal_notes.split("\n").map((s) => s.trim()).filter(Boolean) : [],
        nextSteps: Array.isArray(c.next_steps) ? c.next_steps : [],
        history: [`Call logged on ${formatDateForDisplay(c.call_date)} at ${formatTimeForDisplay(c.call_time)}`],
      })),
    [calls]
  );

  const selectedRecord = useMemo(() => records.find((r) => r.id === selectedCallId) || null, [records, selectedCallId]);

  // --- Stats ---
  const callsToday = useMemo(() => records.filter((r) => r.callDateIso === todayIsoDay()).length, [records]);
  const followUpsDueToday = useMemo(() => records.filter((r) => r.followUpIso === todayIsoDay()).length, [records]);
  // Real count from company_leads + unpaid clients now, not a heuristic
  // string-match over call records — every LTOS lead/unpaid signup is
  // inherently "new" until they convert to a paying client (mirrors
  // AdminNewLeads.jsx's own convention of treating the whole unpaid pool
  // as "new", no extra recency filter).
  const newLeadsCount = leads.length + unpaidClients.length;
  const appointmentsSetCount = useMemo(() => records.filter((r) => r.outcome === "Appointment Set").length, [records]);

  const statCards = [
    { icon: "📞", title: "Calls Today", value: callsToday },
    { icon: "📅", title: "Follow Ups Due", value: followUpsDueToday },
    { icon: "👥", title: "New Leads", value: newLeadsCount },
    { icon: "✅", title: "Appointments Set", value: appointmentsSetCount },
  ];

  // --- Call Log filtering ---
  const filteredRecords = useMemo(() => {
    const s = search.trim().toLowerCase();
    const d = dateFilter.trim().toLowerCase();
    return records.filter((r) => {
      const matchesSearch =
        !s ||
        [r.name, r.phone, r.summary, r.date].some((v) => String(v || "").toLowerCase().includes(s)) ||
        r.notes.join(" ").toLowerCase().includes(s);
      const matchesOutcome = outcomeFilter === "all" || r.outcome === outcomeFilter;
      const matchesDate = !d || String(r.date).toLowerCase().includes(d) || String(r.followUp).toLowerCase().includes(d);
      return matchesSearch && matchesOutcome && matchesDate;
    });
  }, [records, search, outcomeFilter, dateFilter]);

  // --- Derived sections (all off the same `records`, matching the
  // mockup's own architecture — no extra fetches per nav tab) ---
  const followUpsData = useMemo(
    () => records.filter((r) => r.followUpIso).slice().sort((a, b) => compareIsoDates(a.followUpIso, b.followUpIso)),
    [records]
  );
  const tasksData = useMemo(
    () =>
      records.flatMap((r) =>
        (r.nextSteps || []).map((step, index) => ({
          id: `${r.id}-${index}`,
          contactName: r.name,
          phone: r.phone,
          calledBy: r.calledBy,
          dueDate: r.followUp !== "—" ? r.followUp : "No due date",
          task: step,
        }))
      ),
    [records]
  );
  const calendarData = useMemo(
    () =>
      records
        .filter((r) => r.followUpIso || r.outcome === "Appointment Set")
        .slice()
        .sort((a, b) => compareIsoDates(a.followUpIso || a.callDateIso, b.followUpIso || b.callDateIso)),
    [records]
  );
  // Shared by clientsRows and leadsRows' signup bucket below — both key off
  // client_id (unpaid signup clients are still `clients` rows, so a call
  // logged against one is a contactType:"client" record exactly like a
  // paying client's). One map instead of two separate reductions over the
  // same `records` array.
  const latestByClientId = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      if (r.contactType !== "client") return;
      const existing = map.get(r.clientId);
      if (!existing || compareIsoDates(r.callDateIso, existing.callDateIso) > 0) map.set(r.clientId, r);
    });
    return map;
  }, [records]);
  // Every paying client, not just ones filtered from `records` the way the
  // mockup's generic-lead version did — we already have a canonical
  // `clients` table, so this shows the real roster (including anyone never
  // called yet) with their most recent call summarized alongside.
  const referralPartnerNameById = useMemo(
    () => new Map(referralPartners.map((p) => [p.id, p.name])),
    [referralPartners]
  );
  const clientsRows = useMemo(
    () =>
      payingClients.map((c) => ({
        id: c.id,
        name: c.full_name,
        phone: c.phone || "—",
        source: referralPartnerNameById.get(c.referral_partner_id) || "Direct",
        lastOutcome: latestByClientId.get(c.id)?.outcome || "Not yet called",
        lastCallDate: latestByClientId.get(c.id)?.date || "—",
        owner: latestByClientId.get(c.id)?.calledBy || "—",
      })),
    [payingClients, latestByClientId, referralPartnerNameById]
  );
  // Combines two prospect sources into one "real roster + latest call
  // alongside" list — company_leads (public widget) and unpaid `clients`
  // rows (individual signups, see the file header comment). Each row
  // carries `source` so the table/badges can tell them apart, and
  // `contactType`/`contactId` so Log Call routes to the right id space
  // (lead_id vs client_id) without the UI having to know which table a
  // given row came from.
  const leadsRows = useMemo(() => {
    const latestByLead = new Map();
    records.forEach((r) => {
      if (r.contactType !== "lead") return;
      const existing = latestByLead.get(r.leadId);
      if (!existing || compareIsoDates(r.callDateIso, existing.callDateIso) > 0) latestByLead.set(r.leadId, r);
    });

    const widgetRows = leads.map((l) => ({
      rowKey: `lead:${l.id}`,
      contactType: "lead",
      contactId: l.id,
      source: "Funding Widget",
      name: l.full_name,
      phone: l.phone || "—",
      email: l.email || "—",
      status: l.computed_status,
      lastOutcome: latestByLead.get(l.id)?.outcome || "Not yet called",
      lastCallDate: latestByLead.get(l.id)?.date || "—",
      owner: latestByLead.get(l.id)?.calledBy || "—",
    }));

    const signupRows = unpaidClients.map((c) => ({
      rowKey: `client:${c.id}`,
      contactType: "client",
      contactId: c.id,
      source: "Client Signup",
      name: c.full_name,
      phone: c.phone || "—",
      email: c.email || "—",
      status: null, // no funder eligibility check for a direct signup
      lastOutcome: latestByClientId.get(c.id)?.outcome || "Not yet called",
      lastCallDate: latestByClientId.get(c.id)?.date || "—",
      owner: latestByClientId.get(c.id)?.calledBy || "—",
    }));

    return [...widgetRows, ...signupRows].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [leads, unpaidClients, records, latestByClientId]);

  // The File Status readiness pipeline — every LTOS client (paid or
  // unpaid), each with its computed doc/payment status and which of the
  // four tabs it belongs in. See utils/fileReadiness.js for the actual
  // bucketing rule (docs before payment, matching the reviewed reference
  // design's own observed behavior).
  const fileStatusRows = useMemo(() => {
    const allClients = [...payingClients, ...unpaidClients];
    return allClients
      .map((c) => {
        const docs = identityDocsByClient.get(c.id) || {};
        const idStatus = computeIdentityStatus(docs.license);
        const addressStatus = computeIdentityStatus(docs.poa);
        const paymentStatus = computePaymentStatus(c);
        const bucket = computeFileBucket({ idStatus, addressStatus, paymentStatus });
        return {
          id: c.id,
          name: c.full_name || "Unnamed client",
          phone: c.phone || "—",
          source: referralPartnerNameById.get(c.referral_partner_id) || "Direct",
          idStatus,
          addressStatus,
          paymentStatus,
          invoiceSentAt: c.invoice_sent_at,
          rate: c.total_amount_due ? `$${Number(c.total_amount_due).toLocaleString()}` : "—",
          assignedTo: adminNamesById.get(c.admin_id) || "—",
          bucket,
        };
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [payingClients, unpaidClients, identityDocsByClient, referralPartnerNameById, adminNamesById]);

  const fileStatusCounts = useMemo(() => {
    const counts = { new_leads: 0, missing_docs: 0, payment_pending: 0, ready: 0 };
    fileStatusRows.forEach((r) => { counts[r.bucket] = (counts[r.bucket] || 0) + 1; });
    return counts;
  }, [fileStatusRows]);
  // "Needs attention" total for the File Status nav badge and QUEUES
  // section header — everything except Ready for Roselle, which is done.
  const fileStatusOpenCount = useMemo(
    () => FILE_STATUS_OPEN_BUCKETS.reduce((sum, key) => sum + (fileStatusCounts[key] || 0), 0),
    [fileStatusCounts]
  );

  // Clients + leads currently attributed to each referral partner — the
  // Partners page's own CLIENTS column. Counts across both tables since a
  // partner's referral can currently be sitting as either.
  const partnerClientCounts = useMemo(() => {
    const counts = new Map();
    [...payingClients, ...unpaidClients].forEach((c) => {
      if (!c.referral_partner_id) return;
      counts.set(c.referral_partner_id, (counts.get(c.referral_partner_id) || 0) + 1);
    });
    leads.forEach((l) => {
      if (!l.referral_partner_id) return;
      counts.set(l.referral_partner_id, (counts.get(l.referral_partner_id) || 0) + 1);
    });
    return counts;
  }, [payingClients, unpaidClients, leads]);

  const fileStatusVisibleRows = useMemo(
    () => (activeFileStatusTab === "all" ? fileStatusRows : fileStatusRows.filter((r) => r.bucket === activeFileStatusTab)),
    [fileStatusRows, activeFileStatusTab]
  );

  const outcomeGroups = useMemo(() => groupCounts(records, (r) => r.outcome), [records]);
  const callerGroups = useMemo(() => groupCounts(records, (r) => r.calledBy), [records]);

  // --- Actions ---
  const openLogModal = () => setShowLogModal(true);
  // Opened from a specific client/lead row's own "Log Call" button —
  // pre-selects that contact in the combined picker below (see
  // prefillContactValue's own comment for why this has to be set BEFORE
  // the modal — and a fresh SearchableSelect instance — mounts).
  const logCallFor = (contactType, id) => {
    setPrefillContactValue(`${contactType}:${id}`);
    setShowLogModal(true);
  };
  const closeLogModal = () => {
    setShowLogModal(false);
    setPrefillContactValue("");
    formRef.current?.reset();
  };

  const handleSaveCall = async (e) => {
    e.preventDefault();
    const formData = new FormData(formRef.current);
    // Combined picker's value is "client:<id>" or "lead:<id>" — see
    // contactOptions below — since company_leads and clients are separate
    // id spaces and cs_call_log can only be tied to exactly one (see
    // sql/add_cs_call_log_leads.sql's xor check).
    const rawContact = String(formData.get("contactId") || "");
    const [contactType, contactId] = rawContact.includes(":") ? rawContact.split(":") : ["", ""];
    if (!contactType || !contactId) {
      addToast({ title: "Contact Required", message: "Pick which client or lead this call was with.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    const isLead = contactType === "lead";
    const matchedContact = isLead
      ? leads.find((l) => l.id === contactId)
      : payingClients.find((c) => c.id === contactId) || unpaidClients.find((c) => c.id === contactId);
    const nextStepsInput = String(formData.get("nextStepsInput") || "").trim();

    const payload = {
      client_id: isLead ? null : contactId,
      lead_id: isLead ? contactId : null,
      employee_id: user?.id || null,
      called_by_name: String(formData.get("calledBy") || displayName).trim() || displayName,
      phone: String(formData.get("phone") || matchedContact?.phone || "").trim() || null,
      call_date: String(formData.get("callDate") || todayIsoDay()),
      call_time: String(formData.get("callTime") || "") || null,
      outcome: String(formData.get("outcome") || "Called"),
      follow_up_date: String(formData.get("followUpDate") || "") || null,
      source: String(formData.get("source") || "").trim() || null,
      lead_status: String(formData.get("leadStatus") || "").trim() || null,
      summary: String(formData.get("summary") || "").trim() || null,
      internal_notes: String(formData.get("internalNotes") || "").trim() || null,
      next_steps: nextStepsInput ? nextStepsInput.split(",").map((s) => s.trim()).filter(Boolean) : [],
    };

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("cs_call_log")
        .insert(payload)
        .select("*, clients ( id, full_name, phone, email ), leads:company_leads ( id, full_name, phone, email, computed_status )")
        .single();
      if (error) throw error;
      setCalls((prev) => [data, ...prev]);
      addToast({ title: "Call Logged", message: `Call with ${matchedContact?.full_name || "contact"} saved.`, variant: "success", icon: "bi-telephone-fill" });
      closeLogModal();
      setActiveSection("call-log");
      setSelectedCallId(data.id);
      setActiveDetailTab("details");
    } catch (err) {
      console.error("Save call failed:", err);
      addToast({ title: "Save Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSaving(false);
    }
  };

  // One combined searchable list for the Log Call modal — LTOS paying
  // clients, unpaid/signup clients, and LTOS leads together, each option's
  // value prefixed with its type so handleSaveCall above can route it to
  // client_id or lead_id correctly. Labels are suffixed so reps can tell
  // apart a paying client, an unpaid signup, and a widget lead who happen
  // to share a name at a glance.
  const contactOptions = useMemo(
    () => [
      ...payingClients.map((c) => ({ value: `client:${c.id}`, label: `${c.full_name || "Unnamed client"} — Client` })),
      ...unpaidClients.map((c) => ({ value: `client:${c.id}`, label: `${c.full_name || "Unnamed client"} — Signup (Unpaid)` })),
      ...leads.map((l) => ({ value: `lead:${l.id}`, label: `${l.full_name || "Unnamed lead"} — Lead` })),
    ],
    [payingClients, unpaidClients, leads]
  );

  // CS sends the invoice themselves — this is the one write action they
  // take on a File Status row directly (the doc checklist is read-only,
  // reflecting the real Alignment Check system elsewhere — see this
  // dashboard's own file header and utils/fileReadiness.js). Refetches
  // afterward rather than patching state locally — this company's client
  // list is small enough that a full reload is simpler and less
  // error-prone than hand-merging invoice_sent_at into two arrays.
  const sendInvoice = async (clientId) => {
    setSendingInvoiceFor(clientId);
    try {
      const { error } = await supabase.from("clients").update({ invoice_sent_at: new Date().toISOString() }).eq("id", clientId);
      if (error) throw error;
      addToast({ title: "Invoice Marked Sent", message: "Payment status is now Pending.", variant: "success", icon: "bi-receipt" });
      await loadData();
    } catch (err) {
      console.error("Send invoice failed:", err);
      addToast({ title: "Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSendingInvoiceFor(null);
    }
  };

  const addLeadFormRef = useRef(null);
  const closeAddLeadModal = () => { setShowAddLeadModal(false); addLeadFormRef.current?.reset(); };
  const handleSaveLead = async (e) => {
    e.preventDefault();
    const formData = new FormData(addLeadFormRef.current);
    const fullName = String(formData.get("fullName") || "").trim();
    if (!fullName) {
      addToast({ title: "Name Required", message: "Enter the lead's name.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        company_id: LTOS_COMPANY_ID,
        full_name: fullName,
        phone: String(formData.get("phone") || "").trim() || null,
        email: String(formData.get("email") || "").trim() || null,
        referral_partner_id: String(formData.get("referralPartnerId") || "") || null,
      };
      const { error } = await supabase.from("company_leads").insert(payload);
      if (error) throw error;
      addToast({ title: "Lead Added", message: `${fullName} added to New Leads.`, variant: "success", icon: "bi-person-plus-fill" });
      closeAddLeadModal();
      setActiveSection("leads");
      await loadData();
    } catch (err) {
      console.error("Add lead failed:", err);
      addToast({ title: "Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSaving(false);
    }
  };

  // --- Onboard Client wizard: Step 1 (contact + source), Step 2 (review
  // + create). Creates a clients row directly, same payload shape as the
  // individual-portal self-heal insert (IndividualDashboard.jsx /
  // IndividualLayout.jsx) — unpaid, LTOS, inquiry_deletion by default —
  // since this is staff manually starting a file for someone who called
  // in rather than signing up themselves.
  const [onboardClientStep, setOnboardClientStep] = useState(1);
  const [onboardClientData, setOnboardClientData] = useState({ fullName: "", email: "", phone: "", referralPartnerId: "" });
  const closeOnboardClientModal = () => {
    setShowOnboardClientModal(false);
    setOnboardClientStep(1);
    setOnboardClientData({ fullName: "", email: "", phone: "", referralPartnerId: "" });
  };
  const submitOnboardClient = async () => {
    if (!onboardClientData.fullName.trim()) {
      addToast({ title: "Name Required", message: "Enter the client's name.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      setOnboardClientStep(1);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        full_name: onboardClientData.fullName.trim(),
        email: onboardClientData.email.trim() || null,
        phone: onboardClientData.phone.trim() || null,
        dispute_method: "inquiry deletion",
        service_id: deriveServiceId("inquiry deletion"),
        status: "pending",
        is_paid: false,
        company_id: LTOS_COMPANY_ID,
        referral_partner_id: onboardClientData.referralPartnerId || null,
      };
      let { error } = await supabase.from("clients").insert(payload);
      // Defensive: sql/add_services.sql may not be run yet — same
      // graceful-degrade pattern IndividualDashboard.jsx already uses.
      if (error && /service_id/i.test(error.message || "")) {
        const { service_id: _omit, ...withoutServiceId } = payload;
        ({ error } = await supabase.from("clients").insert(withoutServiceId));
      }
      if (error) throw error;
      addToast({ title: "Client Onboarded", message: `${payload.full_name} added as an unpaid client.`, variant: "success", icon: "bi-person-check-fill" });
      closeOnboardClientModal();
      setActiveSection("file-status");
      setActiveFileStatusTab("new_leads");
      await loadData();
    } catch (err) {
      console.error("Onboard client failed:", err);
      addToast({ title: "Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSaving(false);
    }
  };

  // --- Onboard Partner wizard: Step 1 (name), Step 2 (confirm) — adds a
  // row to the referral_partners list (sql/add_referral_partners.sql)
  // that then shows up in every Source picker across this dashboard.
  const [onboardPartnerStep, setOnboardPartnerStep] = useState(1);
  const [onboardPartnerName, setOnboardPartnerName] = useState("");
  const closeOnboardPartnerModal = () => {
    setShowOnboardPartnerModal(false);
    setOnboardPartnerStep(1);
    setOnboardPartnerName("");
  };
  const submitOnboardPartner = async () => {
    const name = onboardPartnerName.trim();
    if (!name) {
      addToast({ title: "Name Required", message: "Enter the partner's name.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      setOnboardPartnerStep(1);
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("referral_partners").insert({ company_id: LTOS_COMPANY_ID, name });
      if (error) throw error;
      addToast({ title: "Partner Added", message: `${name} is now available as a lead source.`, variant: "success", icon: "bi-diagram-3-fill" });
      closeOnboardPartnerModal();
      await loadData();
    } catch (err) {
      console.error("Onboard partner failed:", err);
      addToast({ title: "Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSaving(false);
    }
  };

  const viewDetails = (record) => {
    setSelectedCallId(record.id);
    setActiveDetailTab("details");
  };
  const clearDetails = () => setSelectedCallId(null);

  const setActiveSectionAndClear = (key) => {
    setActiveSection(key);
    if (key !== "call-log") clearDetails();
  };

  if (migrationMissing) {
    return (
      <div className="csd2-root">
        <div className="csd2-migration-notice">
          <strong>Setup needed:</strong> the <code>cs_call_log</code> table doesn't exist yet. Run{" "}
          <code>sql/add_cs_call_log.sql</code> against the database, then reload this page.
        </div>
      </div>
    );
  }

  return (
    <div className="csd2-root">
      <div className="csd2-app">
        <aside className="csd2-sidebar">
          <div className="csd2-brand">
            <div className="csd2-brand-title">Hidden Partner Cloud</div>
          </div>

          <nav className="csd2-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                className={activeSection === item.key ? "csd2-active" : ""}
                onClick={() => setActiveSectionAndClear(item.key)}
              >
                <span>{item.icon}</span> {item.label}
                {item.key === "file-status" && fileStatusOpenCount > 0 && (
                  <span className="csd2-nav-badge">{fileStatusOpenCount}</span>
                )}
              </button>
            ))}
          </nav>

          <div className="csd2-queues">
            <div className="csd2-queues-title">QUEUES</div>
            {FILE_STATUS_TABS.filter((t) => t.key !== "all").map((t) => (
              <button
                key={t.key}
                type="button"
                className={`csd2-queue-row ${activeSection === "file-status" && activeFileStatusTab === t.key ? "csd2-active" : ""}`}
                onClick={() => { setActiveSectionAndClear("file-status"); setActiveFileStatusTab(t.key); }}
              >
                {t.label} <span className="csd2-queue-count">{fileStatusCounts[t.key] || 0}</span>
              </button>
            ))}
          </div>

          <div className="csd2-sidebar-footer">
            <div className="csd2-avatar">{initialsFromName(displayName).slice(0, 1)}</div>
            <div>
              <div style={{ fontWeight: 800 }}>{displayName}</div>
              <div className="csd2-sub">Staff</div>
            </div>
            <button
              type="button"
              className="csd2-logout-btn"
              title="Sign Out"
              onClick={handleLogout}
            >
              <i className="bi bi-box-arrow-right" />
            </button>
          </div>
        </aside>

        <main className="csd2-main">
          {activeSection === "dashboard" && (
            <section>
              <div className="csd2-breadcrumb">
                Hidden Partner Cloud / <span className="csd2-crumb-current">Dashboard</span>
              </div>
              <div className="csd2-topbar">
                <div className="csd2-welcome">
                  <h1>Welcome back, {displayName}</h1>
                  <p>This is your summary page.</p>
                </div>
                <div className="csd2-top-actions">
                  <button className="csd2-primary-btn" type="button" onClick={openLogModal}>＋ Log New Call</button>
                </div>
              </div>

              <section className="csd2-summary-stats">
                {statCards.map((s) => (
                  <div className="csd2-card csd2-stat-card" key={s.title}>
                    <div className="csd2-icon-box">{s.icon}</div>
                    <div>
                      <div className="csd2-stat-title">{s.title}</div>
                      <div className="csd2-stat-value">{s.value}</div>
                    </div>
                  </div>
                ))}
              </section>

              <div className="csd2-grid-2" style={{ marginTop: 16 }}>
                <div className="csd2-card csd2-panel-body">
                  <div className="csd2-panel-head">
                    <h2 className="csd2-section-title" style={{ margin: 0 }}>Recent Calls</h2>
                  </div>
                  {records.length === 0 ? (
                    <EmptyState title="No recent calls" message="Log a call to see activity here." />
                  ) : (
                    <div className="csd2-list-stack">
                      {records.slice(0, 5).map((r) => (
                        <div className="csd2-list-item" key={r.id}>
                          <div className="csd2-list-item-head">
                            <div>
                              <div className="csd2-list-item-title">{r.name}</div>
                              <div className="csd2-list-item-sub">{r.phone} · {r.date} {r.time}</div>
                            </div>
                            <span className={`csd2-badge ${badgeClass(r.outcome)}`}>{r.outcome}</span>
                          </div>
                          <div className="csd2-subtle">Called by {r.calledBy}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="csd2-card csd2-panel-body">
                  <div className="csd2-panel-head">
                    <h2 className="csd2-section-title" style={{ margin: 0 }}>Today's Follow Ups</h2>
                  </div>
                  {records.filter((r) => r.followUpIso === todayIsoDay()).length === 0 ? (
                    <EmptyState title="No follow ups today" message="You do not have any follow ups due today." />
                  ) : (
                    <div className="csd2-list-stack">
                      {records.filter((r) => r.followUpIso === todayIsoDay()).map((r) => (
                        <div className="csd2-list-item" key={r.id}>
                          <div className="csd2-list-item-title">{r.name}</div>
                          <div className="csd2-list-item-sub">{r.phone} · Due {r.followUp}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeSection === "call-log" && (
            <section>
              <div className="csd2-breadcrumb">
                Hidden Partner Cloud / <span className="csd2-crumb-current">Call Log</span>
              </div>
              <div className="csd2-topbar">
                <div className="csd2-welcome">
                  <h1>Welcome back, {displayName}</h1>
                  <p>Here's what's happening with your calls today.</p>
                </div>
                <div className="csd2-top-actions">
                  <button className="csd2-primary-btn" type="button" onClick={openLogModal}>＋ Log New Call</button>
                  <button className="csd2-notification" type="button" title="Notifications" onClick={() => addToast({ title: "Notifications", message: "No new notifications.", variant: "info", icon: "bi-bell-fill" })}>
                    🔔
                    <span className="csd2-notification-badge">{records.length}</span>
                  </button>
                </div>
              </div>

              <section className="csd2-stats">
                {statCards.map((s) => (
                  <div className="csd2-card csd2-stat-card" key={s.title}>
                    <div className="csd2-icon-box">{s.icon}</div>
                    <div>
                      <div className="csd2-stat-title">{s.title}</div>
                      <div className="csd2-stat-value">{s.value}</div>
                    </div>
                  </div>
                ))}
              </section>

              <section>
                <h2 className="csd2-section-title">Call Log</h2>

                <div className="csd2-filters">
                  <input className="csd2-input" type="text" placeholder="Search by name, phone, or notes..." value={search} onChange={(e) => setSearch(e.target.value)} />
                  <select className="csd2-select" value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
                    <option value="all">All Outcomes</option>
                    {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <input className="csd2-input" type="text" placeholder="Search date text..." value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                  {/* No "Apply" button — filtering already runs live off the
                      inputs above (filteredRecords' useMemo), so a separate
                      apply step would just be a dead click. */}
                  <button className="csd2-filter-btn" type="button" onClick={() => { setSearch(""); setOutcomeFilter("all"); setDateFilter(""); }}>Reset</button>
                </div>

                <div className="csd2-card csd2-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>CONTACT</th>
                        <th>PHONE</th>
                        <th>DATE &amp; TIME</th>
                        <th>OUTCOME</th>
                        <th>FOLLOW UP</th>
                        <th>CALLED BY</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.map((r) => (
                        <tr key={r.id} className="csd2-clickable" onClick={() => viewDetails(r)}>
                          <td>
                            <div className="csd2-contact-cell">
                              <div className="csd2-mini-avatar">{initialsFromName(r.name)}</div>
                              <div>
                                <div className="csd2-name">{r.name}</div>
                                <div className="csd2-subtle">{r.contactType === "lead" ? "Lead" : "Client"}</div>
                              </div>
                            </div>
                          </td>
                          <td>{r.phone || "—"}</td>
                          <td>
                            <div>{r.date}</div>
                            <div className="csd2-subtle">{r.time}</div>
                          </td>
                          <td><span className={`csd2-badge ${badgeClass(r.outcome)}`}>{r.outcome}</span></td>
                          <td>{r.followUp}</td>
                          <td>{r.calledBy}</td>
                          <td>•••</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!loading && filteredRecords.length === 0 && (
                    <EmptyState title="No call records yet" message="Add a call with the button above." />
                  )}
                </div>

                <div className="csd2-table-footer">
                  <div>Showing {filteredRecords.length === 0 ? 0 : 1} to {filteredRecords.length} of {filteredRecords.length} results</div>
                </div>
              </section>
            </section>
          )}

          {activeSection === "leads" && (
            <section>
              <div className="csd2-breadcrumb">
                Hidden Partner Cloud / <span className="csd2-crumb-current">Leads</span>
              </div>
              <div className="csd2-panel-head">
                <h2 className="csd2-section-title" style={{ margin: 0 }}>Leads</h2>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="csd2-primary-btn" type="button" onClick={() => setShowAddLeadModal(true)}>＋ Add Lead</button>
                  <button className="csd2-secondary-btn" type="button" onClick={openLogModal}>Log Call</button>
                </div>
              </div>
              <div className="csd2-card csd2-panel-body">
                {leadsRows.length === 0 ? (
                  <EmptyState title="No leads yet" message="Leads from the funding-eligibility widget and unpaid client signups will appear here." />
                ) : (
                  <table>
                    <thead><tr><th>LEAD</th><th>SOURCE</th><th>PHONE</th><th>EMAIL</th><th>FUNDER STATUS</th><th>LAST OUTCOME</th><th>LAST CALLED</th><th>OWNER</th><th></th></tr></thead>
                    <tbody>
                      {leadsRows.map((l) => (
                        <tr key={l.rowKey}>
                          <td>{l.name}</td>
                          <td><span className={`csd2-chip ${sourceChipClass(l.source)}`}>{l.source}</span></td>
                          <td>{l.phone}</td>
                          <td>{l.email}</td>
                          <td>{l.status ? <span className={`csd2-badge ${statusBadgeClass(l.status)}`}>{statusLabel(l.status)}</span> : "—"}</td>
                          <td>{l.lastOutcome}</td>
                          <td>{l.lastCallDate}</td>
                          <td>{l.owner}</td>
                          <td>
                            <button className="csd2-secondary-btn" type="button" onClick={() => logCallFor(l.contactType, l.contactId)}>Log Call</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {activeSection === "file-status" && (
            <section>
              <div className="csd2-breadcrumb">
                Hidden Partner Cloud / File Status /{" "}
                <span className="csd2-crumb-current">
                  {FILE_STATUS_TABS.find((t) => t.key === activeFileStatusTab)?.label || "All files"}
                </span>
              </div>
              <div className="csd2-page-header">
                <div>
                  <h1>File Status</h1>
                  <p className="csd2-subtle" style={{ margin: "6px 0 0" }}>
                    Every file, by what it still needs. Nothing reaches Roselle until source, docs, and payment are green.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className="csd2-primary-btn" type="button" onClick={() => setShowAddLeadModal(true)}>＋ Add Lead</button>
                  <button className="csd2-secondary-btn" type="button" onClick={() => setShowOnboardClientModal(true)}>Onboard Client</button>
                  <button className="csd2-secondary-btn" type="button" onClick={() => setShowOnboardPartnerModal(true)}>Onboard Partner</button>
                </div>
              </div>

              <div className="csd2-howto-banner">
                <strong>How files move:</strong> every new lead and logged call starts in <em>New Leads</em>. ID and
                Address documents move to <em>Uploaded</em> then <em>Verified</em> through the real Alignment Check
                process elsewhere in the app — this view reflects that status, it doesn't set it. The file sits in{" "}
                <em>Missing Docs</em> until both are verified. Send the invoice to move Payment to <em>Pending</em>;
                it becomes <em>Verified</em> once the payment actually clears. When docs and payment are both
                verified, the file moves to <em>Ready for Roselle</em> on its own.
              </div>

              <div className="csd2-fs-tabs">
                {FILE_STATUS_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`csd2-fs-tab ${activeFileStatusTab === t.key ? "csd2-active" : ""}`}
                    onClick={() => setActiveFileStatusTab(t.key)}
                  >
                    {t.label}{" "}
                    <span className="csd2-badge csd2-status-unknown">
                      {t.key === "all" ? fileStatusRows.length : fileStatusCounts[t.key] || 0}
                    </span>
                  </button>
                ))}
              </div>

              <div className="csd2-card csd2-panel-body">
                {fileStatusVisibleRows.length === 0 ? (
                  <EmptyState title="Nothing here" message="No files in this stage right now." />
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>CLIENT</th><th>SOURCE</th><th>ID</th><th>ADDRESS</th><th>PAYMENT</th><th>RATE</th><th>ASSIGNED TO</th><th>STATUS</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fileStatusVisibleRows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <span className="csd2-name">{r.name}</span>
                            <div className="csd2-list-item-sub">{r.phone}</div>
                          </td>
                          <td><span className={`csd2-chip ${sourceChipClass(r.source)}`}>{r.source}</span></td>
                          <td><span className={`csd2-badge ${docStatusClass(r.idStatus)}`}>{docStatusLabel(r.idStatus)}</span></td>
                          <td><span className={`csd2-badge ${docStatusClass(r.addressStatus)}`}>{docStatusLabel(r.addressStatus)}</span></td>
                          <td>
                            {r.paymentStatus === "not_sent" ? (
                              <button className="csd2-secondary-btn" type="button" disabled={sendingInvoiceFor === r.id} onClick={() => sendInvoice(r.id)}>
                                {sendingInvoiceFor === r.id ? "Sending..." : "Send Invoice"}
                              </button>
                            ) : (
                              // Pending/Verified aren't staff-editable here — Verified only ever
                              // comes from the real payment flow (markClientPaid), which also resets
                              // bureau statuses and fires the paid webhooks. A plain dropdown that let
                              // CS flip straight to Verified would silently skip all of that.
                              <select className={`csd2-payment-select ${paymentStatusClass(r.paymentStatus)}`} value={r.paymentStatus} disabled>
                                <option value="pending">Pending</option>
                                <option value="verified">Verified</option>
                              </select>
                            )}
                          </td>
                          <td>{r.rate}</td>
                          <td>{r.assignedTo}</td>
                          <td>
                            <span className={`csd2-badge ${bucketStatusClass(r.bucket)}`}>
                              {FILE_STATUS_TABS.find((t) => t.key === r.bucket)?.label || r.bucket}
                            </span>
                          </td>
                          <td>
                            <button className="csd2-secondary-btn" type="button" onClick={() => navigate(`/clients/${r.id}`)}>Open File →</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {activeSection === "follow-ups" && (
            <section>
              <div className="csd2-panel-head"><h2 className="csd2-section-title" style={{ margin: 0 }}>Follow Ups</h2></div>
              <div className="csd2-card csd2-panel-body">
                {followUpsData.length === 0 ? (
                  <EmptyState title="No follow ups scheduled" message="Add a follow up date when logging calls." />
                ) : (
                  <div className="csd2-list-stack">
                    {followUpsData.map((r) => (
                      <div className="csd2-list-item" key={r.id}>
                        <div className="csd2-list-item-head">
                          <div>
                            <div className="csd2-list-item-title">{r.name}</div>
                            <div className="csd2-list-item-sub">{r.phone || "—"} · Due {r.followUp}</div>
                          </div>
                          <span className={`csd2-badge ${badgeClass(r.outcome)}`}>{r.outcome}</span>
                        </div>
                        <div className="csd2-subtle">Assigned to {r.calledBy}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "tasks" && (
            <section>
              <div className="csd2-panel-head"><h2 className="csd2-section-title" style={{ margin: 0 }}>Tasks</h2></div>
              <div className="csd2-card csd2-panel-body">
                {tasksData.length === 0 ? (
                  <EmptyState title="No tasks yet" message="Tasks appear from the Next Steps field in your calls." />
                ) : (
                  <div className="csd2-list-stack">
                    {tasksData.map((t) => (
                      <div className="csd2-list-item" key={t.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input type="checkbox" />
                          <div>
                            <div className="csd2-list-item-title">{t.task}</div>
                            <div className="csd2-list-item-sub">{t.contactName} · {t.phone || "—"} · {t.dueDate}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "calendar" && (
            <section>
              <div className="csd2-panel-head"><h2 className="csd2-section-title" style={{ margin: 0 }}>Calendar</h2></div>
              <div className="csd2-card csd2-panel-body">
                {calendarData.length === 0 ? (
                  <EmptyState title="No calendar items yet" message="Appointments and follow ups will show here." />
                ) : (
                  <div className="csd2-list-stack">
                    {calendarData.map((r) => (
                      <div className="csd2-list-item" key={r.id}>
                        <div className="csd2-list-item-head">
                          <div>
                            <div className="csd2-list-item-title">{r.name}</div>
                            <div className="csd2-list-item-sub">{r.outcome === "Appointment Set" ? "Appointment" : "Follow Up"} · {r.followUp !== "—" ? r.followUp : r.date}</div>
                          </div>
                          <span className={`csd2-badge ${badgeClass(r.outcome)}`}>{r.outcome}</span>
                        </div>
                        <div className="csd2-subtle">{r.calledBy}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {activeSection === "clients" && (
            <section>
              <div className="csd2-breadcrumb">
                Hidden Partner Cloud / <span className="csd2-crumb-current">Clients</span>
              </div>
              <div className="csd2-panel-head"><h2 className="csd2-section-title" style={{ margin: 0 }}>Clients</h2></div>
              <div className="csd2-card csd2-panel-body">
                {clientsRows.length === 0 ? (
                  <EmptyState title="No paying clients yet" message="Clients appear here once they're marked paid." />
                ) : (
                  <table>
                    <thead><tr><th>CLIENT</th><th>SOURCE</th><th>PHONE</th><th>LAST OUTCOME</th><th>LAST CALLED</th><th>OWNER</th><th></th></tr></thead>
                    <tbody>
                      {clientsRows.map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td>
                          <td><span className={`csd2-chip ${sourceChipClass(c.source)}`}>{c.source}</span></td>
                          <td>{c.phone}</td><td>{c.lastOutcome}</td><td>{c.lastCallDate}</td><td>{c.owner}</td>
                          <td>
                            <button className="csd2-secondary-btn" type="button" onClick={() => logCallFor("client", c.id)}>Log Call</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {activeSection === "partners" && (
            <section>
              <div className="csd2-breadcrumb">
                Hidden Partner Cloud / <span className="csd2-crumb-current">Partners</span>
              </div>
              <div className="csd2-page-header">
                <h1>Partners</h1>
                <button className="csd2-primary-btn" type="button" onClick={() => setShowOnboardPartnerModal(true)}>Onboard Partner</button>
              </div>
              <div className="csd2-card csd2-panel-body">
                {referralPartners.length === 0 ? (
                  <EmptyState title="No referral partners yet" message="Onboard a partner to make them available as a lead source." />
                ) : (
                  <table>
                    <thead><tr><th>PARTNER</th><th>CLIENTS</th><th></th></tr></thead>
                    <tbody>
                      {referralPartners.map((p) => (
                        <tr key={p.id}>
                          <td><span className={`csd2-chip ${sourceChipClass(p.name)}`}>{p.name}</span></td>
                          <td>{partnerClientCounts.get(p.id) || 0}</td>
                          <td>
                            <button
                              className="csd2-secondary-btn"
                              type="button"
                              onClick={() => { setShowAddLeadModal(true); }}
                            >
                              Add Lead for This Partner
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          )}

          {activeSection === "reports" && (
            <section>
              <div className="csd2-panel-head"><h2 className="csd2-section-title" style={{ margin: 0 }}>Reports</h2></div>
              <div className="csd2-grid-2">
                <div className="csd2-card csd2-panel-body">
                  <h3 style={{ marginTop: 0 }}>By Outcome</h3>
                  {outcomeGroups.length === 0 ? (
                    <EmptyState title="No report data" message="Log calls to generate reports." />
                  ) : (
                    <div className="csd2-list-stack">
                      {outcomeGroups.map(([label, value]) => (
                        <div className="csd2-list-item" key={label}>
                          <div className="csd2-list-item-head" style={{ marginBottom: 0 }}>
                            <div className="csd2-list-item-title">{label}</div>
                            <div className="csd2-list-item-title">{value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="csd2-card csd2-panel-body">
                  <h3 style={{ marginTop: 0 }}>By Team Member</h3>
                  {callerGroups.length === 0 ? (
                    <EmptyState title="No team data" message="Calls by team member will appear here." />
                  ) : (
                    <div className="csd2-list-stack">
                      {callerGroups.map(([label, value]) => (
                        <div className="csd2-list-item" key={label}>
                          <div className="csd2-list-item-head" style={{ marginBottom: 0 }}>
                            <div className="csd2-list-item-title">{label}</div>
                            <div className="csd2-list-item-title">{value}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeSection === "team" && (
            <div className="csd2-card csd2-simple-panel">
              <h2>Team</h2>
              <p>This section is ready for your team content.</p>
            </div>
          )}
        </main>

        <aside className="csd2-details">
          <div className="csd2-details-top">
            <button className="csd2-close-btn" type="button" title="Close" onClick={clearDetails}>×</button>
          </div>

          {!selectedRecord ? (
            <div className="csd2-drawer-placeholder">
              <h3>No contact selected</h3>
              <div>Select a record from the call log to view details here.</div>
            </div>
          ) : (
            <div>
              <div className="csd2-contact-header">
                <h2>{selectedRecord.name}</h2>
                <div className="csd2-phone-line">{selectedRecord.phone || "—"}</div>
              </div>

              <div className="csd2-tabs">
                {["details", "notes", "history", "tasks"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    className={`csd2-tab ${activeDetailTab === tab ? "csd2-active" : ""}`}
                    onClick={() => setActiveDetailTab(tab)}
                  >
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>

              <div className={`csd2-tab-panel ${activeDetailTab === "details" ? "csd2-active" : ""}`}>
                <div className="csd2-detail-list">
                  {[
                    ["Outcome", selectedRecord.outcome],
                    ["Date & Time", `${selectedRecord.date} ${selectedRecord.time}`.trim()],
                    ["Called By", selectedRecord.calledBy],
                    ["Follow Up Date", selectedRecord.followUp],
                    ["Source", selectedRecord.source],
                    ["Lead Status", selectedRecord.leadStatus],
                  ].map(([key, value]) => (
                    <div className="csd2-detail-row" key={key}>
                      <div className="csd2-detail-key">{key}</div>
                      <div className="csd2-detail-value">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className={`csd2-tab-panel ${activeDetailTab === "notes" ? "csd2-active" : ""}`}>
                <div className="csd2-note-block">
                  <h3>Call Summary</h3>
                  <p className={selectedRecord.summary ? "" : "csd2-placeholder"}>{selectedRecord.summary || "No call summary."}</p>
                </div>
                <div className="csd2-note-block">
                  <h3>Internal Notes</h3>
                  <div className="csd2-internal-notes">
                    {selectedRecord.notes.length ? selectedRecord.notes.map((n, i) => <div key={i}>{n}</div>) : <span className="csd2-placeholder">No internal notes.</span>}
                  </div>
                </div>
              </div>

              <div className={`csd2-tab-panel ${activeDetailTab === "history" ? "csd2-active" : ""}`}>
                <div className="csd2-note-block">
                  <h3>History</h3>
                  <div className="csd2-internal-notes">
                    {selectedRecord.history.length ? selectedRecord.history.map((h, i) => <div key={i}>{h}</div>) : <span className="csd2-placeholder">No history available.</span>}
                  </div>
                </div>
              </div>

              <div className={`csd2-tab-panel ${activeDetailTab === "tasks" ? "csd2-active" : ""}`}>
                <div className="csd2-note-block">
                  <h3>Next Steps</h3>
                  {selectedRecord.nextSteps.length ? (
                    <ul>{selectedRecord.nextSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
                  ) : (
                    <p className="csd2-placeholder">No next steps.</p>
                  )}
                </div>
              </div>

              <div className="csd2-details-actions">
                <button className="csd2-secondary-btn" type="button" onClick={() => addToast({ title: "Coming Soon", message: "Editing a logged call isn't wired up yet in this preview.", variant: "info", icon: "bi-info-circle-fill" })}>
                  ✎ Edit
                </button>
                <button className="csd2-cta-btn" type="button" onClick={openLogModal}>📞 Log Another Call</button>
              </div>
            </div>
          )}
        </aside>
      </div>

      {showLogModal && (
        <div className="csd2-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeLogModal(); }}>
          <div className="csd2-modal">
            <div className="csd2-modal-header">
              <h2>Log New Call</h2>
              <button className="csd2-close-btn" type="button" onClick={closeLogModal}>×</button>
            </div>
            <div className="csd2-modal-body">
              <form ref={formRef} onSubmit={handleSaveCall}>
                <div className="csd2-modal-grid">
                  <div className="csd2-field csd2-full">
                    <label>Client or Lead</label>
                    <SearchableSelect
                      name="contactId"
                      options={contactOptions}
                      placeholder="Search LTOS clients and leads..."
                      required
                      defaultValue={prefillContactValue}
                    />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2Phone">Phone</label>
                    <input id="csd2Phone" name="phone" type="text" placeholder="Defaults to contact's phone on file" />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2CallDate">Date</label>
                    <input id="csd2CallDate" name="callDate" type="date" defaultValue={todayIsoDay()} required />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2CallTime">Time</label>
                    <input id="csd2CallTime" name="callTime" type="time" />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2Outcome">Outcome</label>
                    <select id="csd2Outcome" name="outcome" defaultValue="Interested" required>
                      {OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2FollowUp">Follow Up Date</label>
                    <input id="csd2FollowUp" name="followUpDate" type="date" />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2CalledBy">Called By</label>
                    <input id="csd2CalledBy" name="calledBy" type="text" defaultValue={displayName} />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2Source">Source</label>
                    <input id="csd2Source" name="source" type="text" placeholder="Website, ad, referral..." />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2LeadStatus">Lead Status</label>
                    <input id="csd2LeadStatus" name="leadStatus" type="text" placeholder="e.g. At risk, Renewal..." />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2NextSteps">Next Steps</label>
                    <input id="csd2NextSteps" name="nextStepsInput" type="text" placeholder="Comma separated" />
                  </div>

                  <div className="csd2-field csd2-full">
                    <label htmlFor="csd2Summary">Call Summary</label>
                    <textarea id="csd2Summary" name="summary" placeholder="Write call notes here..." />
                  </div>

                  <div className="csd2-field csd2-full">
                    <label htmlFor="csd2InternalNotes">Internal Notes</label>
                    <textarea id="csd2InternalNotes" name="internalNotes" placeholder="Private notes..." />
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
                  <button className="csd2-secondary-btn" type="button" onClick={closeLogModal} disabled={saving}>Cancel</button>
                  <button className="csd2-cta-btn" type="submit" disabled={saving}>{saving ? "Saving..." : "Save Call"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showAddLeadModal && (
        <div className="csd2-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeAddLeadModal(); }}>
          <div className="csd2-modal">
            <div className="csd2-modal-header">
              <h2>Add Lead</h2>
              <button className="csd2-close-btn" type="button" onClick={closeAddLeadModal}>×</button>
            </div>
            <div className="csd2-modal-body">
              <form ref={addLeadFormRef} onSubmit={handleSaveLead}>
                <div className="csd2-modal-grid">
                  <div className="csd2-field csd2-full">
                    <label htmlFor="csd2LeadName">Full Name</label>
                    <input id="csd2LeadName" name="fullName" type="text" required />
                  </div>
                  <div className="csd2-field">
                    <label htmlFor="csd2LeadPhone">Phone</label>
                    <input id="csd2LeadPhone" name="phone" type="text" />
                  </div>
                  <div className="csd2-field">
                    <label htmlFor="csd2LeadEmail">Email</label>
                    <input id="csd2LeadEmail" name="email" type="email" />
                  </div>
                  <div className="csd2-field csd2-full">
                    <label htmlFor="csd2LeadSource">Source</label>
                    <select id="csd2LeadSource" name="referralPartnerId" defaultValue="">
                      <option value="">Direct</option>
                      {referralPartners.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
                  <button className="csd2-secondary-btn" type="button" onClick={closeAddLeadModal} disabled={saving}>Cancel</button>
                  <button className="csd2-cta-btn" type="submit" disabled={saving}>{saving ? "Saving..." : "Add Lead"}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {showOnboardClientModal && (
        <div className="csd2-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeOnboardClientModal(); }}>
          <div className="csd2-modal">
            <div className="csd2-modal-header">
              <h2>Onboard Client — Step {onboardClientStep} of 2</h2>
              <button className="csd2-close-btn" type="button" onClick={closeOnboardClientModal}>×</button>
            </div>
            <div className="csd2-modal-body">
              {onboardClientStep === 1 ? (
                <>
                  <div className="csd2-modal-grid">
                    <div className="csd2-field csd2-full">
                      <label htmlFor="csd2OcName">Full Name</label>
                      <input
                        id="csd2OcName" type="text" required
                        value={onboardClientData.fullName}
                        onChange={(e) => setOnboardClientData((d) => ({ ...d, fullName: e.target.value }))}
                      />
                    </div>
                    <div className="csd2-field">
                      <label htmlFor="csd2OcPhone">Phone</label>
                      <input
                        id="csd2OcPhone" type="text"
                        value={onboardClientData.phone}
                        onChange={(e) => setOnboardClientData((d) => ({ ...d, phone: e.target.value }))}
                      />
                    </div>
                    <div className="csd2-field">
                      <label htmlFor="csd2OcEmail">Email</label>
                      <input
                        id="csd2OcEmail" type="email"
                        value={onboardClientData.email}
                        onChange={(e) => setOnboardClientData((d) => ({ ...d, email: e.target.value }))}
                      />
                    </div>
                    <div className="csd2-field csd2-full">
                      <label htmlFor="csd2OcSource">Source</label>
                      <select
                        id="csd2OcSource"
                        value={onboardClientData.referralPartnerId}
                        onChange={(e) => setOnboardClientData((d) => ({ ...d, referralPartnerId: e.target.value }))}
                      >
                        <option value="">Direct</option>
                        {referralPartners.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
                    <button className="csd2-secondary-btn" type="button" onClick={closeOnboardClientModal}>Cancel</button>
                    <button
                      className="csd2-cta-btn" type="button"
                      onClick={() => { if (onboardClientData.fullName.trim()) setOnboardClientStep(2); }}
                    >
                      Next
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="csd2-list-stack">
                    <div className="csd2-list-item">
                      <div className="csd2-list-item-title">{onboardClientData.fullName}</div>
                      <div className="csd2-list-item-sub">{onboardClientData.phone || "—"} · {onboardClientData.email || "—"}</div>
                      <div className="csd2-subtle">
                        Source: {referralPartners.find((p) => p.id === onboardClientData.referralPartnerId)?.name || "Direct"}
                      </div>
                    </div>
                  </div>
                  <p className="csd2-subtle">This creates an unpaid client file starting in New Leads. Docs and payment are tracked from there.</p>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
                    <button className="csd2-secondary-btn" type="button" onClick={() => setOnboardClientStep(1)} disabled={saving}>Back</button>
                    <button className="csd2-cta-btn" type="button" onClick={submitOnboardClient} disabled={saving}>
                      {saving ? "Creating..." : "Create Client"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showOnboardPartnerModal && (
        <div className="csd2-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeOnboardPartnerModal(); }}>
          <div className="csd2-modal">
            <div className="csd2-modal-header">
              <h2>Onboard Partner — Step {onboardPartnerStep} of 2</h2>
              <button className="csd2-close-btn" type="button" onClick={closeOnboardPartnerModal}>×</button>
            </div>
            <div className="csd2-modal-body">
              {onboardPartnerStep === 1 ? (
                <>
                  <div className="csd2-modal-grid">
                    <div className="csd2-field csd2-full">
                      <label htmlFor="csd2OpName">Partner Name</label>
                      <input id="csd2OpName" type="text" required value={onboardPartnerName} onChange={(e) => setOnboardPartnerName(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
                    <button className="csd2-secondary-btn" type="button" onClick={closeOnboardPartnerModal}>Cancel</button>
                    <button className="csd2-cta-btn" type="button" onClick={() => { if (onboardPartnerName.trim()) setOnboardPartnerStep(2); }}>Next</button>
                  </div>
                </>
              ) : (
                <>
                  <p>Add <strong>{onboardPartnerName}</strong> as a lead source available on every Source picker?</p>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 18 }}>
                    <button className="csd2-secondary-btn" type="button" onClick={() => setOnboardPartnerStep(1)} disabled={saving}>Back</button>
                    <button className="csd2-cta-btn" type="button" onClick={submitOnboardPartner} disabled={saving}>
                      {saving ? "Adding..." : "Add Partner"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
