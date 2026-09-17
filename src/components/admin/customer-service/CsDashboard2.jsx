// src/components/admin/customer-service/CsDashboard2.jsx
//
// Preview build of the "revamped" CS dashboard, per the pasted GHL-style
// call-log mockup (call-log-dashboard-ghl.html). Deliberately a SEPARATE
// route/component (/cs-dashboard2) from the live ClientDocumentDashboard.jsx
// (/cs-dashboard) — nothing here touches that file or its route, so the
// live dashboard staff already use every day is completely unaffected
// while this is reviewed.
//
// Data: per explicit product decision, this tracks calls to EXISTING
// PAYING CLIENTS (clients.is_paid = true), not new/unconverted leads —
// so "Contact Name/Phone" in the mockup's Log Call modal becomes a
// client picker (SearchableSelect, same component the Add Income modal
// already uses for the same 1000+-row problem) rather than free-text
// entry, and every call is tied to a real client_id.
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
import { supabase } from "../../../supabaseClient";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../shared/ui/ToastNotifier";
import SearchableSelect from "../../shared/ui/SearchableSelect";
import "./CsDashboard2.css";

const OUTCOMES = ["Interested", "Follow Up", "Called", "Not Interested", "Appointment Set"];

const NAV_ITEMS = [
  { key: "dashboard", icon: "🏠", label: "Dashboard" },
  { key: "call-log", icon: "📞", label: "Call Log" },
  { key: "leads", icon: "👤", label: "Leads" },
  { key: "follow-ups", icon: "🗓️", label: "Follow Ups" },
  { key: "tasks", icon: "✅", label: "Tasks" },
  { key: "calendar", icon: "📅", label: "Calendar" },
  { key: "clients", icon: "👥", label: "Clients" },
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

export default function CsDashboard2() {
  const { user, fullName } = useAuth();
  const { addToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [calls, setCalls] = useState([]);
  const [payingClients, setPayingClients] = useState([]);
  const [activeSection, setActiveSection] = useState("call-log");
  const [saving, setSaving] = useState(false);

  const [selectedCallId, setSelectedCallId] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState("details");

  const [showLogModal, setShowLogModal] = useState(false);
  const formRef = useRef(null);

  // Filters (Call Log section)
  const [search, setSearch] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");

  const displayName = fullName || "Staff";

  const loadData = async () => {
    setLoading(true);
    try {
      const [callsRes, clientsRes] = await Promise.all([
        supabase
          .from("cs_call_log")
          .select("*, clients ( id, full_name, phone, email )")
          .order("created_at", { ascending: false }),
        supabase
          .from("clients")
          .select("id, full_name, phone, email, is_paid")
          .eq("is_paid", true)
          .order("full_name", { ascending: true }),
      ]);

      if (callsRes.error) {
        // Migration not run yet (sql/add_cs_call_log.sql) — fail soft with
        // a visible notice instead of a blank/broken page, same pattern
        // useAlignmentDocs.js and others in this codebase already use for
        // optional-migration tables.
        if (/cs_call_log/i.test(callsRes.error.message || "")) {
          setMigrationMissing(true);
          setCalls([]);
        } else {
          throw callsRes.error;
        }
      } else {
        setCalls(callsRes.data || []);
        setMigrationMissing(false);
      }

      if (clientsRes.error) throw clientsRes.error;
      setPayingClients(clientsRes.data || []);
    } catch (err) {
      console.error("CsDashboard2 load error:", err);
      addToast({ title: "Load Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Normalizes each raw cs_call_log row (joined with its client) into the
  // flat shape every section below renders from — same role the pasted
  // mockup's own `records` array played, just sourced from Supabase
  // instead of an in-memory array.
  const records = useMemo(
    () =>
      calls.map((c) => ({
        id: c.id,
        clientId: c.client_id,
        name: c.clients?.full_name || "Unknown Client",
        phone: c.phone || c.clients?.phone || "",
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
  const newLeadsCount = useMemo(
    () => records.filter((r) => String(r.leadStatus || "").toLowerCase().includes("new")).length,
    [records]
  );
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
  const leadsData = useMemo(() => records.filter((r) => r.outcome !== "Not Interested"), [records]);
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
  // Every paying client, not just ones filtered from `records` the way the
  // mockup's generic-lead version did — we already have a canonical
  // `clients` table, so this shows the real roster (including anyone never
  // called yet) with their most recent call summarized alongside.
  const clientsRows = useMemo(() => {
    const latestByClient = new Map();
    records.forEach((r) => {
      const existing = latestByClient.get(r.clientId);
      if (!existing || compareIsoDates(r.callDateIso, existing.callDateIso) > 0) latestByClient.set(r.clientId, r);
    });
    return payingClients.map((c) => ({
      id: c.id,
      name: c.full_name,
      phone: c.phone || "—",
      lastOutcome: latestByClient.get(c.id)?.outcome || "Not yet called",
      lastCallDate: latestByClient.get(c.id)?.date || "—",
      owner: latestByClient.get(c.id)?.calledBy || "—",
    }));
  }, [payingClients, records]);
  const outcomeGroups = useMemo(() => groupCounts(records, (r) => r.outcome), [records]);
  const callerGroups = useMemo(() => groupCounts(records, (r) => r.calledBy), [records]);

  // --- Actions ---
  const openLogModal = () => setShowLogModal(true);
  const closeLogModal = () => {
    setShowLogModal(false);
    formRef.current?.reset();
  };

  const handleSaveCall = async (e) => {
    e.preventDefault();
    const formData = new FormData(formRef.current);
    const clientId = String(formData.get("clientId") || "");
    if (!clientId) {
      addToast({ title: "Client Required", message: "Pick which client this call was with.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    const matchedClient = payingClients.find((c) => c.id === clientId);
    const nextStepsInput = String(formData.get("nextStepsInput") || "").trim();

    const payload = {
      client_id: clientId,
      employee_id: user?.id || null,
      called_by_name: String(formData.get("calledBy") || displayName).trim() || displayName,
      phone: String(formData.get("phone") || matchedClient?.phone || "").trim() || null,
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
      const { data, error } = await supabase.from("cs_call_log").insert(payload).select("*, clients ( id, full_name, phone, email )").single();
      if (error) throw error;
      setCalls((prev) => [data, ...prev]);
      addToast({ title: "Call Logged", message: `Call with ${matchedClient?.full_name || "client"} saved.`, variant: "success", icon: "bi-telephone-fill" });
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

  const clientOptions = useMemo(
    () => payingClients.map((c) => ({ value: c.id, label: c.full_name || "Unnamed client" })),
    [payingClients]
  );

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
              </button>
            ))}
          </nav>

          <div className="csd2-sidebar-footer">
            <div className="csd2-avatar">{initialsFromName(displayName).slice(0, 1)}</div>
            <div>
              <div style={{ fontWeight: 800 }}>{displayName}</div>
              <div className="csd2-sub">Staff</div>
            </div>
          </div>
        </aside>

        <main className="csd2-main">
          {activeSection === "dashboard" && (
            <section>
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
                  <button className="csd2-filter-btn" type="button" onClick={() => {}}>Apply</button>
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
                              <div className="csd2-name">{r.name}</div>
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
              <div className="csd2-panel-head">
                <h2 className="csd2-section-title" style={{ margin: 0 }}>Leads</h2>
                <button className="csd2-secondary-btn" type="button" onClick={openLogModal}>Log Call</button>
              </div>
              <div className="csd2-card csd2-panel-body">
                {leadsData.length === 0 ? (
                  <EmptyState title="No leads yet" message="Leads will appear here after you log calls." />
                ) : (
                  <table>
                    <thead><tr><th>LEAD</th><th>PHONE</th><th>STATUS</th><th>SOURCE</th><th>LAST OUTCOME</th><th>OWNER</th></tr></thead>
                    <tbody>
                      {leadsData.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td><td>{r.phone || "—"}</td><td>{r.leadStatus}</td><td>{r.source}</td><td>{r.outcome}</td><td>{r.calledBy}</td>
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
              <div className="csd2-panel-head"><h2 className="csd2-section-title" style={{ margin: 0 }}>Clients</h2></div>
              <div className="csd2-card csd2-panel-body">
                {clientsRows.length === 0 ? (
                  <EmptyState title="No paying clients yet" message="Clients appear here once they're marked paid." />
                ) : (
                  <table>
                    <thead><tr><th>CLIENT</th><th>PHONE</th><th>LAST OUTCOME</th><th>LAST CALLED</th><th>OWNER</th></tr></thead>
                    <tbody>
                      {clientsRows.map((c) => (
                        <tr key={c.id}>
                          <td>{c.name}</td><td>{c.phone}</td><td>{c.lastOutcome}</td><td>{c.lastCallDate}</td><td>{c.owner}</td>
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
                    <label>Client</label>
                    <SearchableSelect name="clientId" options={clientOptions} placeholder="Search paying clients..." required />
                  </div>

                  <div className="csd2-field">
                    <label htmlFor="csd2Phone">Phone</label>
                    <input id="csd2Phone" name="phone" type="text" placeholder="Defaults to client's phone on file" />
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
    </div>
  );
}
