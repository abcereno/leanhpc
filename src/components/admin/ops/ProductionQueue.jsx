import { useMemo, useState } from "react";
import { Badge, Form } from "react-bootstrap";
import { AGING_BUCKETS } from "../../../utils/aging";
import ProductionQueueLegend from "./ProductionQueueLegend";
import ClientCardGrid from "./ClientCardGrid";

// Chip list mirrors ActionRequired.jsx minus "completed" (kept here since a
// manager may still want to filter down to completed files from this view).
// The 9 "pipeline_*" filters (utils/clientFlags.js) are reached by clicking
// a stage on AdminDashboard.jsx's Pipeline tab, not by browsing chips here —
// showing all of them as chips too would clutter this row. They're still
// usable via activeFilter (see the synthetic "active filter" chip logic
// below, which shows whichever one is currently selected even though it's
// excluded from this static list).
const EXCLUDED_KEYS = new Set(["my_files"]);
const isPipelineKey = (key) => key.startsWith("pipeline_");

// Aging-related chips get their matching bucket's colors (from
// utils/aging.js — the same green/yellow/orange/red used for each card's
// aging dot) so the filter row visually agrees with what it's filtering,
// instead of every chip looking the same regardless of urgency.
const CHIP_BUCKET_BY_KEY = {
  active: AGING_BUCKETS[0], // 0–14 days, green
  over_15: AGING_BUCKETS[1], // 15–19 days, yellow
  over_20: AGING_BUCKETS[2], // 20–29 days, orange
  over_30: AGING_BUCKETS[3], // 30+ days, red
};

/**
 * Card-per-client "Production Queue" — the spec's alternative to
 * AdminClientList.jsx's table. Reuses hooks/useOpsFilters.js (search +
 * filter-chip state already shared with ActionRequired/Team Queue) rather
 * than re-querying or re-deriving flags a second time.
 *
 * `dateRange` (its own dedicated hooks/useDateRange.js instance, defaulting
 * to all-time — see AdminDashboard.jsx) further narrows the list to clients
 * created within that range, on top of the existing search + filter-chip
 * narrowing.
 *
 * `clients` is the raw, flags-attached pool (useOpsFilters().clients — pre
 * chip/search) so the chip badge counts can be computed here against the
 * date-narrowed pool instead of the shared, date-unaware
 * useOpsFilters().filterCounts. Without this, a badge could read e.g. "681"
 * while the (date-narrowed) list below showed zero results for that same
 * chip — the counts and the list need to agree on the same pool.
 *
 * `companies` (the same `{ id, company_name }[]` array AdminDashboard.jsx
 * already sources from useOpsSummary() for Partner Dashboard) drives an
 * optional company narrowing, applied the same way as dateRange: on top of
 * both the badge-count pool and the rendered list, so a manager can scope
 * the whole Production Queue to one partner.
 */
export default function ProductionQueue({
  clients,
  filteredClients,
  filterDefinitions,
  search,
  setSearch,
  activeFilter,
  setActiveFilter,
  dateRange,
  companies,
  loading,
}) {
  const [companyFilter, setCompanyFilter] = useState("all");

  const visibleDefs = (filterDefinitions || []).filter((f) => !EXCLUDED_KEYS.has(f.key) && !isPipelineKey(f.key));
  const chips = [{ key: "all", label: "All" }, ...visibleDefs];

  // Arriving here via a Pipeline stage click (AdminDashboard.jsx) sets
  // activeFilter to one of the "pipeline_*" keys above, which is
  // deliberately not in `chips`. Without this, the chip row would show no
  // active selection at all even though the list below IS filtered —
  // looking like the filter silently reset. Appending a synthetic chip
  // for whatever's actually active keeps that one visible (and
  // clearable back to "All") regardless of where it came from.
  const activeDef = (filterDefinitions || []).find((f) => f.key === activeFilter);
  if (activeFilter !== "all" && isPipelineKey(activeFilter) && activeDef) {
    chips.push(activeDef);
  }

  const sortedCompanies = useMemo(
    () => [...(companies || [])].sort((a, b) => (a.company_name || "").localeCompare(b.company_name || "")),
    [companies]
  );

  const byCompany = (list) =>
    companyFilter === "all" ? list : list.filter((c) => String(c.company_id) === String(companyFilter));

  const dateNarrowedPool = dateRange?.isActive
    ? byCompany(clients || []).filter((c) => dateRange.inRange(c.created_at))
    : byCompany(clients || []);

  const filterCounts = useMemo(() => {
    const counts = {};
    (filterDefinitions || []).forEach((f) => {
      counts[f.key] = dateNarrowedPool.filter((c) => f.predicate(c)).length;
    });
    return counts;
  }, [dateNarrowedPool, filterDefinitions]);

  const dateFilteredClients = dateRange?.isActive
    ? byCompany(filteredClients).filter((c) => dateRange.inRange(c.created_at))
    : byCompany(filteredClients);

  return (
    <div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <Form.Control
          style={{ maxWidth: 320 }}
          placeholder="Search name, email, phone, partner, employee…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <ProductionQueueLegend />
        {sortedCompanies.length > 0 && (
          <Form.Select
            size="sm"
            style={{ maxWidth: 220 }}
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="all">All Companies</option>
            {sortedCompanies.map((co) => (
              <option key={co.id} value={co.id}>{co.company_name}</option>
            ))}
          </Form.Select>
        )}
        <div className="d-flex flex-wrap gap-2">
          {chips.map((f) => {
            const count = f.key === "all" ? undefined : filterCounts?.[f.key] ?? 0;
            const active = activeFilter === f.key;
            const bucket = CHIP_BUCKET_BY_KEY[f.key];
            const bucketStyle = bucket
              ? {
                  backgroundColor: bucket.bg,
                  color: bucket.color,
                  border: `1px solid ${bucket.color}`,
                  boxShadow: active ? `0 0 0 2px ${bucket.color}55` : undefined,
                  fontWeight: active ? 700 : 500,
                }
              : undefined;
            return (
              <button
                key={f.key}
                type="button"
                className={`btn btn-sm ${bucket ? "" : active ? "btn-primary" : "cmd-btn"}`}
                style={bucketStyle}
                onClick={() => {
                  setActiveFilter(f.key);
                }}
              >
                {f.label}
                {count !== undefined && <Badge bg={active ? "light" : "secondary"} text={active ? "dark" : undefined} className="ms-2" pill>{count}</Badge>}
              </button>
            );
          })}
        </div>
      </div>

      <ClientCardGrid clients={dateFilteredClients} loading={loading} />
    </div>
  );
}
