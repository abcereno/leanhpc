// src/components/shared/client-pages/CoverLetterAssetsLTOS.jsx
//
// LTOS Document Requirements uploader — used by the company portal
// (AddClientModal.jsx) and the public intake form (AddClientForm.jsx).
// A DIFFERENT taxonomy than the admin-side CoverLetterAssets.jsx (which
// still uses the original fixed license/SSN/POA system, untouched by
// this file): each of the three slots here is a CATEGORY that accepts
// several alternative document types —
//   - Identity Verification: Driver's License, State ID, or Passport
//   - Proof of Address: Utility Bill, Bank Statement, Mortgage
//     Statement, Lease Agreement, Property Deed, Insurance Statement,
//     or Government Mail
//   - Authorization: Signed Limited Power of Attorney ("when
//     applicable" — optional, unlike the other two)
// See src/utils/documentAssetLabels.js (LTOS_KEYS/LTOS_LABELS/
// LTOS_REQUIRED/LTOS_TYPE_LABELS) and supabase/functions/validate-document
// (CATEGORY_TYPES) for the full taxonomy — those three must stay in sync.
//
// The uploader does NOT ask which specific type they're uploading — the
// AI auto-detects it from the image (product decision) and the result
// (status/detectedType/expiresAt/reasoning) is shown as a badge, mirroring
// CoverLetterAssets.jsx's warning-only pattern: nothing here blocks an
// upload or downstream action, it's purely a visible signal for staff.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../supabaseClient";
import { useToast } from "../ui/ToastNotifier";
import { validateDocument } from "../../../utils/validateDocument";
import { LTOS_KEYS as KEYS, LTOS_LABELS, LTOS_REQUIRED, LTOS_TYPE_LABELS, VALIDATION_BADGES } from "../../../utils/documentAssetLabels";
import useDropzone from "../../../hooks/useDropzone";

const BUCKET = "cover-letter-assets";
const SIGNED_URL_TTL = 60 * 60 * 24 * 7;

const emptyAssets = () => ({
  identity: { path: null, signedUrl: null, validation: null, docType: null },
  address: { path: null, signedUrl: null, validation: null, docType: null },
  authorization: { path: null, signedUrl: null, validation: null, docType: null },
});

