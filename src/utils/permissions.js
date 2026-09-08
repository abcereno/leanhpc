// src/utils/permissions.js
//
// Single source of truth for the permission-based access system that
// replaces hard-coded role checks (isCaller, isCounter, isSupervisor, etc.)
// across the app. Every permission an employee can be granted lives here,
// grouped the same way they're shown on the Add/Edit Employee checkbox UI.
//
// Why this exists: roles used to be free-floating strings (profiles.role)
// checked ad-hoc across ~13 files as boolean flags in AuthContext.jsx. That
// meant "what can a Caller actually do" was scattered across the codebase,
// and it was easy for a flag to go stale — e.g. RemindersSidebar.jsx
// destructured `isDocs` from useAuth() for a "Docs" role that was never
// actually wired up there, so it was always undefined. Permissions replace
// all of that with one flat, explicit key per capability, stored as JSON on
// profiles.permissions — so changing what an employee can do is just
// checking/unchecking a box, never a code change or a new "role".
//
// This file is imported by:
// - AddEmployee.jsx / EditEmployeePermissions.jsx (renders the checkbox UI)
// - permissionPresets.js (presets are just named subsets of these keys)
// - AuthContext.jsx (hasPermission/hasAny helpers check against these keys)
// - AdminSidebar.jsx, PermissionGuard.jsx, and every component that used to
//   branch on a role boolean

/**
 * PERMISSION_GROUPS: ordered list of { key, label, permissions: [{key, label}] }.
 * `key` values are what actually get stored (as `true`) in profiles.permissions.
 * Keep these keys stable once shipped — renaming one silently revokes it for
 * every employee who had it checked.
 */
