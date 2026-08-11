// src/utils/documentAssetLabels.js
//
// Shared identity-document constants — pulled out of CoverLetterAssets.jsx
// so LetterEditorModal.jsx (which shows the same three assets, since
// they get attached as extra pages to every generated letter PDF — see
// src/utils/letterPdf.js) can render identical labels/badges without a
// second copy drifting out of sync with the first.
export const ASSET_KEYS = ["license", "ssn", "poa"];
export const ASSET_LABELS = { license: "Driver's License", ssn: "Social Security Card", poa: "Proof of Address" };

// Same warning-only badges CoverLetterAssets.jsx already shows — nothing
// here blocks a letter from being generated/saved, it's purely so staff
// can see the same validity signal in both places. Also reused by
// CoverLetterAssetsLTOS.jsx (see LTOS_* below) — the four statuses are
// identical across both systems.
export const VALIDATION_BADGES = {
  valid: { label: "Valid", icon: "bi-check-circle-fill", className: "text-success" },
  expired: { label: "Expired", icon: "bi-exclamation-triangle-fill", className: "text-warning" },
  invalid: { label: "Invalid", icon: "bi-x-circle-fill", className: "text-danger" },
  needs_review: { label: "Needs Review", icon: "bi-question-circle-fill", className: "text-secondary" },
};

// LTOS Document Requirements taxonomy — CoverLetterAssetsLTOS.jsx only
// (company portal + public intake). A DIFFERENT 3-slot system than
// ASSET_KEYS above: each slot is a CATEGORY that accepts several
// alternative document types (see supabase/functions/validate-document's
// CATEGORY_TYPES, which must stay in sync with LTOS_TYPE_LABELS below),
// with the AI auto-detecting which specific type was uploaded rather
// than the uploader picking one. Kept separate from ASSET_KEYS/ASSET_LABELS
// since the admin-side CoverLetterAssets.jsx / in-house letter generator
// still use the original fixed license/ssn/poa system, untouched.
export const LTOS_KEYS = ["identity", "address", "authorization"];
export const LTOS_LABELS = {
  identity: "Identity Verification",
  address: "Proof of Address",
  authorization: "Authorization (LPOA)",
};
// Authorization/LPOA is "when applicable" per the LTOS requirements list
// — not always required, unlike identity/address.
export const LTOS_REQUIRED = { identity: true, address: true, authorization: false };

// Must mirror the keys inside CATEGORY_TYPES for each category in
// supabase/functions/validate-document/index.ts.
export const LTOS_TYPE_LABELS = {
  driver_license: "Driver's License",
  state_id: "State ID",
  passport: "Passport",
  utility_bill: "Utility Bill",
  bank_statement: "Bank Statement",
  mortgage_statement: "Mortgage Statement",
  lease_agreement: "Lease Agreement",
  property_deed: "Property Deed",
  insurance_statement: "Insurance Statement",
  government_mail: "Government Mail",
  limited_poa: "Limited Power of Attorney",
  unknown: "Unrecognized Document",
};
