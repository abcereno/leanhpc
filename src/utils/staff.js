// src/utils/staff.js
//
// Named individual staff references that a few features need to hardcode
// (as opposed to a permission/role, which any number of employees can
// hold). Kept separate from utils/permissions.js — that file is about
// WHAT an employee can do; this one is about WHO a specific employee is.
//
// ROSELLE_ADMIN_ID: the admin every fully-ready LTOS file (File Status —
// see CsDashboard2.jsx and utils/fileReadiness.js) auto-assigns to.
// Confirmed directly from her profiles row: role "owner", full_name
// "Roselle", email rosellemistiza@gmail.com.
export const ROSELLE_ADMIN_ID = "1e7da57d-32b9-4be7-b9d3-206d13e88814";
