// src/components/shared/support/SupportChatThread.jsx
//
// Shared real-time chat panel — the actual UI for the support chat feature
// (see sql/add_support_chat.sql, src/utils/supportChat.js). One component
// used by all three surfaces (individual portal, company portal, admin
// inbox) parameterized by who's viewing, rather than three separate
// chat implementations drifting apart:
//   - Individual portal: clientId set, senderType="individual"
//   - Company portal:    companyId set, senderType="company" (shared by
//                         every agent at that company — not per-agent)
//   - Admin inbox:        whichever of clientId/companyId the selected
//                         thread has, senderType="admin"
// "Mine" alignment (right-aligned bubbles) is by sender_type matching the
// viewer's own senderType, not sender_id — a company thread is a shared
// team inbox, so any agent's past messages should read as "us" too, not
// just the one who happens to be looking right now.
//
// Attachments (see sql/add_support_chat_attachments.sql): a file can be
// sent two ways — the paperclip button's file picker, or pasting an image
// straight from the clipboard (the actual point of "attach screenshots" —
// nobody wants to save-to-disk-then-browse for a screenshot). Both funnel
// through the same handleFile() upload+send path.
import React, { useEffect, useRef, useState } from "react";
import { Form, Button, Spinner } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { fetchThreadMessages, sendSupportMessage, subscribeToThread, markThreadReadByAdmin, uploadSupportChatAttachment } from "../../../utils/supportChat";

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isImageType(type) {
  return typeof type === "string" && type.startsWith("image/");
}

export default function SupportChatThread({
  clientId,
  companyId,
  senderId,
  senderName,
  senderType, // 'individual' | 'company' | 'admin'
  emptyText = "No messages yet — say hello.",
  height = 520,
}) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachError, setAttachError] = useState(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const ownerKey = clientId || companyId;

  useEffect(() => {
    if (!ownerKey) return;
    let isMounted = true;

    setLoading(true);
    fetchThreadMessages({ clientId, companyId }).then(({ data, error }) => {
      if (!isMounted) return;
      if (!error) setMessages(data || []);
      setLoading(false);
    });

    // Admin viewing a thread clears its unread badge — individual/company
    // senders never set read_by_admin themselves (see sql/add_support_chat.sql,
    // there's no read-receipt policy for them in this first version).
    if (senderType === "admin") {
      markThreadReadByAdmin({ clientId, companyId });
    }

    const channel = subscribeToThread({ clientId, companyId }, (newMessage) => {
      setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));
    });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, senderType]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    const { error } = await sendSupportMessage({ clientId, companyId, senderId, senderName, senderType, body });
    if (!error) setDraft("");
    setSending(false);
  };

  // Shared by the paperclip file picker and clipboard paste — uploads the
  // file, then sends it as a message immediately (whatever's currently
  // typed in the draft box becomes the caption), rather than staging it
  // for a separate confirm step. Keeps this a one-action flow.
  const handleFile = async (file) => {
    if (!file || uploading) return;
    setAttachError(null);
    setUploading(true);

    const { data: attachment, error: uploadError } = await uploadSupportChatAttachment(file, ownerKey);
    if (uploadError) {
      setAttachError(uploadError.message || "Upload failed.");
      setUploading(false);
      return;
    }

    const { error: sendError } = await sendSupportMessage({
      clientId, companyId, senderId, senderName, senderType,
      body: draft.trim(),
      attachment,
    });
    if (sendError) {
      setAttachError(sendError.message || "Failed to send attachment.");
    } else {
      setDraft("");
    }
    setUploading(false);
  };

  const handlePaste = (e) => {
    const item = Array.from(e.clipboardData?.items || []).find((it) => it.kind === "file");
    if (!item) return; // plain text paste — let the browser handle it normally
    e.preventDefault();
    handleFile(item.getAsFile());
  };

  if (!ownerKey) return null;

  return (
    <div
      className="d-flex flex-column rounded-3"
      style={{ height, background: "var(--bg-card, #151E32)", border: "1px solid var(--border-color, #334155)" }}
    >
      <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-2">
        {loading ? (
          <div className="d-flex justify-content-center align-items-center h-100">
            <Spinner animation="border" size="sm" variant="light" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-muted text-center mt-5 small">{emptyText}</div>
        ) : (
          messages.map((m) => {
            const mine = m.sender_type === senderType;
            return (
              <div key={m.id} className={`d-flex flex-column ${mine ? "align-items-end" : "align-items-start"}`}>
                {m.attachment_url && (
                  isImageType(m.attachment_type) ? (
                    <a href={m.attachment_url} target="_blank" rel="noreferrer" style={{ maxWidth: "75%" }}>
                      <img
                        src={m.attachment_url}
                        alt={m.attachment_name || "attachment"}
                        className="rounded-3"
                        style={{ maxWidth: "100%", maxHeight: 220, display: "block", border: "1px solid var(--border-color, #334155)" }}
                      />
                    </a>
                  ) : (
                    <a
                      href={m.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="d-flex align-items-center gap-2 px-3 py-2 rounded-3 text-decoration-none"
                      style={{ maxWidth: "75%", background: "rgba(148, 163, 184, 0.12)", color: "inherit" }}
                    >
                      <i className="bi bi-file-earmark-arrow-down fs-5" />
                      <span className="text-truncate small">{m.attachment_name || "Download file"}</span>
                    </a>
                  )
                )}
                {m.body && (
                  <div
                    className="px-3 py-2 rounded-3 mt-1"
                    style={{
                      maxWidth: "75%",
                      background: mine ? "var(--primary-blue, #0EA5E9)" : "rgba(148, 163, 184, 0.12)",
                      color: mine ? "#fff" : "inherit",
                    }}
                  >
                    {m.body}
                  </div>
                )}
                <div className="text-muted mt-1" style={{ fontSize: "0.7rem" }}>
                  {m.sender_name || (m.sender_type === "admin" ? "Support" : "")} · {formatTime(m.created_at)}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {attachError && (
        <div className="px-2 text-danger small">{attachError}</div>
      )}

      <Form onSubmit={handleSend} className="d-flex align-items-center gap-2 p-2 border-top" style={{ borderColor: "var(--border-color, #334155)" }}>
        <input
          ref={fileInputRef}
          type="file"
          className="d-none"
          onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }}
        />
        <Button
          type="button"
          variant="link"
          className="p-1 text-muted flex-shrink-0"
          disabled={uploading || sending}
          onClick={() => fileInputRef.current?.click()}
          title="Attach a file"
        >
          {uploading ? <Spinner size="sm" animation="border" /> : <i className="bi bi-paperclip fs-5" />}
        </Button>
        <Form.Control
          type="text"
          placeholder="Type a message, or paste a screenshot..."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPaste={handlePaste}
          disabled={sending || uploading}
          autoComplete="off"
        />
        <Button type="submit" disabled={sending || uploading || !draft.trim()} style={{ background: "var(--primary-blue, #0EA5E9)", borderColor: "var(--primary-blue, #0EA5E9)" }}>
          {sending ? <Spinner size="sm" animation="border" /> : <i className="bi bi-send-fill" />}
        </Button>
      </Form>
    </div>
  );
}
