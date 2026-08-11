// src/utils/teamQueue.js
//
// Builds the "Team Queue" rows (replaces the old ad-hoc "Employee
// Workload" idea from the spec, which had no code behind it). One row per
// staff member: how many files are assigned to them, how many are aging
// past 30 days, and how many are stalled specifically waiting on *them*
// (as opposed to waiting on a bureau, payment, or documents).
//
// Expects `flaggedClients` = the output of utils/clientFlags.js#attachFlags
// (each client already has `.flags` and `.agingDaysCurrent`).

export function computeTeamQueue(flaggedClients, staff) {
  const byEmployee = new Map();

  (staff || []).forEach((s) => {
    byEmployee.set(s.id, {
      employeeId: s.id,
      name: s.full_name || s.email || "Unassigned",
      role: s.role || null,
      assignedFiles: 0,
      overThirtyDays: 0,
      waitingOnEmployee: 0,
    });
  });

  const ensureRow = (adminId, fallbackName) => {
    if (!byEmployee.has(adminId)) {
      byEmployee.set(adminId, {
        employeeId: adminId,
        name: fallbackName || "Unknown Employee",
        role: null,
        assignedFiles: 0,
        overThirtyDays: 0,
        waitingOnEmployee: 0,
      });
    }
    return byEmployee.get(adminId);
  };

  (flaggedClients || []).forEach((c) => {
    if (!c.admin_id || c.flags?.completed) return;

    const row = ensureRow(c.admin_id, c.profiles?.full_name || c.admin_full_name);
    row.assignedFiles += 1;

    if ((c.agingDaysCurrent ?? 0) >= 30) row.overThirtyDays += 1;

    // "Waiting on Employee" = nothing external (payment, documents, a
    // bureau) is blocking this file, so the next action is on the
    // assigned employee.
    const externallyBlocked =
      c.flags.missingPayment ||
      c.flags.missingDocuments ||
      c.flags.waitingExperian ||
      c.flags.waitingTransUnion ||
      c.flags.waitingEquifax;
    if (!externallyBlocked) row.waitingOnEmployee += 1;
  });

  return Array.from(byEmployee.values())
    .filter((r) => r.assignedFiles > 0)
    .sort((a, b) => b.assignedFiles - a.assignedFiles);
}
