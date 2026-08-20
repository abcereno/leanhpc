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
import { useEffect, useState, useCallback } from "react";
import { Card, Badge, Button, Spinner, OverlayTrigger, Tooltip } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { validateDocument } from "../../../utils/validateDocument";
import { useToast } from "../../shared/ui/ToastNotifier";

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

export default function AlignmentCheckPanel({ clientId, refreshKey }) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [client, setClient] = useState(null);
  const [identityDocs, setIdentityDocs] = useState({ license: null, ssn: null, poa: null });
  const [ftcReport, setFtcReport] = useState(null);
  const [letters, setLetters] = useState([]);
  const [checkingId, setCheckingId] = useState(null); // row id (or 'license'/'ssn'/'poa') currently being checked
  const [migrationMissing, setMigrationMissing] = useState(false);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const { data: c } = await supabase
        .from("clients")
        .select("full_name, ssn, address, email, phone")
        .eq("id", clientId)
        .single();
      setClient(c || null);

      let { data: docs, error } = await supabase
        .from("client_documents")
        .select("id, file_name, file_url, doc_type, validation_status, validation_notes, validation_details, created_at")
        .eq("client_id", clientId)
        .in("doc_type", ["license", "ssn", "poa", "ftc_report", "letter"])
        .order("created_at", { ascending: false });

      if (error && /doc_type|validation_details/i.test(error.message || "")) {
        setMigrationMissing(true);
        setLoading(false);
        return;
      }
      if (error) throw error;

      const nextIdentity = { license: null, ssn: null, poa: null };
      let latestFtc = null;
      const letterRows = [];

      (docs || []).forEach((row) => {
        if (["license", "ssn", "poa"].includes(row.doc_type)) {
          if (!nextIdentity[row.doc_type]) nextIdentity[row.doc_type] = row; // first-seen = most recent (already ordered desc)
        } else if (row.doc_type === "ftc_report") {
          if (!latestFtc) latestFtc = row;
        } else if (row.doc_type === "letter") {
          letterRows.push(row);
        }
      });

      setIdentityDocs(nextIdentity);
      setFtcReport(latestFtc);
      setLetters(letterRows);
    } catch (err) {
      console.error("AlignmentCheckPanel load error:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Shared by every "Check Now" button below — `identityKind` is
  // 'license'|'ssn'|'poa' for the fixed identity slots (uses docType,
  // signed URL comes from cover-letter-assets bucket), or null for
  // ftc_report/letter rows (uses reportCheck/category-less request keyed
  // off doc_type, signed URL comes from the "clients" bucket).
  const runCheck = async (row, identityKind) => {
    if (!client) return;
    const checkKey = identityKind || row.id;
    setCheckingId(checkKey);
    try {
      const bucket = identityKind ? "cover-letter-assets" : BUCKET;
      const { data: signedData, error: signErr } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.file_url, 120);
      if (signErr || !signedData?.signedUrl) throw new Error(signErr?.message || "Could not sign file URL.");

      const isFtc = !identityKind && row.doc_type === "ftc_report";
      const result = await validateDocument({
        docType: identityKind || (row.doc_type === "letter" ? "letter" : undefined),
        reportCheck: isFtc ? "ftc" : undefined,
        fileUrl: signedData.signedUrl,
        clientName: client.full_name,
        clientAddress: client.address,
        clientSsn: client.ssn,
        clientEmail: client.email,
        clientPhone: client.phone,
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
      await load();
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

  const identityRows = [
    { kind: "license", label: "Driver's License", row: identityDocs.license, checks: identityDocs.license?.validation_details, fields: [{ key: "nameMatch", label: "Name" }] },
    { kind: "ssn", label: "SSN Card", row: identityDocs.ssn, checks: identityDocs.ssn?.validation_details, fields: [{ key: "ssnMatch", label: "SSN" }, { key: "nameMatch", label: "Name" }] },
    { kind: "poa", label: "Proof of Address", row: identityDocs.poa, checks: identityDocs.poa?.validation_details, fields: [{ key: "nameMatch", label: "Name" }, { key: "addressMatch", label: "Address" }] },
  ];

  const anyMismatch = [
    ...identityRows.map((r) => r.checks),
    ftcReport?.validation_details,
    ...letters.map((l) => l.validation_details),
  ].some((c) => c && Object.values(c).some((v) => v === false));

  const anyUnchecked = [identityDocs.license, identityDocs.ssn, identityDocs.poa, ftcReport, ...letters]
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
                missingText="Not uploaded yet."
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
