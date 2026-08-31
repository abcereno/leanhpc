// src/components/shared/support/SupportChatLauncher.jsx
//
// Facebook/Messenger-style floating chat bubble for the individual and
// company portals — a persistent launcher icon bottom-right (mounted at
// the layout level, so it follows the user across every tab/page, not
// just a "Support" nav item you have to navigate to), that pops open a
// small chat panel over whatever they're looking at.
//
// Mirrors SupportChatPopups.jsx's bubble visual language on the admin
// side, but simpler: each of these portals only ever has the one thread
// (with admin), so there's a single launcher instead of a stack.
import React, { useEffect, useState } from "react";
import SupportChatThread from "./SupportChatThread";
import { subscribeToThread } from "../../../utils/supportChat";
import { supabase } from "../../../supabaseClient";

export default function SupportChatLauncher({ clientId, companyId, senderId, senderName, senderType, open: openProp, onOpenChange }) {
  // Controlled if the parent passes `open`/`onOpenChange` (e.g. a sidebar
  // "Support Chat" nav item that should open this same overlay instead of
  // navigating to a separate page) — otherwise fully self-contained via
  // its own click-to-toggle button, so existing call sites that don't
  // need external control keep working unchanged.
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;
  const setOpen = (value) => (isControlled ? onOpenChange?.(value) : setInternalOpen(value));

  const [hasUnread, setHasUnread] = useState(false);
  const ownerKey = clientId || companyId;

  // Runs independent of `open` — SupportChatThread only mounts (and
  // subscribes) while the panel is expanded, so this is what notices a
  // new admin reply arriving while the bubble is collapsed and lights up
  // the unread dot. No read-receipt column on this side (see
  // sql/add_support_chat.sql's note on that being admin-only for v1), so
  // "unread" here is just session-local — resets on reload, same as any
  // lightweight chat-widget badge.
  useEffect(() => {
    if (!ownerKey) return;
    const channel = subscribeToThread({ clientId, companyId }, (row) => {
      if (row.sender_type === "admin") setHasUnread((prev) => (open ? prev : true));
    });
    return () => supabase.removeChannel(channel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey]);

  // Covers opening via the sidebar nav item (controlled mode), not just
  // the bubble's own button — either path should clear the unread dot.
  useEffect(() => {
    if (open) setHasUnread(false);
  }, [open]);

  if (!ownerKey) return null;

  return (
    <div style={{ position: "fixed", bottom: 16, right: 16, zIndex: 2000 }}>
      {/* Always mounted (not conditionally rendered) and positioned
          absolutely so it doesn't push the button around — visibility is
          purely opacity/transform, which is what makes the open/close
          feel like a smooth slide instead of an instant pop. Keeping
          SupportChatThread mounted even while "closed" is a deliberate
          side effect, not an oversight: it means messages arrive live in
          the background and are already there the moment this reopens,
          instead of a fetch delay every time. */}
      <div
        className="shadow-lg rounded-3 overflow-hidden"
        style={{
          width: 340,
          position: "absolute",
          bottom: 68,
          right: 0,
          background: "var(--bg-card, #151E32)",
          border: "1px solid var(--border-color, #334155)",
          transformOrigin: "bottom right",
          opacity: open ? 1 : 0,
          transform: open ? "translateY(0) scale(1)" : "translateY(12px) scale(0.96)",
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.2s ease, transform 0.2s ease",
        }}
      >
        <div className="d-flex align-items-center justify-content-between px-3 py-2" style={{ background: "var(--primary-blue, #0EA5E9)" }}>
          <span className="fw-bold text-white" style={{ fontSize: "0.9rem" }}>
            <i className="bi bi-headset me-2" />Support Chat
          </span>
          <i className="bi bi-x-lg text-white" style={{ cursor: "pointer" }} onClick={() => setOpen(false)} />
        </div>
        <SupportChatThread
          clientId={clientId}
          companyId={companyId}
          senderId={senderId}
          senderName={senderName}
          senderType={senderType}
          height={420}
          emptyText="No messages yet — send us a message and we'll reply here."
        />
      </div>

      <button
        type="button"
        className="rounded-circle border-0 shadow-lg d-flex align-items-center justify-content-center position-relative"
        style={{ width: 56, height: 56, background: "var(--primary-blue, #0EA5E9)", marginLeft: "auto", display: "flex" }}
        onClick={() => { setOpen(!open); setHasUnread(false); }}
        title="Support Chat"
      >
        <i className={`bi ${open ? "bi-chevron-down" : "bi-chat-dots-fill"} text-white fs-4`} />
        {hasUnread && !open && (
          <span
            className="rounded-circle position-absolute"
            style={{ width: 14, height: 14, background: "var(--accent-red, #EF4444)", top: 2, right: 2, border: "2px solid var(--bg-card, #151E32)" }}
          />
        )}
      </button>
    </div>
  );
}
