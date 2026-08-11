// src/utils/quickActions.js
//
// Static config for the Ops Dashboard's "Quick Actions" button row. Every
// entry points at a route/flow that already exists in the app — this file
// doesn't add any new functionality, it just centralizes where each
// spec'd action currently lives so the button row can be built as a
// simple map() over this list.
//
// A few spec actions (New Client, Upload Documents, Assign Employee) don't
// have their own standalone route today — they're modals/actions launched
// from within an existing page (AdminClientList.jsx's "Add Client"
// sidebar, a client's Documents tab, editing a client's assigned admin).
// Those are pointed at the nearest existing page with a note; wiring a
// direct modal-open-on-load isn't done here since that's page-specific UI
// work, not a routing decision.

export const QUICK_ACTIONS = [
  {
    key: "new_client",
    label: "New Client",
    icon: "bi-person-plus",
    to: "/clients",
    note: "Opens the Client List — use its \"Add Client\" button.",
  },
  {
    key: "upload_credit_report",
    label: "Upload Credit Report",
    icon: "bi-file-earmark-arrow-up",
    to: "/identify-inquiries",
  },
  {
    key: "run_ai_count",
    label: "Run AI Count",
    icon: "bi-robot",
    to: "/identify-inquiries",
    note: "Same OCR/AI pipeline as \"Upload Credit Report\" — re-parses a report and re-counts inquiries.",
  },
  {
    key: "upload_documents",
    label: "Upload Documents",
    icon: "bi-folder-plus",
    to: "/clients",
    note: "Open a client profile, then its Documents tab.",
  },
  {
    key: "add_partner_company",
    label: "Add Company Partner",
    icon: "bi-building-add",
    to: "/add-company",
  },
  {
    key: "add_partner_affiliate",
    label: "Add Affiliate Partner",
    icon: "bi-diagram-3",
    to: "/add-affiliate",
  },
  {
    key: "assign_employee",
    label: "Assign Employee",
    icon: "bi-person-check",
    to: "/clients",
    note: "Open a client (or use Bulk Edit) to set the assigned employee.",
  },
];
