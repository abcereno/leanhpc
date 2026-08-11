import { useEffect, useState, useCallback } from "react";
import { supabase } from "../supabaseClient";
import { runAuditEngine } from "../utils/auditEngine"; 

export function useReportData(clientId) {
  const [data, setData] = useState(null); 
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    if (!clientId) {
      setError("Missing clientId");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Fetch RAW Report & Client Data
      const bucket = "clients";
      const pathA = `${clientId}/raw_credit_report.json`;
      const pathB = `${clientId}/SmartCreditRaw.json`;

      const [
        { data: clientRow, error: clientErr },
        { data: calls },
        { data: docs },
        { data: urlA }, // If file is missing, urlA is null
        { data: urlB }  // If file is missing, urlB is null
      ] = await Promise.all([
        supabase
          .from("clients")
          .select("full_name,address,email,phone,ssn,dob")
          .eq("id", clientId)
          .maybeSingle(),
        supabase
          .from("call_logs")
          .select("call_date, exp_result, tu_result, eq_result")
          .eq("client_id", clientId)
          .order("call_date", { ascending: false })
          .limit(10),
        supabase.from("client_documents").select("id").eq("client_id", clientId),
        supabase.storage.from(bucket).createSignedUrl(pathA, 60),
        supabase.storage.from(bucket).createSignedUrl(pathB, 60)
      ]);

      if (clientErr) throw clientErr;

      // 2. Fetch JSON content
      let rawJson = null;
      
      // 👇 FIX 1: Safely check for the signedUrl using optional chaining to prevent null crashes
      const validUrl = urlA?.signedUrl || urlB?.signedUrl || null;

      if (validUrl) {
        const res = await fetch(validUrl);
        if (res.ok) rawJson = await res.json();
      }

      if (!rawJson) {
        throw new Error("No raw credit report found. Please import a report first.");
      }

      // 3. PARSE LOCALLY - pass the fetched JSON straight through to the engine
      const auditResult = runAuditEngine(rawJson);

      // 👇 FIX 2: The Array Safety Net. Forces empty reports to have arrays so .map() never crashes the UI
      if (auditResult) {
          auditResult.inquiries = Array.isArray(auditResult.inquiries) ? auditResult.inquiries : [];
          auditResult.accounts = Array.isArray(auditResult.accounts) ? auditResult.accounts : [];
          auditResult.negatives = Array.isArray(auditResult.negatives) ? auditResult.negatives : [];
      }

      // 4. Return the Audit Object + Extras
      setData({
        ...auditResult,
        client: {
            full_name: clientRow?.full_name || "",
            address:   clientRow?.address   || "",
            email:     clientRow?.email     || "",
            phone:     clientRow?.phone     || "",
            ssn_last4: clientRow?.ssn ? String(clientRow.ssn).replace(/\D/g, "").slice(-4) : "",
            dob:       clientRow?.dob || "",
        },
        calls: calls || [],
        docs:  docs  || []
      });

    } catch (e) {
      console.error("Report Data Load Error:", e);
      setError(e.message || "Failed to load report data");
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    run();
  }, [run]);

  return { data, loading, error, refresh: run };
}