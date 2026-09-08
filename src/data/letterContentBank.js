// src/data/letterContentBank.js
//
// Pre-written dispute-letter body content, transcribed from the client's
// own letter-template reference doc ("letter template11_21_25.pdf" —
// itself headed "Always Change the color of the fonts to purple,
// magenta and cyan", confirming the colored-text convention already
// applied in src/utils/letterTemplate.js is intentional, not decorative).
//
// Per the client, this whole bank replaces live OpenAI paragraph
// generation as the default content source — see LetterEditorModal.jsx.
// It's a static, already-approved wording library ("we have a lot of
// version so its not the same per client"): the generator ROTATES
// through these per client/bureau instead of asking an LLM to improvise
// new legal wording every time.
//
// Two distinct letter types, per the client's explicit answer
// ("Different letter types") — pick one via the "Letter Type" dropdown
// in LetterEditorModal.jsx, deliberately NOT auto-selected by round or
// any other rule the client didn't specify:
//
// - STANDARD_INQUIRY_LETTERS: plain "I never authorized this inquiry"
//   wording, citing 15 U.S.C. §1681b (permissible purpose) and §1681e(b)
//   (accuracy) — closest to the earlier real bureau-letter samples.
// - IDENTITY_THEFT_LETTERS: the same core demand (block/delete,
//   negligent noncompliance under FCRA §617, up to $1,000/violation
//   statutory damages, 7-day deadline before "legal action"/lawsuit),
//   but framed as the disputed items resulting from identity theft. The
//   client confirmed this is standard practice for every client here,
//   not limited to clients who reported an actual identity-theft case —
//   that's a business/compliance decision the client made explicitly,
//   not one inferred or defaulted by this code.
//
// Only entries that had real, extracted body text in the source PDF are
// included below (several "Version N"/"Letter N" slots in that doc were
// empty headers with no body — skipped rather than invented). A few
// obvious OCR/typography artifacts (missing spaces, "immediatley" /
// "appreaciated") were cleaned up since this text goes out as real
// correspondence — no wording/legal substance was changed.
//
// Each entry is the letter's core paragraphs only — no header block,
// salutation, inquiry list, or sign-off. compileLetterHtml (letterTemplate.js)
// supplies all of that structure and only slots this text in as the
// colored body paragraphs.
export const STANDARD_INQUIRY_LETTERS = [
  `I am formally disputing an inquiry listed on my consumer report because I never consented to it. Under 15 U.S.C. § 1681b, businesses are prohibited from accessing my credit report without a legally permissible purpose. This inquiry was not authorized by me.

Pursuant to 15 U.S.C. § 1681e(b), your agency is responsible for maintaining accurate credit information. Reporting an unauthorized inquiry fails to meet this legal requirement and adversely affects my creditworthiness.

Please provide written verification of my authorization. If no such proof exists, I demand the immediate removal of this inquiry and written confirmation that it has been deleted.`,

  `I dispute the inquiry appearing on my consumer report because I have no knowledge of authorizing it. Pursuant to 15 U.S.C. § 1681b, a company must have a lawful purpose before obtaining my credit information. This inquiry appears unauthorized.

Under 15 U.S.C. § 1681e(b), consumer reporting agencies are required to maintain accurate information. An unauthorized inquiry is inaccurate and should not remain on my credit report.

Please send proof that I authorized this inquiry. If you are unable to verify it, remove the inquiry immediately and provide written confirmation of the deletion.`,

  `I am disputing an inquiry on my credit report because I never authorized anyone to obtain my consumer report. Pursuant to 15 U.S.C. § 1681b, companies must have a permissible purpose before accessing my credit information. This inquiry appears invalid.

Under 15 U.S.C. § 1681e(b), reporting agencies are obligated to ensure the maximum possible accuracy of the information they report. This unauthorized inquiry is damaging to my credit profile and should be corrected immediately.

Please provide written evidence of my authorization. If you cannot, delete the inquiry promptly and send written confirmation to my address.`,

  `I am formally disputing an inquiry reported on my consumer file because I did not authorize it. Under 15 U.S.C. § 1681b, no company may access my credit report without a legally permissible purpose. This inquiry appears to be unauthorized.

Pursuant to 15 U.S.C. § 1681e(b), your agency must assure maximum possible accuracy when reporting consumer information. An unauthorized inquiry does not meet this standard and should be removed.

Please provide proof that I authorized this inquiry. If no documentation exists, remove it immediately and notify me in writing.`,

  `I am disputing an inquiry reflected on my credit report because I never requested or authorized it. Pursuant to 15 U.S.C. § 1681b, access to my consumer report requires a lawful permissible purpose. This inquiry appears fraudulent.

Under 15 U.S.C. § 1681e(b), reporting agencies have a legal duty to report only accurate information. Reporting an unauthorized inquiry violates this obligation and negatively impacts my creditworthiness.

Please provide documentation showing my authorization. Otherwise, delete the inquiry immediately and send written confirmation of its removal.`,

  `I am submitting this dispute regarding an inquiry appearing on my consumer report because I never authorized it. Under 15 U.S.C. § 1681b, businesses may not obtain my credit information without a permissible purpose. This inquiry appears unauthorized.

Pursuant to 15 U.S.C. § 1681e(b), your agency must ensure maximum possible accuracy in all reported information. This inaccurate inquiry should be corrected without delay.

Please send proof that I authorized this inquiry. If you cannot provide such proof, remove the inquiry immediately and confirm the deletion in writing.`,

  `I am formally disputing the unauthorized inquiries listed on my credit report. Under 15 U.S.C. § 1681b, businesses are prohibited from accessing consumer reports without permissible purpose. I never consented to this inquiry and believe it was reported in error.

In accordance with 15 U.S.C. § 1681i, I request a complete reinvestigation into this matter. If you are unable to provide signed authorization documents proving my consent, this inquiry must be deleted immediately.

Please notify me once corrections have been made to my report. Your prompt compliance with the Fair Credit Reporting Act is expected and appreciated.`,

  `I am writing to formally dispute an inquiry appearing on my consumer report that I did not authorize. Under 15 U.S.C. § 1681b, access to my credit information is only permitted for a lawful purpose. This inquiry appears unauthorized.

Pursuant to 15 U.S.C. § 1681e(b), your agency is responsible for ensuring the accuracy of the information it reports. Reporting an unauthorized inquiry violates this requirement.

Please provide documentation proving my authorization. If you cannot, delete the inquiry immediately and send written confirmation to my address.`,

  `I am disputing an inquiry on my credit report because I never consented to it. Pursuant to 15 U.S.C. § 1681b, companies may not obtain my consumer report without a permissible purpose. This inquiry appears unauthorized or fraudulent.

Under 15 U.S.C. § 1681e(b), consumer reporting agencies are required to report only accurate information. An unauthorized inquiry harms my credit profile and should be removed immediately.

Please provide written verification of my authorization. If none exists, delete the inquiry immediately and send written confirmation of the deletion.`,

  `I formally dispute the inquiry appearing on my consumer report because I never authorized it. Under 15 U.S.C. § 1681b, businesses are prohibited from accessing my credit report without a lawful permissible purpose. This inquiry is unauthorized.

Pursuant to 15 U.S.C. § 1681e(b), your agency must ensure maximum possible accuracy in consumer reporting. Continuing to report an unauthorized inquiry violates this obligation.

Please provide proof of authorization. If you are unable to verify the inquiry, remove it immediately and provide written confirmation.`,

  `I am disputing the inquiry listed on my consumer report because I never authorized or approved it. Pursuant to 15 U.S.C. § 1681b, companies must have a legally permissible purpose before obtaining my credit information. This inquiry appears unauthorized.

Under 15 U.S.C. § 1681e(b), consumer reporting agencies have a duty to ensure the maximum possible accuracy of all reported information. Reporting an unauthorized inquiry fails to meet this legal standard and damages my creditworthiness.

Please send written proof that I authorized this inquiry. If you cannot provide such proof, remove the inquiry immediately and mail written confirmation of the deletion to my address.`,
];

