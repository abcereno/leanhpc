// src/hooks/useAlignmentDocs.js
//
// Shared data-fetch for the "Alignment Check" identity/FTC/letter
// documents — pulled out of AlignmentCheckPanel.jsx so ClientHeader.jsx's
// Personal Info section (which shows what the AI actually read off the
// SSN card / proof-of-address document, inline under each field) can
// reuse the exact same client_documents query and legacy/LTOS merge logic
// instead of a second copy that could drift out of sync.
//
// Two unrelated upload flows share client_documents: the legacy admin
// uploader (CoverLetterAssets.jsx) tags rows via doc_type in
// ('license','ssn','poa'); the LTOS uploader (company portal / public
// intake, CoverLetterAssetsLTOS.jsx) instead uses file_name in
// ('identity','address','authorization') — its own doc_type only ever
// holds the AI-detected specific type (e.g. 'driver_license'), never
// 'license'/'ssn'/'poa'. Both are merged into one set of identity slots
// here so every caller sees the same picture regardless of which flow a
// given client's documents came through.
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { LTOS_KEYS } from "../utils/documentAssetLabels";

// Normalizes a row from either flow down to one of the identity slots
// this hook exposes. LTOS 'identity' -> 'license' and LTOS 'address' ->
// 'poa' since the edge function computes identical `checks` shapes for
// those pairs (see supabase/functions/validate-document). LTOS
// 'authorization' has no legacy equivalent, so it gets its own slot.
// Legacy SSN card has no LTOS equivalent (LTOS never collects one as a
// document) — 'ssn' stays legacy-only.
function identitySlot(row) {
  if (["license", "ssn", "poa"].includes(row.doc_type)) return row.doc_type;
  if (row.file_name === "identity") return "license";
  if (row.file_name === "address") return "poa";
  if (row.file_name === "authorization") return "authorization";
  return null;
}

export function useAlignmentDocs(clientId, refreshKey) {
  const [loading, setLoading] = useState(true);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [identityDocs, setIdentityDocs] = useState({ license: null, ssn: null, poa: null, authorization: null });
  const [ftcReport, setFtcReport] = useState(null);
  const [letters, setLetters] = useState([]);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const SELECT = "id, file_name, file_url, doc_type, validation_status, validation_notes, validation_details, created_at";

      // Two plain .in() queries run in parallel and merged client-side,
      // rather than one .or() query — this codebase has no other .or()
      // usage anywhere to confirm the PostgREST filter-string syntax
      // against, while .in() is already used everywhere (e.g.
      // CoverLetterAssets.jsx). Safer to stick with the pattern that's
      // known to work than trust an untested filter string.
      const [legacyRes, ltosRes] = await Promise.all([
        supabase.from("client_documents").select(SELECT).eq("client_id", clientId)
          .in("doc_type", ["license", "ssn", "poa", "ftc_report", "letter"]),
        supabase.from("client_documents").select(SELECT).eq("client_id", clientId)
          .in("file_name", LTOS_KEYS),
      ]);

      const error = legacyRes.error || ltosRes.error;
      if (error && /doc_type|validation_details/i.test(error.message || "")) {
        setMigrationMissing(true);
        setLoading(false);
        return;
      }
      if (error) throw error;

      // Dedupe by id (a row can't actually match both queries — doc_type
      // and file_name conventions are mutually exclusive between the two
      // flows — but merging defensively costs nothing) and sort newest
      // first, same ordering the single-query version relied on for its
      // "first-seen = most recent" slot-assignment logic below.
      const byId = new Map();
      [...(legacyRes.data || []), ...(ltosRes.data || [])].forEach((row) => byId.set(row.id, row));
      const docs = Array.from(byId.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      const nextIdentity = { license: null, ssn: null, poa: null, authorization: null };
      let latestFtc = null;
      const letterRows = [];

      (docs || []).forEach((row) => {
        const slot = identitySlot(row);
        if (slot) {
          // First-seen = most recent (already ordered desc) — if both
          // flows ever produced a row for the same slot, whichever was
          // uploaded most recently wins, same precedent as the FTC report
          // lookup just below.
          if (!nextIdentity[slot]) nextIdentity[slot] = row;
        } else if (row.doc_type === "ftc_report") {
          if (!latestFtc) latestFtc = row;
        } else if (row.doc_type === "letter") {
          letterRows.push(row);
        }
      });

      setIdentityDocs(nextIdentity);
      setFtcReport(latestFtc);
      setLetters(letterRows);
      setMigrationMissing(false);
    } catch (err) {
      console.error("useAlignmentDocs load error:", err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  return { loading, migrationMissing, identityDocs, ftcReport, letters, reload: load };
}
