// src/utils/pdfExport.js
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

export async function waitForImages(rootEl) {
  if (!rootEl) return;
  const imgs = Array.from(rootEl.querySelectorAll("img"));
  const pending = imgs
    .filter((img) => !img.complete || img.naturalWidth === 0)
    .map(
      (img) =>
        new Promise((r) => {
          img.onload = img.onerror = () => r();
        })
    );
  if (pending.length) await Promise.allSettled(pending);
}

/** Capture any DOM node to a canvas (hi-dpi, CORS safe) */
export async function captureNodeToCanvas(
  rootEl,
  { scale = Math.max(2, Math.ceil(window.devicePixelRatio || 2)), backgroundColor = "#0B1121" } = {}
) {
  if (!rootEl) throw new Error("captureNodeToCanvas: rootEl is required");
  await delay(20);
  await waitForImages(rootEl);
  const canvas = await html2canvas(rootEl, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor,
    logging: false,
    windowWidth: rootEl.scrollWidth || undefined,
  });
  return canvas;
}

/** Convert DOM pages → [{url,w,h}] for aspect-accurate PDF placement */
export async function pagesToImages(pageEls, opts = {}) {
  const images = [];
  for (const el of pageEls) {
    const canvas = await captureNodeToCanvas(el, opts);
    images.push({ url: canvas.toDataURL("image/jpeg", 1), w: canvas.width, h: canvas.height });
  }
  return images;
}

/** Build multi-page A4 PDF, preserving aspect ratio & centering per page */
export function imagesToPdf(
  images,
  {
    marginMm = 0,
    orientation = "p",
    format = "a4",
    unit = "mm",
    imageType = "JPEG",
    // imageQuality = 1.0,
    docProps = { title: "Report" },
  } = {}
) {
  const pdf = new jsPDF({ orientation, unit, format });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const boxW = pageW - marginMm * 2;
  const boxH = pageH - marginMm * 2;

  images.forEach(({ url, w, h }, idx) => {
    if (idx > 0) pdf.addPage(format, orientation);

    const imgAR = w / h;
    const boxAR = boxW / boxH;
    let drawW, drawH;
    if (imgAR >= boxAR) {
      drawW = boxW;
      drawH = boxW / imgAR;
    } else {
      drawH = boxH;
      drawW = boxH * imgAR;
    }
    const x = marginMm + (boxW - drawW) / 2;
    const y = marginMm + (boxH - drawH) / 2;

    pdf.addImage(url, imageType, x, y, drawW, drawH, undefined, "FAST");
  });

  if (docProps) pdf.setProperties(docProps);
  return pdf;
}