export const IDENTITY_THEFT_LETTERS = [
  `I am writing to formally notify your agency of violations of the Fair Credit Reporting Act, 15 U.S.C. §1681 et seq. My credit report contains information that resulted from identity theft. I did not authorize the transactions or inquiries associated with these entries.

At no time did I provide written authorization for this information to be furnished to my credit file. Pursuant to the FCRA, I demand the immediate blocking and deletion of all fraudulent items from my report.

Your failure to properly investigate and remove these inaccuracies may constitute negligent noncompliance under Section 617 of the FCRA, which carries potential civil liability. I intend to enforce my rights under federal law if necessary.

Consumers have the right to dispute inaccurate reporting and require its correction or removal. Statutory damages range from $100 to $1,000 per violation. I demand the maximum statutory damages of $1,000 per violation or the immediate removal of the inaccurate information.

If this matter is not resolved within seven (7) days of receipt of this notice, I will proceed with legal action.`,

  `I am contacting your agency regarding fraudulent information appearing on my credit report. The entries I am disputing resulted from identity theft, and I did not authorize the activity connected to them. At no point did I provide written authorization allowing this information to be furnished to my credit file.

The Fair Credit Reporting Act protects consumers from inaccurate reporting and requires consumer reporting agencies to investigate disputed information. I demand the immediate blocking and deletion of all fraudulent entries associated with my identity. Continuing to report inaccurate information may constitute negligent noncompliance under the FCRA.

Please resolve this matter promptly. If these inaccuracies are not removed within seven (7) days after receiving this notice, I will pursue all legal remedies available to me.`,

  `Please accept this correspondence as my formal dispute regarding inaccurate information appearing on my credit report. The disputed entries were caused by identity theft, and I never authorized the activity associated with them. I also never gave written consent for this information to be reported under my name.

Federal law provides consumers with the right to accurate credit reporting. Under the Fair Credit Reporting Act, I request that your agency immediately block and delete every fraudulent item from my credit file. Failure to properly investigate these inaccuracies may constitute negligent noncompliance.

I expect prompt resolution of this matter. If these inaccurate entries remain after seven (7) days, I will exercise my rights under federal law and seek all available remedies.`,

  `This letter is to notify your agency that my credit report contains fraudulent information resulting from identity theft. I did not authorize any inquiries, transactions, or reporting associated with these disputed entries. As such, they should not remain on my consumer credit report.

The Fair Credit Reporting Act grants consumers the right to dispute inaccurate information and requires consumer reporting agencies to investigate and correct reporting errors. I request the immediate deletion and blocking of every fraudulent item associated with my identity. Continued reporting of inaccurate information may violate the FCRA.

I expect written confirmation once these corrections have been completed. If this issue remains unresolved within seven (7) days, I will pursue all legal remedies available to me.`,

  `I am formally disputing information on my credit report that resulted from identity theft. The activity reflected by these entries was not authorized by me, and I never consented to having this information reported under my name. These records are inaccurate and should be removed immediately.

The Fair Credit Reporting Act requires your agency to investigate disputed information and remove inaccurate or fraudulent reporting. I request the immediate blocking and deletion of every item associated with this identity theft. Failure to fulfill these obligations may constitute negligent noncompliance under federal law.

Please resolve this dispute as quickly as possible. If these inaccurate items remain after seven (7) days from receipt of this notice, I will pursue all available legal options.`,

  `Please consider this formal notice that your agency is currently violating the Fair Credit Reporting Act. My credit history includes fraudulent transactions that occurred because of identity theft. I never authorized or took part in any of the inquiries or accounts in question.

No written authorization was ever given by me to furnish this inaccurate data to my file. Under federal law, I demand the immediate blocking and removal of all fraudulent items from my report. Your failure to investigate this dispute will result in negligent noncompliance under Section 617 of the FCRA.

The FCRA gives consumers the power to dispute incorrect reporting and force its removal. I demand the maximum statutory damages of $1,000 per infraction or the instant deletion of the records. If this matter is not resolved within seven (7) days of receiving this notice, I will file a lawsuit.`,

  `I am writing to formally alert you to violations of the Fair Credit Reporting Act regarding my file. My credit report contains damaging information that is the result of identity theft. I did not approve or authorize any of these specific entries or inquiries.

I never provided written authorization for this data to be added to my credit profile. Pursuant to the FCRA, I demand that you immediately block and delete all fraudulent items. If you fail to properly investigate, it may constitute negligent noncompliance under Section 617, and I will enforce my rights.

Consumers are legally entitled to dispute inaccurate reporting and demand its removal. I demand the maximum statutory damages of $1,000 per violation or the immediate removal of the false information. If this is not resolved within seven (7) days of receipt, I will proceed with formal legal action.`,

  `I am writing to formally notify your bureau of violations of the Fair Credit Reporting Act, 15 U.S.C. §1681. My credit history contains fraudulent information resulting from a serious case of identity theft. I never authorized any of the transactions or inquiries listed.

I never provided written consent for this data to be furnished to my credit file. Under the FCRA, I demand the immediate blocking and deletion of all fraudulent items. A failure to investigate and remove these errors will constitute negligent noncompliance under Section 617, and I will enforce my rights.

The law grants consumers the right to dispute inaccurate reporting and demand its deletion. I demand the maximum statutory damages of $1,000 per violation or the immediate removal of the data. If this is not resolved within seven (7) days of receipt, I will proceed with litigation.`,

  `Please be advised that your agency is in violation of the Fair Credit Reporting Act regarding my profile. My credit report contains inaccurate details that resulted entirely from identity theft. I did not authorize any of the inquiries or transactions associated with these accounts.

I have never provided written authorization for this information to be furnished to my credit file. Pursuant to the FCRA, I demand that you immediately block and delete these fraudulent items. Failure to properly investigate will constitute negligent noncompliance under Section 617, carrying civil liability.

Consumers possess the right to dispute inaccurate reporting and require its removal. I demand the maximum statutory damages of $1,000 per violation or the immediate correction of my file. If this matter is not resolved within seven (7) days, I will proceed with legal action.`,

  `This letter is formal notice that your company is violating the Fair Credit Reporting Act. My credit report includes inaccurate entries that resulted from identity theft. I never authorized the transactions or credit inquiries associated with these specific items.

I never gave written authorization for this information to be furnished to my credit file. Under the FCRA, I demand the immediate blocking and deletion of all fraudulent records. Failure to investigate this matter properly constitutes negligent noncompliance under Section 617, which carries civil liability.

Every consumer has the right to dispute inaccurate reporting and force its correction. I demand the maximum statutory damages of $1,000 per violation or the immediate removal of the errors. If this is not resolved within seven (7) days of receipt, I will proceed with legal action.`,

  `I am writing to formally notify your agency of violations of the Fair Credit Reporting Act, 15 U.S.C. §1681. My credit file contains fraudulent information that is the direct result of identity theft. I did not authorize the transactions or inquiries listed in these entries.

At no time did I provide written authorization for this data to be furnished to my credit file. Pursuant to the FCRA, I demand the immediate blocking and deletion of all fraudulent items. Failure to investigate and remove these inaccuracies constitutes negligent noncompliance under Section 617.

Consumers have the right to dispute inaccurate reporting and require its immediate removal. I demand the maximum statutory damages of $1,000 per violation or the immediate removal of the information. If this matter is not resolved within seven (7) days, I will proceed with legal action.`,

  `Please accept this as formal notice of violations of the Fair Credit Reporting Act regarding my credit profile. My report contains inaccurate information that resulted entirely from identity theft. I did not authorize any of the transactions or inquiries associated with these entries.

I never provided written authorization for this information to be furnished to my credit file. Under the FCRA, I demand the immediate blocking and deletion of all fraudulent items. Your failure to properly investigate constitutes negligent noncompliance under Section 617, and I am prepared to enforce my rights.

Consumers have the legal right to dispute inaccurate reporting and require its removal. I demand the maximum statutory damages of $1,000 per violation or the immediate removal of the inaccurate information. If this matter is not resolved within seven (7) days, I will proceed with legal action.`,
];

