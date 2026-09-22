// src/utils/classificationChat.js
//
// Client-side wrapper for the "AI Training Chat" feature
// (src/components/admin/AiTrainingChat.jsx, sql/add_classification_rules.sql,
// supabase/functions/classify-training-chat). Same never-throw-on-missing-
// table posture as classifyInquiries.js — a fresh install that hasn't run
// the migration yet just sees an empty chat/rules list instead of a crash.
import { supabase } from "../supabaseClient";

// clientId null/undefined = the global training thread. Ordered oldest
// first, same as a normal chat transcript reads top-to-bottom.
export async function fetchChatHistory(clientId) {
  try {
    let query = supabase
      .from("classification_chat_messages")
      .select("*")
      .order("created_at", { ascending: true });
    query = clientId ? query.eq("client_id", clientId) : query.is("client_id", null);
    const { data, error } = await query;
    if (error) {
      console.warn("Failed to load training chat history (run sql/add_classification_rules.sql?):", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("Failed to load training chat history:", err);
    return [];
  }
}

// Every active rule visible to a given scope — every global rule, plus (if
// a clientId is given) rules scoped to that one client. Used both by the
// chat's "existing rules" sidebar and, indirectly, by classify-inquiries
// via classifyInquiries.js#fetchClassificationRules (a separate, parallel
// query — kept independent rather than shared so the chat's rules-panel
// fetch and the classifier's own fetch don't couple two otherwise-unrelated
// call paths together).
export async function fetchActiveRules(clientId) {
  try {
    let query = supabase
      .from("classification_rules")
      .select("*")
      .eq("active", true)
      .order("created_at", { ascending: false });
    query = clientId ? query.or(`client_id.is.null,client_id.eq.${clientId}`) : query.is("client_id", null);
    const { data, error } = await query;
    if (error) {
      console.warn("Failed to load classification_rules:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("Failed to load classification_rules:", err);
    return [];
  }
}

// Sends one admin message to the classify-training-chat Edge Function,
// persists both the admin's message and the assistant's reply, and returns
// the assistant's reply row (including any proposedRule, stashed on the row
// as `proposed_rule` so confirmProposedRule below can find it again by
// message id without the caller having to pass the object back around).
export async function sendChatMessage({ clientId, clientName, history, message, adminId, adminName }) {
  const { error: userInsertErr } = await supabase.from("classification_chat_messages").insert({
    client_id: clientId || null,
    role: "user",
    content: message,
    created_by: adminId || null,
    created_by_name: adminName || null,
  });
  if (userInsertErr) throw new Error(`Failed to save your message: ${userInsertErr.message}`);

  const rules = await fetchActiveRules(clientId);
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-training-chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        clientId: clientId || null,
        clientName: clientName || null,
        history: (history || []).map((m) => ({ role: m.role, content: m.content })),
        message,
        existingRules: rules,
      }),
    }
  );
  const result = await res.json();
  if (!result?.success) {
    throw new Error(result?.error || "The training chat didn't respond — try again.");
  }

  const { data: assistantRow, error: assistantInsertErr } = await supabase
    .from("classification_chat_messages")
    .insert({
      client_id: clientId || null,
      role: "assistant",
      content: result.reply,
      proposed_rule: result.proposedRule || null,
    })
    .select()
    .single();
  if (assistantInsertErr) throw new Error(`Failed to save the AI's reply: ${assistantInsertErr.message}`);

  return assistantRow;
}

// Saves a proposed rule the admin confirmed from a chat bubble, and links
// the chat message to it (rule_id) so the transcript still shows which
// message it came from even after the proposal card itself is gone.
export async function confirmProposedRule({ messageId, proposedRule, clientId, adminId, adminName, sourceMessage }) {
  const scope = proposedRule?.scope === "global" ? null : clientId || null;
  const { data: rule, error: ruleErr } = await supabase
    .from("classification_rules")
    .insert({
      client_id: scope,
      rule_text: proposedRule?.ruleText,
      creditor_pattern: proposedRule?.creditorPattern || null,
      action: proposedRule?.action || null,
      created_by: adminId || null,
      created_by_name: adminName || null,
      source_message: sourceMessage || null,
    })
    .select()
    .single();
  if (ruleErr) throw new Error(`Failed to save rule: ${ruleErr.message}`);

  if (messageId) {
    const { error: linkErr } = await supabase
      .from("classification_chat_messages")
      .update({ rule_id: rule.id })
      .eq("id", messageId);
    if (linkErr) console.warn("Rule saved, but couldn't link it back to the chat message:", linkErr.message);
  }

  return rule;
}

// Read-only sample of a client's actual inquiries AND accounts, for the AI
// Training Chat's "Inquiries"/"Accounts" panels — so an admin can teach a
// rule against a real creditor/bureau/date (or a real account — useful for
// dealership/captive-finance-company rules like the ones in
// sql/add_lender_aliases.sql's related_canonical_name column) instead of
// typing one from memory. Mirrors the read side of
// useInquiriesThread.js#fetchInquiriesThread (same public-URL + cache-bust
// fetch of thread.json from the `clients` storage bucket, one fetch for
// both lists since they live in the same file), but deliberately not a
// shared import from that hook: this needs only a flattened, read-only
// view, not the full editable-thread state machine (save/classify/
// letters/etc.) that hook owns. Never throws — a client with no report
// imported yet, or a fetch failure, just yields empty lists.
export async function fetchClientCreditData(clientId) {
  const empty = { inquiries: [], accounts: [] };
  if (!clientId) return empty;
  try {
    const { data: threadFile } = supabase.storage.from("clients").getPublicUrl(`${clientId}/thread.json`);
    if (!threadFile?.publicUrl) return empty;
    const res = await fetch(`${threadFile.publicUrl}?cacheBust=${Date.now()}`);
    if (!res.ok) return empty;
    const json = await res.json();
    if (!json) return empty;
    const withBureau = (arr, bureauName) => (arr || []).map((i) => ({ ...i, bureau: bureauName, classification: i.classification || "non-linked" }));
    return {
      inquiries: [
        ...withBureau(json.experian, "Experian"),
        ...withBureau(json.transunion, "TransUnion"),
        ...withBureau(json.equifax, "Equifax"),
      ],
      accounts: json.accounts || [],
    };
  } catch (err) {
    console.warn("Failed to load client credit data:", err);
    return empty;
  }
}

// Soft-delete — same is_inactive/is_paused pattern used elsewhere in this
// app (useClientActions.js) rather than a hard DELETE, so a deactivated
// rule stays in the audit trail instead of disappearing.
export async function deactivateRule(ruleId) {
  const { error } = await supabase.from("classification_rules").update({ active: false }).eq("id", ruleId);
  if (error) throw new Error(`Failed to deactivate rule: ${error.message}`);
}
