import { useCallback, useRef, useState } from "react";
import { getIntegrationSettingValue } from "../utils/integrationSettings";

/**
 * useBureauWebhookDispatcher
 * Send a bureau-specific call payload to a webhook.
 *
 * - Bureau must be one of: "exp" | "tu" | "eq"
 * - URL for each bureau comes from integration_settings (see
 *   sql/add_integration_settings.sql — seeded with what used to be
 *   hardcoded literals here, now editable on the admin Integration
 *   Settings page instead of requiring a deploy to rotate).
 * - Optional config override: useBureauWebhookDispatcher({ exp, tu, eq })
 *   still takes priority over the DB-backed URL, for any caller that wants
 *   to bypass integration_settings entirely.
 *
 * API:
 *   const { sendCall, status, isLoading, error, lastResponse, reset } =
 *     useBureauWebhookDispatcher(optionalConfig);
 *
 *   await sendCall("exp", payload, { timeoutMs?: number, headers?: object });
 */
const SETTING_KEY_FOR_BUREAU = { exp: "highlevel_bureau_exp_webhook_url", tu: "highlevel_bureau_tu_webhook_url", eq: "highlevel_bureau_eq_webhook_url" };

export function useBureauWebhookDispatcher(config) {
  // status for the *latest* request only
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [error, setError] = useState(null);
  const lastResponseRef = useRef(null);

  // Guard against race conditions: only the latest request updates state
  const requestIdRef = useRef(0);

  const urlFor = useCallback(async (bureauRaw) => {
    const bureau = (bureauRaw || "").toString().trim().toLowerCase();
    const override = config && config[bureau];
    if (override) return override;
    return getIntegrationSettingValue(SETTING_KEY_FOR_BUREAU[bureau]);
  }, [config]);

  const reset = useCallback(() => {
    lastResponseRef.current = null;
    setError(null);
    setStatus("idle");
  }, []);

  const sendCall = useCallback(
    async (bureauRaw, payload, { timeoutMs = 10000, headers = {} } = {}) => {
      const bureau = (bureauRaw || "").toString().trim().toLowerCase();
      if (!["exp", "tu", "eq"].includes(bureau)) {
        throw new Error(`Invalid bureau: ${bureauRaw}`);
      }

      const url = await urlFor(bureau);
      if (!url) throw new Error(`No webhook URL configured for bureau: ${bureau} — set one on the Integration Settings page.`);

      const reqId = ++requestIdRef.current;
      setStatus("loading");
      setError(null);
      lastResponseRef.current = null;

      // Abort/timeout
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);

      // Idempotency (helps avoid dupes on double-click)
      const idemKey =
        payload?.idempotency_key ||
        `${bureau}:${payload?.client_id || "unknown"}:${Date.now()}`;

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Idempotency-Key": idemKey,
            ...headers,
          },
          body: JSON.stringify({
            bureau,                 // "exp" | "tu" | "eq"
            ts: new Date().toISOString(),
            ...payload,             // your call log fields (already flattened)
          }),
          signal: ctrl.signal,
        });

        if (!res.ok) {
          // Try to surface response text for debugging
          let bodyText = "";
          try { bodyText = await res.text(); } catch (err) {console.log(err);
          }
          throw new Error(`Webhook HTTP ${res.status}${bodyText ? `: ${bodyText}` : ""}`);
        }

        let data = null;
        try { data = await res.json(); } catch { /* non-JSON is fine */ }

        // Only update state if this is the latest request
        if (requestIdRef.current === reqId) {
          lastResponseRef.current = data;
          setStatus("success");
        }
        return data;
      } catch (e) {
        if (requestIdRef.current === reqId) {
          setStatus("error");
          setError(e);
        }
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    [urlFor]
  );

  return {
    sendCall,
    status,
    isLoading: status === "loading",
    error,
    lastResponse: lastResponseRef.current,
    reset,
  };
}
