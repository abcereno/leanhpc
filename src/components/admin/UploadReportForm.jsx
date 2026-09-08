// components/UploadReportForm.js
import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { getDocument } from "pdfjs-dist";
import { createWorker } from "tesseract.js";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/build/pdf.worker";
import OCRPreview from "./report-canvas/OcrPreview";
import ParsedInquiryPreview from "./report-canvas/ParsedInquiryPreview";
import { useAuth } from "../../context/AuthContext";
import { getEasternDateString } from "../../utils/timezone";
import { computeAiCounts, withDefaultedApprovedCounts, isBlankStartInquiries } from "../../utils/inquiryCounts";
import { fetchLenderAliases } from "../../utils/classifyInquiries";
import { flagGuardedInquiries } from "../../utils/aiReviewQueue";
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.js";

// Contrast-stretches a rendered page to grayscale before OCR — credit
// reports are dense small-font tables, and a mild grayscale + contrast
// boost (not a hard black/white threshold, which risks losing thin
// character strokes on lower-quality scans) measurably helps Tesseract's
// accuracy on this kind of content without needing a heavier image
// library.
function preprocessForOcr(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const contrasted = gray < 150 ? Math.max(0, gray - 25) : Math.min(255, gray + 25);
    data[i] = data[i + 1] = data[i + 2] = contrasted;
  }
  context.putImageData(imageData, 0, 0);
}

export default function UploadReportForm() {
  const {adminName, userId} = useAuth();
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState("");
  const [parsedInquiries, setParsedInquiries] = useState({
    accounts: [],
    experian: [],
    transunion: [],
    equifax: [],
  });
  const [uploading, setUploading] = useState(false);
  const [ocrText, setOcrText] = useState("");

  useEffect(() => {
    const fetchClients = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, full_name")
        .order("full_name", { ascending: true });
      if (error) console.error(error);
      else setClients(data);
    };

    fetchClients();
  }, []);

  const handleOCR = async () => {
    setMessage("");
    // A fresh Step 1 run invalidates whatever Step 2 previously produced —
    // without this, re-running OCR (new file, or retrying after a failure)
    // left the old ocrText/parsedInquiries sitting around, and Step 2 was
    // still enabled against that stale text.
    setOcrText("");
    setParsedInquiries({ accounts: [], experian: [], transunion: [], equifax: [] });
    if (!file) return setMessage("❌ Please upload a PDF.");
    setUploading(true);

    // One shared Tesseract worker for the whole document, reused across
    // every page. Tesseract.recognize(image, lang) — the previous
    // approach — spins up and tears down a brand-new worker on every
    // single call (see node_modules/tesseract.js/src/Tesseract.js), so a
    // 20-page report meant 20 full engine initializations instead of one.
    let worker;
    try {
      worker = await createWorker("eng");
    } catch (err) {
      console.error("OCR engine failed to start:", err);
      setMessage("❌ OCR engine failed to start.");
      setUploading(false);
      return;
    }

    const failedPages = [];
    try {
      const pdfBlob = await file.arrayBuffer();
      const pdf = await getDocument({ data: pdfBlob }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        setMessage(`🧠 OCR: page ${i} of ${pdf.numPages}...`);
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) throw new Error("Canvas context is null");

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({ canvasContext: context, viewport }).promise;
          preprocessForOcr(context, canvas.width, canvas.height);

          const imageDataUrl = canvas.toDataURL("image/png");
          if (!imageDataUrl || imageDataUrl.length < 100)
            throw new Error("Failed to get image data from canvas");

          const {
            data: { text },
          } = await worker.recognize(imageDataUrl);
          fullText += `\n\n--- PAGE ${i} ---\n\n` + text;
        } catch (err) {
          // Deliberately NOT appended to fullText. The old "[OCR failed]"
          // placeholder got spliced straight into what the account/inquiry
          // parser reads in Step 2, where it could be misread as real
          // report content. A failed page is just dropped and reported to
          // the user below instead.
          console.error(`❌ OCR failed on page ${i}:`, err);
          failedPages.push(i);
        }
      }

      setOcrText(fullText);
      setMessage(
        failedPages.length
          ? `⚠️ OCR complete — page(s) ${failedPages.join(", ")} failed and were skipped. Review below.`
          : "✅ OCR complete. Review below."
      );
    } catch (err) {
      console.error("OCR Error:", err);
      setMessage("❌ OCR failed.");
    } finally {
      await worker.terminate();
      setUploading(false);
    }
  };

  const splitOCRByPages = (ocrText, pagesPerChunk = 5) => {
    const pageChunks = ocrText.split(/--- PAGE \d+ ---/).filter(Boolean);
    const chunks = [];

    for (let i = 0; i < pageChunks.length; i += pagesPerChunk) {
      const chunkText = pageChunks.slice(i, i + pagesPerChunk).join("\n");
      chunks.push(chunkText.trim());
    }

    return chunks;
  };

