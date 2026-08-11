import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Affiliate partners list. Companies (the other partner type) are already
 * fetched by useOpsSummary/fetchEnrichedClients, so this hook only covers
 * the `affiliates` table — combine both in the Partner Dashboard via
 * utils/opsMetrics.js#computePartnerRollup.
 */
export default function usePartnerDirectory() {
  const [affiliates, setAffiliates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("affiliates")
        .select("id, affiliate_name, contact_email")
        .order("affiliate_name", { ascending: true });
      if (err) throw err;
      setAffiliates(data || []);
    } catch (e) {
      console.error("[usePartnerDirectory] load error", e);
      setError(e.message || "Failed to load affiliate directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { affiliates, loading, error, reload };
}