export const LETTER_TYPES = {
  standard: { label: "Standard Inquiry Dispute", bank: STANDARD_INQUIRY_LETTERS },
  identity_theft: { label: "Identity Theft Escalation", bank: IDENTITY_THEFT_LETTERS },
};

// Banner-page "this is a real person, not a form letter" assertion — used
// to be a single fixed string in letterTemplate.js's BANNER_ASSERTION,
// identical on every letter regardless of client, bureau, or round. That
// was the one piece of every generated letter guaranteed to be word-for-
// word the same as the last one, which is exactly what this bank exists
// to fix (per the client's explicit ask: "do not make the same letter
// that used previously"). Rotated the same way the body content is,
// below.
//
// [0] is letterTemplate.js's original wording, kept as the default/
// fallback so nothing changes for any code path that doesn't pass a
// bannerText. [1] and [2] are the client's own wording, given directly as
// an "example" + its "revise" — added verbatim, no wording invented here
// (same rule the body banks above follow).
export const BANNER_ASSERTIONS = [
  "I am the person named on this credit file contacting you directly — this is not a form letter from a credit repair company. I did not authorize the inquiries listed in this letter and am requesting their removal, along with documentation proving permissible purpose bearing my signature.",
  "I am writing to formally dispute the hard inquiries listed below that appear on my credit report. I am the consumer identified on this credit file, and I am submitting this dispute directly and personally, not through a credit repair organization or any other third party.",
  "I am submitting this dispute directly and personally as the consumer identified above, not through a third party.",
];

