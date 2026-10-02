// Single source of truth for the IDIQ scraper's URL (routes/loginidiq.js in
// the backend repo) — was hardcoded as "https://backend-4uir.onrender.com/loginidiq"
// independently in 7 different call sites (QuickEligibilityChecker.jsx,
// LeadEligibilityFunnel.jsx, EmbeddableEligibilityChecker.jsx,
// reportAutoImport.js, ClientReportPage.jsx, SmartIdiQModal.jsx,
// ParseRreportModal.jsx). Moved to a shared constant so the 2026-09-30 VPS
// migration (see backend repo's IDIQ_SCRAPER_VPS_SETUP.md — Render's shared
// outbound IP got WAF-flagged by IdentityIQ) only needed one env var change
// instead of 7 file edits, and so it stays that way for any future move.
//
// Falls back to the old Render URL if the env var is ever unset, rather than
// silently resolving to "undefined/loginidiq" — see .env for the current
// value.
export const IDIQ_SERVICE_URL =
  import.meta.env.VITE_IDIQ_SERVICE_URL || "https://backend-4uir.onrender.com/loginidiq";
