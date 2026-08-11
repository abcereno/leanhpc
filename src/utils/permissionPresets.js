// src/utils/permissionPresets.js
//
// Named starting points for the permission checkboxes in AddEmployee.jsx /
// EditEmployeePermissions.jsx. Picking a preset is a ONE-TIME PREFILL — it
// just checks/unchecks boxes in the form. Once saved, an employee's
// profiles.permissions is their own independent set; editing it later never
// touches anyone else, and editing this file later never retroactively
// changes an already-created employee. That's the whole point of moving off
// hard-coded roles: presets are a convenience for filling out the form
// quickly, not a role employees stay attached to.
//
// See utils/permissions.js for what each key actually grants.

import { ALL_PERMISSION_KEYS, allPermissions, permissionsFrom } from "./permissions";

const EXCLUDE_FROM_OPS_MANAGER = ["api_settings", "delete_employees"];

export const PERMISSION_PRESETS = [
  {
    key: "owner",
    label: "Owner",
    description: "Everything checked.",
    permissions: allPermissions(),
  },
  {
    key: "operations_manager",
    label: "Operations Manager",
    description: "Everything except API Settings and Delete Employees.",
    permissions: permissionsFrom(
      ALL_PERMISSION_KEYS.filter((k) => !EXCLUDE_FROM_OPS_MANAGER.includes(k))
    ),
  },
  {
    key: "caller",
    label: "Caller",
    description: "Call center only — no documents, payments, or employee permissions.",
    permissions: permissionsFrom([
      "view_clients",
      "view_workflow_progress",
      "view_call_queue",
      "complete_call_task",
      "view_call_notes",
      "edit_call_notes",
      "call_experian",
      "call_transunion",
      "call_equifax",
      "call_personal_identifiers",
    ]),
  },
  {
    key: "documents_team",
    label: "Documents Team",
    description: "Document handling only — no calling permissions.",
    permissions: permissionsFrom([
      "view_clients",
      "view_workflow_progress",
      "view_documents",
      "upload_documents",
      "approve_documents",
      "generate_cfpb_package",
      "generate_postalocity_package",
    ]),
  },
  {
    key: "counter",
    label: "Counter",
    description: "Inquiry counting only.",
    permissions: permissionsFrom([
      "view_clients",
      "view_credit_reports",
      "count_inquiries",
      "save_count",
      "submit_count",
      "view_workflow",
    ]),
  },
  {
    key: "sales",
    label: "Sales",
    description: "Add clients and track their own leads through to payment.",
    permissions: permissionsFrom([
      "add_client",
      "view_clients", // scoped to own — view_all_clients intentionally omitted
      "upload_documents",
      "view_payments",
    ]),
  },
  {
    key: "partner",
    label: "Partner",
    description: "Referral partners — their own clients and reporting only.",
    permissions: permissionsFrom([
      "upload_partner_clients",
      "view_partner_clients",
      "view_workflow",
      "reports",
    ]),
  },
];

export const PERMISSION_PRESETS_BY_KEY = Object.fromEntries(
  PERMISSION_PRESETS.map((p) => [p.key, p])
);
