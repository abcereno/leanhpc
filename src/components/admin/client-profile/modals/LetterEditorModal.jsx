import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Button, Spinner, Alert, Tabs, Tab, Form } from "react-bootstrap";
import { useEditor, useEditorState, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
// Color/FontFamily/FontSize all ship inside @tiptap/extension-text-style
// as of v3.28 (no separate @tiptap/extension-color package needed — that
// package is just a re-export of the same Color extension). All three
// attach attributes to the same `textStyle` mark and render as inline
// styles, so they round-trip through editor.getHTML() and carry into the
// generated PDF exactly like the pre-existing color rotation does — see
// src/utils/letterTemplate.js's header comment.
import { TextStyle, Color, FontFamily, FontSize } from "@tiptap/extension-text-style";
import { supabase } from "../../../../supabaseClient";
import useLogger from "../../../../hooks/useLogger";
import { useToast } from "../../../shared/ui/ToastNotifier";
import { groupDisputableByBureau } from "../../../../utils/inquiryCounts";
import { compileLetterHtml } from "../../../../utils/letterTemplate";
import { generateLetterPdfBlob, downloadBlob, PAGE_WIDTH_IN, PAGE_MARGIN_IN, PAGE_HEIGHT_IN, LETTER_TYPOGRAPHY_CSS } from "../../../../utils/letterPdf";
import {
  LETTER_TYPES,
  initialVariantIndex,
  nextVariantIndex,
  getVariantText,
  initialBannerIndex,
  nextBannerIndex,
  getBannerText,
} from "../../../../data/letterContentBank";
import { ASSET_KEYS, ASSET_LABELS, VALIDATION_BADGES } from "../../../../utils/documentAssetLabels";
import { validateDocument } from "../../../../utils/validateDocument";

const BUCKET = "cover-letter-assets";
const DEFAULT_LETTER_TYPE = "standard";

// Toolbar options. "" always means "unset — inherit the default" (the
// container's Helvetica/Arial 11pt from src/utils/letterPdf.js), never a
// hardcoded value duplicating that default, so the two stay in sync.
const FONT_FAMILIES = [
  { value: "'Times New Roman', Times, serif", label: "Times New Roman" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Calibri, sans-serif", label: "Calibri" },
];
const FONT_SIZES = ["9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt"];

// Matches COLOR_ROTATION in src/utils/letterTemplate.js exactly — these
// are the "purple, magenta, cyan" colors the source document requires,
// offered as one-click swatches. Black is included so staff can revert a
// selection back to plain text.
const BRAND_COLORS = [
  { value: "#7C1FA0", label: "Purple" },
  { value: "#C2007F", label: "Magenta" },
  { value: "#0891B2", label: "Cyan" },
  { value: "#000000", label: "Black" },
];

// In-house replacement for the "edit first, then generate" step of the
// admin "Standard Letters" flow — see useInquiriesThread.js's
// generateDisputeLetters, which stays untouched: this is a separate,
// additional flow (new button alongside it in InquiriesThread.jsx), not
// a replacement.
//
// Letter body content is rotated from src/data/letterContentBank.js — a
// static, pre-approved wording library the client provided directly,
// per their explicit choice to use that instead of live OpenAI
// generation ("we have a lot of version so its not the same per
// client"). "Letter Type" picks which bank (Standard Inquiry Dispute vs
// Identity Theft Escalation) is used — a manual per-letter choice, per
// the client's answer, not auto-tied to dispute round or anything else.
// The compiled letter is shown in an editable Tiptap editor so staff can
// review/tweak before the PDF is created, saved to client_documents, and
// downloaded.
export default function LetterEditorModal({ show, onClose, clientId, letterAssets, inquiries, round = 1, userId, onGenerated }) {
  const logAction = useLogger();
  const { addToast } = useToast();

  const [loadingClient, setLoadingClient] = useState(false);
  const [letterType, setLetterType] = useState(DEFAULT_LETTER_TYPE);
  const [letters, setLetters] = useState({}); // { bureau: html }
  const [variantIndexes, setVariantIndexes] = useState({}); // { bureau: index into the active body bank }
  // Separate from variantIndexes above — the banner assertion
  // (letterContentBank.js's BANNER_ASSERTIONS) rotates independently of
  // which letter type/body bank is selected, since it isn't part of
  // LETTER_TYPES.
  const [bannerIndexes, setBannerIndexes] = useState({}); // { bureau: index into BANNER_ASSERTIONS }
  const [activeBureau, setActiveBureau] = useState(null);
  const [clientInfo, setClientInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  // Validity status for the same license/SSN/POA docs that get attached
  // as extra pages to every generated letter PDF (see
  // src/utils/letterPdf.js) — shown here so staff can see, at the moment
  // they're about to generate the letter, exactly what will be attached
  // and whether the AI check flagged anything. Warning-only, same as
  // CoverLetterAssets.jsx: nothing here blocks generation.
  const [assetDocs, setAssetDocs] = useState({
    license: { validation: null },
    ssn: { validation: null },
    poa: { validation: null },
  });
  // Which asset key(s) currently have a check in flight — drives the
  // "Check Now" button's spinner in the Attached Documents panel below.
  const [checkingAssetKeys, setCheckingAssetKeys] = useState({});

  const prevShowRef = useRef(false);
  const activeBureauRef = useRef(null);
  useEffect(() => {
    activeBureauRef.current = activeBureau;
  }, [activeBureau]);

  const byBureau = useMemo(() => groupDisputableByBureau(inquiries), [inquiries]);

  const editor = useEditor(
    {
      extensions: [StarterKit, TextStyle, Color, FontFamily, FontSize],
      content: "",
      onUpdate: ({ editor: ed }) => {
        const bureau = activeBureauRef.current;
        if (bureau) setLetters((prev) => ({ ...prev, [bureau]: ed.getHTML() }));
      },
    },
    []
  );

  // Drives the toolbar's active/highlighted states (bold button pressed,
  // current font/size/color shown) — re-evaluated on every selection
  // change and edit, not just on mount, unlike reading editor.isActive()
  // directly in the render body (which wouldn't trigger a re-render).
  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) {
        return { bold: false, italic: false, underline: false, strike: false, color: "", fontFamily: "", fontSize: "" };
      }
      const textStyleAttrs = ed.getAttributes("textStyle");
      return {
        bold: ed.isActive("bold"),
        italic: ed.isActive("italic"),
        underline: ed.isActive("underline"),
        strike: ed.isActive("strike"),
        color: textStyleAttrs.color || "",
        fontFamily: textStyleAttrs.fontFamily || "",
        fontSize: textStyleAttrs.fontSize || "",
      };
    },
  });

  // Keep the editor's displayed content in sync with the active tab —
  // guarded so it never fires from our own onUpdate above (which already
  // leaves editor.getHTML() equal to letters[activeBureau]).
  useEffect(() => {
    if (!editor || !activeBureau) return;
    const next = letters[activeBureau];
    if (next !== undefined && editor.getHTML() !== next) {
      editor.commands.setContent(next, false);
    }
  }, [editor, activeBureau, letters]);

  const compileForBureau = useCallback(
    (clientRow, bureau, typeKey, variantIndex, bannerIndex) => {
      const list = byBureau[bureau] || [];
      const bodyText = getVariantText(typeKey, variantIndex);
      const bannerText = getBannerText(bannerIndex);
      return compileLetterHtml({ client: clientRow, bureau, inquiries: list, bodyText, bannerText });
    },
    [byBureau]
  );

  // Same missing-column fallback CoverLetterAssets.jsx uses — the
  // validation columns (sql/add_document_validation.sql) may not exist
  // in every environment yet, and a schema mismatch here should only
  // mean "no badge shown," never break letter generation.
  const loadAssetDocs = useCallback(async () => {
    if (!clientId) return;
    try {
      let { data, error } = await supabase
        .from("client_documents")
        .select("file_name, validation_status, validation_notes, expires_at")
        .eq("client_id", clientId)
        .in("file_name", ASSET_KEYS)
        .order("created_at", { ascending: false });

      if (error && /validation_status|validation_notes|expires_at/i.test(error.message || "")) {
        const fallback = await supabase
          .from("client_documents")
          .select("file_name")
          .eq("client_id", clientId)
          .in("file_name", ASSET_KEYS)
          .order("created_at", { ascending: false });
        data = fallback.data;
        error = fallback.error;
      }
      if (error) throw error;

      const next = { license: { validation: null }, ssn: { validation: null }, poa: { validation: null } };
      (data || []).forEach((row) => {
        if (ASSET_KEYS.includes(row.file_name) && !next[row.file_name].validation) {
          next[row.file_name].validation =
            row.validation_status && row.validation_status !== "pending"
              ? { status: row.validation_status, reasoning: row.validation_notes, expiresAt: row.expires_at }
              : null;
        }
      });
      setAssetDocs(next);
    } catch (err) {
      console.warn("Could not load document validation status:", err);
    }
  }, [clientId]);

  // Lets staff trigger (or retrigger) the AI check right here instead of
  // having to leave the letter editor and go find the document on the
  // client's profile — added because "Not checked" showing here had no
  // remedy short of that detour. Re-checks from the signed URL already
  // in `letterAssets` (same pattern as CoverLetterAssets.jsx's manual
  // "Check Validity" button), and persists the result the same way, so
  // it sticks the next time this panel loads.
  const handleCheckAsset = useCallback(
    async (key) => {
      const fileUrl = letterAssets?.[`${key}Url`];
      if (!fileUrl || !clientId) return;
      setCheckingAssetKeys((prev) => ({ ...prev, [key]: true }));
      try {
        const result = await validateDocument({ docType: key, fileUrl, clientName: clientInfo?.full_name });
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
          })
          .eq("client_id", clientId)
          .eq("file_name", key)
          .select("id");

        setAssetDocs((prev) => ({
          ...prev,
          [key]: { validation: { status: result.status, reasoning: result.reasoning, expiresAt: result.expiresAt } },
        }));

        if (updErr) {
          console.error("Failed to save validation result:", updErr);
          addToast({
            title: "Check Ran, But Couldn't Save",
            message: `The AI checked this document, but the result couldn't be saved (${updErr.message}). It will show as "Not checked" again after reopening this modal — confirm sql/add_document_validation.sql has been run.`,
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
            message: `The AI checked this document, but the save was silently blocked — no database error, but 0 rows were updated. This points to a missing UPDATE permission (Row Level Security policy) on client_documents, not a missing migration. It will show as "Not checked" again after reopening this modal.`,
            variant: "danger",
            icon: "bi-exclamation-octagon-fill",
            timeout: 15000,
          });
          return;
        }

        const badge = VALIDATION_BADGES[result.status];
        addToast({
          title: `${ASSET_LABELS[key] || key}: ${badge?.label || result.status}`,
          message: result.reasoning || "",
          variant: result.status === "valid" ? "success" : result.status === "needs_review" ? "info" : "warning",
          icon: badge?.icon ? `bi ${badge.icon}` : "bi-info-circle-fill",
        });
      } catch (err) {
        console.error("Validation error:", err);
      } finally {
        setCheckingAssetKeys((prev) => ({ ...prev, [key]: false }));
      }
    },
    [clientId, clientInfo, letterAssets, addToast]
  );

  const runGeneration = useCallback(async () => {
    if (!clientId) return;
    setLoadingClient(true);
    setLetters({});
    setVariantIndexes({});
    setBannerIndexes({});
    setActiveBureau(null);
    loadAssetDocs();
    try {
      const { data: clientRow, error } = await supabase
        .from("clients")
        .select("full_name, address, dob, ssn")
        .eq("id", clientId)
        .single();
      if (error || !clientRow) throw new Error(error?.message || "Client not found");
      setClientInfo(clientRow);

      const bureaus = Object.keys(byBureau);
      if (!bureaus.length) {
        addToast({
          title: "Nothing to Generate",
          message: "No non-linked or disputable inquiries found. Items marked 'deleted' are ignored for new letters.",
          variant: "warning",
          icon: "bi-info-circle-fill",
        });
        return;
      }

      const nextLetters = {};
      const nextIndexes = {};
      const nextBannerIndexes = {};
      bureaus.forEach((bureau) => {
        const idx = initialVariantIndex(letterType, clientId, bureau);
        const bannerIdx = initialBannerIndex(clientId, bureau);
        nextIndexes[bureau] = idx;
        nextBannerIndexes[bureau] = bannerIdx;
        nextLetters[bureau] = compileForBureau(clientRow, bureau, letterType, idx, bannerIdx);
      });

      setLetters(nextLetters);
      setVariantIndexes(nextIndexes);
      setBannerIndexes(nextBannerIndexes);
      setActiveBureau(bureaus[0]);
    } catch (err) {
      console.error("Letter generation failed:", err);
      addToast({ title: "Generation Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill", timeout: 8000 });
    } finally {
      setLoadingClient(false);
    }
  }, [clientId, byBureau, addToast, compileForBureau, loadAssetDocs, letterType]);

  useEffect(() => {
    if (show && !prevShowRef.current) runGeneration();
    prevShowRef.current = show;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  // Changing letter type re-rolls every bureau's letter from the new
  // bank (same discard-edits confirmation as trying another version,
  // since it swaps the whole body).
  const handleLetterTypeChange = (nextType) => {
    if (nextType === letterType) return;
    const bureaus = Object.keys(letters);
    if (bureaus.length && !window.confirm("Switch letter type? Any edits you've made will be lost.")) return;
    setLetterType(nextType);
    if (!clientInfo) return;
    const nextLetters = {};
    const nextIndexes = {};
    bureaus.forEach((bureau) => {
      const idx = initialVariantIndex(nextType, clientId, bureau);
      nextIndexes[bureau] = idx;
      // Banner assertion isn't tied to letter type — reuse whatever
      // index this bureau already has (falling back to the same
      // deterministic starting index if it somehow isn't set yet).
      const bannerIdx = bannerIndexes[bureau] ?? initialBannerIndex(clientId, bureau);
      nextLetters[bureau] = compileForBureau(clientInfo, bureau, nextType, idx, bannerIdx);
    });
    setLetters(nextLetters);
    setVariantIndexes(nextIndexes);
  };

  // Cycles the active bureau's letter to the next version in the same
  // bank — no network call, since the content is a static, pre-approved
  // library (src/data/letterContentBank.js), not live-generated.
  // Cycles BOTH the body paragraphs and the banner assertion together —
  // "another version" should mean a genuinely different letter, not just
  // different body wording with the same banner line every time.
  const handleTryAnotherVersion = () => {
    if (!activeBureau || !clientInfo) return;
    if (!window.confirm("Try another version of this letter? Any edits you've made will be lost.")) return;
    const currentIdx = variantIndexes[activeBureau] ?? 0;
    const idx = nextVariantIndex(letterType, currentIdx);
    const currentBannerIdx = bannerIndexes[activeBureau] ?? 0;
    const bannerIdx = nextBannerIndex(currentBannerIdx);
    setVariantIndexes((prev) => ({ ...prev, [activeBureau]: idx }));
    setBannerIndexes((prev) => ({ ...prev, [activeBureau]: bannerIdx }));
    setLetters((prev) => ({ ...prev, [activeBureau]: compileForBureau(clientInfo, activeBureau, letterType, idx, bannerIdx) }));
  };

  const handleSaveAll = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      // onUpdate already keeps `letters` in sync as the user types, but
      // reading the active tab straight from the editor avoids any gap
      // between the last keystroke and this click.
      const finalLetters = { ...letters };
      if (activeBureau && editor) finalLetters[activeBureau] = editor.getHTML();

      const savedBureaus = [];
      for (const [bureau, html] of Object.entries(finalLetters)) {
        const pdfBlob = await generateLetterPdfBlob({ html, assets: letterAssets });
        const storagePath = `${clientId}/letters/round-${round}-${bureau.toLowerCase()}-${Date.now()}.pdf`;

        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, pdfBlob, { contentType: "application/pdf" });
        if (uploadError) throw new Error(`${bureau}: ${uploadError.message}`);

        const { error: insertError } = await supabase.from("client_documents").insert({
          client_id: clientId,
          file_name: `Round ${round} - ${bureau} Cover Letter (In-House)`,
          file_url: storagePath,
          uploaded_by: userId,
          // Alignment Check (AlignmentCheckPanel.jsx) filters on doc_type —
          // without this, every letter generated after
          // sql/add_document_alignment_check.sql's one-time backfill would
          // have doc_type null and silently never show up there.
          doc_type: "letter",
        });
        if (insertError) throw new Error(`${bureau}: ${insertError.message}`);

        downloadBlob(pdfBlob, `${bureau} Cover Letter.pdf`);
        savedBureaus.push(bureau);
      }

      await logAction({
        action: "generate_letter_inhouse",
        targetId: clientId,
        targetName: clientInfo?.full_name || "Client",
        details: `Generated in-house Round ${round} (${LETTER_TYPES[letterType]?.label || letterType}) letters for ${savedBureaus.join(", ")}.`,
      });

      addToast({
        title: "Letters Saved",
        message: `${savedBureaus.join(", ")} saved to the Documents tab and downloaded.`,
        variant: "success",
        icon: "bi-file-earmark-check-fill",
      });

      onGenerated && onGenerated();
      onClose();
    } catch (err) {
      console.error("Save letters failed:", err);
      addToast({ title: "Save Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill", timeout: 8000 });
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  const bureausReady = Object.keys(letters);

  return (
    <Modal show={show} onHide={onClose} size="xl" backdrop="static">
      <Modal.Header closeButton className="bg-dark text-white">
        <Modal.Title>
          <i className="bi bi-pencil-square me-2"></i> Generate Letter (In-House)
        </Modal.Title>
      </Modal.Header>
      <Modal.Body className="bg-light">
        <div className="mb-3 p-3 bg-white border rounded">
          <div className="fw-bold small text-uppercase text-muted mb-2">
            <i className="bi bi-paperclip me-1"></i>Attached Documents
            <span className="fw-normal normal-case ms-2 text-muted" style={{ textTransform: "none" }}>
              — these are added as extra pages to every letter PDF below
            </span>
          </div>
          <div className="d-flex flex-wrap gap-4">
            {ASSET_KEYS.map((key) => {
              const url = letterAssets?.[`${key}Url`];
              const validation = assetDocs[key]?.validation;
              const badge = validation ? VALIDATION_BADGES[validation.status] : null;
              const isImage = url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
              return (
                <div key={key} className="d-flex align-items-center gap-2" style={{ minWidth: 180 }}>
                  <div
                    className="flex-shrink-0"
                    style={{
                      width: 56,
                      height: 56,
                      border: "1px solid #dee2e6",
                      borderRadius: 8,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      background: "#f8f9fa",
                    }}
                  >
                    {url ? (
                      isImage ? (
                        <img src={url} alt={ASSET_LABELS[key]} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
                      ) : (
                        <i className="bi bi-file-earmark-pdf-fill fs-4 text-danger"></i>
                      )
                    ) : (
                      <i className="bi bi-file-earmark-x fs-4 text-muted opacity-50"></i>
                    )}
                  </div>
                  <div>
                    <div className="small fw-semibold">{ASSET_LABELS[key]}</div>
                    {!url ? (
                      <span className="small text-danger">
                        <i className="bi bi-exclamation-triangle-fill me-1"></i>Not uploaded
                      </span>
                    ) : badge ? (
                      <span
                        className={`small fw-semibold ${badge.className}`}
                        title={[validation.reasoning, validation.expiresAt ? `Date on file: ${validation.expiresAt}` : null].filter(Boolean).join(" — ")}
                      >
                        <i className={`bi ${badge.icon} me-1`}></i>
                        {badge.label}
                      </span>
                    ) : (
                      <span className="small text-muted opacity-75">Not checked</span>
                    )}
                    {url && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm p-0 ms-2 align-baseline"
                        onClick={() => handleCheckAsset(key)}
                        disabled={!!checkingAssetKeys[key]}
                        title="Run the AI validity check now"
                      >
                        {checkingAssetKeys[key] ? (
                          <span className="spinner-border spinner-border-sm" style={{ width: "0.75rem", height: "0.75rem" }}></span>
                        ) : badge ? (
                          "Recheck"
                        ) : (
                          "Check Now"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Form.Group className="mb-3" style={{ maxWidth: 320 }}>
          <Form.Label className="small fw-bold text-muted text-uppercase">Letter Type</Form.Label>
          <Form.Select value={letterType} onChange={(e) => handleLetterTypeChange(e.target.value)} disabled={loadingClient}>
            {Object.entries(LETTER_TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        {loadingClient && (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" />
            <p className="mt-3 text-muted">Compiling letter…</p>
          </div>
        )}

        {!loadingClient && bureausReady.length === 0 && (
          <Alert variant="warning" className="mb-0">
            No non-linked or disputable inquiries found for this client.
          </Alert>
        )}

        {!loadingClient && bureausReady.length > 0 && (
          <>
            <Tabs activeKey={activeBureau} onSelect={(k) => setActiveBureau(k)} className="mb-3">
              {bureausReady.map((bureau) => (
                <Tab key={bureau} eventKey={bureau} title={bureau} />
              ))}
            </Tabs>

            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="text-muted small">
                <i className="bi bi-info-circle me-1"></i>
                Colored text is intentional — leave it as-is unless you have a specific reason to change it.
              </span>
              <Button variant="outline-secondary" size="sm" onClick={handleTryAnotherVersion}>
                <i className="bi bi-arrow-clockwise me-1"></i>
                Try Another Version
              </Button>
            </div>

            <div className="d-flex flex-wrap align-items-center gap-3 mb-2 p-2 bg-white border rounded">
              <div className="btn-group btn-group-sm" role="group" aria-label="Text style">
                <Button
                  variant={toolbarState.bold ? "dark" : "outline-secondary"}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  title="Bold"
                >
                  <i className="bi bi-type-bold"></i>
                </Button>
                <Button
                  variant={toolbarState.italic ? "dark" : "outline-secondary"}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  title="Italic"
                >
                  <i className="bi bi-type-italic"></i>
                </Button>
                <Button
                  variant={toolbarState.underline ? "dark" : "outline-secondary"}
                  onClick={() => editor.chain().focus().toggleUnderline().run()}
                  title="Underline"
                >
                  <i className="bi bi-type-underline"></i>
                </Button>
                <Button
                  variant={toolbarState.strike ? "dark" : "outline-secondary"}
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  title="Strikethrough"
                >
                  <i className="bi bi-type-strikethrough"></i>
                </Button>
              </div>

              <Form.Select
                size="sm"
                style={{ width: 190 }}
                value={toolbarState.fontFamily}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) editor.chain().focus().setFontFamily(value).run();
                  else editor.chain().focus().unsetFontFamily().run();
                }}
                title="Font"
              >
                <option value="">Default Font</option>
                {FONT_FAMILIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Form.Select>

              <Form.Select
                size="sm"
                style={{ width: 130 }}
                value={toolbarState.fontSize}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) editor.chain().focus().setFontSize(value).run();
                  else editor.chain().focus().unsetFontSize().run();
                }}
                title="Font Size"
              >
                <option value="">Default Size</option>
                {FONT_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Form.Select>

              <div className="d-flex align-items-center gap-1">
                <span className="small text-muted me-1">Color:</span>
                {BRAND_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => editor.chain().focus().setColor(c.value).run()}
                    title={c.label}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: c.value,
                      border: toolbarState.color.toLowerCase() === c.value.toLowerCase() ? "2px solid #000" : "1px solid #ccc",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                ))}
                <input
                  type="color"
                  value={/^#([0-9a-f]{6})$/i.test(toolbarState.color) ? toolbarState.color : "#000000"}
                  onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                  title="Custom color"
                  style={{ width: 26, height: 26, padding: 0, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
                />
                <Button variant="outline-secondary" size="sm" onClick={() => editor.chain().focus().unsetColor().run()} title="Clear color">
                  <i className="bi bi-x-lg"></i>
                </Button>
              </div>
            </div>

            {/* "Page" preview: a full PAGE_WIDTH_IN x PAGE_HEIGHT_IN (8.5x11)
                white rectangle with the same PAGE_MARGIN_IN (0.75in) inset the
                PDF actually prints with — a Google-Docs-style page, not just a
                same-width text column with no visible edges — sized/padded off
                the exact constants letterPdf.js renders the PDF with, so it
                can't silently drift out of sync with the real output.

                Deliberately NOT using the `bg-white` class here — index.css's
                "Utility Overrides" section globally hijacks `.bg-white` to
                the app's dark card color (#151E32) with !important, for
                every other screen's dark theme. That's fine for normal UI,
                but this page has to look like an actual sheet of white paper
                with black text no matter what theme is active (same problem
                ClientProgressPage.jsx's .report-page/.print-page already
                solved the same way) — so background/color are forced here
                with !important, on the page div itself, not just the inner
                ProseMirror text. */}
            <style>{`
              .letter-editor-page {
                background-color: #fff !important;
                color: #000 !important;
                box-sizing: border-box;
                width: ${PAGE_WIDTH_IN}in;
                min-height: ${PAGE_HEIGHT_IN}in;
                padding: ${PAGE_MARGIN_IN}in;
                margin: 0 auto;
              }
              .letter-editor-page .ProseMirror { ${LETTER_TYPOGRAPHY_CSS} outline: none; min-height: 100%; }
            `}</style>
            <div
              className="d-flex justify-content-center p-4 rounded"
              style={{ background: "#dee2e6", maxHeight: "70vh", overflow: "auto" }}
            >
              <div className="letter-editor-page shadow" style={{ flexShrink: 0 }}>
                <EditorContent editor={editor} />
              </div>
            </div>
          </>
        )}
      </Modal.Body>
      <Modal.Footer className="bg-light border-0">
        <Button variant="outline-secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" disabled={loadingClient || saving || bureausReady.length === 0} onClick={handleSaveAll}>
          {saving ? (
            <>
              <Spinner as="span" animation="border" size="sm" className="me-2" />
              Creating PDFs…
            </>
          ) : (
            <>
              <i className="bi bi-file-earmark-pdf me-2"></i>
              Create PDF(s), Save &amp; Download
            </>
          )}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
