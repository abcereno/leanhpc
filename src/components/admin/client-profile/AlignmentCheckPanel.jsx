// src/components/admin/client-profile/AlignmentCheckPanel.jsx
//
// "Alignment Check" — one panel that answers "does everything we have on
// file for this client actually match?" across the documents that carry
// personal info: identity docs (license/SSN/POA, CoverLetterAssets.jsx),
// the FTC Identity Theft Report (now required when checking the FTC box
// in Docs Routing — see LogChecklistItemModal.jsx), and generated dispute
// letters (LetterEditorModal.jsx). All three already get an AI validity
// check (supabase/functions/validate-document); this panel is what
// surfaces the newer alignment-specific results (SSN/name/address/email/
// phone match, FTC report number format) that check adds, in one place —
// per the explicit product decision that this belongs on the client
// profile, not scattered across Docs Routing/Call Routing.
//
// Reuses validateDocument()/client_documents exactly as CoverLetterAssets.jsx
// and CoverLetterAssetsLTOS.jsx already do (same upload bucket paths, same
// "warning-only, never a hard gate" precedent, same .select("id")-then-
// check-row-count pattern for detecting a silent RLS no-op) rather than a
// third parallel implementation.
import { useEffect, useState } from "react";
import { Card, Badge, Button, Spinner, OverlayTrigger, Tooltip } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { validateDocument } from "../../../utils/validateDocument";
import { useToast } from "../../shared/ui/ToastNotifier";
import { useAlignmentDocs } from "../../../hooks/useAlignmentDocs";

const BUCKET = "clients"; // ftc_report + letter files live here (LetterEditorModal.jsx's bucket) — NOT the separate "cover-letter-assets" bucket CoverLetterAssets.jsx uses for license/ssn/poa.

// Each row this panel checks — how to request the AI check, and which of
// the returned `checks` fields to display as match/mismatch badges.
const CHECK_FIELDS = {
  ftc_report: [
    { key: "reportNumberValid", label: "Report # (9 digits)" },
    { key: "nameMatch", label: "Name" },
    { key: "emailMatch", label: "Email" },
    { key: "phoneMatch", label: "Phone" },
  ],
  letter: [
    { key: "nameMatch", label: "Name" },
    { key: "addressMatch", label: "Address" },
  ],
};

// Merged identity slot ('license'/'poa'/'authorization') -> the LTOS
// category to send when re-checking a row that originated from
// CoverLetterAssetsLTOS.jsx (see useAlignmentDocs.js's identitySlot()
// and runCheck() below).
const LTOS_CATEGORY_BY_SLOT = { license: "identity", poa: "address", authorization: "authorization" };

function MatchBadge({ label, value }) {
  // true = match, false = mismatch, null/undefined = not checked or N/A
  const variant = value === true ? "success" : value === false ? "danger" : "secondary";
  const icon = value === true ? "bi-check-circle-fill" : value === false ? "bi-x-circle-fill" : "bi-dash-circle";
  return (
    <Badge bg={variant} className="fw-normal me-1 mb-1">
      <i className={`bi ${icon} me-1`} />
      {label}
    </Badge>
  );
}

