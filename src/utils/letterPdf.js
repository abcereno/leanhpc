// src/utils/letterPdf.js
//
// Renders an edited in-house dispute letter (LetterEditorModal.jsx) to a
// PDF blob: the two `.letter-page` sections produced by
// letterTemplate.js#compileLetterHtml (rendered exactly as the staff
// left them after editing in Tiptap — "what you edit is what gets
// saved", no separate re-parsing step), followed by one page per
// license/SSN/POA asset, matching what the existing Apps Script letter
// flow already attaches (see useInquiriesThread.js#generateDisputeLetters's
// `assets` payload).
//
// Renders via html2canvas directly (already a dependency) rather than
// jsPDF's own .html() wrapper — that wrapper renders a BLANK page for a
// container positioned off-screen (e.g. `left:-9999px`, the standard
// "hide it while still rendering it" trick used here originally):
// html2canvas's automatic scroll-offset detection gets confused by large
// negative coordinates and captures an empty canvas instead of throwing,
// so the bug shows up as pages that are just silently blank, not an
// error. Calling html2canvas ourselves with explicit x/y/scroll options
// sidesteps that entirely. react-pdf isn't used here because it can't
// render arbitrary HTML/inline styles the way a rich-text editor
// produces them — this way the PDF is a direct rasterization of the
// exact HTML the staff edited, colors included.
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { resolveToImageDataUrl } from "./validateDocument";

// Exported (not just PAGE_MARGIN_IN/CONTENT_WIDTH_IN) so LetterEditorModal.jsx
// can render the on-screen editor as a full 8.5x11 "page" — white rectangle,
// with the same 0.75in inset the PDF actually prints with — instead of just
// a same-width text column with no visible page edges. Single source of
// truth for all of it, so the preview can't silently drift from the PDF.
export const PAGE_MARGIN_IN = 0.75;
export const PAGE_WIDTH_IN = 8.5;
export const PAGE_HEIGHT_IN = 11;
export const CONTENT_WIDTH_IN = PAGE_WIDTH_IN - PAGE_MARGIN_IN * 2;
export const LETTER_TYPOGRAPHY_CSS = "font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#000;";
const PAGE_CONTENT_HEIGHT_IN = PAGE_HEIGHT_IN - PAGE_MARGIN_IN * 2;

function extractPageHtml(fullHtml, className) {
  const doc = new DOMParser().parseFromString(fullHtml || "", "text/html");
  const el = doc.querySelector(`.${className}`);
  return el ? el.outerHTML : "";
}

async function renderHtmlPage(pdf, html, isFirstPageOfDoc) {
  const container = document.createElement("div");
  // Positioned on-page at (0,0) — NOT off-screen — with z-index below
  // everything else so it doesn't visibly flash. html2canvas needs the
  // element at real, in-viewport coordinates to capture it correctly;
  // negative-offset containers are what produced blank pages before.
  container.style.cssText = `position:absolute;top:0;left:0;z-index:-1;width:${CONTENT_WIDTH_IN}in;background:#fff;padding:0;margin:0;${LETTER_TYPOGRAPHY_CSS}`;
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      windowWidth: container.scrollWidth,
      windowHeight: container.scrollHeight,
    });

    const pxToIn = CONTENT_WIDTH_IN / canvas.width;
    const totalHeightIn = canvas.height * pxToIn;

    // Slice tall content (long letters, many inquiries) across multiple
    // physical PDF pages — driving addImage ourselves means we lost
    // jsPDF's built-in autoPaging, so this replaces it.
    let renderedIn = 0;
    let firstSlice = true;
    while (renderedIn < totalHeightIn) {
      if (!(isFirstPageOfDoc && firstSlice)) pdf.addPage();
      const sliceHeightIn = Math.min(PAGE_CONTENT_HEIGHT_IN, totalHeightIn - renderedIn);
      const srcYPx = renderedIn / pxToIn;
      const srcHeightPx = sliceHeightIn / pxToIn;

      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = Math.max(1, Math.round(srcHeightPx));
      sliceCanvas.getContext("2d").drawImage(
        canvas,
        0, srcYPx, canvas.width, srcHeightPx,
        0, 0, canvas.width, sliceCanvas.height
      );

      pdf.addImage(sliceCanvas.toDataURL("image/png"), "PNG", PAGE_MARGIN_IN, PAGE_MARGIN_IN, CONTENT_WIDTH_IN, sliceHeightIn);

      renderedIn += sliceHeightIn;
      firstSlice = false;
    }
  } finally {
    document.body.removeChild(container);
  }
}

async function appendImagePage(pdf, url) {
  if (!url) return;
  try {
    const blob = await (await fetch(url)).blob();
    const dataUrl = await resolveToImageDataUrl(blob);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("Could not load asset image"));
      img.src = dataUrl;
    });

    pdf.addPage();
    const maxW = PAGE_WIDTH_IN - PAGE_MARGIN_IN * 2;
    const maxH = PAGE_HEIGHT_IN - PAGE_MARGIN_IN * 2;
    const ratio = img.width / img.height;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const x = PAGE_MARGIN_IN + (maxW - w) / 2;
    const y = PAGE_MARGIN_IN + (maxH - h) / 2;
    const format = /^data:image\/jpe?g/i.test(dataUrl) ? "JPEG" : "PNG";
    pdf.addImage(dataUrl, format, x, y, w, h);
  } catch (err) {
    // Best-effort — a failed attachment page (e.g. expired signed URL)
    // should never block the letter body itself from being saved.
    console.warn("Could not attach asset page to letter PDF:", err);
  }
}

// `html` — the current edited HTML from editor.getHTML(), containing the
// `.letter-banner` / `.letter-body` sections from letterTemplate.js.
// `assets` — { licenseUrl, ssnUrl, poaUrl } signed Storage URLs, same
// shape CoverLetterAssets.jsx/useInquiriesThread.js already use.
export async function generateLetterPdfBlob({ html, assets }) {
  const pdf = new jsPDF({ orientation: "p", unit: "in", format: "letter" });

  const bannerHtml = extractPageHtml(html, "letter-banner");
  const bodyHtml = extractPageHtml(html, "letter-body");

  let renderedAny = false;
  if (bannerHtml) {
    await renderHtmlPage(pdf, bannerHtml, true);
    renderedAny = true;
  }
  if (bodyHtml) {
    await renderHtmlPage(pdf, bodyHtml, !renderedAny);
    renderedAny = true;
  }
  // If the editor's page-marker divs got stripped somehow, fall back to
  // rendering the raw edited HTML as a single page rather than producing
  // an empty PDF.
  if (!renderedAny) {
    await renderHtmlPage(pdf, html, true);
  }

  await appendImagePage(pdf, assets?.licenseUrl);
  await appendImagePage(pdf, assets?.ssnUrl);
  await appendImagePage(pdf, assets?.poaUrl);

  return pdf.output("blob");
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
