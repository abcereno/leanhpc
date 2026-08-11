import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabaseClient";
import { usePricingCalculator } from "./usePricingCalculator";
import { useToast } from "../components/shared/ui/ToastNotifier";

const RECEIPT_WEBHOOK = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/61da67a8-c2e3-4b99-b13f-74c08f0847fd";

const countDisputable = (items = []) =>
  items.filter((i) => ["dispute", "associated", "non-linked"].includes(String(i.classification || "non-linked").trim().toLowerCase())).length;

export function useReceiptGenerator(clientId, agentDisplay, refetch, onRefresh) {
  const { calculatePrice } = usePricingCalculator();
  const { addToast } = useToast();

  const [isPreparing, setIsPreparing] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [preview, setPreview] = useState(null);
  const [customPrice, setCustomPrice] = useState("");

  const preparePreview = async () => {
    setIsPreparing(true);
    try {
      // Fetch inquiry counts from thread.json
      let expCount = 0, tuCount = 0, eqCount = 0;
      const { data: threadFile } = supabase.storage.from("clients").getPublicUrl(`${clientId}/thread.json`);
      if (threadFile?.publicUrl) {
        try {
          const res = await fetch(`${threadFile.publicUrl}?cacheBust=${Date.now()}`);
          if (res.ok) {
            const json = await res.json();
            expCount = countDisputable(json.experian);
            tuCount  = countDisputable(json.transunion);
            eqCount  = countDisputable(json.equifax);
          }
        } catch { /* non-fatal */ }
      }
      const totalCount = expCount + tuCount + eqCount;

      const { data: clientData, error: fetchErr } = await supabase
        .from("clients").select("full_name,email,phone,company_id").eq("id", clientId).single();
      if (fetchErr) throw fetchErr;

      let companyEmail = "", companyName = "Direct";
      if (clientData?.company_id) {
        const { data: co } = await supabase.from("companies")
          .select("contact_email,company_name").eq("id", clientData.company_id).single();
        if (co) { companyEmail = co.contact_email || ""; companyName = co.company_name || companyName; }
      }

      const pricingDetails = calculatePrice(companyName, { serviceType: "activity_review", count: totalCount });
      setCustomPrice(pricingDetails.grandTotal);
      setPreview({ expCount, tuCount, eqCount, totalCount, clientData, companyName, companyEmail, pricingDetails });
    } catch (e) {
      addToast({ title: "Error", message: "Failed to prepare receipt: " + e.message, variant: "danger", icon: "bi-exclamation-triangle" });
    } finally {
      setIsPreparing(false);
    }
  };

  const confirmGenerate = async () => {
    if (!preview) return;
    setIsSending(true);
    try {
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + 86_400_000).toISOString();

      const { error: upErr } = await supabase.from("clients")
        .update({ public_token: token, public_token_expires_at: expiresAt, public_token_viewed: false })
        .eq("id", clientId);
      if (upErr) throw upErr;

      const { clientData, companyName, companyEmail, expCount, tuCount, eqCount, totalCount, pricingDetails } = preview;
      const finalPrice = Number(customPrice);

      const payload = {
        client_id: clientId,
        client_name: clientData?.full_name,
        client_email: clientData?.email,
        client_phone: clientData?.phone,
        company_name: companyName,
        company_email: companyEmail,
        receipt_url: `${window.location.origin}/receipt/${token}`,
        expires_at: expiresAt,
        experian_inquiries: expCount,
        transunion_inquiries: tuCount,
        equifax_inquiries: eqCount,
        total_inquiries: totalCount,
        base_price: pricingDetails.basePrice,
        surcharge_amount: pricingDetails.surchargeAmount,
        grand_total: finalPrice,
        is_custom_price: finalPrice !== pricingDetails.grandTotal,
        pricing_model_applied: pricingDetails.pricingModelApplied,
        assigned_agent: agentDisplay !== "Loading..." ? agentDisplay : "Unassigned",
        event: "receipt_link_generated",
      };

      try {
        await fetch(RECEIPT_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      } catch {
        await fetch(RECEIPT_WEBHOOK, { method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => {});
      }

      setPreview(null);
      addToast({ title: "Receipt Generated", message: "Receipt link created. Valid for 24 hours.", variant: "success", icon: "bi-check-circle" });
      await refetch();
      if (onRefresh) onRefresh();
    } catch (e) {
      addToast({ title: "Error", message: "Failed to generate receipt link: " + e.message, variant: "danger", icon: "bi-exclamation-triangle" });
    } finally {
      setIsSending(false);
    }
  };

  const dismiss = () => { if (!isSending) setPreview(null); };

  return { isPreparing, isSending, preview, customPrice, setCustomPrice, preparePreview, confirmGenerate, dismiss };
}
