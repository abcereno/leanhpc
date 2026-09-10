import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";
import { getHolidays, calculateBusinessDays, calculatePaidRunningDays } from "../utils/dateHelpers";
import { useToast } from "../components/shared/ui/ToastNotifier";
import { useConfirm } from "../components/shared/ui/ConfirmDialog";
import { resolveServiceId } from "../utils/services";
import { allBureausResolved } from "../utils/inquiryCounts";
import { fetchNextStepSignals, getNextStepTag } from "../utils/nextStepTag";

const DAY = 24 * 60 * 60 * 1000;

// Each sortable column's first-click direction — see handleSort below.
const SORT_DEFAULT_DIRECTION = { name: "asc", company: "asc", agent: "asc", progress: "desc", duration: "desc" };

export default function useAdminClients() {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { isAuthenticated } = useAuth();

  // Core State
  const [loading, setLoading] = useState(true);
  const [allClients, setAllClients] = useState([]);
  const [error, setError] = useState(null);
  const tbodyRef = useRef(null);

  // Holiday State
  const [holidaySet, setHolidaySet] = useState(new Set());

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [taskFilter, setTaskFilter] = useState("all"); 
  const [companyFilter, setCompanyFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all"); // 👈 NEW
  const [daysFilter, setDaysFilter] = useState("all");
  const [paidDaysFilter, setPaidDaysFilter] = useState("all");
  // Defaults to "paid" — unpaid clients now live on the dedicated admin
  // "New Leads" page (AdminNewLeads.jsx, /new-leads) so this list isn't
  // cluttered with clients still awaiting payment. The "Unpaid" tab (and
  // its daysFilter aging-chase) is left in place, not removed, for admins
  // who still want to see/chase them from here too.
  const [activeTab, setActiveTab] = useState("paid");

  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Column sorting — null sortField keeps the existing default order
  // (most pending tasks first, then newest). Each column gets its own
  // sensible first-click direction: text columns start A-Z, day-count/
  // progress columns start with the biggest number first (so clicking
  // Duration reads top-to-bottom the same way a hand-kept aging
  // spreadsheet is usually sorted — oldest/reddest files at the top).
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("desc");
  const handleSort = useCallback((field) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDirection((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      } else {
        setSortDirection(SORT_DEFAULT_DIRECTION[field] || "asc");
      }
      return field;
    });
    setPage(1);
  }, []);

  // Companies State (Fetched from DB)
  const [dbCompanies, setDbCompanies] = useState([]);

  // Options
  const companyOptions = useMemo(() => {
    const s = new Set(dbCompanies.map(c => c.company_name));
    for (const c of allClients) {
      const name = c?.companies?.company_name;
      if (name) s.add(name);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allClients, dbCompanies]);

  const agentOptions = useMemo(() => {
    const s = new Set();
    for (const c of allClients) {
      const name = c.agent; 
      if (name && name.trim() !== "") s.add(name);
    }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [allClients]);

  // Actions
  const handleDeleteClient = useCallback(
    async (clientId, canDelete) => {
      if (!canDelete) {
        addToast({ title: "Permission Denied", message: "You do not have permission to delete clients.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
        return;
      }
      if (!clientId) return;
      
      if (!(await confirm("Are you sure you want to delete this client? This cannot be undone."))) {
        return;
      }

      try {
        const { error: delErr } = await supabase.from("clients").delete().eq("id", clientId);
        if (delErr) throw delErr;

        setAllClients((prev) => prev.filter((c) => c.id !== clientId));
      } catch (e) {
        console.error("[useAdminClients] delete error:", e);
        setError(e.message || "Delete failed");
        addToast({ title: "Delete Failed", message: "Failed to delete client: " + e.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      }
    },
    [confirm]
  );

  // Helpers
  const enrichRows = useCallback((rows, holidays) => {
    const now = new Date();

    return rows.map((r) => {
      // 1. Unpaid Duration
      const unpaidEnd = r.paid_at ? new Date(r.paid_at) : now;
      const createdRunningDays = calculateBusinessDays(r.created_at, unpaidEnd, holidays);

      // 2. Paid Duration — pause-aware (see dateHelpers.js#calculatePaidRunningDays),
      // so a paused client's day count freezes instead of climbing right
      // alongside active files.
      const paidRunningDays = calculatePaidRunningDays(r, holidays, now);

      // N/A-inclusive — see utils/inquiryCounts.js#allBureausResolved. The
      // old `exp_completed && tu_completed && eq_completed` check ignored
      // exp_na/tu_na/eq_na entirely, so a client fully resolved with a
      // legitimately N/A bureau read progress: 100% but all_completed:
      // false — missing from the admin Completed tab filter (line ~401
      // below) and never turning green in AdminClientList.jsx's row
      // coloring despite showing 100% progress.
      const all_completed = allBureausResolved(r);

      const companies = r.companies ?? (r.company_name ? { company_name: r.company_name } : undefined);
      const profiles = r.profiles ?? (r.admin_full_name ? { full_name: r.admin_full_name } : undefined);

      const pendingTasksCount = r.company_tasks 
        ? r.company_tasks.filter(t => !t.is_completed).length 
        : 0;
      
      const completedTasksCount = r.company_tasks 
        ? r.company_tasks.filter(t => t.is_completed).length 
        : 0;

      const dbProgress = r.progress ? Number(r.progress) : 0; 
      const pScore = Math.round(dbProgress * 100);

      return {
        ...r,
        progress: pScore, 
        companies,
        profiles,
        createdRunningDays, 
        paidRunningDays,    
        all_completed,
        pendingTasksCount,
        completedTasksCount,
      };
    });
  }, []);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setAllClients([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const holidays = await getHolidays();
      setHolidaySet(holidays);

      const { data: companiesData } = await supabase
        .from("companies")
        .select("id, company_name")
        .order("company_name");
      
      if (companiesData) setDbCompanies(companiesData);

      const baseFields = `
            id, full_name, email, created_at, paid_at, date_completed, is_paid,
            dispute_method, counter, start_inquiries, start_date,
            exp_na, tu_na, eq_na, exp_completed, tu_completed, eq_completed,
            admin_id, company_id, agent, progress,
            is_paused, paused_at, paused_days_total,
            processing_duration,
            company_tasks ( id, is_completed )
      `;

      let selectedFields = `${baseFields}, dispute_round, service_id`;
      let { data: baseRows, error: baseErr } = await supabase
        .from("clients")
        .select(selectedFields)
        .order("created_at", { ascending: false })
        .range(0, 99999);

      // sql/add_dispute_round.sql and/or sql/add_services.sql may not have
      // been run yet on this database — rather than let one missing
      // optional column blank out the entire client list (which is exactly
      // what happened here before), drop whichever is missing and retry.
      for (const [col, sqlFile] of [
        ["dispute_round", "sql/add_dispute_round.sql"],
        ["service_id", "sql/add_services.sql"],
      ]) {
        if (baseErr && selectedFields.includes(col) && new RegExp(col, "i").test(baseErr.message || "")) {
          console.warn(`clients.${col} not found (run ${sqlFile}) — falling back without it.`);
          selectedFields = selectedFields
            .split(",")
            .map((f) => f.trim())
            .filter((f) => f !== col)
            .join(", ");
          ({ data: baseRows, error: baseErr } = await supabase
            .from("clients")
            .select(selectedFields)
            .order("created_at", { ascending: false })
            .range(0, 99999));
        }
      }

      if (baseErr) throw baseErr;

      const adminIds = Array.from(new Set(baseRows.map((r) => r.admin_id).filter(Boolean)));
      const companyIds = Array.from(new Set(baseRows.map((r) => r.company_id).filter(Boolean)));
      
      let adminMap = new Map();
      if (adminIds.length) {
        const { data: admins } = await supabase.from("profiles").select("id, full_name").in("id", adminIds);
        if (admins) adminMap = new Map(admins.map((a) => [a.id, a.full_name]));
      }
      
      let companyMap = new Map();
      if (companyIds.length) {
        const { data: companies } = await supabase.from("companies").select("id, company_name").in("id", companyIds);
        if (companies) companyMap = new Map(companies.map((c) => [c.id, c.company_name]));
      }
      
      const merged = baseRows.map((r) => ({
        ...r,
        admin_full_name: r.admin_id ? adminMap.get(r.admin_id) ?? null : null,
        company_name: r.company_id ? companyMap.get(r.company_id) ?? null : null,
        companies: r.company_id ? { company_name: companyMap.get(r.company_id) ?? "—" } : undefined,
        profiles: r.admin_id ? { full_name: adminMap.get(r.admin_id) ?? "—" } : undefined,
      }));

      // "What does this client need next" tag (utils/nextStepTag.js) — one
      // more bulk fetch, same pattern as adminMap/companyMap above, then
      // attached per row after enrichRows so it can read all_completed
      // (computed by enrichRows via allBureausResolved).
      const nextStepSignals = await fetchNextStepSignals(supabase, baseRows.map((r) => r.id));

      const enriched = enrichRows(merged, holidays).map((r) => ({
        ...r,
        nextStepTag: getNextStepTag(r, nextStepSignals),
        // AdminClientList.jsx's "DOC ISSUE" badge has referenced
        // client.hasDocIssue since it was added, but nothing in this
        // pipeline ever set it (that field only existed in
        // clientsData.js's separate, heavier Ops Dashboard pipeline) — the
        // badge has always silently evaluated to false. nextStepSignals
        // already fetches this exact data for the tag above, so wiring it
        // through here as well fixes that badge for free.
        hasDocIssue: nextStepSignals.hasDocIssue.has(r.id),
      }));

      enriched.sort((a, b) => {
        if (b.pendingTasksCount !== a.pendingTasksCount) return b.pendingTasksCount - a.pendingTasksCount;
        return new Date(b.created_at) - new Date(a.created_at);
      });

      setAllClients(enriched);
    } catch (e) {
      console.error(e);
      setError("Failed to load clients");
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, enrichRows]);

  useEffect(() => { reload(); }, [reload]);

  // Pause/Resume Handler
  const handleTogglePause = useCallback(async (clientId) => {
    if (!clientId) return;
    let target = null;
    setAllClients((prev) => {
      const found = prev.find((c) => c.id === clientId);
      if (found) target = found;
      return prev;
    });

    if (!target) return;

    const isPausing = !target.is_paused;

    // Pausing requires a reason (clients.pause_reason, sql/add_pause_reason.sql)
    // — same requirement as ClientHeader.jsx's Status-dropdown pause action
    // (useClientActions.js#togglePause), which this list-row pause button is
    // a separate implementation of. It's visible on the client's
    // company/broker portal summary (ClientSummaryModal.jsx), not gated
    // admin-only like the Operational Timeline gap notes.
    let reason = null;
    if (isPausing) {
      reason = await confirm({
        title: "Pause Service",
        message: `Pause service for ${target.full_name || "this client"}? The reason below will show on their company/partner portal summary until service resumes.`,
        confirmText: "Pause Service",
        variant: "warning",
        requireReason: true,
        reasonLabel: "Reason for pausing",
        reasonPlaceholder: "e.g. Waiting on ID/SSN documents from client",
      });
      if (!reason) return;
    } else {
      const confirmed = await confirm({
        title: "Resume Service",
        message: `Resume service for ${target.full_name || "this client"}?`,
        confirmText: "Resume Service",
        variant: "success",
      });
      if (!confirmed) return;
    }

    const updateData = { is_paused: isPausing };
    if (isPausing) {
      updateData.paused_at = new Date().toISOString();
      updateData.pause_reason = reason;
    } else {
      const pausedAt = target.paused_at ? new Date(target.paused_at) : null;
      const now = new Date();
      let sessionDays = 0;
      if (pausedAt && !Number.isNaN(pausedAt.getTime())) {
        sessionDays = Math.floor((now.getTime() - pausedAt.getTime()) / (1000 * 60 * 60 * 24));
      }
      updateData.paused_days_total = (target.paused_days_total || 0) + sessionDays;
      updateData.paused_at = null;
    }

    const { error: upErr } = await supabase.from('clients').update(updateData).eq('id', clientId);
    if (upErr) {
      console.error('[useAdminClients] toggle pause error', upErr);
      addToast({ title: "Update Failed", message: 'Failed to update pause status: ' + upErr.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    setAllClients((prev) => prev.map((c) => {
      if (c.id !== clientId) return c;
      const newPausedAt = isPausing ? updateData.paused_at : null;
      const newPausedTotal = isPausing ? (c.paused_days_total || 0) : (updateData.paused_days_total || c.paused_days_total || 0);
      const updated = { ...c, is_paused: isPausing, paused_at: newPausedAt, paused_days_total: newPausedTotal, pause_reason: isPausing ? reason : c.pause_reason };
      // Recompute immediately so pausing freezes the visible day count right
      // away instead of only after the next reload.
      return { ...updated, paidRunningDays: calculatePaidRunningDays(updated, holidaySet) };
    }));

  }, [holidaySet, confirm]);

  // Set Paid Days Handler
  const handleSetPaidDays = useCallback(async (clientId) => {
    if (!clientId) return;
    let target = null;
    setAllClients((prev) => {
      const f = prev.find((c) => c.id === clientId);
      if (f) target = f;
      return prev;
    });
    if (!target) return;

    const input = window.prompt(`Enter number of days since payment for ${target.full_name || 'this client'} (integer):`, `${target.paid_at ? Math.ceil((Date.now() - new Date(target.paid_at).getTime())/DAY) : 0}`);
    if (input === null) return; 
    const days = parseInt(input, 10);
    if (Number.isNaN(days) || days < 0) {
      addToast({ title: "Invalid Input", message: 'Please enter a valid non-negative integer number of days.', variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    const newPaidAt = new Date(Date.now() - days * DAY).toISOString();
    const { error: upErr } = await supabase.from('clients').update({ paid_at: newPaidAt, is_paid: true }).eq('id', clientId);
    if (upErr) {
      console.error('[useAdminClients] set paid days error', upErr);
      addToast({ title: "Update Failed", message: 'Failed to update paid date: ' + upErr.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }

    setAllClients((prev) => prev.map((c) => {
      if (c.id !== clientId) return c;
      const newPaidRunningDays = calculatePaidRunningDays({ ...c, paid_at: newPaidAt }, holidaySet);
      return { ...c, paid_at: newPaidAt, is_paid: true, paidRunningDays: newPaidRunningDays };
    }));
  }, [holidaySet]);

  // Set Paid At Directly
  const handleSetPaidAt = useCallback(async (clientId, isoDate) => {
    if (!clientId || !isoDate) return;
    try {
      const { error: upErr } = await supabase.from('clients').update({ paid_at: isoDate, is_paid: true }).eq('id', clientId);
      if (upErr) {
        console.error('[useAdminClients] set paid_at error', upErr);
        addToast({ title: "Update Failed", message: 'Failed to update paid date: ' + upErr.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
        return;
      }

      setAllClients((prev) => prev.map((c) => {
        if (c.id !== clientId) return c;
        const newPaidRunningDays = calculatePaidRunningDays({ ...c, paid_at: isoDate }, holidaySet);
        return { ...c, paid_at: isoDate, is_paid: true, paidRunningDays: newPaidRunningDays };
      }));
      
      try {
        window.dispatchEvent(new CustomEvent('client-updated', { detail: { id: clientId } }));
      } catch (e) {
        console.warn('Failed to dispatch client-updated event', e);
      }
    } catch (e) {
      console.error(e);
      addToast({ title: "Update Failed", message: 'Failed to update paid date', variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  }, [holidaySet]);

  // Group multiple dispute_round rows for the same client (same email, a
  // separate `clients` row per round — see utils/clientDuplicateRound.js)
  // into one entry so the list shows one row per person instead of one row
  // per round. Rows without an email never get grouped together (a blank
  // email isn't a shared identity), each stays its own singleton group.
  // Filtering below reads from the LATEST round in each group, since
  // that's the engagement someone browsing the list actually cares about;
  // AdminClientList.jsx lets each row's dropdown pick a different round to
  // display without re-filtering/re-paginating anything.
  const groupedClients = useMemo(() => {
    const byEmail = new Map();
    const singles = [];

    for (const c of allClients) {
      const email = String(c.email || "").trim().toLowerCase();
      if (!email) {
        singles.push({ key: `id:${c.id}`, rounds: [c] });
        continue;
      }
      if (!byEmail.has(email)) byEmail.set(email, []);
      byEmail.get(email).push(c);
    }

    const groups = singles;
    for (const [email, rows] of byEmail.entries()) {
      rows.sort((a, b) => (a.dispute_round || 1) - (b.dispute_round || 1));
      groups.push({ key: `email:${email}`, rounds: rows });
    }

    // Keep the same "most pending tasks, then newest" ordering the flat
    // list used, based on each group's latest round.
    groups.sort((a, b) => {
      const repA = a.rounds[a.rounds.length - 1];
      const repB = b.rounds[b.rounds.length - 1];
      if (repB.pendingTasksCount !== repA.pendingTasksCount) return repB.pendingTasksCount - repA.pendingTasksCount;
      return new Date(repB.created_at) - new Date(repA.created_at);
    });

    return groups;
  }, [allClients]);

  // Filtering
  const filteredClientList = useMemo(() => {
    const s = search.trim().toLowerCase();
    const fromStr = dateFrom || null;
    const toStr = dateTo || null;

    return groupedClients.filter((group) => {
      const c = group.rounds[group.rounds.length - 1];
      // Paid/Unpaid both exclude completed clients now, matching how
      // AdminClientList.jsx's own tab-count badges next to these same tabs
      // are already defined (paid_at && !all_completed / !paid_at &&
      // !all_completed / all_completed — a clean 3-way partition that adds
      // up to "All Clients"). The badges were already right; this filter
      // wasn't reading them the same way, so clicking "Paid" showed every
      // paid client including ones long since completed, with no way to
      // see just the still-active ones.
      if (activeTab === "paid" && (!c.is_paid || c.all_completed)) return false;
      if (activeTab === "unpaid" && (c.is_paid || c.all_completed)) return false;
      if (activeTab === "completed" && !c.all_completed) return false;
      // Paid clients still in progress — unpaid clients aren't being
      // actively worked yet, so "not completed" only matters for people
      // who've actually paid.
      if (activeTab === "not_completed" && (!c.is_paid || c.all_completed)) return false;
      
      if (taskFilter === "pending" && c.pendingTasksCount === 0) return false;
      if (taskFilter === "resolved" && c.completedTasksCount === 0) return false;
      if (taskFilter === "any" && (c.pendingTasksCount === 0 && c.completedTasksCount === 0)) return false;

      // Service Type Filter — serviceFilter holds a services.js id (e.g.
      // "credit_repair"), matched via resolveServiceId so it works whether
      // or not this row's service_id has been backfilled yet.
      if (serviceFilter !== "all" && resolveServiceId(c) !== serviceFilter) return false;

      if (s && !String(c.full_name || "").toLowerCase().includes(s)) return false;

      if (fromStr || toStr) {
        const clientDateStr = new Date(c.created_at).toLocaleDateString("en-CA");
        if (fromStr && clientDateStr < fromStr) return false;
        if (toStr && clientDateStr > toStr) return false;
      }
      
      if (companyFilter !== "all" && (c?.companies?.company_name || "—") !== companyFilter) return false;

      if (agentFilter !== "all") {
          const currentAgent = c.agent ? c.agent : "Unassigned";
          if (currentAgent !== agentFilter) return false;
      }
      
      // 👇 UPDATED: Unpaid Aging Filters 👇
      if (daysFilter !== "all") {
        if (c.is_paid) return false;
        const d = c.createdRunningDays ?? 0;
        if (daysFilter === "14" && d < 14) return false;
        if (daysFilter === "21" && d < 21) return false;
        if (daysFilter === "28" && d < 28) return false; 
      }

      // 👇 UPDATED: Paid Aging Filters 👇
      if (paidDaysFilter !== "all") {
        if (!c.is_paid) return false;
        const d = c.paidRunningDays ?? 0;
        if (paidDaysFilter === "lt14" && !(d < 14)) return false;
        if (paidDaysFilter === "14to20" && !(d >= 14 && d <= 20)) return false;
        if (paidDaysFilter === "21to27" && !(d >= 21 && d <= 27)) return false;
        if (paidDaysFilter === "28plus" && !(d >= 28)) return false;
      }
      return true;
    });
  }, [groupedClients, search, dateFrom, dateTo, companyFilter, agentFilter, serviceFilter, daysFilter, paidDaysFilter, activeTab, taskFilter]);

  // Applied on top of filteredClientList's own default ordering — leaves
  // that default alone (sortField === null) until an admin actually clicks
  // a header. Reads off the same representative-round row (last item in
  // group.rounds) the filters above already use, and the same fields their
  // cells render (companies.company_name, profiles.full_name — NOT client.
  // agent, which is a different, legacy text field also present on the row)
  // so the visible sort order always matches what's actually on screen.
  const sortedClientList = useMemo(() => {
    if (!sortField) return filteredClientList;
    const dir = sortDirection === "asc" ? 1 : -1;
    const sortValue = (group) => {
      const c = group.rounds[group.rounds.length - 1];
      switch (sortField) {
        case "name": return String(c.full_name || "").toLowerCase();
        case "company": return String(c?.companies?.company_name || "").toLowerCase();
        case "agent": return String(c?.profiles?.full_name || "").toLowerCase();
        case "progress": return Number(c.progress) || 0;
        // Whichever duration is currently "live" for this client — Setup
        // (unpaid) before payment, Active (paid) after — same distinction
        // the Duration column itself renders.
        case "duration": return c.is_paid ? (c.paidRunningDays ?? 0) : (c.createdRunningDays ?? 0);
        default: return 0;
      }
    };
    return [...filteredClientList].sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filteredClientList, sortField, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sortedClientList.length / pageSize));

  const pagedClients = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedClientList.slice(start, start + pageSize);
  }, [sortedClientList, page, pageSize]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages]);

  const resetFilters = useCallback(() => {
    setSearch(""); setDateFrom(""); setDateTo("");
    setCompanyFilter("all"); setAgentFilter("all"); setServiceFilter("all"); 
    setDaysFilter("all"); setPaidDaysFilter("all");
    setTaskFilter("all"); 
    setActiveTab("all"); setPage(1);
  }, []);

  return {
    loading, error, tbodyRef, filteredClientList, pagedClients, totalPages,
    search, setSearch, dateFrom, setDateFrom, dateTo, setDateTo,
    daysFilter, setDaysFilter, paidDaysFilter, setPaidDaysFilter,
    companyFilter, setCompanyFilter, 
    agentFilter, setAgentFilter, agentOptions, 
    serviceFilter, setServiceFilter, // 👈 NEW
    activeTab, setActiveTab,
    taskFilter, setTaskFilter,
    sortField, sortDirection, handleSort,
    page, setPage, pageSize, companyOptions,
    handleDeleteClient, 
    resetFilters, reload,
    handleTogglePause,
    handleSetPaidDays,
    handleSetPaidAt,
  };
}