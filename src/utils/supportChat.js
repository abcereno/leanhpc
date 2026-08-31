// src/utils/supportChat.js
//
// Shared data layer for the support chat feature (see sql/add_support_chat.sql)
// — individuals and partner companies each get a real-time thread with HPC
// admin/support, reusing the client_id/company_id "exactly one owner"
// pattern already established by payment_verifications. Kept in one place
// so SupportChatThread.jsx (the shared UI, used by all three portals) and
// the admin inbox aren't each rolling their own query/realtime logic.
import { supabase } from "../supabaseClient";

const TABLE = "support_messages";
// Reuses the existing public "uploads" bucket (see
// sql/add_support_chat_attachments.sql's comment for why) rather than a
// dedicated bucket — same model already used elsewhere in this app for
// client-facing uploads.
const ATTACHMENT_BUCKET = "uploads";
const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15MB — generous for a screenshot/PDF, not for a raw video dump.

// A thread is identified by exactly one of clientId/companyId — same
// owner shape as the table itself.
function ownerFilter(query, { clientId, companyId }) {
  return clientId ? query.eq("client_id", clientId) : query.eq("company_id", companyId);
}

/**
 * Full message history for one thread, oldest to newest (chat reading
 * order). Chat volume here is inherently small (a support conversation,
 * not a bulk data table), so a single unpaginated query is fine — unlike
 * fetchAllRows.js's use cases.
 */
export async function fetchThreadMessages({ clientId, companyId }) {
  let query = supabase.from(TABLE).select("*").order("created_at", { ascending: true });
  query = ownerFilter(query, { clientId, companyId });
  return query;
}

/**
 * Inserts one message. `senderType` must match the row's actual RLS
 * lane ('individual' | 'company' | 'admin') — the database enforces this
 * for real (see sql/add_support_chat.sql's insert policies), this is just
 * so a bad call fails obviously in the UI instead of as an opaque RLS
 * rejection.
 *
 * `attachment` (optional) is `{ url, name, type }` from
 * uploadSupportChatAttachment below — a message needs a non-empty body OR
 * an attachment (see sql/add_support_chat_attachments.sql's check
 * constraint), not necessarily both.
 */
export async function sendSupportMessage({ clientId, companyId, senderId, senderName, senderType, body, attachment }) {
  const trimmed = (body || "").trim();
  if (!trimmed && !attachment) return { error: { message: "Message body is empty" } };

  const payload = {
    client_id: clientId || null,
    company_id: companyId || null,
    sender_id: senderId,
    sender_name: senderName || null,
    sender_type: senderType,
    body: trimmed || null,
    attachment_url: attachment?.url || null,
    attachment_name: attachment?.name || null,
    attachment_type: attachment?.type || null,
  };

  const { data, error } = await supabase.from(TABLE).insert(payload).select().single();
  return { data, error };
}

/**
 * Uploads one file to the shared "uploads" bucket under a
 * support-chat/<ownerKey>/ prefix and returns `{ url, name, type }` ready
 * to hand to sendSupportMessage's `attachment` param. `ownerKey` is
 * whichever of clientId/companyId the thread belongs to — just used to
 * namespace the storage path, not written anywhere.
 */
export async function uploadSupportChatAttachment(file, ownerKey) {
  if (!file) return { error: { message: "No file selected" } };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: { message: `File is too large (max ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)}MB).` } };
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `support-chat/${ownerKey}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file);
  if (uploadError) return { error: uploadError };

  const { data: { publicUrl } } = supabase.storage.from(ATTACHMENT_BUCKET).getPublicUrl(path);
  return { data: { url: publicUrl, name: file.name, type: file.type || "application/octet-stream" }, error: null };
}

/**
 * Subscribes to new messages on one thread via Supabase Realtime — same
 * postgres_changes mechanism already used by MessagesTab.jsx elsewhere in
 * this codebase. Returns the channel; caller owns calling
 * supabase.removeChannel(channel) on unmount.
 */
export function subscribeToThread({ clientId, companyId }, onInsert) {
  const filter = clientId ? `client_id=eq.${clientId}` : `company_id=eq.${companyId}`;
  // Unique per call, not just per thread — the same thread can legitimately
  // have more than one subscriber alive at once (an admin's popup bubble
  // AND the SupportInbox page both open on the same thread, or a widget
  // remounting on reopen before the old channel finished tearing down). A
  // shared name risks one subscription silently clobbering another — same
  // reasoning AdminNotificationWatcher.jsx already documents for its own
  // channel names.
  const channelName = `support_messages_${clientId || companyId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return supabase
    .channel(channelName)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: TABLE, filter }, (payload) => {
      onInsert(payload.new);
    })
    // Logged on purpose — a failed realtime subscription (bad RLS, table
    // not in the publication, auth issue) fails SILENTLY otherwise; this
    // is the only way to actually see it happen instead of guessing.
    // Remove once the feature's been confirmed stable in production.
    .subscribe((status, err) => {
      if (status !== "SUBSCRIBED") console.warn(`[supportChat] ${channelName} → ${status}`, err || "");
    });
}

/** Admin-only — clears the unread badge for one thread once opened. */
export async function markThreadReadByAdmin({ clientId, companyId }) {
  let query = supabase.from(TABLE).update({ read_by_admin: true }).eq("read_by_admin", false);
  query = ownerFilter(query, { clientId, companyId });
  return query.select("id");
}

/**
 * Admin inbox list: one row per thread (client or company) with the most
 * recent message and an unread count, newest activity first. Supabase's
 * JS client has no GROUP BY, so this pulls a bounded recent-message window
 * and reduces it client-side — proportionate to a support inbox's actual
 * volume (this is a chat feature, not a reporting table); revisit with a
 * real SQL view/RPC if thread count ever outgrows this.
 */
export async function fetchAdminThreads({ limit = 500 } = {}) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, client_id, company_id, sender_type, sender_name, body, attachment_name, read_by_admin, created_at, clients(full_name, email), companies(company_name)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: null, error };

  const threads = new Map();
  for (const row of data) {
    const key = row.client_id ? `client:${row.client_id}` : `company:${row.company_id}`;
    if (!threads.has(key)) {
      threads.set(key, {
        clientId: row.client_id,
        companyId: row.company_id,
        ownerType: row.client_id ? "individual" : "company",
        ownerName: row.client_id ? (row.clients?.full_name || row.clients?.email || "Unknown client") : (row.companies?.company_name || "Unknown company"),
        lastMessage: row.body || (row.attachment_name ? `📎 ${row.attachment_name}` : ""),
        lastSenderType: row.sender_type,
        lastMessageAt: row.created_at,
        unreadCount: 0,
      });
    }
    if (!row.read_by_admin && row.sender_type !== "admin") {
      threads.get(key).unreadCount += 1;
    }
  }

  return { data: Array.from(threads.values()), error: null };
}
