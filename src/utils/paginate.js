// src/utils/paginate.js
// Build pages while attached to a hidden measurement host in the DOM,
// so offsetHeight measurements are correct. Then detach and return.

function newPage(pageWidthPx, pageHeightPx, pagePaddingPx) {
  const root = document.createElement("div");
  root.className = "report-page";
  Object.assign(root.style, {
    width: `${pageWidthPx}px`,
    height: `${pageHeightPx}px`,
    background: "#ffffff",
    boxSizing: "border-box",
    border: "1px solid #e5e5e5",
    borderRadius: "8px",
    margin: "0 auto 16px auto",
    overflow: "hidden",
  });

  const content = document.createElement("div");
  Object.assign(content.style, {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    padding: `${pagePaddingPx}px`,
  });

  root.appendChild(content);
  return { root, content };
}

function shallowClone(el) {
  const clone = document.createElement(el.tagName.toLowerCase());
  for (const { name, value } of Array.from(el.attributes)) {
    clone.setAttribute(name, value);
  }
  clone.style.breakInside = "avoid";
  clone.style.pageBreakInside = "avoid";
  return clone;
}

function placeBlockOrSplit({
  sourceBlock,
  page,
  wrapper,
  usable,
  gapPx,
  pageWidthPx,
  pageHeightPx,
  pagePaddingPx,
  usedRef,
}) {
  // Try to place whole block
  const fullClone = sourceBlock.cloneNode(true);
  fullClone.style.breakInside = "avoid";
  fullClone.style.pageBreakInside = "avoid";
  fullClone.style.marginBottom = `${gapPx}px`;

  page.content.appendChild(fullClone);
  const h = fullClone.offsetHeight;

  if (usedRef.value + h <= usable) {
    usedRef.value += h + gapPx;
    return page;
  }

  // Whole block too tall for a single page? Split by children.
  if (h > usable) {
    page.content.removeChild(fullClone);

    let shell = shallowClone(sourceBlock);
    shell.style.marginBottom = `${gapPx}px`;
    page.content.appendChild(shell);

    const kids = Array.from(sourceBlock.childNodes);
    for (const kid of kids) {
      let kidClone;
      if (kid.nodeType === Node.ELEMENT_NODE) {
        kidClone = kid.cloneNode(true);
      } else if (kid.nodeType === Node.TEXT_NODE) {
        const wrap = document.createElement("div");
        wrap.textContent = kid.textContent || "";
        kidClone = wrap;
      } else continue;

      shell.appendChild(kidClone);
      const shellHeight = shell.offsetHeight;

      if (usedRef.value + shellHeight > usable) {
        shell.removeChild(kidClone);

        const finalShellHeight = shell.offsetHeight;
        if (finalShellHeight > 0) {
          usedRef.value += finalShellHeight + gapPx;
        }

        // finalize current page and start a new one
        wrapper.appendChild(page.root);
        page = newPage(pageWidthPx, pageHeightPx, pagePaddingPx);
        usedRef.value = 0;

        shell = shallowClone(sourceBlock);
        shell.style.marginBottom = `${gapPx}px`;
        page.content.appendChild(shell);
        shell.appendChild(kidClone);
      }
    }

    usedRef.value += shell.offsetHeight + gapPx;
    return page;
  }

  // Fits on a fresh page (but not current)
  page.content.removeChild(fullClone);
  wrapper.appendChild(page.root);

  const newPg = newPage(pageWidthPx, pageHeightPx, pagePaddingPx);
  newPg.content.appendChild(fullClone);
  usedRef.value = fullClone.offsetHeight + gapPx;
  return newPg;
}

export function paginateBlocks(
  sourceRoot,
  {
    pageWidthPx = 794,   // A4 @ ~96dpi
    pageHeightPx = 1123, // A4 @ ~96dpi
    pagePaddingPx = 24,
    gapPx = 16,
  } = {}
) {
  if (!sourceRoot) throw new Error("paginateBlocks: sourceRoot required");
  const blocks = Array.from(sourceRoot.querySelectorAll('[data-block="true"]'));
  if (!blocks.length) throw new Error("paginateBlocks: no blocks found (enable printMode)");

  // 1) Create a hidden measurement host attached to the DOM
  const host = document.createElement("div");
  Object.assign(host.style, {
    position: "absolute",
    left: "-99999px",
    top: "0",
    width: `${pageWidthPx}px`,
    background: "#fff",
  });
  document.body.appendChild(host);

  // 2) Build wrapper + first page INSIDE the host (so measurements work)
  const wrapper = document.createElement("div");
  wrapper.style.width = `${pageWidthPx}px`;
  wrapper.style.background = "transparent";
  host.appendChild(wrapper);

  let page = newPage(pageWidthPx, pageHeightPx, pagePaddingPx);
  wrapper.appendChild(page.root); // attach first page before measuring
  const usable = pageHeightPx - pagePaddingPx * 2;
  const usedRef = { value: 0 };

  for (const b of blocks) {
    page = placeBlockOrSplit({
      sourceBlock: b,
      page,
      wrapper,
      usable,
      gapPx,
      pageWidthPx,
      pageHeightPx,
      pagePaddingPx,
      usedRef,
    });
  }

  // 3) Detach wrapper from host (keep wrapper with pages), then remove host
  host.removeChild(wrapper);
  if (host.parentNode) host.parentNode.removeChild(host);

  return wrapper;
}
