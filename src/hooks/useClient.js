import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";

export function useClient(
  clientId,
  {
    locale = "en-US",
    dateFormatOptions,
    dateTimeFormatOptions,
  } = {}
) {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const dateFmtRef = useRef(dateFormatOptions ?? {});
  const dateTimeFmtRef = useRef(dateTimeFormatOptions ?? {});

  const fetchClientData = useCallback(async () => {
    if (!clientId) {
      setClient(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    const { data, error: fetchError } = await supabase
      .from("clients")
      .select("*")
      .eq("id", clientId)
      .maybeSingle();

    if (fetchError) {
      console.error(fetchError);
      setError(fetchError.message);
      setClient(null);
      setLoading(false);
      return;
    }
    if (!data) {
      setError("Client not found");
      setClient(null);
      setLoading(false);
      return;
    }

    let admin_name = "Unknown";
    if (data.admin_id) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.admin_id)
        .maybeSingle();
      if (prof?.full_name) admin_name = prof.full_name;
    }

    let company_name = "N/A";
    if (data.company_id) {
      const { data: co } = await supabase
        .from("companies")
        .select("company_name")
        .eq("id", data.company_id)
        .maybeSingle();
      if (co?.company_name) company_name = co.company_name;
    }

    const createdAt = data.created_at ? new Date(data.created_at) : null;
    const paidAt = data.paid_at ? new Date(data.paid_at) : null;

    // [UPDATED LOGIC] Calculate running days while accounting for pauses
    const now = new Date();
    // If paused, use the pause timestamp as the "current" reference to freeze the count
    const referenceDate = data.is_paused && data.paused_at ? new Date(data.paused_at) : now;

    const runningDays =
      data.is_paid && paidAt instanceof Date && !isNaN(paidAt)
        ? Math.max(
            0,
            Math.ceil(
              (Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()) -
                Date.UTC(paidAt.getUTCFullYear(), paidAt.getUTCMonth(), paidAt.getUTCDate())) /
                (1000 * 60 * 60 * 24)
            ) - (data.paused_days_total || 0) // Subtract the total historical days spent in pause
          )
        : null;

    const tokenExpiresFormatted = data.public_token_expires_at
      ? new Date(data.public_token_expires_at).toLocaleString(
          locale,
          dateTimeFmtRef.current
        )
      : "N/A";

    const createdAtFormatted =
      createdAt instanceof Date && !isNaN(createdAt)
        ? createdAt.toLocaleDateString(locale, dateFmtRef.current)
        : "N/A";

    setClient({
      ...data,
      admin_name,
      company_name,
      createdAtFormatted,
      runningDays,
      tokenExpiresFormatted,
    });
    setLoading(false);
  }, [clientId, locale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await fetchClientData();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchClientData]);

  return { client, loading, error, refetch: fetchClientData };
}