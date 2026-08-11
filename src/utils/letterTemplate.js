// src/utils/letterTemplate.js
//
// Compiles the editable HTML for one bureau's in-house dispute letter
// (LetterEditorModal.jsx). Structure, addresses, and wording pattern are
// taken directly from three real sample letters the client provided
// (Equifax/Experian/TransUnion cover letters), unified into one format
// per the client's explicit answer ("Same format for all 3") rather than
// keeping TransUnion's differing font/salutation/missing banner page.
//
// Two `.letter-page` sections are produced — banner page, then the
// actual letter body — matching the real samples' page 1 / page 2 split.
// src/utils/letterPdf.js renders each onto its own PDF page.
//
// Body content now comes from src/data/letterContentBank.js — a static,
// pre-written wording library the client provided directly ("letter
// template11_21_25.pdf"), rotated per client/bureau instead of generated
// live by OpenAI (see LetterEditorModal.jsx). That source doc's own
// header — "Always Change the color of the fonts to purple, magenta and
// cyan" — confirms the colored <span style="color:..."> wrapping below
// is a deliberate, functional convention (the bureau's own scanning
// system treats colored text differently per the client), not
// decoration, so every rotated paragraph is colored, cycling through all
// three colors. @tiptap/extension-color + @tiptap/extension-text-style
// parse/preserve this inline color on load into the editor, and it
// round-trips back out through editor.getHTML() when the letter is
// saved/rendered to PDF, so whatever the staff sees in the editor is
// exactly what gets saved.
export const BUREAU_ADDRESSES = {
  Equifax: ["P.O. Box 740256", "Atlanta, GA 30374"],
  Experian: ["P.O. Box 4500", "Allen, TX 75013"],
  TransUnion: ["P.O. Box 2000", "Chester, PA 19016"],
};

// Cycled across the bank paragraphs (purple/magenta/cyan, per the source
// doc's explicit instruction) and also used for the fixed banner-page
// assertion below.
const COLOR_ROTATION = ["#7C1FA0", "#C2007F", "#0891B2"]; // purple, magenta, cyan

// Structural legitimacy assertion for the banner page — independent of
// which content-bank letter type is chosen below, so it stays fixed
// rather than rotating with the body wording.
const BANNER_ASSERTION =
  "I am the person named on this credit file contacting you directly — this is not a form letter from a credit repair company. I did not authorize the inquiries listed in this letter and am requesting their removal, along with documentation proving permissible purpose bearing my signature.";

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// clients.address is a single free-text field in this schema — best-
// effort split into a street line + city/state/zip line at the first
// comma (matches the two-line header block in every real sample); falls
// back to one line if there's no comma to split on.
function splitAddress(address) {
  const raw = String(address || "").trim();
  if (!raw) return { street: "", cityStateZip: "" };
  const idx = raw.indexOf(",");
  if (idx === -1) return { street: raw, cityStateZip: "" };
  return { street: raw.slice(0, idx).trim(), cityStateZip: raw.slice(idx + 1).trim() };
}

function maskSsn(ssn) {
  const last4 = String(ssn || "").replace(/\D/g, "").slice(-4);
  return last4 ? `***-**-${last4}` : "";
}

// `bodyText` is one entry straight from letterContentBank.js — a
// multi-paragraph (blank-line-separated) block of already-approved
// wording. Each paragraph gets its own color, cycling through
// COLOR_ROTATION, matching the source doc's "purple, magenta and cyan"
// instruction rather than only ever using two fixed colors.
export function compileLetterHtml({ client, bureau, inquiries, bodyText }) {
  const { street, cityStateZip } = splitAddress(client?.address);
  const bureauAddress = BUREAU_ADDRESSES[bureau] || ["", ""];
  const letterDate = new Date().toLocaleDateString("en-US");
  const fullName = client?.full_name || "Client";

  const inquiryLines = (Array.isArray(inquiries) ? inquiries : [])
    .map((i) => `<strong>${esc(i.creditor)}</strong>&nbsp;&nbsp;&nbsp;${esc(i.date)}`)
    .join("<br/>");

  const bodyParagraphs = String(bodyText || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bodyHtml = bodyParagraphs
    .map((p, i) => `<p><span style="color:${COLOR_ROTATION[i % COLOR_ROTATION.length]}">${esc(p)}</span></p>`)
    .join("\n  ");

  return `
<div class="letter-page letter-banner">
  <p style="text-align:center;font-weight:bold;font-size:14pt;margin-bottom:4px;">This is an actual person, NOT a third party</p>
  <p style="text-align:center;font-weight:bold;font-size:13pt;margin-bottom:16px;">ATTENTION ${esc(bureau)}</p>
  <p><span style="color:${COLOR_ROTATION[0]}">${esc(BANNER_ASSERTION)}</span></p>
</div>
<div class="letter-page letter-body">
  <p>${esc(fullName)}<br/>${esc(street)}<br/>${esc(cityStateZip)}<br/>Date of Birth: ${esc(client?.dob || "")}<br/>SSN: ${esc(maskSsn(client?.ssn))}</p>
  <p>${esc(letterDate)}</p>
  <p>${esc(bureau)}<br/>${esc(bureauAddress[0])}<br/>${esc(bureauAddress[1])}</p>
  <p>To ${esc(bureau)},</p>
  ${bodyHtml}
  <p>Please see the list of inquiries below for your review:</p>
  <p>${inquiryLines}</p>
  <p>Thank you for your prompt attention to this matter.</p>
  <p>Sincerely,<br/><strong>${esc(fullName)}</strong></p>
</div>`.trim();
}
