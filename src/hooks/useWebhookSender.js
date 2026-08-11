// hooks/useWebhookSender.js
import { useCallback, useState } from "react";

const isEmail = (e) => typeof e === "string" && /\S+@\S+\.\S+/.test(e);
const cleanPhone = (p = "") =>
  p.toString().replace(/[^\d+]/g, "").replace(/^00/, "+");

// Exported (not just used internally by the hook below) so plain, non-hook
// call sites — like utils/markClientPaid.js, which runs outside a React
// component/hook and can't call useWebhookSender() — build the exact same
// payload shape instead of copy-pasting it.
export function buildWebhookPayload(client) {
  return {
    id: client.id ?? null,
    name: client.full_name ?? "",
    full_name: client.full_name ?? "",
    email: (client.email ?? "").trim(),
    phone: cleanPhone(client.phone ?? ""),
    company: client.company_name ?? "",
    agent: client.agent ?? "",
    ts: new Date().toISOString(),
    source: "inquiry-deleter",
    company_email: client.company_email ?? null,
    is_paid: client.is_paid ?? false,
    paid_at: client.paid_at ?? null,
    trigger_source: client.trigger_source ?? null,
  };
}

/** Plain (non-hook) sender — same request useWebhookSender()'s `send` makes,
 * usable from utility functions that aren't React components/hooks. */
export async function sendWebhook(client, webhookUrl) {
  if (!client) throw new Error("Missing client object");
  if (!webhookUrl) throw new Error("Missing webhookUrl");

  const payload = buildWebhookPayload(client);
  if (!payload.name) throw new Error("Client name is required");
  if (!isEmail(payload.email)) throw new Error("Valid email is required");

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export function useWebhookSender() {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const send = useCallback(async (client, webhookUrl) => {
    setStatus("loading");
    setError(null);
    try {
      const result = await sendWebhook(client, webhookUrl);
      setStatus("success");
      return result;
    } catch (e) {
      setStatus("error");
      setError(e);
      throw e;
    }
  }, []);

  return { send, status, error };
}