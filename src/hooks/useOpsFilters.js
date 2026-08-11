import { useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getCurrentAgingDays } from "../utils/aging";
import { attachFlags, FILTER_DEFINITIONS } from "../utils/clientFlags";
import { matchesClientSearch } from "../utils/searchClients";

/**
 * Search + filter-chip state layered on top of a raw client array (e.g.
 * from useOpsSummary). Attaches `.flags`/`.agingDaysCurrent` once, then
 * exposes the filtered list plus per-filter counts (for chip badges) so
 * the Production Queue, Team Queue drilldowns, etc. all share one
 * implementation instead of each re-deriving flags/search independently.
 */
export default function useOpsFilters(rawClients) {
  const { userId } = useAuth();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const clients = useMemo(
    () => attachFlags(rawClients || [], getCurrentAgingDays),
    [rawClients]
  );

  const ctx = useMemo(() => ({ userId }), [userId]);

  const filterCounts = useMemo(() => {
    const counts = {};
    FILTER_DEFINITIONS.forEach((f) => {
      counts[f.key] = clients.filter((c) => f.predicate(c, ctx)).length;
    });
    return counts;
  }, [clients, ctx]);

  const filteredClients = useMemo(() => {
    let list = clients;

    if (activeFilter !== "all") {
      const def = FILTER_DEFINITIONS.find((f) => f.key === activeFilter);
      if (def) list = list.filter((c) => def.predicate(c, ctx));
    }

    if (search.trim()) {
      list = list.filter((c) => matchesClientSearch(c, search));
    }

    return list;
  }, [clients, activeFilter, search, ctx]);

  return {
    clients,
    filteredClients,
    filterCounts,
    filterDefinitions: FILTER_DEFINITIONS,
    search,
    setSearch,
    activeFilter,
    setActiveFilter,
  };
}
