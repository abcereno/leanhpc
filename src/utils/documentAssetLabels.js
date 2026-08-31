// src/utils/documentAssetLabels.js
//
// Shared identity-document constants — pulled out of CoverLetterAssets.jsx
// so LetterEditorModal.jsx (which shows the same three assets, since
// they get attached as extra pages to every generated letter PDF — see
// src/utils/letterPdf.js) can render identical labels/badges without a
// second copy drifting out of sync with the first.
import { formatYmd } from "./dateHelpers";
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

// Builds the "AI detected: ..." lines shown under a document — a plain-
// language summary of exactly what the AI extracted, so an admin can spot
// a misread immediately instead of hovering a tooltip or asking someone to
// check. `kind` is 'license'/'ssn'/'poa' (CoverLetterAssets.jsx's ASSET_KEYS,
// also what AlignmentCheckPanel.jsx's identityRows use); `checks` is the
// row's validation_details jsonb — the same object the edge function
// returns as `checks` (supabase/functions/validate-document/index.ts).
// Shared here (not duplicated per component) since both surfaces show the
// same three document types with the same extracted fields.
export function buildAiDetectedLines(kind, checks) {
  if (!checks) return [];
  const lines = [];

  if (kind === "license") {
    if (checks.extractedName) lines.push(checks.extractedName);
    if (checks.extractedAddress) lines.push(checks.extractedAddress);
    if (checks.expiresAt) {
      lines.push(`Expires ${formatYmd(checks.expiresAt)}${checks.issuedAt ? ` (Issued ${formatYmd(checks.issuedAt)})` : ""}`);
    }
  } else if (kind === "ssn") {
    if (checks.extractedName) lines.push(checks.extractedName);
  } else if (kind === "poa") {
    // POA documents don't expire — status is based on how old the
    // statement/bill date is (60-day window), not an expiration date.
    if (checks.statementDate) {
      const ageLabel = checks.statementIsRecent === true ? "Recent" : checks.statementIsRecent === false ? "Older than 60 days" : null;
      lines.push([ageLabel, `dated ${formatYmd(checks.statementDate)}`].filter(Boolean).join(" — "));
    }
  }

  return lines;
}