// Cheap, dependency-free string hash — only needs to spread different
// client/bureau combinations across a bank, not cryptographic strength.
function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Shared core behind every bank's rotation below (body-content banks via
// LETTER_TYPES, and BANNER_ASSERTIONS) — one hash/index implementation
// instead of a copy per bank.
function initialIndexForBank(bank, clientId, bureau) {
  if (!bank.length) return 0;
  return hashString(`${clientId}|${bureau}`) % bank.length;
}
function nextIndexForBank(bank, currentIndex) {
  if (!bank.length) return 0;
  return (currentIndex + 1) % bank.length;
}
function textForBank(bank, index) {
  if (!bank.length) return "";
  return bank[((index % bank.length) + bank.length) % bank.length];
}

// Deterministic starting variant for a given client+bureau (so the same
// client always opens to the same version rather than reshuffling every
// time the modal is reopened), spread across the bank so different
// clients land on different versions ("not the same per client").
// Callers cycle to a different index afterward via nextVariantIndex if
// staff want to swap it for another version from the same bank.
export function initialVariantIndex(letterTypeKey, clientId, bureau) {
  return initialIndexForBank(LETTER_TYPES[letterTypeKey]?.bank || [], clientId, bureau);
}

export function nextVariantIndex(letterTypeKey, currentIndex) {
  return nextIndexForBank(LETTER_TYPES[letterTypeKey]?.bank || [], currentIndex);
}

export function getVariantText(letterTypeKey, index) {
  return textForBank(LETTER_TYPES[letterTypeKey]?.bank || [], index);
}

// Same rotation, for the banner-assertion bank above — kept as its own
// small set of functions rather than overloading the letterType-keyed
// ones above, since BANNER_ASSERTIONS isn't part of LETTER_TYPES (it's
// used on every letter regardless of which body bank is selected).
export function initialBannerIndex(clientId, bureau) {
  return initialIndexForBank(BANNER_ASSERTIONS, clientId, bureau);
}

export function nextBannerIndex(currentIndex) {
  return nextIndexForBank(BANNER_ASSERTIONS, currentIndex);
}

export function getBannerText(index) {
  return textForBank(BANNER_ASSERTIONS, index);
}