export default function AlignmentCheckPanel({ clientId, refreshKey, onRefresh }) {
  const { addToast } = useToast();
  const [client, setClient] = useState(null);
  const [checkingId, setCheckingId] = useState(null); // row id (or 'license'/'ssn'/'poa') currently being checked

  // Document fetch + legacy/LTOS merge is shared with ClientHeader.jsx's
  // Personal Info "AI detected from ID" sub-lines — see useAlignmentDocs.js.
  const { loading, migrationMissing, identityDocs, ftcReport, letters, reload } = useAlignmentDocs(clientId, refreshKey);

  // Client record (name/ssn/address/email/phone) is only needed here, to
  // pass as the comparison target when running a check — not part of the
  // shared hook.
  useEffect(() => {
    if (!clientId) return;
    let alive = true;
    (async () => {
      const { data: c } = await supabase
        .from("clients")
        .select("full_name, ssn, address, email, phone, dob")
        .eq("id", clientId)
        .single();
      if (alive) setClient(c || null);
    })();
    return () => { alive = false; };
  }, [clientId, refreshKey]);

  // Shared by every "Check Now" button below — `identityKind` is
  // 'license'|'ssn'|'poa'|'authorization' for the identity slots (signed
  // URL comes from cover-letter-assets bucket), or null for ftc_report/
  // letter rows (reportCheck/docType keyed off doc_type, signed URL comes
  // from the "clients" bucket).
  //
  // Identity slots need one more branch: a slot can be filled by either a
  // legacy row (CoverLetterAssets.jsx, file_name === doc_type, checked via
  // docType) or an LTOS row (CoverLetterAssetsLTOS.jsx, file_name in
  // identity/address/authorization, checked via category — see
  // useAlignmentDocs.js's identitySlot()). Re-checking must send the SAME
  // request shape it was
  // originally validated with, or the edge function runs the wrong
  // prompt entirely (e.g. judging a passport against the legacy "driver's
  // license" rules, or a lease against the utility-bill freshness rule).
  const runCheck = async (row, identityKind) => {
    if (!client) return;
    const checkKey = identityKind || row.id;
    setCheckingId(checkKey);
    try {
      const isLtosOrigin = identityKind && ["identity", "address", "authorization"].includes(row?.file_name);

      const bucket = identityKind ? "cover-letter-assets" : BUCKET;
      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.file_url, 120);
      if (signErr || !signedData?.signedUrl) throw new Error(signErr?.message || "Could not sign file URL.");

      const isFtc = !identityKind && row.doc_type === "ftc_report";
      const result = await validateDocument({
        docType: identityKind && !isLtosOrigin ? identityKind : (!identityKind && row.doc_type === "letter" ? "letter" : undefined),
        category: identityKind && isLtosOrigin ? LTOS_CATEGORY_BY_SLOT[identityKind] : undefined,
        reportCheck: isFtc ? "ftc" : undefined,
        fileUrl: signedData.signedUrl,
        clientName: client.full_name,
        clientAddress: client.address,
        clientSsn: client.ssn,
        clientEmail: client.email,
        clientPhone: client.phone,
        clientDob: client.dob,
      });

      if (!result.success) {
        addToast({ title: "Check Failed", message: result.reasoning || "Could not check this document right now.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
        return;
      }

      const { data: updated, error: updErr } = await supabase
        .from("client_documents")
        .update({
          validation_status: result.status,
          validation_notes: result.reasoning || null,
          ai_confidence: result.confidence,
          validation_details: result.checks || null,
          validated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .select("id");

      if (updErr || !updated || updated.length === 0) {
        addToast({
          title: "Check Ran, But Couldn't Save",
          message: updErr?.message || "The AI checked this document, but 0 rows were updated — likely a missing Row Level Security UPDATE policy on client_documents.",
          variant: "danger",
          icon: "bi-exclamation-octagon-fill",
          timeout: 12000,
        });
        return;
      }

      addToast({ title: "Checked", message: result.reasoning || "Alignment check complete.", variant: "success", icon: "bi-check-circle" });
      await reload();
      // This panel's own useAlignmentDocs instance just refetched via
      // reload() above, but ClientHeader.jsx's Personal Info "AI detected"
      // sub-lines use a SEPARATE instance of the same hook — plain React
      // state isn't shared across components, so without this that panel
      // would keep showing the stale pre-check result until something else
      // happened to bump the page-level refreshKey (e.g. a full reload).
      // Bumping it here is what makes a check run from this panel actually
      // show up in the header immediately.
      onRefresh && onRefresh();
    } catch (err) {
      console.error("Alignment check error:", err);
      addToast({ title: "Check Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setCheckingId(null);
    }
  };

  if (migrationMissing) {
    return (
      <Card className="border-warning">
        <Card.Body className="small text-muted">
          <i className="bi bi-exclamation-triangle-fill text-warning me-2" />
          Alignment Check needs <code>sql/add_document_alignment_check.sql</code> run against this database.
        </Card.Body>
      </Card>
    );
  }

  // "license" and "poa" slots merge rows from both upload flows (legacy
  // CoverLetterAssets.jsx + LTOS CoverLetterAssetsLTOS.jsx — see load()'s
  // identitySlot()), so their labels stay generic rather than assuming
  // one specific document type. "authorization" only ever comes from the
  // LTOS flow (no legacy equivalent).
  const identityRows = [
    // DOB checks apply to every photo ID (license, state ID, passport);
    // address only applies to license/state ID — a passport never prints
    // one, so addressMatch will correctly come back null (shown as a
    // gray "N/A" badge, not a mismatch) for those. See the edge
    // function's isAddressDoc/isDobDoc.
    { kind: "license", label: "Photo ID (License/Passport)", row: identityDocs.license, checks: identityDocs.license?.validation_details, fields: [{ key: "nameMatch", label: "Name" }, { key: "dobMatch", label: "DOB" }, { key: "addressMatch", label: "Address" }] },
    { kind: "ssn", label: "SSN Card", row: identityDocs.ssn, checks: identityDocs.ssn?.validation_details, fields: [{ key: "ssnMatch", label: "SSN" }, { key: "nameMatch", label: "Name" }] },
    { kind: "poa", label: "Proof of Address", row: identityDocs.poa, checks: identityDocs.poa?.validation_details, fields: [{ key: "nameMatch", label: "Name" }, { key: "addressMatch", label: "Address" }] },
    { kind: "authorization", label: "Authorization (Limited POA)", row: identityDocs.authorization, checks: identityDocs.authorization?.validation_details, fields: [{ key: "nameMatch", label: "Name" }] },
  ];

  const anyMismatch = [
    ...identityRows.map((r) => r.checks),
    ftcReport?.validation_details,
    ...letters.map((l) => l.validation_details),
  ].some((c) => c && Object.values(c).some((v) => v === false));

  const anyUnchecked = [identityDocs.license, identityDocs.ssn, identityDocs.poa, identityDocs.authorization, ftcReport, ...letters]
    .some((row) => row && (!row.validation_status || row.validation_status === "pending"));

  const overall = anyMismatch
    ? { label: "Needs Attention", variant: "danger", icon: "bi-exclamation-octagon-fill" }
    : anyUnchecked
    ? { label: "Not Fully Checked", variant: "secondary", icon: "bi-dash-circle" }
    : { label: "All Aligned", variant: "success", icon: "bi-check-circle-fill" };

  return (
    <Card className="shadow-sm border">
      <Card.Header className="bg-white d-flex align-items-center justify-content-between">
        <span className="fw-bold">
          <i className="bi bi-shield-check me-2 text-primary" />
          Alignment Check
        </span>
        <Badge bg={overall.variant} className="fw-normal">
          <i className={`bi ${overall.icon} me-1`} />
          {overall.label}
        </Badge>
      </Card.Header>
      <Card.Body>
        {loading ? (
          <div className="text-center py-3"><Spinner size="sm" /></div>
        ) : (
          <div className="d-flex flex-column gap-3">
            {identityRows.map(({ kind, label, row, checks, fields }) => (
              <AlignmentRow
                key={kind}
                label={label}
                row={row}
                checks={checks}
                fields={fields}
                checking={checkingId === kind}
                onCheck={() => runCheck(row, kind)}
                missingText={kind === "authorization" ? "Not uploaded — optional (Limited POA), when applicable." : "Not uploaded yet."}
              />
            ))}
            <AlignmentRow
              label="FTC Report"
              row={ftcReport}
              checks={ftcReport?.validation_details}
              fields={CHECK_FIELDS.ftc_report}
              checking={checkingId === ftcReport?.id}
              onCheck={() => runCheck(ftcReport, null)}
              missingText="No FTC report on file — attach one from Docs Routing's FTC checkbox."
            />
            {letters.length === 0 ? (
              <AlignmentRow label="Letters" row={null} checks={null} fields={[]} checking={false} onCheck={() => {}} missingText="No letters generated yet." />
            ) : (
              letters.map((l) => (
                <AlignmentRow
                  key={l.id}
                  label={l.file_name}
                  row={l}
                  checks={l.validation_details}
                  fields={CHECK_FIELDS.letter}
                  checking={checkingId === l.id}
                  onCheck={() => runCheck(l, null)}
                  missingText=""
                />
              ))
            )}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}

function AlignmentRow({ label, row, checks, fields, checking, onCheck, missingText }) {
  const notChecked = row && (!row.validation_status || row.validation_status === "pending");
  return (
    <div className="d-flex align-items-start justify-content-between border-bottom pb-2">
      <div>
        <div className="fw-semibold small">{label}</div>
        {!row ? (
          <div className="text-muted small fst-italic">{missingText}</div>
        ) : notChecked ? (
          <div className="text-muted small">Uploaded — not checked yet.</div>
        ) : (
          <div>
            {fields.map((f) => (
              <MatchBadge key={f.key} label={f.label} value={checks?.[f.key]} />
            ))}
            {row.validation_notes && (
              <OverlayTrigger overlay={<Tooltip>{row.validation_notes}</Tooltip>}>
                <i className="bi bi-info-circle text-muted ms-1" style={{ cursor: "help" }} />
              </OverlayTrigger>
            )}
          </div>
        )}
      </div>
      {row && (
        <Button size="sm" variant="outline-secondary" onClick={onCheck} disabled={checking}>
          {checking ? <Spinner size="sm" /> : notChecked ? "Check Now" : "Re-check"}
        </Button>
      )}
    </div>
  );
}
