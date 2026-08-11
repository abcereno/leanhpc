import { useState, useEffect, useCallback } from "react";
import { fetchEnrichedClients } from "../utils/clientsData";

/**
 * Fleet-wide data source for the Operations Dashboard. Separate from
 * useAdminClients.js (which owns pagination/search/filter state for the
 * Client List page) — this hook just loads everything once and lets the
 * dashboard components derive counts/buckets from the full set.
 */
export default function useOpsSummary() {
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { clients: c, companies: co } = await fetchEnrichedClients();
      setClients(c);
      setCompanies(co);
    } catch (e) {
      console.error("[useOpsSummary] load error", e);
      setError(e.message || "Failed to load operations data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { clients, companies, loading, error, reload };
}
