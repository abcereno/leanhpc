// src/hooks/useClassicReportLink.js
//
// Generates a public link to the client-facing Classic Report page
// (components/shared/public/ClassicReportPage.jsx, route
// /classic-report/:token). Same token+expiry shape as
// useReceiptGenerator.js, but its own dedicated columns
// (clients.classic_report_token*) — see sql/add_classic_report_token.sql
// for why this isn't sharing clients.public_token.
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabaseClient";
import { useToast } from "../components/shared/ui/ToastNotifier";

export function useClassicReportLink(clientId, refetch) {
  const { addToast } = useToast();
  const [generating, setGenerating] = useState(false);

  const generateLink = async () => {
    setGenerating(true);
    try {
      const token = uuidv4();

      // Classic Report links are permanent (no expiry) — see
      // ClassicReportPage.jsx, which no longer checks
      // classic_report_token_expires_at. That column is left in place
      // unused rather than dropped, since it's nullable and harmless.
      const { error } = await supabase
        .from("clients")
        .update({ classic_report_token: token, classic_report_token_expires_at: null, classic_report_token_viewed: false })
        .eq("id", clientId);
      if (error) throw error;

      const url = `${window.location.origin}/classic-report/${token}`;
      try {
        await navigator.clipboard.writeText(url);
        addToast({ title: "Link Copied", message: "Classic Report link copied to clipboard.", variant: "success", icon: "bi-clipboard-check" });
      } catch {
        addToast({ title: "Link Generated", message: url, variant: "success", icon: "bi-link-45deg", timeout: 15000 });
      }

      if (refetch) await refetch();
    } catch (e) {
      addToast({ title: "Error", message: "Failed to generate Classic Report link: " + e.message, variant: "danger", icon: "bi-exclamation-triangle" });
    } finally {
      setGenerating(false);
    }
  };

  return { generating, generateLink };
}
