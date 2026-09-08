import { useEffect, useMemo, useState } from "react";
import { Tab, Tabs, Form, Alert, Button, Spinner, Badge } from "react-bootstrap";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import useOpsSummary from "../../hooks/useOpsSummary";
import useOpsFilters from "../../hooks/useOpsFilters";
import useStaffDirectory from "../../hooks/useStaffDirectory";
import usePartnerDirectory from "../../hooks/usePartnerDirectory";
import useDailyMetrics from "../../hooks/useDailyMetrics";
import useOpsAlerts, { summarizeAlerts } from "../../hooks/useOpsAlerts";
import useDateRange from "../../hooks/useDateRange";
import { computeCompanySnapshot, computeHealthScore } from "../../utils/opsMetrics";
import CompanySnapshot from "./ops/CompanySnapshot";
import AgingDashboard from "./ops/AgingDashboard";
import DailyMetrics from "./ops/DailyMetrics";
import ActionRequired from "./ops/ActionRequired";
import ActivityFeed from "./ops/ActivityFeed";
import TeamQueue from "./ops/TeamQueue";
import PartnerDashboard from "./ops/PartnerDashboard";
import ProductionQueue from "./ops/ProductionQueue";
import WorkflowPipeline from "./ops/WorkflowPipeline";
import QuickActions from "./ops/QuickActions";
import HealthScoreBadge from "./ops/HealthScoreBadge";
import DateRangeFilter from "./ops/DateRangeFilter";
import InquiryLoader from "../shared/ui/InquiryLoader";

