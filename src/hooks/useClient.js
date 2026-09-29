import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../supabaseClient";
import { getHolidays, calculatePaidRunningDays } from "../utils/dateHelpers";

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

    // Same shared helper the client list/dashboard views already use
    // (utils/dateHelpers.js#calculatePaidRunningDays) — this used to be a
    // bespoke calendar-day calculation that only accounted for pauses, not
    // for date_completed. That meant a client's "days running" here kept
    // climbing forever after they finished (this file's header badge is
    // the one place staff actually look for "how long did this take"),
    // disagreeing with the client list's own "Active Xd", which already
    // freezes at date_completed. Business days (not calendar days) too,
    // matching that same shared convention everywhere else in the app.
    const holidays = await getHolidays();
    const runningDays = data.is_paid ? calculatePaidRunningDays(data, holidays) : null;

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