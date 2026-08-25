import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "../../../supabaseClient";
import useLogger from "../../../hooks/useLogger";
import { useToast } from "../../shared/ui/ToastNotifier";
import { validateDocument } from "../../../utils/validateDocument";
import { ASSET_KEYS as KEYS, ASSET_LABELS, VALIDATION_BADGES } from "../../../utils/documentAssetLabels";
import useDropzone from "../../../hooks/useDropzone";

const BUCKET = "cover-letter-assets";     // private bucket recommended
const SIGNED_URL_TTL = 60 * 60 * 24 * 30; // 30 days

// AI validity check (sql/add_document_validation.sql,
// supabase/functions/validate-document) — warning-only badges, never
// blocks anything. Runs automatically right after a successful upload,
// plus a manual "Check Validity" button per asset for documents already
// on file from before this existed.

// `showAiResults` (default true — the admin client profile, the only
// call site that doesn't pass this explicitly) gates whether the AI
// validity/alignment check badge and its manual "Check Validity" trigger
// are rendered at all. Partners (MoveForwardModal.jsx, ClientProfilePage.jsx)
// and individuals (ProfileStep2.jsx) pass showAiResults={false} — product
// decision: admins review AI results themselves and follow up with the
// client/partner directly rather than surfacing raw AI output to them.
// The check itself still runs automatically after upload either way (so
// the result is waiting for an admin the next time they open this same
// client) — only the rendering and the result-revealing toast are gated,
// never the underlying check.
export default function CoverLetterAssets({ clientId, onChange, refreshKey, showAiResults = true, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [clientName, setClientName] = useState("Client");
  // On file, for the Alignment Check (SSN match on the 'ssn' doc, DOB +
  // address match on the 'license'/'poa' docs) — fetched alongside the
  // name below rather than a second round trip.
  const [clientSsn, setClientSsn] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [clientDob, setClientDob] = useState("");
  
  const [assets, setAssets] = useState({
    license: { path: null, signedUrl: null, validation: null },
    ssn: { path: null, signedUrl: null, validation: null },
    poa: { path: null, signedUrl: null, validation: null },
  });
  const [checkingKeys, setCheckingKeys] = useState({});

  const logAction = useLogger();
  const { addToast } = useToast();
  const mounted = useRef(true);

  const canUse = useMemo(() => !!clientId, [clientId]);

  useEffect(() => {
    if (!clientId) return;
    mounted.current = true;

    (async () => {
      setLoading(true);
      try {
        const { data: cData } = await supabase.from("clients").select("full_name, ssn, address, dob").eq("id", clientId).single();
        if (cData && mounted.current) {
          setClientName(cData.full_name);
          setClientSsn(cData.ssn || "");
          setClientAddress(cData.address || "");
          setClientDob(cData.dob || "");
        }

        let { data, error } = await supabase
          .from("client_documents")
          .select("file_name, file_url, created_at, validation_status, validation_notes, expires_at, ai_confidence, validation_details")
          .eq("client_id", clientId)
          .in("file_name", KEYS)
          .order("created_at", { ascending: false });

        // sql/add_document_validation.sql not yet applied against this
        // environment (or its migration transaction rolled back) — the
        // validation columns don't exist, so the select above 500s and
        // the whole load used to silently fail, making every already-
        // uploaded document look like it vanished even though the row is
        // still there (same class of bug start_inquiries/counted_at/
        // dispute_round hit before: any new column added to an existing
        // select/update/insert needs a fallback until the migration is
        // confirmed run). Retry without the new columns so existing
        // uploads keep showing regardless of migration state.
        if (error && /validation_status|validation_notes|expires_at|ai_confidence|validation_details/i.test(error.message || "")) {
          console.warn("client_documents validation columns not found (run sql/add_document_validation.sql) — loading without validation state.");
          const fallback = await supabase
            .from("client_documents")
            .select("file_name, file_url, created_at")
            .eq("client_id", clientId)
            .in("file_name", KEYS)
            .order("created_at", { ascending: false });
          data = fallback.data;
          error = fallback.error;
        }

        if (error) throw error;

        const next = {
          license: { path: null, signedUrl: null, validation: null },
          ssn: { path: null, signedUrl: null, validation: null },
          poa: { path: null, signedUrl: null, validation: null },
        };

        (data || []).forEach((row) => {
          const fn = row.file_name;
          if (KEYS.includes(fn) && !next[fn].path) {
            next[fn].path = row.file_url;
            next[fn].validation =
              row.validation_status && row.validation_status !== "pending"
                ? {
                    status: row.validation_status,
                    reasoning: row.validation_notes,
                    expiresAt: row.expires_at,
                    confidence: row.ai_confidence,
                    checks: row.validation_details || null,
                  }
                : null;
          }
        });

        await Promise.all(
          KEYS.map(async (k) => {
            next[k].signedUrl = await getSignedUrl(next[k].path);
          })
        );

        if (mounted.current) {
          setAssets(next);
          onChange &&
            onChange({
              licenseUrl: next.license.signedUrl || undefined,
              ssnUrl: next.ssn.signedUrl || undefined,
              poaUrl: next.poa.signedUrl || undefined,
            });
        }
      } catch (err) {
        console.error("Load assets error:", err);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshKey]); 

  async function getSignedUrl(path) {
    if (!path) return null;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL);
    if (error) {
      console.warn("Signed URL error:", error);
      return null;
    }
    return data.signedUrl;
  }

  // 👇 ADDED: Helper to check completion and update DB 👇
  const checkAndUpdateCompletion = async (currentAssets) => {
    const allUploaded = Boolean(currentAssets.license.path && currentAssets.ssn.path && currentAssets.poa.path);
    
    try {
      if (allUploaded) {
        await supabase.from("clients").update({
          is_uploaded: true,
          uploaded_timestamp: new Date().toISOString(),
          routing_status: "PENDING_REVIEW" // Moves them forward in the queue
        }).eq("id", clientId);
      } else {
        await supabase.from("clients").update({
          is_uploaded: false,
          routing_status: "NEEDS_DOCS" // Moves them back if a doc is deleted
        }).eq("id", clientId);
      }
    } catch (e) {
      console.error("Failed to update client document status:", e);
    }
  };

  async function handleUpload(key, file) {
    if (!clientId || !file) return;
    setLoading(true);
    try {
      const ext = (file.name.split(".").pop() || "png")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const path = `${clientId}/${key}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, {
          upsert: true,
          contentType: file.type || "application/octet-stream",
        });
      if (upErr && !String(upErr.message || "").includes("already exists")) {
        throw upErr;
      }

      await supabase
        .from("client_documents")
        .delete()
        .eq("client_id", clientId)
        .eq("file_name", key);

      let { error: insErr } = await supabase.from("client_documents").insert({
        client_id: clientId,
        file_name: key,
        doc_type: key,
        file_url: path,
      });
      // Same fallback as the load above — if doc_type doesn't exist yet
      // in this environment, retry without it rather than blocking the
      // upload entirely (file_name already carries the same value for
      // this flow, so nothing is actually lost).
      if (insErr && /doc_type/i.test(insErr.message || "")) {
        const retry = await supabase.from("client_documents").insert({
          client_id: clientId,
          file_name: key,
          file_url: path,
        });
        insErr = retry.error;
      }
      if (insErr) throw insErr;

      const signedUrl = await getSignedUrl(path);
      const next = { ...assets, [key]: { path, signedUrl, validation: null } };

      setAssets(next);

      // 👇 NEW: Check if this was the final missing document! 👇
      await checkAndUpdateCompletion(next);

      await logAction({
        action: "upload_asset",
        targetId: clientId,
        targetName: clientName,
        details: `Uploaded ${key.toUpperCase()} document.`
      });

      onChange &&
        onChange({
          licenseUrl: next.license.signedUrl || undefined,
          ssnUrl: next.ssn.signedUrl || undefined,
          poaUrl: next.poa.signedUrl || undefined,
        });

      addToast({ title: "Document Uploaded", message: `${ASSET_LABELS[key] || key} saved.`, variant: "success", icon: "bi-file-earmark-check-fill" });

      // AI validity check runs automatically right after upload (product
      // decision — see sql/add_document_validation.sql). Deliberately not
      // awaited here: the upload itself is already done and shouldn't
      // wait on an OpenAI round trip. runValidation manages its own
      // loading/checking state and toast.
      runValidation(key, file);
    } catch (err) {
      console.error("Upload error:", err);
      addToast({ title: "Upload Failed", message: err.message || "Check console for details.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  }

  // Shared by the automatic post-upload check and the manual "Check
  // Validity" button — `file` (a fresh File object) is used right after
  // upload; `fileUrl` (a signed Storage URL) is used to re-check a
  // document already on file. Warning-only: this never touches
  // routing_status or blocks anything, it only records what the AI saw.
  async function runValidation(key, file, fileUrl) {
    if (!clientId) return;
    setCheckingKeys((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await validateDocument({ docType: key, file, fileUrl, clientName, clientAddress, clientSsn, clientDob });
      if (!result.success) {
        if (showAiResults) addToast({ title: "Validity Check Failed", message: result.reasoning || "Could not check this document right now.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
        return;
      }

      // `.select("id")` is required here, not cosmetic — without it,
      // Supabase/PostgREST reports success (error: null) even when Row
      // Level Security silently matched ZERO rows (e.g. an UPDATE policy
      // that doesn't cover this table/column, while SELECT and INSERT do).
      // That "no error, but nothing actually saved" case is exactly what
      // was happening: the badge showed the AI result correctly for the
      // rest of the session, then vanished back to "Not checked" on the
      // next reload with no error ever shown. Checking `updated.length`
      // below is what actually catches that silent-RLS case, which a bare
      // `updErr` check cannot.
      const { data: updated, error: updErr } = await supabase
        .from("client_documents")
        .update({
          validation_status: result.status,
          validation_notes: result.reasoning || null,
          expires_at: result.expiresAt || null,
          ai_confidence: result.confidence,
          validation_details: result.checks || null,
          validated_at: new Date().toISOString(),
        })
        .eq("client_id", clientId)
        .eq("file_name", key)
        .select("id");

      if (mounted.current) {
        setAssets((prev) => ({
          ...prev,
          [key]: { ...prev[key], validation: { status: result.status, reasoning: result.reasoning, expiresAt: result.expiresAt, confidence: result.confidence, checks: result.checks || null } },
        }));
      }

      if (updErr) {
        console.error("Failed to save validation result:", updErr);
        if (showAiResults) addToast({
          title: "Check Ran, But Couldn't Save",
          message: `The AI checked this document, but the result couldn't be saved (${updErr.message}). It will show as "Not checked" again after reloading — confirm sql/add_document_validation.sql has been run.`,
          variant: "danger",
          icon: "bi-exclamation-octagon-fill",
          timeout: 12000,
        });
        return;
      }

      if (!updated || updated.length === 0) {
        console.error("Validation update matched 0 rows — likely blocked by a Row Level Security UPDATE policy on client_documents.");
        if (showAiResults) addToast({
          title: "Check Ran, But Couldn't Save",
          message: `The AI checked this document, but the save was silently blocked — no database error, but 0 rows were updated. This points to a missing UPDATE permission (Row Level Security policy) on client_documents, not a missing migration. It will show as "Not checked" again after reloading.`,
          variant: "danger",
          icon: "bi-exclamation-octagon-fill",
          timeout: 15000,
        });
        return;
      }

      const badge = VALIDATION_BADGES[result.status];
      if (showAiResults) addToast({
        title: `${ASSET_LABELS[key] || key}: ${badge?.label || result.status}`,
        message: result.reasoning || "",
        variant: result.status === "valid" ? "success" : result.status === "needs_review" ? "info" : "warning",
        icon: badge?.icon ? `bi ${badge.icon}` : "bi-info-circle-fill",
      });

      // ClientHeader.jsx's Personal Info "AI detected from ID" sub-lines
      // read the same client_documents rows via their own useAlignmentDocs
      // instance — a separate hook call, so it never sees this update on
      // its own. Bumping the page-level refreshKey is what makes a check
      // run from here actually show up in the header right away, same as
      // AlignmentCheckPanel.jsx's runCheck does.
      onRefresh && onRefresh();
    } catch (err) {
      console.error("Validation error:", err);
    } finally {
      if (mounted.current) setCheckingKeys((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleCheckValidity(key) {
    const fileUrl = assets[key]?.signedUrl;
    if (!fileUrl) return;
    await runValidation(key, null, fileUrl);
  }

  async function handleRemove(key) {
    if (!clientId) return;
    setLoading(true);
    try {
      const path = assets[key].path;
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]);
      }
      await supabase
        .from("client_documents")
        .delete()
        .eq("client_id", clientId)
        .eq("file_name", key);

      const next = { ...assets, [key]: { path: null, signedUrl: null, validation: null } };
      setAssets(next);

      // 👇 NEW: Check and revert status since a document is missing now 👇
      await checkAndUpdateCompletion(next);

      await logAction({
        action: "remove_asset",
        targetId: clientId,
        targetName: clientName,
        details: `Removed ${key.toUpperCase()} document.`
      });

      onChange &&
        onChange({
          licenseUrl: next.license.signedUrl || undefined,
          ssnUrl: next.ssn.signedUrl || undefined,
          poaUrl: next.poa.signedUrl || undefined,
        });

      addToast({ title: "Document Removed", message: `${ASSET_LABELS[key] || key} removed.`, variant: "success", icon: "bi-trash3-fill" });
    } catch (err) {
      console.error("Remove error:", err);
      addToast({ title: "Remove Failed", message: err.message || "Check console for details.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  }

  async function copyUrl(url) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      addToast({ title: "Copied", message: "URL copied to clipboard.", variant: "success", icon: "bi-clipboard-check-fill", timeout: 2500 });
    } catch {
      addToast({ title: "Copy Failed", message: "Could not copy the URL.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  }

  return (
    <div className="card p-0 mb-4 shadow-sm border-0">
      <div className="card-header bg-white d-flex align-items-center justify-content-between py-3">
        <strong className="text-primary"><i className="bi bi-file-earmark-lock me-2"></i>Cover Letter Assets</strong>
        {loading && <span className="text-muted small"><span className="spinner-border spinner-border-sm me-1"></span>Saving…</span>}
      </div>

      <div className="card-body d-flex align-items-stretch gap-4 overflow-auto py-4">
        {!canUse && <div className="alert alert-warning w-100">Client ID missing.</div>}

        <AssetRow
          label="Driver’s License"
          record={assets.license}
          placeholder="Upload ID Image"
          onUpload={(file) => handleUpload("license", file)}
          onRemove={() => handleRemove("license")}
          onCopy={() => copyUrl(assets.license.signedUrl)}
          onCheckValidity={() => handleCheckValidity("license")}
          checking={!!checkingKeys.license}
          showAiResults={showAiResults}
        />

        <div className="vr border-secondary opacity-25"></div>

        <AssetRow
          label="Social Security Card"
          record={assets.ssn}
          placeholder="Upload SSN Image"
          onUpload={(file) => handleUpload("ssn", file)}
          onRemove={() => handleRemove("ssn")}
          onCopy={() => copyUrl(assets.ssn.signedUrl)}
          onCheckValidity={() => handleCheckValidity("ssn")}
          checking={!!checkingKeys.ssn}
          showAiResults={showAiResults}
        />

        <div className="vr border-secondary opacity-25"></div>

        <AssetRow
          label="Proof of Address"
          record={assets.poa}
          placeholder="Utility Bill / Bank Stmt"
          onUpload={(file) => handleUpload("poa", file)}
          onRemove={() => handleRemove("poa")}
          onCopy={() => copyUrl(assets.poa.signedUrl)}
          onCheckValidity={() => handleCheckValidity("poa")}
          checking={!!checkingKeys.poa}
          showAiResults={showAiResults}
        />
      </div>
    </div>
  );
}

function AssetRow({ label, record, placeholder, onUpload, onRemove, onCopy, onCheckValidity, checking, showAiResults = true }) {
  const isImage = record.signedUrl && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(record.signedUrl);
  const badge = record.validation ? VALIDATION_BADGES[record.validation.status] : null;

  // Same single-file drop target as CoverLetterAssetsLTOS.jsx's AssetTile —
  // reused as-is (see useDropzone.js's own header) rather than growing a
  // second drag-and-drop implementation. This component renders unmodified
  // inside both the admin client profile and, via MoveForwardModal.jsx, the
  // company/partner portal's "Move Forward" form, so both get drag-and-drop
  // from this one change.
  const { isDragActive, dropzoneProps } = useDropzone({
    accept: "image/*,application/pdf",
    onFiles: (dropped) => dropped[0] && onUpload(dropped[0]),
  });

  return (
    <div
      {...dropzoneProps}
      className="d-flex flex-column align-items-center gap-2 flex-grow-1 rounded p-1"
      style={{ minWidth: "160px", ...(isDragActive ? { backgroundColor: "rgba(13,110,253,0.08)" } : undefined) }}
    >
      <div className="fw-bold text-center text-secondary mb-1" style={{ fontSize: "0.9rem", minHeight: "40px" }}>
        {label}
      </div>

      {showAiResults && (
        <div style={{ minHeight: "20px" }}>
          {checking ? (
            <span className="small text-muted"><span className="spinner-border spinner-border-sm me-1" style={{ width: "0.7rem", height: "0.7rem" }}></span>Checking…</span>
          ) : badge ? (
            <span
              className={`small fw-semibold ${badge.className}`}
              title={[record.validation.reasoning, record.validation.expiresAt ? `Date on file: ${record.validation.expiresAt}` : null].filter(Boolean).join(" — ")}
            >
              <i className={`bi ${badge.icon} me-1`}></i>{badge.label}
            </span>
          ) : record.path ? (
            <span className="small text-muted opacity-75">Not checked</span>
          ) : null}
        </div>
      )}

      <div
        className="shadow-sm"
        style={{
          width: 140,
          height: 140,
          border: isDragActive ? "2px dashed #0d6efd" : "1px dashed #adb5bd",
          borderRadius: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          background: isDragActive ? "#e7f1ff" : "#f8f9fa",
        }}
      >
        {isDragActive ? (
          <span className="text-primary fw-semibold small text-center px-2">
            <i className="bi bi-cloud-arrow-up-fill d-block mb-1 fs-3"></i>Drop to upload
          </span>
        ) : record.signedUrl ? (
          isImage ? (
            <img
              src={record.signedUrl}
              alt={label}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : (
            <div className="text-center px-2 small">
              <i className="bi bi-file-earmark-pdf-fill fs-1 text-danger"></i>
              <div className="fw-semibold mt-1 text-primary">Document</div>
            </div>
          )
        ) : (
          <span className="text-muted small text-center px-3 opacity-75">{placeholder} or drag &amp; drop</span>
        )}
      </div>

      <div className="d-flex gap-2 mt-2">
        <label className="btn btn-sm btn-primary mb-0" title="Upload New File">
          <i className="bi bi-upload"></i>
          <input
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </label>
        
        <a
          className={`btn btn-sm btn-info text-dark ${!record.signedUrl ? 'disabled' : ''}`}
          href={record.signedUrl || "#"}
          target="_blank"
          rel="noreferrer"
          title="View File"
          onClick={(e) => !record.signedUrl && e.preventDefault()}
        >
          <i className="bi bi-eye"></i>
        </a>
        
        <button
          className="btn btn-sm btn-danger"
          onClick={onRemove}
          disabled={!record.path}
          title="Delete File"
        >
          <i className="bi bi-trash"></i>
        </button>

        {showAiResults && (
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={onCheckValidity}
            disabled={!record.path || checking}
            title="Check Validity (AI)"
          >
            {checking ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-shield-check"></i>}
          </button>
        )}
      </div>
    </div>
  );
}