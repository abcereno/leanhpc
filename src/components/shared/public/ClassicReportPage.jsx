// src/components/shared/public/ClassicReportPage.jsx
//
// Client-facing recreation of SmartCredit's "Classic 3B Report" — reached
// via a token link (route /classic-report/:token, see App.jsx), same
// no-login public-link pattern as PublicClientReceipt.jsx but with its own
// dedicated token column (clients.classic_report_token — see
// sql/add_classic_report_token.sql) so generating one doesn't clobber a
// live receipt link.
//
// Data comes straight from raw_credit_report.json via
// utils/buildClassicReport.js (a purpose-built parser — see that file's
// header for why it doesn't reuse auditEngine.js or credit_analysis).
//
// Two layouts share one set of section components (the *Panel functions
// below) so nothing is duplicated between them — see ScrollLayout (the
// original single-scroll page) and SidebarLayout (left nav, one section at
// a time, collapses to a horizontal icon-tab row under 768px — see
// index.css's .crs-* rules). The client toggles between them; the choice is
// local UI state, not a route or a stored preference.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Spinner, Alert, Badge, Button, Form } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { buildClassicReport, PAY_STATUS_LABEL, BUREAU_LABEL } from "../../../utils/buildClassicReport";
import { submitInquiryFlags } from "../../../hooks/useInquiryFlags";

const COLORS = {
  EX: { primary: "#2563eb", textDark: "#1e40af", bg: "#eff6ff", border: "#bfdbfe" },
  TU: { primary: "#0d9488", textDark: "#115e59", bg: "#f0fdfa", border: "#99f6e4" },
  EQ: { primary: "#d97706", textDark: "#92400e", bg: "#fffbeb", border: "#fde68a" },
  textMain: "#0f172a",
  textMuted: "#334155",
  success: "#16a34a",
  danger: "#dc2626",
  warning: "#eab308",
};

const BUCKET = "clients";

function scoreRange(score) {
  if (!score) return { label: "No Score", color: COLORS.textMuted };
  if (score >= 750) return { label: "Excellent", color: COLORS.success };
  if (score >= 700) return { label: "Good", color: COLORS.EX.primary };
  if (score >= 650) return { label: "Fair", color: COLORS.warning };
  return { label: "Needs Work", color: COLORS.danger };
}

function fmtMoney(v) {
  if (v === null || v === undefined) return "—";
  return `$${Number(v).toLocaleString()}`;
}

const DEROGATORY_WORDS = /(late|delinq|derog|collect|charge.?off|repo)/i;

// An account "needs attention" if any bureau column reports a past-due
// balance, any 30/60/90-day lates, or a condition/status that reads as
// derogatory — used both to decide the Needs Attention summary items and
// whether an AccountCard starts collapsed (good-standing accounts collapse
// by default; anything flagged here stays open).
function accountNeedsAttention(account) {
  return Object.values(account.byBureau).some((d) => {
    if ((d.pastDueAmount || 0) > 0) return true;
    if ((d.daysLate?.d30 || 0) > 0 || (d.daysLate?.d60 || 0) > 0 || (d.daysLate?.d90 || 0) > 0) return true;
    if (DEROGATORY_WORDS.test(d.accountCondition || "")) return true;
    if (DEROGATORY_WORDS.test(d.paymentStatus || "")) return true;
    return false;
  });
}

