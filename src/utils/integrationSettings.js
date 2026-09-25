// src/utils/integrationSettings.js
//
// Thin data layer over the integration_settings table
// (sql/add_integration_settings.sql) — a generic key/value store for
// per-integration config (currently just HighLevel webhook URLs) that
// used to be hardcoded literals scattered across the frontend. Read
// through here instead of `supabase.from("integration_settings")`
// directly so every caller shares one in-memory cache and one shape.
import { supabase } from "../supabaseClient";

const SELECT = "key, value, label, description, updated_at, updated_by";

// Short-lived cache: highlevelWebhook.js's senders call getIntegrationSettingValue()
// on every fire (a client_completed, a call log, etc.), and those can happen
// in bursts (e.g. three bureaus resolving back to back) — this avoids a
// network round trip per event without going stale for more than a few
// seconds if an admin edits a URL from the Settings page mid-session.
const CACHE_TTL_MS = 15000;
let cache = null; // Map<key, row>
let cacheAt = 0;

function cacheIsFresh() {
  return cache && Date.now() - cacheAt < CACHE_TTL_MS;
}

/** All rows, ordered by label — for the Integration Settings admin page. */
export async function listIntegrationSettings() {
  const { data, error } = await supabase
    .from("integration_settings")
    .select(SELECT)
    .order("label");
  if (error) {
    console.error("listIntegrationSettings error:", error.message);
    return [];
  }
  cache = new Map((data || []).map((row) => [row.key, row]));
  cacheAt = Date.now();
  return data || [];
}

/** Just the value for one key — used by the webhook senders. Empty string/null if unset or missing. */
export async function getIntegrationSettingValue(key) {
  if (!cacheIsFresh()) {
    await listIntegrationSettings();
  }
  return cache?.get(key)?.value || null;
}

/** Upsert one key's value — used by the Integration Settings page's Save button. */
export async function setIntegrationSettingValue(key, value, userId) {
  const { error } = await supabase
    .from("integration_settings")
    .update({ value: value || null, updated_at: new Date().toISOString(), updated_by: userId || null })
    .eq("key", key);
  if (error) {
    console.error("setIntegrationSettingValue error:", error.message);
    return { error };
  }
  cache = null; // force a fresh read next call, in this tab and (after TTL) others
  return { error: null };
}
