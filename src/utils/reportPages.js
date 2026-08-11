// src/utils/reportPages.js
// Build fixed-size A4 pages (794x1123 @ ~96dpi) as pure DOM nodes.
// Page 1: header + summary + first slice of each long section
// Continuation pages: remaining items in clean 2-column layout.

const PAGE_W = 794;
const PAGE_H = 1123;
const PAD = 24;

const FIRST_LIMIT = 8;   // items per list on Page 1
const CONT_LIMIT = 24;   // items per continuation page (total)

export function createPortal(widthPx = PAGE_W) {
  const portalEl = document.createElement("div");
  Object.assign(portalEl.style, {
    position: "absolute",
    left: "-99999px",
    top: "0",
    width: `${widthPx}px`,
    background: "#fff",
  });
  document.body.appendChild(portalEl);
  return portalEl;
}

export function destroyPortal(portalEl) {
  if (portalEl && portalEl.parentNode) portalEl.parentNode.removeChild(portalEl);
}

function el(tag, attrs = {}, styles = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) n.setAttribute(k, v);
  }
  Object.assign(n.style, styles);
  for (const c of children) {
    if (typeof c === "string") n.appendChild(document.createTextNode(c));
    else if (c) n.appendChild(c);
  }
  return n;
}

function pageRoot({ titleSuffix } = {}) {
  const root = el("div", {}, {
    width: `${PAGE_W}px`,
    height: `${PAGE_H}px`,
    background: "#fff",
    boxSizing: "border-box",
    border: "1px solid #e5e5e5",
    borderRadius: "8px",
    overflow: "hidden",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    WebkitFontSmoothing: "antialiased",
  });

  const content = el("div", {}, {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    padding: `${PAD}px`,
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "16px",
  });

  const header = el("div", {}, {
    display: "grid",
    gridTemplateColumns: "auto 1fr",
    alignItems: "center",
    gap: "12px",
  }, [
    el("div", {}, { width: "60px", height: "60px", borderRadius: "8px", background: "#f2f2f2" }),
    el("div", {}, {}, [
      el("div", {}, { fontSize: "12px", color: "#6b7280", textTransform: "uppercase", letterSpacing: ".06em" },
        ["Credit Audit Report", titleSuffix ? ` — ${titleSuffix}` : ""]
      )
    ])
  ]);

  content.appendChild(header);
  const body = el("div", {}, { overflow: "hidden" });
  content.appendChild(body);
  root.appendChild(content);
  return { root, body };
}

function sectionTitle(text) {
  return el("div", {}, { fontSize: "16px", fontWeight: "600", margin: "8px 0" }, [text]);
}
function infoRow(label, value) {
  return el("div", {}, { fontSize: "12px", display: "flex", gap: "8px" }, [
    el("div", {}, { color: "#6b7280", minWidth: "120px" }, [label]),
    el("div", {}, {}, [value || "—"]),
  ]);
}
function scoreCard(label, value) {
  return el("div", {}, {
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "10px",
  }, [
    el("div", {}, { fontSize: "12px", color: "#6b7280" }, [label]),
    el("div", {}, { fontSize: "18px", fontWeight: "600" }, [String(value ?? "—")])
  ]);
}
function twoColumnList(items, title) {
  const wrap = el("div");
  if (title) wrap.appendChild(sectionTitle(title));
  const grid = el("div", {}, {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "8px 12px",
  });
  for (const t of items) {
    grid.appendChild(el("div", {}, {
      fontSize: "12px",
      border: "1px solid #e5e7eb",
      borderRadius: "6px",
      padding: "8px",
    }, [t]));
  }
  wrap.appendChild(grid);
  return wrap;
}

function mapDerogItems(items = []) {
  return items.map((d) => {
    const acc = d.accountName || d.account || "Account";
    const issue = d.issue || d.notes || "Issue noted";
    return `${acc}: ${issue}`;
  });
}
function mapPublicRecords(items = []) {
  return items.map((r) => {
    const acc = r.accountName || r.type || "Record";
    const detail = r.issue || r.detail || r.status || "On file";
    return `${acc}: ${detail}`;
  });
}
function mapInquiries(items = []) {
  return items.map((q) => {
    const name = q.name || q.creditor || "Inquiry";
    const meta = [q.date, q.label, q.bureau].filter(Boolean).join(" · ");
    return meta ? `${name} — ${meta}` : name;
  });
}