export default function CoverLetterAssetsLTOS({
  clientId,
  onChange,
  companyName,
  clientName,
  clientAddress,
}) {
  const { addToast } = useToast();
  const shouldRender = useMemo(() => {
    if (!companyName) return true;
    return !companyName.toLowerCase().includes("trusted");
  }, [companyName]);

  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState(emptyAssets);
  const [checkingKeys, setCheckingKeys] = useState({});
  const [pending, setPending] = useState({});
  const mounted = useRef(true);

  // 1. Initial Load: Fetch from DB table
  useEffect(() => {
    if (!shouldRender || !clientId) return;
    mounted.current = true;

    (async () => {
      setLoading(true);
      try {
        let { data, error } = await supabase
          .from("client_documents")
          .select("file_name, file_url, validation_status, validation_notes, expires_at, ai_confidence, doc_type")
          .eq("client_id", clientId)
          .in("file_name", KEYS);

        // sql/add_document_validation.sql may not have run in this
        // environment yet — same missing-column fallback pattern used by
        // CoverLetterAssets.jsx, so an unapplied migration never makes
        // already-uploaded documents look like they vanished.
        if (error && /validation_status|validation_notes|expires_at|ai_confidence|doc_type/i.test(error.message || "")) {
          console.warn("client_documents validation columns not found (run sql/add_document_validation.sql) — loading without validation state.");
          const fallback = await supabase
            .from("client_documents")
            .select("file_name, file_url")
            .eq("client_id", clientId)
            .in("file_name", KEYS);
          data = fallback.data;
          error = fallback.error;
        }

        if (error) throw error;

        const next = emptyAssets();
        for (const row of (data || [])) {
          if (!KEYS.includes(row.file_name)) continue;
          next[row.file_name].path = row.file_url;
          next[row.file_name].signedUrl = await getSignedUrl(row.file_url);
          next[row.file_name].docType = row.doc_type || null;
          next[row.file_name].validation =
            row.validation_status && row.validation_status !== "pending"
              ? {
                  status: row.validation_status,
                  reasoning: row.validation_notes,
                  expiresAt: row.expires_at,
                  confidence: row.ai_confidence,
                }
              : null;
        }
        if (!mounted.current) return;
        setAssets(next);
        notifyParent(next);
      } catch (err) {
        console.error("Load assets error:", err);
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();

    return () => {
      mounted.current = false;
    };
  }, [clientId, shouldRender]);

  // 2. Flush pending once ID exists
  useEffect(() => {
    if (clientId && Object.keys(pending).length > 0) {
      Object.entries(pending).forEach(([key, file]) => {
        if (file) handleUploadInternal(key, file);
      });
      setPending({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, pending]);

  async function getSignedUrl(path) {
    if (!path) return null;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
    return data?.signedUrl || null;
  }

  function notifyParent(assetState) {
    if (onChange) {
      onChange({
        identityUrl: assetState.identity.signedUrl || undefined,
        addressUrl: assetState.address.signedUrl || undefined,
        authorizationUrl: assetState.authorization.signedUrl || undefined,
      });
    }
  }

  async function handleUpload(key, file) {
    if (!clientId) {
      setPending((cur) => ({ ...cur, [key]: file }));
      return;
    }
    await handleUploadInternal(key, file);
  }

  async function handleUploadInternal(key, file) {
    if (!clientId || !file) return;
    setLoading(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${clientId}/${key}.${ext}`;

      // A. Storage Upload
      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // B. MANUAL SYNC (Instead of Upsert)
      await supabase
        .from("client_documents")
        .delete()
        .eq("client_id", clientId)
        .eq("file_name", key);

      // doc_type starts null — the specific type (e.g. "passport") isn't
      // known until the AI check below runs; same missing-column
      // fallback CoverLetterAssets.jsx uses in case the migration hasn't
      // run in this environment yet.
      let { error: insErr } = await supabase
        .from("client_documents")
        .insert({ client_id: clientId, file_name: key, file_url: path });
      if (insErr) throw insErr;

      const signedUrl = await getSignedUrl(path);
      const next = { ...assets, [key]: { path, signedUrl, validation: null, docType: null } };
      setAssets(next);
      notifyParent(next);

      // AI validity check runs automatically right after upload (same
      // product decision as CoverLetterAssets.jsx). Not awaited — the
      // upload itself is already done.
      runValidation(key, file);
    } catch (err) {
      console.error("Upload error:", err);
      addToast({ title: "Upload Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  }

  // Shared by the automatic post-upload check and the manual "Check"
  // button — `file` (fresh File) right after upload, `fileUrl` (signed
  // Storage URL) to re-check a document already on file. Warning-only:
  // never blocks anything, just records what the AI saw.
  async function runValidation(key, file, fileUrl) {
    if (!clientId) return;
    setCheckingKeys((prev) => ({ ...prev, [key]: true }));
    try {
      const result = await validateDocument({ category: key, file, fileUrl, clientName, clientAddress });
      if (!result.success) {
        addToast({ title: "Validity Check Failed", message: result.reasoning || "Could not check this document right now.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
        return;
      }

      // `.select("id")` required to detect a silent-RLS no-op — see
      // CoverLetterAssets.jsx's runValidation for the full explanation.
      const { data: updated, error: updErr } = await supabase
        .from("client_documents")
        .update({
          validation_status: result.status,
          validation_notes: result.reasoning || null,
          expires_at: result.expiresAt || null,
          ai_confidence: result.confidence,
          validated_at: new Date().toISOString(),
          doc_type: result.detectedType || null,
        })
        .eq("client_id", clientId)
        .eq("file_name", key)
        .select("id");

      if (mounted.current) {
        setAssets((prev) => ({
          ...prev,
          [key]: {
            ...prev[key],
            docType: result.detectedType || null,
            validation: { status: result.status, reasoning: result.reasoning, expiresAt: result.expiresAt, confidence: result.confidence },
          },
        }));
      }

      if (updErr) {
        console.error("Failed to save validation result:", updErr);
        addToast({
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
        addToast({
          title: "Check Ran, But Couldn't Save",
          message: `The AI checked this document, but the save was silently blocked — no database error, but 0 rows were updated. This points to a missing UPDATE permission (Row Level Security policy) on client_documents, not a missing migration. It will show as "Not checked" again after reloading.`,
          variant: "danger",
          icon: "bi-exclamation-octagon-fill",
          timeout: 15000,
        });
        return;
      }

      const badge = VALIDATION_BADGES[result.status];
      const typeLabel = result.detectedType ? LTOS_TYPE_LABELS[result.detectedType] || result.detectedType : null;
      addToast({
        title: `${LTOS_LABELS[key]}${typeLabel ? ` (${typeLabel})` : ""}: ${badge?.label || result.status}`,
        message: result.reasoning || "",
        variant: result.status === "valid" ? "success" : result.status === "needs_review" ? "info" : "warning",
        icon: badge?.icon ? `bi ${badge.icon}` : "bi-info-circle-fill",
      });
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
    if (!clientId) {
      setPending((cur) => ({ ...cur, [key]: undefined }));
      return;
    }
    setLoading(true);
    try {
      const path = assets[key].path;
      if (path) await supabase.storage.from(BUCKET).remove([path]);

      await supabase.from("client_documents")
        .delete().eq("client_id", clientId).eq("file_name", key);

      const next = { ...assets, [key]: { path: null, signedUrl: null, validation: null, docType: null } };
      setAssets(next);
      notifyParent(next);
    } catch (err) {
      console.error("Remove error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (!shouldRender) return null;

  return (
    <div className="card mb-4 border-primary shadow-sm bg-white">
      <div className="card-header bg-primary text-white py-2 d-flex align-items-center justify-content-between">
        <strong className="small text-uppercase">LTOS Identification Documents</strong>
        {loading && <span className="small"><span className="spinner-border spinner-border-sm me-1"></span>Saving…</span>}
      </div>
      <div className="card-body">
        <div className="row g-3">
          {KEYS.map((k) => (
            <div className="col-md-4" key={k}>
              <AssetTile
                assetKey={k}
                label={LTOS_LABELS[k]}
                required={LTOS_REQUIRED[k]}
                record={assets[k]}
                checking={!!checkingKeys[k]}
                placeholder={pending[k] ? `Queued: ${pending[k].name}` : "Upload File"}
                onUpload={(f) => handleUpload(k, f)}
                onRemove={() => handleRemove(k)}
                onCheckValidity={() => handleCheckValidity(k)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AssetTile({ label, required, record, checking, placeholder, onUpload, onRemove, onCheckValidity }) {
  const isImage = record.signedUrl && /\.(png|jpe?g|webp|gif)/i.test(record.signedUrl);
  const badge = record.validation ? VALIDATION_BADGES[record.validation.status] : null;
  const typeLabel = record.docType ? LTOS_TYPE_LABELS[record.docType] || record.docType : null;

  // Single-file drop target — dropping more than one file onto a tile
  // just takes the first, matching what the click-to-upload button
  // already does (one document per category slot).
  const { isDragActive, dropzoneProps } = useDropzone({
    onFiles: (dropped) => dropped[0] && onUpload(dropped[0]),
  });

  return (
    <div
      {...dropzoneProps}
      className={`border rounded p-2 text-center h-100 d-flex flex-column ${isDragActive ? "border-primary bg-primary bg-opacity-10" : "bg-light"}`}
      style={isDragActive ? { borderStyle: "dashed", borderWidth: 2 } : undefined}
    >
      <div className="fw-bold small mb-1">
        {label}{required ? <span className="text-danger"> *</span> : <span className="text-muted fw-normal"> (when applicable)</span>}
      </div>

      <div className="mb-2" style={{ minHeight: "16px" }}>
        {checking ? (
          <span className="extra-small text-muted"><span className="spinner-border spinner-border-sm me-1" style={{ width: "0.65rem", height: "0.65rem" }}></span>Checking…</span>
        ) : badge ? (
          <span
            className={`extra-small fw-semibold ${badge.className}`}
            title={[record.validation.reasoning, record.validation.expiresAt ? `Date on file: ${record.validation.expiresAt}` : null].filter(Boolean).join(" — ")}
          >
            <i className={`bi ${badge.icon} me-1`}></i>{badge.label}{typeLabel ? ` · ${typeLabel}` : ""}
          </span>
        ) : record.path ? (
          <span className="extra-small text-muted opacity-75">Not checked</span>
        ) : null}
      </div>

      <div className="mb-2 bg-white border d-flex align-items-center justify-content-center" style={{ height: 100, borderRadius: 6, overflow: "hidden" }}>
        {isDragActive ? (
          <span className="text-primary fw-semibold extra-small px-2">
            <i className="bi bi-cloud-arrow-up-fill d-block mb-1 fs-4"></i>Drop to upload
          </span>
        ) : record.signedUrl ? (
          isImage ? <img src={record.signedUrl} alt="prev" style={{ maxWidth: "100%", maxHeight: "100%" }} />
          : <i className="bi bi-file-check text-success fs-2"></i>
        ) : (
          <span className="text-muted extra-small px-2">{placeholder} or drag & drop</span>
        )}
      </div>
      <div className="mt-auto d-flex gap-1">
        <label className="btn btn-sm btn-primary flex-fill mb-0">
          Upload <input type="file" hidden onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
        {record.path && (
          <button className="btn btn-sm btn-outline-secondary" onClick={onCheckValidity} disabled={checking} title="Check Validity (AI)">
            {checking ? <span className="spinner-border spinner-border-sm"></span> : <i className="bi bi-shield-check"></i>}
          </button>
        )}
        {record.path && <button className="btn btn-sm btn-outline-danger" onClick={onRemove}><i className="bi bi-trash"></i></button>}
      </div>
    </div>
  );
}
