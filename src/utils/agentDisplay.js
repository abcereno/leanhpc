// src/utils/agentDisplay.js
//
// Shared helpers for resolving/display a client's agent name. Company
// portal client lists store the agent two ways — a denormalized `agent`
// text column (set by a few older forms) and `agent_id` (a FK into
// company_user_profiles, set by NewLeadForm.jsx among others) — so
// display code needs to fall back from one to the other rather than
// assuming either is always populated.
//
// standardizeAgentName was previously duplicated identically in
// CompanyPortalDashboard.jsx and InquiryRemovalClientList.jsx; new callers
// (e.g. NewLeadsList.jsx) should import it from here instead of copying it
// a third time.

/** Normalizes empty/placeholder agent values ("", "-", "n/a", "unassigned",
 * etc.) to a single canonical "N/A". */
export function standardizeAgentName(name) {
  if (!name) return "N/A";
  const lowerName = name.trim().toLowerCase();
  if (["n/a", "na", "-", "—", "unassigned", "null", ""].includes(lowerName)) {
    return "N/A";
  }
  return name.trim();
}

/** Fetches a company's roster of agents as plain { id, full_name } rows —
 * the shape a "Reassign agent" <select> needs. Shared so the client-list
 * screens and the new agent-assignment picker query company_user_profiles
 * the exact same way (same role filter) instead of each hand-rolling it. */
export async function fetchCompanyAgents(supabase, companyId) {
  if (!companyId) return [];

  const { data, error } = await supabase
    .from("company_user_profiles")
    .select("id, full_name")
    .eq("company_id", companyId)
    .in("role", ["agent", "company_agent"])
    .order("full_name", { ascending: true });

  if (error) {
    console.warn("Could not fetch agents list:", error.message);
    return [];
  }
  return data || [];
}

/** Builds an `{ [company_user_profiles.id]: full_name }` map for a
 * company's agents — the shared "agent_id -> display name" lookup used
 * wherever a client list needs to resolve agent_id into a name. */
export async function fetchAgentLookupMap(supabase, companyId) {
  const agents = await fetchCompanyAgents(supabase, companyId);
  const map = {};
  agents.forEach((a) => { map[a.id] = a.full_name; });
  return map;
}

/** A client's display-ready agent name: prefers the denormalized `agent`
 * text column, falls back to looking up `agent_id` in the map, then to
 * "N/A" if neither resolves to anything. */
export function resolveAgentName(client, agentLookupMap = {}) {
  const raw = client?.agent || agentLookupMap[client?.agent_id] || "N/A";
  return standardizeAgentName(raw);
}
