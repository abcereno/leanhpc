// src/utils/searchClients.js
//
// Search predicate shared by the Ops Dashboard's Production Queue search
// box (and reusable later if AdminClientList.jsx's search gets extended
// past name-only). Matches client name, email, phone, partner/company
// name, and assigned employee name.

export function matchesClientSearch(client, rawQuery) {
  const q = String(rawQuery || "").trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    client.full_name,
    client.email,
    client.phone,
    client.companies?.company_name || client.company_name,
    client.profiles?.full_name || client.admin_full_name,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());

  return haystack.some((v) => v.includes(q));
}