// Plain-language "what should this client actually look at first" list,
// derived from data already on the report rather than a new field — the
// PDF this recreates has no equivalent section, but burying a derogatory
// mark 3 sections down in a 3-bureau comparison table is exactly the kind
// of thing a client will miss.
function buildAttentionItems(report) {
  const items = [];

  ["TU", "EX", "EQ"].forEach((b) => {
    const s = report.summary[b] || {};
    if (s.derogatory > 0) items.push({ severity: "danger", text: `${BUREAU_LABEL[b]} reports ${s.derogatory} derogatory account${s.derogatory === 1 ? "" : "s"}.` });
    else if (s.delinquent > 0) items.push({ severity: "warning", text: `${BUREAU_LABEL[b]} reports ${s.delinquent} delinquent account${s.delinquent === 1 ? "" : "s"}.` });
  });

  const flaggedAccounts = [];
  Object.values(report.accounts).forEach((list) => list.forEach((acc) => { if (accountNeedsAttention(acc)) flaggedAccounts.push(acc.creditor); }));
  if (flaggedAccounts.length > 0) {
    items.push({ severity: "danger", text: `${flaggedAccounts.length} account${flaggedAccounts.length === 1 ? "" : "s"} showing late payments or a derogatory status: ${flaggedAccounts.slice(0, 5).join(", ")}${flaggedAccounts.length > 5 ? "…" : ""}.` });
  }

  if (report.publicRecords.length > 0) {
    items.push({ severity: "danger", text: `${report.publicRecords.length} public record${report.publicRecords.length === 1 ? "" : "s"} on file.` });
  }

  if (report.inquiries.noMatch.length > 0) {
    items.push({ severity: "warning", text: `${report.inquiries.noMatch.length} inquir${report.inquiries.noMatch.length === 1 ? "y" : "ies"} with no matching account — see "No Match" below and flag anything you don't recognize.` });
  }

  return items;
}

function inquiryKey(inq) {
  return `${inq.creditor}|${inq.bureau}|${inq.date}`;
}

