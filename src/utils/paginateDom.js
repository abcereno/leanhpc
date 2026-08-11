// src/utils/paginateDom.js
// One block per page pagination for an existing .print-root.
// We clone each [data-block="true"] into its own fixed A4 page.
// If a block is taller than the content area, we shrink-to-fit (no clipping).

const PAGE_W = 794;   // A4 @ ~96dpi
const PAGE_H = 1123;
const PAD    = 24;    // inner padding

function newPage() {
  const root = document.createElement("div");
  root.className = "report-page";
  Object.assign(root.style, {
    width: `${PAGE_W}px`,
    height: `${PAGE_H}px`,
    background: "#0B1121",
    boxSizing: "border-box",
    border: "1px solid #dddfe4",
    borderRadius: "8px",
    margin: "0 0 16px 0",
    overflow: "hidden",
  });

  const content = document.createElement("div");
  Object.assign(content.style, {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    padding: `${PAD}px`,
  });

  root.appendChild(content);
  return { root, content };
}

function cloneBlock(el) {
  const c = el.cloneNode(true);
  // Respect "no split" intent
  c.style.breakInside = "avoid";
  c.style.pageBreakInside = "avoid";
  return c;
}

/**
 * Paginate from the *rendered* .print-root (React-managed, hidden off-screen)
 * without mutating it. We create ONE PAGE per [data-block="true"].
 * If no blocks exist, we treat the whole root as one page.
 *
 * Returns `{ portalEl, pages[] }`
 */
export function paginateFromPrintRoot(printRootEl, { shrinkToFit = true } = {}) {
  if (!printRootEl) throw new Error("paginateFromPrintRoot: printRootEl required");

  // Create a portal attached to DOM so measurements work
  const portalEl = document.createElement("div");
  Object.assign(portalEl.style, {
    position: "absolute",
    left: "-99999px",
    top: "0",
    width: `${PAGE_W}px`,
    background: "#0B1121",
  });
  document.body.appendChild(portalEl);

  // Container to hold all generated pages
  const host = document.createElement("div");
  host.style.width = `${PAGE_W}px`;
  portalEl.appendChild(host);

  // Collect blocks (each becomes its own page)
  let blocks = Array.from(printRootEl.querySelectorAll('[data-block="true"]'));
  if (!blocks.length) blocks = [printRootEl];

  const usableH = PAGE_H - PAD * 2;

  for (const b of blocks) {
    const page = newPage();
    host.appendChild(page.root);

    const clone = cloneBlock(b);
    page.content.appendChild(clone);

    // Measure and optionally shrink-to-fit if taller than the usable area
    const h = clone.offsetHeight;
    if (shrinkToFit && h > usableH) {
      const scale = usableH / Math.max(h, 1);
      // Scale down the block so it fits entirely on the page without clipping
      Object.assign(clone.style, {
        transform: `scale(${scale})`,
        transformOrigin: "top left",
        width: `${(clone.offsetWidth || (PAGE_W - PAD * 2))}px`,
        // After scaling, keep it top-left; extra space remains empty (by design)
      });
    }
  }

  const pages = Array.from(host.querySelectorAll(".report-page"));
  return { portalEl, pages };
}

export function destroyPaginatedPortal(portalEl) {
  if (portalEl && portalEl.parentNode) portalEl.parentNode.removeChild(portalEl);
}
