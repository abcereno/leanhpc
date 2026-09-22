// src/utils/companies.js
//
// LTOS's companies.id — previously hardcoded as an inline string literal
// independently in 4+ places (EmbeddableEligibilityChecker.jsx,
// LeadEligibilityFunnel.jsx, ClientIntakeForm.jsx, CsDashboard2.jsx's own
// LTOS_COMPANY_ID const), each with its own copy of the same "confirmed
// live via companies table" comment. Centralized here so a future company
// ID change (or adding a second such constant for another company) only
// has to happen in one place.
export const LTOS_COMPANY_ID = "e33ef166-d381-458e-a5c8-ac77557d5ea2";