// Human-readable description of the shared ops date range, for section
// headers (e.g. DailyMetrics' "{scope} — {rangeLabel}"). Kept local since
// it's purely presentational formatting, not state.
function describeRange(from, to) {
  const today = new Date().toLocaleDateString("en-CA");
  if (!from && !to) return "All Time";
  if (from === today && to === today) return "Today";
  if (from && to) return `${from} to ${to}`;
  if (from) return `Since ${from}`;
  return `Through ${to}`;
}

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const getStartOfMonthString = () => {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${month}-01`;
};

/**
 * The admin landing page (/admin-dashboard). Formerly just the call/
 * production metrics view below (now the "Call Metrics" tab) — the
 * Operations Dashboard from the client's ops sprint is now the default set
 * of tabs here instead of living at its own /ops route.
 *
 * Overview = Quick Actions + Health Score + Company Snapshot + Daily
 * Metrics + Action Required + Live Activity + Aging Dashboard.
 * Production Queue / Team Queue / Partners are separate tabs so each can
 * breathe (search+filters, a staff table, a partner rollup) without
 * crowding the Overview. Team Queue and Partners are company-wide views,
 * so they're hidden for employees scoped to their own files (scopeToSelf).
 *
 * All of this reads from the same data layer built for Priority 3:
 * useOpsSummary/useOpsFilters/useStaffDirectory/usePartnerDirectory/
 * useDailyMetrics/useOpsAlerts + utils/opsMetrics.js, clientFlags.js,
 * teamQueue.js, aging.js — see HPC-Ops-Sprint-Implementation-Plan.md.
 */
export default function AdminDashboard() {
  const [topTab, setTopTab] = useState("overview"); // "overview" | "pipeline" | "production_queue" | "team_queue" | "partners" | "call_metrics"

  // --- Shared ops data ---
  // `role` here is only used as a display label (badge) further down — the
  // actual scoping decision is permission-based (view_all_clients).
  const { role, userId, fullName, hasPermission } = useAuth();
  const { clients: opsClients, companies, loading: opsLoading, error: opsError, reload: opsReload } = useOpsSummary();

  const scopeToSelf = !hasPermission("view_all_clients");

  const scopedClients = useMemo(() => {
    if (!scopeToSelf) return opsClients;
    return opsClients.filter((c) => c.admin_id === userId);
  }, [opsClients, scopeToSelf, userId]);

  // Date range for Company Snapshot / Daily Metrics — defaults to this
  // month, matching what those sections always showed before this control
  // existed (Team Queue/Partners/Call Metrics are unaffected; Call Metrics
  // already has its own independent date picker below, querying a
  // different table).
  const opsDateRange = useDateRange();
  const rangeLabel = describeRange(opsDateRange.from, opsDateRange.to);

  // Separate, independent date range for Production Queue, defaulting to
  // all-time rather than this-month — it's a backlog/queue view, and a
  // this-month default silently hid older backlog *and* was mutually
  // exclusive with the aging-bucket chips (over_15/20/30 — a client can't
  // be both "created this month" and "aged 15+ business days").
  const pqDateRange = useDateRange({ defaultRange: "empty" });

  const opsMetrics = useMemo(
    () => computeCompanySnapshot(scopedClients, opsDateRange),
    [scopedClients, opsDateRange.from, opsDateRange.to]
  );
  const healthScore = useMemo(() => computeHealthScore(scopedClients), [scopedClients]);

  const scopeLabel = scopeToSelf ? "My Clients" : "Company-Wide";
  const hiddenKeys = scopeToSelf ? ["activePartners", "newClientsInRange"] : [];

  // Search + filter-chip state, shared across Action Required, Production
  // Queue, and Team Queue so a count in one place always matches another.
  const opsFilters = useOpsFilters(scopedClients);

  const { alerts } = useOpsAlerts();
  const alertsSummary = useMemo(() => summarizeAlerts(alerts), [alerts]);

  const { metrics: dailyMetrics } = useDailyMetrics(scopedClients, opsDateRange);

  const { staff } = useStaffDirectory();
  const { affiliates } = usePartnerDirectory();

  const handleSelectFilter = (key) => {
    opsFilters.setActiveFilter(key);
    setTopTab("production_queue");
  };

  // --- Call Metrics tab: existing call/production metrics ---
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // 👈 Default to "all"
  const [dateRange, setDateRange] = useState({
    from: getStartOfMonthString(),
    to: "",
  });

  useEffect(() => {
    const fetchMetrics = async () => {
      setLoading(true);
      setFetchError(null);

      let query = supabase
        .from("call_metrics")
        .select("*, profiles!call_metrics_employee_id_fkey(full_name)")
        .order('log_date', { ascending: false });

      if (dateRange.from) query = query.gte('log_date', dateRange.from);
      if (dateRange.to)   query = query.lte('log_date', dateRange.to);

      const { data, error } = await query;

      if (error) {
        console.error("❌ Failed to fetch metrics:", error);
        setFetchError(error.message);
      } else {
        const processedData = (data || []).map(row => {
          const rawDate = row.log_date || row.created_at || "";
          return {
            ...row,
            local_date_string: rawDate.substring(0, 10)
          };
        });
        setMetrics(processedData);
      }
      setLoading(false);
    };
    fetchMetrics();
  }, [dateRange]);

  const handleDateChange = (field, value) => {
    setDateRange((prev) => ({ ...prev, [field]: value }));
  };

  const groupByEmployee = metrics.reduce((acc, entry) => {
    const key = entry.employee_id || entry.admin_id || "unassigned";
    if (!acc[key]) acc[key] = [];
    acc[key].push(entry);
    return acc;
  }, {});

  const availableTabs = ["all", ...Object.keys(groupByEmployee)];
  const currentTab = availableTabs.includes(activeTab) ? activeTab : "all";

  // --- HELPER: Aggregate data by date for the "All" chart ---
  const aggregateByDate = (data) => {
    const groupedByDate = data.reduce((acc, curr) => {
      const date = curr.local_date_string;
      if (!acc[date]) {
        acc[date] = {
          local_date_string: date,
          total_calls: 0,
          total_docs: 0,
          total_disputes: 0,
          total_confirmed: 0,
          total_unable_to_dispute: 0,
          total_disconnected: 0,
          total_count: 0
        };
      }
      acc[date].total_calls += Number(curr.total_calls) || 0;
      acc[date].total_docs += Number(curr.total_docs) || 0;
      acc[date].total_disputes += Number(curr.total_disputes) || 0;
      acc[date].total_confirmed += Number(curr.total_confirmed) || 0;
      acc[date].total_unable_to_dispute += Number(curr.total_unable_to_dispute) || 0;
      acc[date].total_disconnected += Number(curr.total_disconnected) || 0;
      acc[date].total_count += Number(curr.total_count) || 0;
      return acc;
    }, {});

    // Sort dates ascending for better chart flow (past -> present)
    return Object.values(groupedByDate).sort((a, b) => a.local_date_string.localeCompare(b.local_date_string));
  };

  // --- HELPER: Render Metrics Cards dynamically ---
  const renderMetricsCards = (data) => {
    const totalCalls = data.reduce((sum, e) => sum + (Number(e.total_calls) || 0), 0);
    const totalDocs = data.reduce((sum, e) => sum + (Number(e.total_docs) || 0), 0);
    const totalDisputes = data.reduce((sum, e) => sum + (Number(e.total_disputes) || 0), 0);
    const totalConfirmed = data.reduce((sum, e) => sum + (Number(e.total_confirmed) || 0), 0);
    const totalUnable = data.reduce((sum, e) => sum + (Number(e.total_unable_to_dispute) || 0), 0);
    const totalDisconnected = data.reduce((sum, e) => sum + (Number(e.total_disconnected) || 0), 0);
    const totalCount = data.reduce((sum, e) => sum + (Number(e.total_count) || 0), 0);

    const disputeRate = totalCalls ? ((totalDisputes / totalCalls) * 100).toFixed(1) : "N/A";
    const completionRate = totalDisputes ? ((totalConfirmed / totalDisputes) * 100).toFixed(1) : "N/A";
    const productivity = disputeRate !== "N/A" && completionRate !== "N/A"
      ? ((disputeRate * completionRate) / 100).toFixed(1)
      : "N/A";

    return (
      <div className="d-flex flex-wrap gap-3 mb-4">
        <CardItem label="📞 Total Calls" value={totalCalls} />
        <CardItem label="📄 Total Docs" value={totalDocs} />
        <CardItem label="🗂️ Total Disputes" value={totalDisputes} />
        <CardItem label="✅ Confirmed" value={totalConfirmed} />
        <CardItem label="⛔ Unable to Dispute" value={totalUnable} />
        <CardItem label="📵 Disconnected" value={totalDisconnected} />
        <CardItem label="📊 Total Count" value={totalCount} />

        <CardItem label="📢 Dispute Rate" value={disputeRate !== "N/A" ? `${disputeRate}%` : "N/A"} />
        <CardItem label="✅ Completion Rate" value={completionRate !== "N/A" ? `${completionRate}%` : "N/A"} />
        <CardItem label="⚙️ Productivity" value={productivity !== "N/A" ? `${productivity}%` : "N/A"}>
          {productivity !== "N/A" && (
            <div className="progress mt-1" style={{ height: "8px" }}>
              <div
                className="progress-bar bg-success"
                role="progressbar"
                style={{ width: `${productivity}%` }}
              />
            </div>
          )}
        </CardItem>
      </div>
    );
  };

  // --- HELPER: Render Chart dynamically ---
  const renderChart = (data) => {
    const labels = data.map((e) => e.local_date_string);
    return (
      <div className="bg-white p-3 rounded border shadow-sm mt-3">
        <Bar
          data={{
            labels,
            datasets: [
              { label: "Total Calls", data: data.map(e => e.total_calls), backgroundColor: "rgba(75,192,192,0.6)" },
              { label: "Total Docs", data: data.map(e => e.total_docs), backgroundColor: "rgba(255,159,64,0.6)" },
              { label: "Disputes", data: data.map(e => e.total_disputes), backgroundColor: "rgba(255,205,86,0.6)" },
              { label: "Confirmed", data: data.map(e => e.total_confirmed), backgroundColor: "rgba(54,162,235,0.6)" },
              { label: "Unable", data: data.map(e => e.total_unable_to_dispute), backgroundColor: "rgba(153,102,255,0.6)" },
              { label: "Disconnected", data: data.map(e => e.total_disconnected), backgroundColor: "rgba(201,203,207,0.6)" },
              { label: "Count", data: data.map(e => e.total_count), backgroundColor: "rgba(255,99,132,0.6)" },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { position: "top" } },
            scales: { y: { beginAtZero: true } },
          }}
        />
      </div>
    );
  };

  return (
    <div className="p-4">
      <div className="d-flex flex-wrap align-items-center justify-content-between mb-3 gap-2">
        <div>
          <h3 className="mb-0">{scopeToSelf ? `${fullName || "My"} Dashboard` : "Operations Dashboard"}</h3>
          <div className="text-muted small">
            {scopeToSelf
              ? "Your assigned files — snapshot and aging."
              : "What requires attention right now, company-wide."}{" "}
            <Badge bg="light" text="dark" className="border ms-1 text-uppercase">
              {role || "unknown"}
            </Badge>
          </div>
        </div>
        {!opsLoading && <HealthScoreBadge score={healthScore.score} penalties={healthScore.penalties} avgProcessingDays={healthScore.avgProcessingDays} />}
      </div>

      <Tabs activeKey={topTab} onSelect={(k) => setTopTab(k)} className="mb-3">
        {/* OVERVIEW */}
        <Tab eventKey="overview" title="Overview">
          <div className="mt-3">
            <div className="d-flex justify-content-end mb-2">
              <Button size="sm" variant="outline-secondary" onClick={opsReload} disabled={opsLoading}>
                <i className="bi bi-arrow-clockwise me-1" />
                Refresh
              </Button>
            </div>

            {opsError && <Alert variant="danger">{opsError}</Alert>}

            {opsLoading ? (
              <div className="text-center py-5">
                <Spinner animation="border" />
                <p className="mt-2 text-muted">Loading operations data…</p>
              </div>
            ) : (
              <>
                <QuickActions />
                <DateRangeFilter
                  from={opsDateRange.from}
                  to={opsDateRange.to}
                  setFrom={opsDateRange.setFrom}
                  setTo={opsDateRange.setTo}
                  onClear={opsDateRange.clear}
                  label="Snapshot Date Range"
                />
                <CompanySnapshot metrics={opsMetrics} scopeLabel={scopeLabel} hiddenKeys={hiddenKeys} />
                <DailyMetrics metrics={dailyMetrics} scopeLabel={scopeLabel} rangeLabel={rangeLabel} />

                <div className="row g-3 mb-4">
                  <div className="col-lg-8">
                    <ActionRequired
                      filterCounts={opsFilters.filterCounts}
                      filterDefinitions={opsFilters.filterDefinitions}
                      onSelectFilter={handleSelectFilter}
                      alertsSummary={alertsSummary}
                    />
                  </div>
                  <div className="col-lg-4">
                    <ActivityFeed />
                  </div>
                </div>

                <AgingDashboard clients={scopedClients} scopeLabel={scopeLabel} />
              </>
            )}
          </div>
        </Tab>

        {/* PIPELINE — aggregate "where clients are sitting on the
            per-bureau workflow" view (utils/workflowStage.js). Reads
            opsFilters.clients (scopedClients with .flags attached — the
            pipeline-stage and missing-payment filter predicates it drills
            into read client.flags), so switches to "My Files" scope for
            employees the same way Production Queue already does. Has its
            own company/date/search filters and drills into an inline
            client list on click, rather than jumping to another tab. */}
        <Tab eventKey="pipeline" title="Pipeline">
          <div className="mt-3">
            {opsLoading ? (
              <div className="text-center py-5">
                <Spinner animation="border" />
              </div>
            ) : (
              <>
                <div className="d-flex justify-content-end mb-2">
                  <Button size="sm" variant="outline-secondary" onClick={opsReload} disabled={opsLoading}>
                    <i className="bi bi-arrow-clockwise me-1" />
                    Refresh
                  </Button>
                </div>
                <WorkflowPipeline clients={opsFilters.clients} companies={companies} scopeLabel={scopeLabel} />
              </>
            )}
          </div>
        </Tab>

        {/* PRODUCTION QUEUE */}
        <Tab eventKey="production_queue" title="Production Queue">
          <div className="mt-3">
            {opsLoading ? (
              <div className="text-center py-5">
                <Spinner animation="border" />
              </div>
            ) : (
              <>
                <div className="d-flex justify-content-end mb-2">
                  {/* Cover-letter asset uploads and comments/notes happen on
                      the Client Profile page, which doesn't notify this tab
                      — useOpsSummary only fetches once on mount (see
                      useOpsSummary.js). Without this, a DOCS badge or a
                      card's latest comment/note can look stale until the
                      whole page is reloaded. */}
                  <Button size="sm" variant="outline-secondary" onClick={opsReload} disabled={opsLoading}>
                    <i className="bi bi-arrow-clockwise me-1" />
                    Refresh
                  </Button>
                </div>
                <DateRangeFilter
                  from={pqDateRange.from}
                  to={pqDateRange.to}
                  setFrom={pqDateRange.setFrom}
                  setTo={pqDateRange.setTo}
                  onClear={pqDateRange.clear}
                  label="Filter by Date Created (optional)"
                />
                <ProductionQueue
                  clients={opsFilters.clients}
                  filteredClients={opsFilters.filteredClients}
                  filterDefinitions={opsFilters.filterDefinitions}
                  search={opsFilters.search}
                  setSearch={opsFilters.setSearch}
                  activeFilter={opsFilters.activeFilter}
                  setActiveFilter={opsFilters.setActiveFilter}
                  dateRange={pqDateRange}
                  companies={companies}
                />
              </>
            )}
          </div>
        </Tab>

        {/* TEAM QUEUE (company-wide only) */}
        {!scopeToSelf && (
          <Tab eventKey="team_queue" title="Team Queue">
            <div className="mt-3">
              <TeamQueue flaggedClients={opsFilters.clients} staff={staff} loading={opsLoading} />
            </div>
          </Tab>
        )}

        {/* PARTNERS (company-wide only) */}
        {!scopeToSelf && (
          <Tab eventKey="partners" title="Partners">
            <div className="mt-3">
              <PartnerDashboard clients={scopedClients} companies={companies} affiliates={affiliates} loading={opsLoading} />
            </div>
          </Tab>
        )}

        {/* CALL METRICS: existing call/production metrics view */}
        <Tab eventKey="call_metrics" title="Call Metrics">
          <div className="mt-3">
            {fetchError && (
              <Alert variant="danger">
                <strong>Database Error:</strong> {fetchError}
              </Alert>
            )}

            {/* Date Filters */}
            <div className="d-flex gap-3 mb-4 align-items-end">
              <Form.Group>
                <Form.Label className="small fw-bold text-muted">From</Form.Label>
                <Form.Control
                  type="date"
                  value={dateRange.from}
                  onChange={(e) => handleDateChange("from", e.target.value)}
                />
              </Form.Group>
              <Form.Group>
                <Form.Label className="small fw-bold text-muted">To</Form.Label>
                <Form.Control
                  type="date"
                  value={dateRange.to}
                  onChange={(e) => handleDateChange("to", e.target.value)}
                />
              </Form.Group>
              <Button variant="outline-secondary" onClick={() => setDateRange({ from: "", to: "" })}>
                Clear Filters
              </Button>
            </div>

            {loading ? (
              <InquiryLoader />
            ) : metrics.length === 0 ? (
              <div className="text-center py-5 bg-light rounded border border-dashed">
                <i className="bi bi-folder-x fs-1 text-muted mb-2 d-block"></i>
                <h5 className="text-muted">No metrics found for this date range</h5>
                <p className="text-muted small">Try clearing the date filters to see if older logs exist.</p>
              </div>
            ) : (
              <Tabs
                activeKey={currentTab}
                onSelect={(k) => setActiveTab(k)}
                className="mb-3"
              >
                {/* TAB 1: ALL (AGGREGATE) */}
                <Tab eventKey="all" title="All (Aggregate)">
                  <div className="mt-3">
                    {renderMetricsCards(metrics)}
                    {renderChart(aggregateByDate(metrics))}
                  </div>
                </Tab>

                {/* TABS 2+: PER EMPLOYEE */}
                {Object.entries(groupByEmployee).map(([employeeId, entries]) => {
                  const employeeName = entries[0]?.profiles?.full_name || (employeeId === "unassigned" ? "Unassigned Logs" : "Unknown Staff");
                  // Sort entries ascending by date specifically for the chart
                  const sortedEntries = [...entries].sort((a, b) => a.local_date_string.localeCompare(b.local_date_string));

                  return (
                    <Tab eventKey={employeeId} title={employeeName} key={employeeId}>
                      <div className="mt-3">
                        {renderMetricsCards(entries)}
                        {renderChart(sortedEntries)}
                      </div>
                    </Tab>
                  );
                })}
              </Tabs>
            )}
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}

function CardItem({ label, value, children }) {
  return (
    <div className="card p-3 shadow-sm border-0 bg-white" style={{ minWidth: "150px", flex: "1 1 auto" }}>
      <strong className="text-muted small text-uppercase">{label}</strong>
      <div className="fs-4 fw-bold text-dark mt-1">{value}</div>
      {children}
    </div>
  );
}