/** Build Page 1: header, client summary, scores, and first slice of long lists */
function buildPageOne(props) {
  const {
    clientName,
    clientAddress,
    clientDob,
    clientSsnLast4,
    createdDate,
    preparedBy,
    email,
    phone,
    website,
    scores = {},
    derogatorySummary = {},
    publicRecords = [],
    inquiries = [],
  } = props;

  const { root, body } = pageRoot();

  // Client info
  body.appendChild(sectionTitle("Prepared For"));
  const info = el("div", {}, { display: "grid", gridTemplateColumns: "1fr", gap: "4px" });
  info.appendChild(infoRow("Client", clientName));
  if (clientAddress) info.appendChild(infoRow("Address", clientAddress));
  if (clientDob || clientSsnLast4) {
    info.appendChild(
      infoRow(
        "Identifiers",
        [clientDob ? `DOB: ${clientDob}` : "", clientSsnLast4 ? `SSN: •••• ${clientSsnLast4}` : ""]
          .filter(Boolean)
          .join(" · ")
      )
    );
  }
  info.appendChild(infoRow("Created", createdDate));
  const contact = [preparedBy && `Prepared by ${preparedBy}`, email, phone, website]
    .filter(Boolean)
    .join("   ");
  if (contact) info.appendChild(infoRow("Contact", contact));
  body.appendChild(info);

  // Scores
  body.appendChild(sectionTitle("Your Credit Scores and Summary"));
  const scoresGrid = el("div", {}, {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "8px",
  });
  scoresGrid.appendChild(scoreCard("Experian", scores.exp));
  scoresGrid.appendChild(scoreCard("TransUnion", scores.tu));
  scoresGrid.appendChild(scoreCard("Equifax", scores.eq));
  scoresGrid.appendChild(scoreCard("Average", scores.avg));
  body.appendChild(scoresGrid);

  // First slice of long lists
  const dFirst = mapDerogItems(derogatorySummary.items || []).slice(0, FIRST_LIMIT);
  const pFirst = mapPublicRecords(publicRecords).slice(0, FIRST_LIMIT);
  const iFirst = mapInquiries(inquiries).slice(0, FIRST_LIMIT);

  if (dFirst.length) body.appendChild(twoColumnList(dFirst, "Derogatory Items (First)"));
  if (pFirst.length) body.appendChild(twoColumnList(pFirst, "Public Records (First)"));
  if (iFirst.length) body.appendChild(twoColumnList(iFirst, "Inquiries (First)"));

  return root;
}

/** Build continuation pages for remaining items (clean 2-column pages) */
function buildContinuationPages(props) {
  const { derogatorySummary = {}, publicRecords = [], inquiries = [] } = props;

  const dRem = mapDerogItems(derogatorySummary.items || []).slice(FIRST_LIMIT);
  const pRem = mapPublicRecords(publicRecords).slice(FIRST_LIMIT);
  const iRem = mapInquiries(inquiries).slice(FIRST_LIMIT);

  const combined = [
    ...dRem.map((x) => `Derogatory: ${x}`),
    ...pRem.map((x) => `Public: ${x}`),
    ...iRem.map((x) => `Inquiry: ${x}`),
  ];

  if (!combined.length) return [];

  const pages = [];
  for (let i = 0; i < combined.length; i += CONT_LIMIT) {
    const slice = combined.slice(i, i + CONT_LIMIT);
    const { root, body } = pageRoot({ titleSuffix: "Continuation" });
    body.appendChild(twoColumnList(slice, null));
    pages.push(root);
  }

  return pages;
}

/** Build all report pages as DOM nodes, mounted under a portal for capture. */
export function buildReportPages(layoutProps) {
  const portal = createPortal(PAGE_W);

  const page1 = buildPageOne(layoutProps);
  portal.appendChild(page1);

  const cont = buildContinuationPages(layoutProps);
  for (const p of cont) portal.appendChild(p);

  const pages = [page1, ...cont];
  return { portalEl: portal, pages };
}