function Field({ label, value }) {
  return (
    <div className="d-flex justify-content-between py-1" style={{ borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
      <span style={{ color: COLORS.textMuted }}>{label}</span>
      <span style={{ color: COLORS.textMain, fontWeight: 600, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

function PaymentHistoryGrid({ history }) {
  if (!history || history.length === 0) return <div className="small text-muted">No payment history reported.</div>;
  return (
    <div className="d-flex flex-wrap gap-1">
      {history.map((code, i) => {
        const isLate = code !== "0" && code !== "X" && PAY_STATUS_LABEL[code];
        return (
          <div
            key={i}
            title={PAY_STATUS_LABEL[code] || "No data"}
            style={{
              width: 22,
              height: 22,
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isLate ? "#fee2e2" : code === "0" ? "#dcfce7" : "#f1f5f9",
              color: isLate ? COLORS.danger : code === "0" ? COLORS.success : COLORS.textMuted,
            }}
          >
            {code === "0" ? "✓" : code === "X" ? "-" : code}
          </div>
        );
      })}
    </div>
  );
}

function AccountCard({ account, forceExpanded }) {
  const bureaus = ["TU", "EX", "EQ"].filter((b) => account.byBureau[b]);
  const needsAttention = accountNeedsAttention(account);
  // Good-standing accounts start collapsed — a client with 20 open accounts
  // shouldn't have to scroll past 20 near-identical "all current" cards to
  // find the 2 that actually need a look. Anything flagged by
  // accountNeedsAttention() (late/past-due/derogatory) always starts open.
  // forceExpanded (set while printing — see ClassicReportPage's
  // beforeprint/afterprint handling) overrides this: a printed report isn't
  // interactive, so nothing should be left collapsed on paper.
  const [manualCollapsed, setManualCollapsed] = useState(!needsAttention);
  const collapsed = !forceExpanded && manualCollapsed;

  if (collapsed) {
    return (
      <div
        className="crs-collapsed-account mb-2 bg-white rounded-3 shadow-sm px-3 py-2"
        style={{ border: "1px solid #e2e8f0", cursor: "pointer" }}
        onClick={() => setManualCollapsed(false)}
      >
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <strong style={{ color: COLORS.textMain, fontSize: 14 }}>{account.creditor}</strong>
          <Badge bg="success" className="fw-normal">Good Standing</Badge>
          <span className="text-muted small crs-collapsed-bureaus">{bureaus.map((b) => BUREAU_LABEL[b]).join(" / ")}</span>
        </div>
        <span className="text-muted small crs-collapsed-action">Show details</span>
      </div>
    );
  }

  return (
    <div className="crs-account-card mb-3 bg-white rounded-3 shadow-sm" style={{ border: "1px solid #e2e8f0", overflow: "hidden" }}>
      <div
        className="px-3 py-2 d-flex align-items-center justify-content-between"
        style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: !needsAttention ? "pointer" : "default" }}
        onClick={() => { if (!needsAttention) setManualCollapsed(true); }}
      >
        <strong style={{ color: COLORS.textMain }}>{account.creditor}</strong>
        {!needsAttention && <span className="text-muted small d-print-none">Hide details</span>}
      </div>
      <div className="p-3">
        <div className="row g-2">
          {bureaus.map((b) => {
            const d = account.byBureau[b];
            return (
              <div className="col-md-4" key={b}>
                <div className="rounded-3 p-2 h-100" style={{ backgroundColor: COLORS[b].bg, border: `1px solid ${COLORS[b].border}` }}>
                  <div className="fw-bold mb-2" style={{ color: COLORS[b].textDark, fontSize: 12, textTransform: "uppercase" }}>
                    {BUREAU_LABEL[b]}
                  </div>
                  <Field label="Account #" value={d.accountNumber ? `••••${d.accountNumber.slice(-4)}` : "—"} />
                  <Field label="Balance Owed" value={fmtMoney(d.balanceOwed)} />
                  <Field label="High Balance" value={fmtMoney(d.highBalance)} />
                  {d.creditLimit ? <Field label="Credit Limit" value={fmtMoney(d.creditLimit)} /> : null}
                  {d.utilizationPct !== null ? <Field label="Utilization" value={`${d.utilizationPct}%`} /> : null}
                  <Field label="Date Opened" value={d.dateOpened} />
                  <Field label="Date Reported" value={d.dateReported} />
                  <Field label="Last Verified" value={d.lastVerified} />
                  <Field label="Last Activity" value={d.dateOfLastActivity} />
                  <Field label="Closed Date" value={d.closedDate} />
                  <Field label="Account Status" value={d.accountStatus} />
                  {d.accountCondition ? <Field label="Condition" value={d.accountCondition} /> : null}
                  <Field label="Payment Status" value={d.paymentStatus} />
                  <Field label="Account Type" value={d.accountType} />
                  <Field label="Creditor Type" value={d.creditorType} />
                  <Field label="Payment Amount" value={fmtMoney(d.paymentAmount)} />
                  <Field label="Last Payment" value={d.lastPayment} />
                  {d.termLength ? <Field label="Term" value={`${d.termLength} mo`} /> : null}
                  <Field label="Past Due" value={fmtMoney(d.pastDueAmount)} />
                  <Field label="Dispute Status" value={d.disputeStatus} />
                  {d.creditorRemarks ? <Field label="Remarks" value={d.creditorRemarks} /> : null}

                  <div className="mt-2 mb-1" style={{ fontSize: 11, fontWeight: 700, color: COLORS[b].textDark }}>
                    PAYMENT HISTORY (24 MO)
                  </div>
                  <PaymentHistoryGrid history={d.paymentHistory} />

                  <div className="d-flex gap-2 mt-2">
                    <Badge bg={d.daysLate.d30 ? "danger" : "light"} text={d.daysLate.d30 ? undefined : "muted"}>30d: {d.daysLate.d30}</Badge>
                    <Badge bg={d.daysLate.d60 ? "danger" : "light"} text={d.daysLate.d60 ? undefined : "muted"}>60d: {d.daysLate.d60}</Badge>
                    <Badge bg={d.daysLate.d90 ? "danger" : "light"} text={d.daysLate.d90 ? undefined : "muted"}>90d: {d.daysLate.d90}</Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ children }) {
  return (
    <h2
      className="mt-5 mb-3"
      style={{ fontWeight: 800, fontSize: 20, color: COLORS.textMain, borderBottom: `3px solid ${COLORS.EX.primary}`, paddingBottom: 10 }}
    >
      {children}
    </h2>
  );
}

// ---------------------------------------------------------------------------
// Section panels — one definition each, reused by both ScrollLayout (renders
// all of them in sequence) and SidebarLayout (renders whichever one is
// active). Keeping the JSX in one place per section is the whole point of
// splitting these out — a change to, say, the Summary cards only has to
// happen here, not once per layout.
// ---------------------------------------------------------------------------

function ScoresPanel({ scores }) {
  return (
    <>
      <div className="row g-3 mb-4">
        {["TU", "EX", "EQ"].map((b) => {
          const range = scoreRange(scores[b]);
          return (
            <div className="col-md-4" key={b}>
              <div className="crs-print-card text-center rounded-3 p-3 h-100" style={{ backgroundColor: "#fff", border: `1px solid ${COLORS[b].border}` }}>
                <div style={{ color: COLORS[b].textDark, fontWeight: 700, fontSize: 13, textTransform: "uppercase" }}>{BUREAU_LABEL[b]}</div>
                <div style={{ fontSize: 40, fontWeight: 900, color: COLORS[b].primary }}>{scores[b] || "—"}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: range.color }}>{range.label}</div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-center text-muted mb-4" style={{ fontSize: 12 }}>
        Scores range 300–850. Each bureau scores independently from what creditors reported to it, so it's normal for these three numbers to differ.
      </div>
    </>
  );
}

function NeedsAttentionPanel({ items }) {
  if (items.length === 0) return null;
  return (
    <>
      <SectionHeader>Needs Your Attention</SectionHeader>
      <div className="d-flex flex-column gap-2 mb-4">
        {items.map((item, i) => (
          <div
            key={i}
            className="crs-print-card d-flex align-items-start gap-2 rounded-3 p-3"
            style={{
              backgroundColor: item.severity === "danger" ? "#fef2f2" : "#fffbeb",
              border: `1px solid ${item.severity === "danger" ? "#fecaca" : "#fde68a"}`,
            }}
          >
            <i className={`bi ${item.severity === "danger" ? "bi-exclamation-octagon-fill" : "bi-exclamation-triangle-fill"}`} style={{ color: item.severity === "danger" ? COLORS.danger : COLORS.warning }} />
            <span style={{ fontSize: 13, color: COLORS.textMain }}>{item.text}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function PersonalInfoPanel({ personal }) {
  return (
    <>
      <SectionHeader>Personal Information</SectionHeader>
      <div className="row g-3">
        {["TU", "EX", "EQ"].map((b) => {
          const p = personal[b] || {};
          return (
            <div className="col-md-4" key={b}>
              <div className="crs-print-card rounded-3 p-3 h-100 bg-white" style={{ border: `1px solid ${COLORS[b].border}` }}>
                <div className="fw-bold mb-2" style={{ color: COLORS[b].textDark, fontSize: 12, textTransform: "uppercase" }}>{BUREAU_LABEL[b]}</div>
                <Field label="Name" value={p.name} />
                <Field label="DOB (Year)" value={p.dob} />
                <Field label="Current Address" value={p.currentAddress ? `${p.currentAddress.line}, ${p.currentAddress.cityLine}` : "—"} />
                {(p.previousAddresses || []).map((a, i) => (
                  <Field key={i} label="Previous Address" value={`${a.line}, ${a.cityLine}`} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SummaryPanel({ summary }) {
  return (
    <>
      <SectionHeader>Summary</SectionHeader>
      <div className="row g-3">
        {["TU", "EX", "EQ"].map((b) => {
          const s = summary[b] || {};
          return (
            <div className="col-md-4" key={b}>
              <div className="crs-print-card rounded-3 p-3 h-100 bg-white" style={{ border: `1px solid ${COLORS[b].border}` }}>
                <div className="fw-bold mb-2" style={{ color: COLORS[b].textDark, fontSize: 12, textTransform: "uppercase" }}>{BUREAU_LABEL[b]}</div>
                <Field label="Total Accounts" value={s.totalAccounts} />
                <Field label="Open Accounts" value={s.openAccounts} />
                <Field label="Closed Accounts" value={s.closedAccounts} />
                <Field label="Delinquent" value={s.delinquent} />
                <Field label="Derogatory" value={s.derogatory} />
                <Field label="Balances" value={fmtMoney(s.balances)} />
                <Field label="Payments" value={fmtMoney(s.payments)} />
                <Field label="Public Records" value={s.publicRecords} />
                <Field label="Inquiries (2yr)" value={s.inquiries2yr} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-muted mt-2" style={{ fontSize: 12 }}>
        Each bureau collects and reports independently, so totals like account counts and balances routinely differ across the three columns above — that's expected, not an error.
      </div>
    </>
  );
}

function AccountsPanel({ accounts, groupOrder, hasAnyAccounts, forceExpanded }) {
  return (
    <>
      {hasAnyAccounts && (
        <>
          <SectionHeader>Accounts</SectionHeader>
          <div className="text-muted mb-3 d-print-none" style={{ fontSize: 12, marginTop: -8 }}>
            Accounts in good standing are collapsed by default — click one to see full details. Anything with a late payment, past-due balance, or derogatory status stays open.
          </div>
        </>
      )}
      {groupOrder.map((group) =>
        accounts[group]?.length ? (
          <div key={group} className="mb-4">
            <h5 style={{ fontWeight: 700, color: COLORS.textMain, fontSize: 15 }}>{group}</h5>
            {accounts[group].map((acc, i) => (
              <AccountCard key={i} account={acc} forceExpanded={forceExpanded} />
            ))}
          </div>
        ) : null,
      )}
    </>
  );
}

function PublicRecordsPanel({ publicRecords }) {
  return (
    <>
      <SectionHeader>Public Records</SectionHeader>
      {publicRecords.length === 0 ? (
        <div className="rounded-3 p-3 bg-white text-muted small" style={{ border: "1px solid #e2e8f0" }}>None reported.</div>
      ) : (
        publicRecords.map((pr, i) => (
          <div key={i} className="crs-print-card rounded-3 p-3 bg-white mb-2" style={{ border: "1px solid #e2e8f0" }}>
            <div className="d-flex justify-content-between">
              <strong>{pr.type}</strong>
              <Badge bg="secondary">{BUREAU_LABEL[pr.bureau] || pr.bureau}</Badge>
            </div>
            <div className="small text-muted mt-1">
              Filed {pr.dateFiled || "—"} • {pr.status || "Status unknown"} {pr.amount ? `• ${fmtMoney(pr.amount)}` : ""}
            </div>
          </div>
        ))
      )}
    </>
  );
}

function InquiriesPanel({ inquiries, selectedFlags, submittedFlags, toggleFlag, submitFlags, flagSubmitting, flagError }) {
  return (
    <>
      <SectionHeader>Inquiries</SectionHeader>
      <div className="row g-3">
        <div className="col-md-6">
          <h6 style={{ color: COLORS.success, fontWeight: 700 }}>Match ({inquiries.match.length})</h6>
          <p className="small text-muted">These inquiries have a matching account on the report.</p>
          {inquiries.match.map((inq, i) => (
            <div key={i} className="crs-print-card d-flex justify-content-between rounded-3 p-2 mb-1 bg-white" style={{ border: "1px solid #e2e8f0", fontSize: 13 }}>
              <span>{inq.creditor}</span>
              <span className="text-muted">{inq.date} · {BUREAU_LABEL[inq.bureau] || inq.bureau}</span>
            </div>
          ))}
        </div>
        <div className="col-md-6">
          <h6 style={{ color: COLORS.danger, fontWeight: 700 }}>No Match ({inquiries.noMatch.length})</h6>
          <p className="small text-muted">No matching account — check any you don't recognize and flag them for your representative to review.</p>
          {inquiries.noMatch.map((inq, i) => {
            const key = inquiryKey(inq);
            const alreadySubmitted = submittedFlags.has(key);
            return (
              <div key={i} className="crs-print-card d-flex justify-content-between align-items-center rounded-3 p-2 mb-1 bg-white" style={{ border: "1px solid #e2e8f0", fontSize: 13 }}>
                <div className="d-flex align-items-center gap-2">
                  <Form.Check
                    type="checkbox"
                    className="d-print-none"
                    checked={selectedFlags.has(key) || alreadySubmitted}
                    disabled={alreadySubmitted}
                    onChange={() => toggleFlag(inq)}
                  />
                  <span>{inq.creditor}</span>
                </div>
                <span className="text-muted">
                  {alreadySubmitted ? <Badge bg="secondary" className="fw-normal">Flagged</Badge> : `${inq.date} · ${BUREAU_LABEL[inq.bureau] || inq.bureau}`}
                </span>
              </div>
            );
          })}
          {inquiries.noMatch.length > 0 && (
            <div className="mt-2 d-print-none">
              <Button size="sm" variant="danger" disabled={selectedFlags.size === 0 || flagSubmitting} onClick={submitFlags}>
                {flagSubmitting ? <Spinner size="sm" className="me-1" /> : <i className="bi bi-flag-fill me-1" />}
                Flag {selectedFlags.size > 0 ? `${selectedFlags.size} ` : ""}as Not Mine
              </Button>
              {flagError && <div className="text-danger small mt-1">{flagError}</div>}
              {submittedFlags.size > 0 && !flagError && <div className="text-success small mt-1">Thanks — your representative will review these.</div>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function CreditorContactsPanel({ creditorContacts }) {
  if (creditorContacts.length === 0) return null;
  return (
    <>
      <SectionHeader>Creditor Contacts</SectionHeader>
      <div className="row g-2">
        {creditorContacts.map((c, i) => (
          <div className="col-md-6" key={i}>
            <div className="crs-print-card rounded-3 p-2 bg-white small" style={{ border: "1px solid #e2e8f0" }}>
              <strong>{c.name}</strong> {c.phone && <span className="text-muted">— {c.phone}</span>}
              {c.address?.length ? <div className="text-muted">{c.address.join(", ")}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Layouts
// ---------------------------------------------------------------------------

function ScrollLayout({ report, attentionItems, groupOrder, hasAnyAccounts, inquiryProps, forceExpanded }) {
  return (
    <>
      <ScoresPanel scores={report.scores} />
      <NeedsAttentionPanel items={attentionItems} />
      <PersonalInfoPanel personal={report.personal} />
      <SummaryPanel summary={report.summary} />
      <AccountsPanel accounts={report.accounts} groupOrder={groupOrder} hasAnyAccounts={hasAnyAccounts} forceExpanded={forceExpanded} />
      <PublicRecordsPanel publicRecords={report.publicRecords} />
      <InquiriesPanel inquiries={report.inquiries} {...inquiryProps} />
      <CreditorContactsPanel creditorContacts={report.creditorContacts} />
    </>
  );
}

// Nav item id -> icon/label, built dynamically since Needs Attention and
// Creditor Contacts only show up when there's something to show (same rule
// their panels already use — see NeedsAttentionPanel/CreditorContactsPanel).
function buildSidebarNav(report, attentionItems) {
  const items = [{ id: "scores", label: "Scores", icon: "bi-bar-chart-fill" }];
  if (attentionItems.length > 0) items.push({ id: "attention", label: "Needs Attention", icon: "bi-exclamation-triangle-fill" });
  items.push(
    { id: "personal", label: "Personal Info", icon: "bi-person-fill" },
    { id: "summary", label: "Summary", icon: "bi-list-check" },
    { id: "accounts", label: "Accounts", icon: "bi-credit-card-2-front-fill" },
    { id: "records", label: "Public Records", icon: "bi-bank2" },
    { id: "inquiries", label: "Inquiries", icon: "bi-search" },
  );
  if (report.creditorContacts.length > 0) items.push({ id: "contacts", label: "Creditor Contacts", icon: "bi-telephone-fill" });
  return items;
}

function SidebarLayout({ report, attentionItems, groupOrder, hasAnyAccounts, inquiryProps }) {
  const navItems = useMemo(() => buildSidebarNav(report, attentionItems), [report, attentionItems]);
  const [active, setActive] = useState(navItems[0]?.id || "scores");
  const activeId = navItems.some((n) => n.id === active) ? active : navItems[0]?.id;

  const renderPanel = () => {
    switch (activeId) {
      case "scores": return <ScoresPanel scores={report.scores} />;
      case "attention": return <NeedsAttentionPanel items={attentionItems} />;
      case "personal": return <PersonalInfoPanel personal={report.personal} />;
      case "summary": return <SummaryPanel summary={report.summary} />;
      case "accounts": return <AccountsPanel accounts={report.accounts} groupOrder={groupOrder} hasAnyAccounts={hasAnyAccounts} />;
      case "records": return <PublicRecordsPanel publicRecords={report.publicRecords} />;
      case "inquiries": return <InquiriesPanel inquiries={report.inquiries} {...inquiryProps} />;
      case "contacts": return <CreditorContactsPanel creditorContacts={report.creditorContacts} />;
      default: return null;
    }
  };

  return (
    <div className="crs-sidebar-wrap">
      <div className="crs-sidebar">
        <div className="crs-sidebar-label">Report Sections</div>
        <div className="crs-sidebar-nav">
          {navItems.map((n) => (
            <button
              key={n.id}
              type="button"
              className={`crs-nav-item${activeId === n.id ? " active" : ""}`}
              onClick={() => setActive(n.id)}
            >
              <i className={`bi ${n.icon}`} aria-hidden="true" />
              <span>{n.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="crs-sidebar-content">{renderPanel()}</div>
    </div>
  );
}

export default function ClassicReportPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clientName, setClientName] = useState("");
  const [clientId, setClientId] = useState(null);
  const [report, setReport] = useState(null);

  // Client-side view preference — not a route or a saved setting, just
  // which of the two layouts (ScrollLayout/SidebarLayout above) is showing
  // right now. Sidebar is the default landing view; Scroll is what printing
  // always uses (see the beforeprint/afterprint effect below), regardless
  // of which one is on screen when Print is clicked.
  const [layoutMode, setLayoutMode] = useState("sidebar");

  // True only while an actual print (or "Save as PDF", which browsers
  // implement as printing to a PDF destination) is in progress. Forces
  // every AccountCard open (see forceExpanded below) and switches to
  // ScrollLayout so the printed output is always the complete report, not
  // whichever single sidebar section happened to be showing on screen.
  const [printMode, setPrintMode] = useState(false);
  const modeBeforePrintRef = useRef("sidebar");

  useEffect(() => {
    const handleBeforePrint = () => {
      setLayoutMode((cur) => {
        modeBeforePrintRef.current = cur;
        return "scroll";
      });
      setPrintMode(true);
    };
    const handleAfterPrint = () => {
      setLayoutMode(modeBeforePrintRef.current);
      setPrintMode(false);
    };
    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, []);

  // Improvement #4 — "flag an inquiry you don't recognize." Selection state
  // lives here (not in the inquiries list itself) since it's purely a
  // client-facing intent to flag, not part of the report data.
  const [selectedFlags, setSelectedFlags] = useState(new Set());
  const [submittedFlags, setSubmittedFlags] = useState(new Set());
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagError, setFlagError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const nowUTC = new Date().toISOString();
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .select("id, full_name")
        .eq("classic_report_token", token)
        .gt("classic_report_token_expires_at", nowUTC)
        .maybeSingle();

      if (!alive) return;
      if (clientErr || !client) {
        setError("This link is invalid or has expired. Please contact your representative for a new one.");
        setLoading(false);
        return;
      }

      setClientName(client.full_name || "Client");
      setClientId(client.id);

      // Best-effort viewed flag — never blocks rendering if it fails.
      supabase.from("clients").update({ classic_report_token_viewed: true }).eq("id", client.id).then(() => {});

      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(`${client.id}/raw_credit_report.json`, 60);
      if (!signed?.signedUrl) {
        setError("No credit report has been imported for this account yet.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(signed.signedUrl, { cache: "no-store" });
        if (!res.ok) throw new Error("Report file not found");
        const rawJson = await res.json();
        const built = buildClassicReport(rawJson);
        if (!alive) return;
        if (!built) {
          setError("We couldn't read your credit report data. Please contact your representative.");
        } else {
          setReport(built);
        }
      } catch (e) {
        if (alive) setError("We couldn't load your credit report. Please contact your representative.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [token]);

  const attentionItems = useMemo(() => (report ? buildAttentionItems(report) : []), [report]);

  const toggleFlag = (inq) => {
    const key = inquiryKey(inq);
    setSelectedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const submitFlags = async () => {
    const toSubmit = report.inquiries.noMatch.filter((inq) => selectedFlags.has(inquiryKey(inq)));
    if (!toSubmit.length) return;
    setFlagSubmitting(true);
    setFlagError(null);
    const { success, error: submitErr } = await submitInquiryFlags(clientId, token, toSubmit);
    setFlagSubmitting(false);
    if (!success) {
      setFlagError(submitErr || "Couldn't submit — please try again or contact your representative.");
      return;
    }
    setSubmittedFlags((prev) => new Set([...prev, ...toSubmit.map(inquiryKey)]));
    setSelectedFlags(new Set());
  };

  if (loading) {
    return (
      <div className="classic-report-root text-center py-5" style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
        <Spinner animation="border" variant="primary" />
        <p className="mt-2 text-muted">Loading your credit report…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="classic-report-root py-5" style={{ backgroundColor: "#f8fafc", minHeight: "100vh" }}>
        <div className="container" style={{ maxWidth: 600 }}>
          <Alert variant="danger">{error}</Alert>
        </div>
      </div>
    );
  }

  const groupOrder = ["Mortgage Accounts", "Revolving Accounts", "Installment Accounts", "Collection Accounts"];
  const hasAnyAccounts = groupOrder.some((g) => report.accounts[g]?.length);
  const inquiryProps = { selectedFlags, submittedFlags, toggleFlag, submitFlags, flagSubmitting, flagError };

  return (
    <div className="classic-report-root" style={{ fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif', backgroundColor: "#f8fafc", minHeight: "100vh" }}>
      {/* Sidebar view is a dashboard, not a printed page — it uses the full
          screen width instead of the centered, max-width "report" column
          Scroll view intentionally keeps. */}
      <div className={layoutMode === "sidebar" ? "px-3 px-md-4 py-4" : "container py-4"} style={layoutMode === "sidebar" ? undefined : { maxWidth: 1000 }}>
        {/* Letterhead */}
        <div
          className="d-flex flex-column flex-md-row justify-content-between align-items-md-end mb-4 pb-3"
          style={{ borderBottom: `3px solid ${COLORS.EX.primary}` }}
        >
          <div>
            <h1 style={{ fontWeight: 900, color: COLORS.textMain, margin: 0, fontSize: 26 }}>
              CREDIT <span style={{ color: COLORS.EX.textDark }}>REPORT</span>
            </h1>
            <div style={{ color: COLORS.textMuted, fontSize: 13 }}>Prepared by <strong>Hidden Partner Cloud</strong></div>
          </div>
          <div className="d-flex flex-column align-items-start align-items-md-end gap-2 mt-2 mt-md-0">
            <div className="text-md-end">
              <h4 style={{ fontWeight: 700, color: COLORS.textMain, margin: 0, fontSize: 18 }}>{clientName}</h4>
              <div style={{ color: COLORS.textMuted, fontSize: 12 }}>Report Date: {report.reportDate}</div>
            </div>
            <div className="d-flex gap-2 d-print-none">
              <div className="crs-view-toggle" role="group" aria-label="Report layout">
                <button type="button" className={`crs-view-btn${layoutMode === "scroll" ? " active" : ""}`} onClick={() => setLayoutMode("scroll")}>
                  <i className="bi bi-list-ul me-1" aria-hidden="true" />Scroll View
                </button>
                <button type="button" className={`crs-view-btn${layoutMode === "sidebar" ? " active" : ""}`} onClick={() => setLayoutMode("sidebar")}>
                  <i className="bi bi-layout-sidebar-inset me-1" aria-hidden="true" />Sidebar View
                </button>
              </div>
              <Button size="sm" variant="outline-secondary" onClick={() => window.print()}>
                <i className="bi bi-printer-fill me-1" aria-hidden="true" />Print / Save PDF
              </Button>
            </div>
          </div>
        </div>

        {layoutMode === "sidebar" ? (
          <SidebarLayout report={report} attentionItems={attentionItems} groupOrder={groupOrder} hasAnyAccounts={hasAnyAccounts} inquiryProps={inquiryProps} />
        ) : (
          <ScrollLayout report={report} attentionItems={attentionItems} groupOrder={groupOrder} hasAnyAccounts={hasAnyAccounts} inquiryProps={inquiryProps} forceExpanded={printMode} />
        )}

        <div className="text-center text-muted small mt-5 pt-3" style={{ borderTop: "1px solid #e2e8f0" }}>
          This report is a summary compiled from data provided by TransUnion, Experian, and Equifax. For questions, contact your representative.
        </div>
      </div>
    </div>
  );
}