const handleParse = async () => {
  setMessage("");
  if (!ocrText || !selectedClientId) {
    return setMessage("❌ Please complete OCR and select a client.");
  }

  setUploading(true);
  const chunks = splitOCRByPages(ocrText, 5);
  const allAccounts = [];
  let accumulatedInquiries = {
    experian: [],
    transunion: [],
    equifax: [],
  };
const classifiedInquiries = {
  experian: [],
  transunion: [],
  equifax: [],
};
  // STEP 1: Extract accounts
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i].trim();
    if (chunkText.length < 100) {
      console.warn(`⏭️ Skipping accounts chunk ${i + 1} (too short)`);
      continue;
    }

    setMessage(`📦 Extracting accounts from chunk ${i + 1} of ${chunks.length}...`);

    const accountRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/account-parser`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ text: chunkText }),
    });

    const accountJson = await accountRes.json();

    if (!accountJson.success) {
      setMessage(`❌ Account parse error in chunk ${i + 1}: ${accountJson.error}`);
      setUploading(false);
      return;
    }

    allAccounts.push(...accountJson.accounts);
  }

  // STEP 2: Extract inquiries
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i].trim();
    if (chunkText.length < 100) {
      console.warn(`⏭️ Skipping inquiry chunk ${i + 1} (too short)`);
      continue;
    }

    setMessage(`📦 Extracting inquiries from chunk ${i + 1} of ${chunks.length}...`);

    const inquiryRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/inquiry-parser`, {
      method: "POST",
      headers: {
        "Content-Type": "",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ text: chunkText }),
    });

    const inquiryJson = await inquiryRes.json();

    if (!inquiryJson.success) {
      setMessage(`❌ Inquiry parse error in chunk ${i + 1}: ${inquiryJson.error}`);
      setUploading(false);
      return;
    }

    classifiedInquiries.experian.push(...(inquiryJson.experian || []));
    classifiedInquiries.transunion.push(...(inquiryJson.transunion || []));
    classifiedInquiries.equifax.push(...(inquiryJson.equifax || []));
  }

  // STEP 3: Classify inquiries
  // Fetched once for the whole upload rather than per chunk — the lender
  // alias table (sql/add_lender_aliases.sql) doesn't change mid-upload,
  // same reference list every chunk needs.
  const lenderAliases = await fetchLenderAliases();
  const inquiryChunks = chunkInquiries(classifiedInquiries, 5);
  for (let i = 0; i < inquiryChunks.length; i++) {
    setMessage(`🤖 Classifying inquiry chunk ${i + 1} of ${inquiryChunks.length}...`);

    const classifyRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-inquiries`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ accounts: allAccounts, ...inquiryChunks[i], lenderAliases }),
    });

    const classifyJson = await classifyRes.json();

    if (!classifyJson.success) {
      setMessage(`❌ Classification failed in chunk ${i + 1}: ${classifyJson.error}`);
      setUploading(false);
      return;
    }

  accumulatedInquiries.experian.push(...(classifyJson.experian || []));
accumulatedInquiries.transunion.push(...(classifyJson.transunion || []));
accumulatedInquiries.equifax.push(...(classifyJson.equifax || []));

  }

  setParsedInquiries({ accounts: allAccounts, ...accumulatedInquiries });
  setMessage("✅ All inquiries classified successfully.");
  setUploading(false);
};


  const chunkInquiries = (inquiries, chunkSize = 5) => {
    const keys = ["experian", "transunion", "equifax"];
    const maxLen = Math.max(...keys.map((k) => inquiries[k].length));
    const chunks = [];

    for (let i = 0; i < maxLen; i += chunkSize) {
      const chunk = {};
      for (const key of keys) {
        chunk[key] = inquiries[key].slice(i, i + chunkSize);
      }
      chunks.push(chunk);
    }

    return chunks;
  };

  const handleSave = async () => {
    if (!parsedInquiries || !selectedClientId) return;
    

    const blob = new Blob([JSON.stringify(parsedInquiries, null, 2)], {
      type: "application/json",
    });

    const filePath = `${selectedClientId}/thread.json`;
    const { error } = await supabase.storage.from("clients").upload(filePath, blob, {
      upsert: true,
      contentType: "application/json",
    });

    if (error) return setMessage(`❌ Failed to save: ${error.message}`);

    // AI Review Queue — flags any inquiry the classifier's own
    // deterministic guard downgraded (see utils/aiReviewQueue.js). Best
    // effort, never blocks the save this runs after.
    flagGuardedInquiries(supabase, selectedClientId, parsedInquiries);

    // Phase 0: persisted bureau counts (see utils/inquiryCounts.js — same
    // helper used by useInquiriesThread.js and SmartIdiQModal.jsx so all
    // three upload paths compute "AI count" identically). approved_*_count
    // is only defaulted here if a supervisor hasn't already set it.
    const { data: currentClient } = await supabase
      .from("clients")
      .select("approved_exp_count, approved_tu_count, approved_eq_count, start_inquiries")
      .eq("id", selectedClientId)
      .single();
    const aiCounts = computeAiCounts(parsedInquiries);
    const approvedCounts = withDefaultedApprovedCounts(aiCounts, currentClient);
    // Only set once — never overwrites a value a later thread-edit save may
    // have already set (matches useInquiriesThread.js's saveUpdatedThread
    // logic). Without this, AdminClientList.jsx shows a blank "start
    // inquiries" for any client whose first save was through this form.
    const finalStartInq = (currentClient?.start_inquiries && !isBlankStartInquiries(currentClient.start_inquiries))
      ? currentClient.start_inquiries
      : `(TU ${aiCounts.ai_tu_count}, EXP ${aiCounts.ai_exp_count}, EQ ${aiCounts.ai_eq_count})`;
    // NOTE: counted_at is intentionally NOT set here. This form's "save" is
    // just confirming the initial AI classification straight from OCR
    // (ParsedInquiryPreview is a read-only JSON dump with no editing) — not
    // an actual human classification review. counted_at should only reflect
    // useInquiriesThread.js's saveUpdatedThread, where an admin/counter
    // actually reviews and corrects classifications in the real editor.

    // 🆕 Update the `counter` column in the clients table
  const { error: updateError } = await supabase
    .from("clients")
    .update({ counter: adminName, start_inquiries: finalStartInq, ...aiCounts, ...approvedCounts }) // make sure adminName is defined in your scope
    .eq("id", selectedClientId);
        const updates = {
          total_calls: 0,
          total_docs: 0,
          total_disputes: 0,
          total_confirmed: 0,
          total_unable_to_dispute: 0,
          total_disconnected: 0,
          total_count: 1,
        };
    
        if (userId) {
          const { error: metricError } = await supabase.rpc(
            "increment_call_metrics",
            {
              uid: userId,
              ldate: getEasternDateString(), // Correct EST date
              ...updates,
            }
          );
          if (metricError) {
            console.error("Metrics update failed:", metricError.message);
          }
        }
  if (updateError) return setMessage(`❌ Saved file but failed to update counter: ${updateError.message}`);
    setParsedInquiries({ accounts: [], experian: [], transunion: [], equifax: [] });
    setFile(null);
    setSelectedClientId("");
    setMessage("✅ thread.json saved to client bucket.");
  };

return (
  <div className="container mt-5 login-container">
    <h1 className="d-flex justify-content-center">3 Easy steps</h1>
    <h4 className="mb-4">
      <i className="bi bi-upload me-2 text-primary"></i>
      Upload & Process Client PDF
    </h4>

    <div className="mb-4">
      <label className="form-label fw-semibold">
        <i className="bi bi-person-fill me-2 text-secondary"></i>
        Select Client
      </label>
      <select
        className="form-select"
        value={selectedClientId}
        onChange={(e) => setSelectedClientId(e.target.value)}
      >
        <option value="">-- Choose a Client --</option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.full_name}
          </option>
        ))}
      </select>
    </div>

    <div className="mb-4">
      <label className="form-label fw-semibold">
        <i className="bi bi-file-earmark-pdf me-2 text-danger"></i>
        Upload PDF Report
      </label>
      <input
        type="file"
        className="form-control"
        accept="application/pdf"
        onChange={(e) => {
          // Picking a new file invalidates any OCR/parse output from the
          // previous one — otherwise Step 2 stayed enabled and would
          // happily save the old file's data under whatever client is
          // selected.
          setFile(e.target.files[0] || null);
          setOcrText("");
          setParsedInquiries({ accounts: [], experian: [], transunion: [], equifax: [] });
          setMessage("");
        }}
      />
    </div>

    <div className="mb-4 d-flex flex-wrap gap-3">
      <button
        className="btn btn-outline-secondary"
        onClick={handleOCR}
        disabled={uploading}
      >
        <i className="bi bi-search me-2"></i>
        {uploading ? "Processing OCR..." : "Step 1"}
      </button>

      <button
        className="btn btn-primary"
        onClick={handleParse}
        disabled={uploading || !ocrText}
      >
        <i className="bi bi-send-check me-2"></i>
        {uploading ? "Parsing..." : "Step 2"}
      </button>
    </div>

    <OCRPreview text={ocrText} />
    <ParsedInquiryPreview inquiries={parsedInquiries} onSave={handleSave} />

    {message && (
      <div className="alert alert-info mt-4 text-center">{message}</div>
    )}
  </div>
);

}


