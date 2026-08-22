// src/pages/IntakeDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import ClientHeaderActions from "./ClientHeaderActions";
import { Spinner, Alert, Container, Form } from "react-bootstrap";

const since = (iso) => {
  if (!iso) return "—";
  const now = Date.now();
  const start = new Date(iso).getTime();
  const diff = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export default function IntakeDashboard() {
  const [calls, setCalls] = useState([]);
  const [docs, setDocs] = useState([]);
  const [fups, setFups] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // replace with real signed-in admin id if filtering "My"
  const myAdminId = "";

  const [filter, setFilter] = useState("all"); // all | my | call | docs | followup | overdue | escalated
  const [q, setQ] = useState("");              // search

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [cRes, dRes, fRes, aRes] = await Promise.all([
          supabase.from("vw_call_timers").select("*"),
          supabase.from("vw_docs_timers").select("*"),
          supabase.from("vw_followup_timers").select("*"),
          supabase.from("alerts_log").select("*").is("cleared_at", null)
        ]);
        if (cRes.error) throw cRes.error;
        if (dRes.error) throw dRes.error;
        if (fRes.error) throw fRes.error;
        if (aRes.error) throw aRes.error;

        setCalls(cRes.data || []);
        setDocs(dRes.data || []);
        setFups(fRes.data || []);
        setAlerts(aRes.data || []);
      } catch (e) {
        setError(e.message || "Failed to load intake data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(() => {
    const nowISO = new Date().toISOString();

    const callRows = (calls || [])
      .filter(r => r.call_completed_at == null)
      .map(r => ({
        client_id: r.client_id, name: r.full_name, assigned: r.admin_id, stage: "Call Pending",
        age: since(r.call_timer_start),
        due: r.soft_deadline_24h && r.soft_deadline_24h <= nowISO,
        overdue: r.hard_deadline_48h && r.hard_deadline_48h <= nowISO,
        start_at: r.call_timer_start
      }));

    const docRows = (docs || [])
      .filter(r => r.tu_eq_docs_submitted_at == null)
      .map(r => ({
        client_id: r.client_id, name: r.full_name, assigned: r.admin_id, stage: "Docs Pending",
        age: since(r.docs_timer_start),
        due: r.docs_due_24h && r.docs_due_24h <= nowISO,
        overdue: r.docs_overdue_48h && r.docs_overdue_48h <= nowISO,
        start_at: r.docs_timer_start
      }));

    const fuRows = (fups || [])
      .filter(r => r.tu_eq_followup_completed_at == null)
      .map(r => ({
        client_id: r.client_id, name: r.full_name, assigned: r.admin_id, stage: "Follow-up Pending",
        age: since(r.call_completed_at),
        due: r.d7_due && r.d7_due <= nowISO,
        overdue: false, // daily reds via alerts
        start_at: r.call_completed_at
      }));

    let all = [...callRows, ...docRows, ...fuRows];

    // escalations
    const escalatedMap = new Map();
    (alerts || []).forEach(a => {
      const isOverdue = String(a.alert_type || "").includes("OVERDUE");
      const hasLeadership = (a.delivered_channels || []).some(ch =>
        typeof ch === "string" && (ch.startsWith("HOD:") || ch.startsWith("MANAGER:") || ch.startsWith("OWNER:"))
      );
      if (isOverdue || hasLeadership) escalatedMap.set(a.client_id, true);
    });
    all = all.map(r => ({ ...r, escalated: !!escalatedMap.get(r.client_id) }));

    // search
    const qNorm = q.trim().toLowerCase();
    if (qNorm) {
      all = all.filter(r =>
        (r.name || "").toLowerCase().includes(qNorm) ||
        (r.client_id || "").toLowerCase().includes(qNorm)
      );
    }

    // filter
    if (filter === "my") all = all.filter(r => r.assigned === myAdminId);
    if (filter === "call") all = all.filter(r => r.stage === "Call Pending");
    if (filter === "docs") all = all.filter(r => r.stage === "Docs Pending");
    if (filter === "followup") all = all.filter(r => r.stage === "Follow-up Pending");
    if (filter === "overdue") all = all.filter(r => r.overdue);
    if (filter === "escalated") all = all.filter(r => r.escalated);

    // sort
    all.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.due !== b.due) return a.due ? -1 : 1;
      return (b.start_at || "").localeCompare(a.start_at || "");
    });

    return all;
  }, [calls, docs, fups, alerts, filter, q]);

  const dueCount = (alerts || []).filter(a =>
    ["CALL_DUE_24H","DOCS_DUE_24H","FOLLOWUP_DUE_D7","FOLLOWUP_REMINDER_D6"].includes(a.alert_type)
  ).length;

  const overdueCount = (alerts || []).filter(a =>
    ["CALL_OVERDUE_48H","CALL_DAILY_OVERDUE","DOCS_OVERDUE_48H","DOCS_DAILY_OVERDUE","FOLLOWUP_DAILY_OVERDUE"].includes(a.alert_type)
  ).length;

  if (loading) {
    return (
      <Container className="py-5 text-center">
        <Spinner animation="border" />
        <p className="mt-2">Loading intake…</p>
      </Container>
    );
  }
  if (error) {
    return (
      <Container className="py-4">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      {/* toolbar */}
      <div className="sticky-top" style={{ top: "64px", zIndex: 2 }}>
        <div className="card border-0 shadow-toolbar mb-3 glassy">
          <div className="card-body py-3 d-flex flex-wrap align-items-center gap-2">
            <h5 className="m-0 me-2 fw-semibold">Intake</h5>
            <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis">Due {dueCount}</span>
            <span className="badge rounded-pill bg-danger-subtle text-danger-emphasis">Overdue {overdueCount}</span>

            <div className="vr mx-2 d-none d-md-block" />

            <div className="btn-group btn-group-sm" role="group" aria-label="Filters">
              {[
                ["all","All"],
                ["my","My"],
                ["call","Call"],
                ["docs","Docs"],
                ["followup","Follow‑up"],
                ["overdue","Overdue"],
                ["escalated","Escalated"],
              ].map(([k,label]) => (
                <button
                  key={k}
                  type="button"
                  className={`btn ${filter===k ? "btn-dark" : "btn-outline-dark"}`}
                  onClick={() => setFilter(k)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="ms-auto" style={{ minWidth: 260 }}>
              <Form.Control
                size="sm"
                type="search"
                placeholder="Search client or ID…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="rounded-pill ps-3"
              />
            </div>
          </div>
        </div>
      </div>

      {/* rows */}
      <div className="row g-3">
        {rows.map((row) => (
          <div key={`${row.stage}-${row.client_id}`} className="col-12">
            <div className="card border-0 shadow-row hover-lift">
              <div className="card-body d-flex flex-wrap align-items-center gap-3">
                {/* Left: Avatar-ish block */}
                <div className="avatar-circle bg-body-secondary text-body fw-semibold">
                  {(row.name || "C").slice(0,1).toUpperCase()}
                </div>

                {/* Middle: Name + meta */}
                <div className="flex-grow-1">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Link to={`/clients/${row.client_id}`} className="link-dark link-underline-opacity-0 link-underline-opacity-75-hover fw-semibold">
                      {row.name || row.client_id}
                    </Link>
                    <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis">{row.stage}</span>
                    {row.due && !row.overdue && (
                      <span className="badge rounded-pill bg-warning-subtle text-warning-emphasis">Due</span>
                    )}
                    {row.overdue && (
                      <span className="badge rounded-pill bg-danger-subtle text-danger-emphasis">Overdue</span>
                    )}
                    {row.escalated && (
                      <span className="badge rounded-pill bg-dark-subtle text-dark-emphasis">Escalated</span>
                    )}
                  </div>
                  <div className="text-secondary small mt-1">
                    <i className="bi bi-clock me-1" /> Age {row.age}
                    <span className="mx-2">•</span>
                    <span className="text-muted">ID:</span> <code>{row.name}</code>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="ms-auto d-flex align-items-center gap-2">
                  <Link className="btn btn-outline-dark btn-sm rounded-pill" to={`/clients/${row.client_id}`}>
                    <i className="bi bi-box-arrow-up-right me-1" /> Open
                  </Link>
                  <div className="vr d-none d-md-block" />
                  <div className="d-flexwhy ">
                    <ClientHeaderActions clientId={row.client_id} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="col-12">
            <div className="card border-0 shadow-sm text-center p-5 text-secondary">
              No items match your filter.
            </div>
          </div>
        )}
      </div>
    </Container>
  );
}
