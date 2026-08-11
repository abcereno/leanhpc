// src/utils/validateDocument.js
//
// Thin wrapper around the validate-document Edge Function — the AI
// validity check for identity documents uploaded via two widgets:
// CoverLetterAssets.jsx (admin, legacy fixed license/ssn/poa docType) and
// CoverLetterAssetsLTOS.jsx (company portal + public intake, LTOS
// identity/address/authorization category system — see that Edge
// Function's header for the full docType-vs-category split). Reuses the
// same classify-inquiries-style pattern: never throws, resolves the file
// to a plain image first so the Edge Function itself never has to reach
// Supabase Storage or handle PDFs.
//
// PDFs are rendered to an image client-side (page 1 only) using the same
// pdfjs-dist pattern UploadReportForm.jsx already uses for OCR, so a
// scanned/e-billed PDF utility statement gets the same AI check an image
// upload does, without adding any new PDF-handling capability to the
// Deno Edge Function.
import { getDocument } from "pdfjs-dist";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/build/pdf.worker";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(blob);
  });
}

async function pdfFirstPageToDataUrl(blob) {
  const buf = await blob.arrayBuffer();
  const pdf = await getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas context is null.");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

// Exported for reuse by src/utils/letterPdf.js, which needs the exact
// same "resolve any uploaded identity-doc blob (image or PDF) to a flat
// image" behavior when embedding license/SSN/POA attachments into a
// generated dispute letter PDF — kept as one shared implementation
// rather than a second pdfjs-dist copy.
export async function resolveToImageDataUrl(blob) {
  if (blob.type === "application/pdf") return pdfFirstPageToDataUrl(blob);
  return blobToDataUrl(blob);
}

// `file` (a File/Blob already in hand, e.g. straight from the upload
// input) is preferred — no network round trip needed. `fileUrl` (a
// signed Storage URL) is the fallback for re-checking an already-
// uploaded document where the original File object no longer exists.
//
// Pass either `docType` (legacy 'license'|'ssn'|'poa', CoverLetterAssets.jsx)
// or `category` ('identity'|'address'|'authorization', CoverLetterAssetsLTOS.jsx)
// — never both. `clientAddress` is only used (and only needed) for
// category:'address' checks — see the Edge Function's addressNote.
//
// On success: { success: true, status, confidence, expiresAt, issuedAt,
// reasoning, detectedType }. issuedAt is only populated for identity
// documents (license/state ID/passport) — the model also extracts it so
// the Edge Function can cross-check it didn't mix up the issue date with
// the expiration date (the two sit right next to each other on a license
// and are easy to misread). detectedType is null for docType requests
// (legacy system has no auto-detection concept) and one of the category's
// allowed type keys (or "unknown") for category requests.
// On any failure (network error, Edge Function error): { success: false,
// reasoning } — callers should NOT persist a status in this case; leave
// whatever validation_status is already on the row untouched rather than
// overwriting a real prior result with an artifact of a failed retry.
export async function validateDocument({ docType, category, file, fileUrl, clientName, clientAddress }) {
  try {
    const blob = file || (fileUrl ? await (await fetch(fileUrl)).blob() : null);
    if (!blob) throw new Error("No file provided to validate.");

    const imageDataUrl = await resolveToImageDataUrl(blob);
    const today = new Date().toISOString().slice(0, 10);

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate-document`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ docType, category, imageDataUrl, clientName, clientAddress, today }),
      }
    );
    const result = await res.json();
    if (!result?.success) {
      console.warn("validate-document returned an error:", result?.error);
      return { success: false, reasoning: result?.error || "Validation failed." };
    }
    return result;
  } catch (err) {
    console.warn("validate-document call failed:", err);
    return { success: false, reasoning: err?.message || "Validation failed." };
  }
}