export const PERMISSION_GROUPS = [
  {
    key: "dashboards",
    label: "Dashboard Access",
    permissions: [
      { key: "owner_dashboard", label: "Owner Dashboard" },
      { key: "aging_dashboard", label: "Aging Dashboard" },
      { key: "my_dashboard", label: "My Dashboard" },
      { key: "reports", label: "Reports" },
      { key: "analytics", label: "Analytics" },
    ],
  },
  {
    key: "clients",
    label: "Client Management",
    permissions: [
      { key: "view_clients", label: "View Clients" },
      // Scoping, not a page gate: with view_clients but not view_all_clients,
      // an employee only sees clients assigned to them (agent_id/admin_id =
      // their own id) — replaces the old isAdmin/isOwner/"callcount" role
      // checks AdminClientList.jsx and AdminDashboard.jsx used for this.
      { key: "view_all_clients", label: "View All Clients (not just your own)" },
      { key: "add_client", label: "Add New Client" },
      { key: "edit_client", label: "Edit Client Information" },
      { key: "delete_client", label: "Delete Client" },
      { key: "view_client_timeline", label: "View Client Timeline" },
      { key: "view_workflow_progress", label: "View Workflow Progress" },
      { key: "restart_workflow", label: "Restart Completed Workflow" },
      { key: "close_workflow", label: "Close Workflow" },
      { key: "view_credit_reports", label: "View Credit Reports" },
      { key: "count_inquiries", label: "Count Inquiries" },
      { key: "save_count", label: "Save Count" },
      { key: "submit_count", label: "Submit Count" },
      // Gates the AI Count Quality Control review step (HPC Ops Sprint,
      // Priority 2): without this, saveUpdatedThread() can't write
      // ai_*_count/approved_*_count directly when a count actually changed —
      // it opens a "Request Count Review" instead (see useInquiriesThread.js
      // and CountReviewQueue.jsx). With it, an employee can both approve
      // pending requests and make direct count-changing saves themselves.
      { key: "approve_count_reviews", label: "Approve Inquiry Count Reviews" },
      // Gates Priority 1 (Inquiry Authorization Protection): overriding a
      // hold where a bureau's disputable count has grown past what was
      // already approved via Count Review — see utils/authorizationHold.js.
      // Deliberately separate from approve_count_reviews: approving a count
      // review and overriding a processing hold are different decisions
      // (the spec requires the override itself to carry its own reason +
      // initials, permanently logged in authorization_overrides), even
      // though in practice the same supervisors will usually hold both.
      { key: "override_authorization_hold", label: "Override Authorization Holds" },
      // Gates the AI Review Queue (src/components/admin/AiReviewQueue.jsx):
      // inquiries the classify-inquiries edge function's own deterministic
      // guard downgraded from a model-proposed linked/associated call back
      // to non-linked (see sql/add_ai_review_queue.sql). Separate from
      // approve_count_reviews — resolving "the AI wasn't confident here" is
      // a different decision from approving a dispute count.
      { key: "review_ai_flags", label: "Review AI Classification Flags" },
    ],
  },
  {
    key: "documents",
    label: "Documents",
    permissions: [
      { key: "view_documents", label: "View Documents" },
      { key: "upload_documents", label: "Upload Documents" },
      { key: "approve_documents", label: "Approve Documents" },
      { key: "reject_documents", label: "Reject Documents" },
      { key: "generate_cfpb_package", label: "Generate CFPB Package" },
      { key: "generate_postalocity_package", label: "Generate Postalocity Package" },
      { key: "download_documents", label: "Download Documents" },
    ],
  },
  {
    key: "workflows",
    label: "Workflows",
    permissions: [
      { key: "view_workflow", label: "View Workflow" },
      { key: "advance_workflow", label: "Advance Workflow" },
      { key: "pause_workflow", label: "Pause Workflow" },
      { key: "resume_workflow", label: "Resume Workflow" },
      { key: "reassign_workflow", label: "Reassign Workflow" },
      { key: "create_workflow", label: "Create New Workflow" },
      { key: "edit_workflow_template", label: "Edit Workflow Template" },
    ],
  },
  {
    key: "call_center",
    label: "Call Center",
    permissions: [
      { key: "view_call_queue", label: "View Call Queue" },
      { key: "call_experian", label: "Call Experian" },
      { key: "call_transunion", label: "Call TransUnion" },
      { key: "call_equifax", label: "Call Equifax" },
      { key: "call_personal_identifiers", label: "Call Personal Identifiers" },
      { key: "complete_call_task", label: "Complete Call Task" },
      { key: "view_call_notes", label: "View Call Notes" },
      { key: "edit_call_notes", label: "Edit Call Notes" },
    ],
  },
  {
    key: "queues",
    label: "Queues",
    permissions: [
      { key: "queue_experian", label: "Waiting Experian" },
      { key: "queue_transunion", label: "Waiting TransUnion" },
      { key: "queue_equifax", label: "Waiting Equifax" },
      { key: "queue_personal_identifiers", label: "Waiting Personal Identifiers" },
      { key: "queue_postalocity", label: "Postalocity Queue" },
      { key: "queue_followup", label: "Follow-up Queue" },
      { key: "queue_completed", label: "Completed Queue" },
    ],
  },
  {
    key: "partners",
    label: "Partners",
    permissions: [
      { key: "view_partners", label: "View Partners" },
      { key: "add_partners", label: "Add Partners" },
      { key: "edit_partners", label: "Edit Partners" },
      { key: "upload_partner_clients", label: "Upload Partner Clients" },
      { key: "view_partner_clients", label: "View Partner Clients" },
    ],
  },
  {
    key: "payments",
    label: "Payments",
    permissions: [
      { key: "view_payments", label: "View Payments" },
      { key: "verify_payments", label: "Verify Payments" },
      { key: "refund_payments", label: "Refund Payments" },
      { key: "billing", label: "Billing" },
    ],
  },
  {
    key: "team_management",
    label: "Team Management",
    permissions: [
      { key: "view_employees", label: "View Employees" },
      { key: "add_employees", label: "Add Employees" },
      { key: "edit_employees", label: "Edit Employees" },
      { key: "delete_employees", label: "Delete Employees" },
      { key: "manage_permissions", label: "Manage Permissions" },
    ],
  },
  {
    key: "system",
    label: "System",
    permissions: [
      { key: "settings", label: "Settings" },
      { key: "workflow_templates", label: "Workflow Templates" },
      { key: "notification_settings", label: "Notification Settings" },
      { key: "api_settings", label: "API Settings" },
      { key: "integrations", label: "Integrations" },
    ],
  },
];

/** Flat array of every valid permission key, derived from PERMISSION_GROUPS. */
export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key)
);

/** { [key]: label } lookup, e.g. for rendering a single permission's name. */
export const PERMISSION_LABELS = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key, p.label]))
);

/** Builds a permissions object with every key set to `value` (default true). */
export function allPermissions(value = true) {
  return Object.fromEntries(ALL_PERMISSION_KEYS.map((k) => [k, value]));
}

/**
 * Builds a permissions object with only the given keys set to true.
 * Unlisted keys are omitted (falsy by absence) rather than explicitly false,
 * so a permissions blob only ever grows the keys it actually cares about.
 */
export function permissionsFrom(keys) {
  return Object.fromEntries(keys.map((k) => [k, true]));
}

/** True if `permissions` grants `key`. Null/undefined permissions grants nothing. */
export function hasPermission(permissions, key) {
  return !!permissions?.[key];
}

/** True if `permissions` grants ANY of `keys`. */
export function hasAnyPermission(permissions, keys = []) {
  return keys.some((k) => hasPermission(permissions, k));
}

/** True if `permissions` grants ALL of `keys`. */
export function hasAllPermissions(permissions, keys = []) {
  return keys.every((k) => hasPermission(permissions, k));
}
