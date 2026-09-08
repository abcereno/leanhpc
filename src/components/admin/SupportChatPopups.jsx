// src/components/admin/SupportChatPopups.jsx
//
// Facebook-Messenger-style floating chat bubbles for the support chat
// feature (see sql/add_support_chat.sql, src/utils/supportChat.js,
// SupportInbox.jsx). Mounted once in AdminLayout.jsx, same pattern as
// AdminNotificationWatcher.jsx/ClientSubmissionListener.jsx — an
// always-on background listener scoped to the whole admin route tree, not
// tied to any one page, so a new client/partner message pops a bubble no
// matter what an admin is currently looking at.
//
// Two pieces, both anchored bottom-right:
//   1. A persistent launcher bubble (always visible, not just when a new
//      message arrives) with a total-unread badge — click it to see every
//      thread and open one. This was missing in the first version: the
//      whole widget rendered nothing until the first realtime INSERT ever
//      arrived, so there was no visible entry point otherwise.
//   2. The auto-popping conversation bubbles themselves, stacking to the
//      left of the launcher as they open — this part pops automatically
//      the moment a client/partner sends a message.
//
// This is additive to SupportInbox.jsx (the full-page thread browser),
// not a replacement — the inbox is still there for browsing/searching
// every thread; this is the "don't miss a live one" layer on top, the
// same relationship AdminNotificationWatcher's toasts have to their
// underlying admin pages.
import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import SupportChatThread from "../shared/support/SupportChatThread";
import { fetchAdminThreads } from "../../utils/supportChat";
import { useFloatingDock } from "../../context/FloatingDockContext";
import { CORNER_OFFSET } from "../../utils/floatingDock";

// Facebook caps how many threads stay expanded at once and minimizes the
// rest rather than letting the row grow unbounded — same idea here, just
// with a smaller number since this is a support inbox, not a personal
// messenger.
const MAX_EXPANDED = 3;
const BUBBLE_WIDTH = 300;
// Recent-threads list + unread badge poll interval — same tradeoff
// SupportInbox.jsx's own list already makes (see its own comment): a
// support inbox's volume doesn't need this to be instant, and every
// already-open bubble still updates live via its own realtime subscription
// regardless of this interval.
const REFRESH_MS = 20000;

function threadKey(row) {
  return row.client_id ? `client:${row.client_id}` : `company:${row.company_id}`;
}

// Individual vs partner-company gets a distinct color everywhere a thread
// shows up (bubble avatar, type badge, list rows) — with several bubbles
// open or a busy recent-threads list, a name alone doesn't make it obvious
// which is which at a glance.
const TYPE_STYLE = {
  individual: { color: "var(--primary-blue, #0EA5E9)", label: "Client" },
  company: { color: "var(--accent-gold, #F59E0B)", label: "Partner" },
};

export default function SupportChatPopups() {
  const { user, userId, adminName, hasAnyPermission } = useAuth();
  const canSeeSupport = hasAnyPermission(["view_call_queue", "view_clients"]);
  const [threads, setThreads] = useState([]);
  const [showList, setShowList] = useState(false);
  const [recentThreads, setRecentThreads] = useState([]);
  // Shared with the Pipeline (24h) queue widget (ClientSubmissionListener.jsx)
  // — only one of the two can have its panel open at a time. See
  // FloatingDockContext.jsx.
  const { activePanel, openPanel } = useFloatingDock();

  // If the Pipeline widget claims the dock, collapse every expanded thread
  // and close the recent-list popover back to just the launcher — the
  // persistent launcher button itself (and any minimized chat-head
  // circles) stay visible regardless, only the big panels yield.
  useEffect(() => {
    if (activePanel === "chat") return;
    setThreads((prev) => (prev.some((t) => t.expanded) ? prev.map((t) => ({ ...t, expanded: false })) : prev));
    setShowList(false);
  }, [activePanel]);

  const loadRecentThreads = useCallback(async () => {
    const { data } = await fetchAdminThreads();
    if (data) setRecentThreads(data);
  }, []);

  useEffect(() => {
    if (!canSeeSupport) return;
    loadRecentThreads();
    const interval = setInterval(loadRecentThreads, REFRESH_MS);
    return () => clearInterval(interval);
  }, [canSeeSupport, loadRecentThreads]);

  useEffect(() => {
    if (!user || !canSeeSupport) return;

    const channel = supabase
      .channel(`support-popups-${user.id}-${Date.now()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        const row = payload.new;
        // Our own outgoing replies (or another admin's) don't pop a new
        // bubble — only genuine incoming requests do, same as Messenger
        // never pops a head for a message you just sent yourself.
        if (row.sender_type === "admin") return;

        const key = threadKey(row);
        let isNewThread = false;
        setThreads((prev) => {
          const existingIndex = prev.findIndex((t) => t.key === key);
          if (existingIndex !== -1) {
            const next = [...prev];
            next[existingIndex] = { ...next[existingIndex], unread: !next[existingIndex].expanded, lastMessage: row.body };
            return next;
          }

          isNewThread = true;
          const expandedCount = prev.filter((t) => t.expanded).length;
          const newThread = {
            key,
            clientId: row.client_id,
            companyId: row.company_id,
            ownerType: row.client_id ? "individual" : "company",
            ownerName: row.sender_name || (row.client_id ? "New client" : "New partner"),
            lastMessage: row.body,
            expanded: expandedCount < MAX_EXPANDED,
            unread: true,
          };
          return [...prev, newThread];
        });

        // A brand-new incoming thread claims the dock, auto-collapsing the
        // Pipeline (24h) queue widget if it happened to be open — a live
        // client/partner request shouldn't stay hidden behind it. It also
        // closes the recent-list popover for the same reason toggleExpanded
        // does: an auto-popped panel could otherwise land right underneath
        // an already-open list. An update to an already-tracked thread just
        // bumps its unread badge instead, same as before.
        if (isNewThread) {
          openPanel("chat");
          setShowList(false);
        }

        // Keeps the launcher's unread badge and recent-threads list in
        // sync immediately instead of waiting for the next poll.
        loadRecentThreads();

        // Same notification sound already used elsewhere in the admin
        // shell (see AdminNotificationWatcher.jsx) — best-effort, browsers
        // block autoplay before any user interaction on the page.
        new Audio("/sounds/notification.mp3").play().catch(() => {});
      })
      // Logged on purpose, same reasoning as subscribeToThread in
      // supportChat.js — a silently-failed subscription here is exactly
      // what "the bubble never pops" looks like from the outside.
      .subscribe((status, err) => {
        if (status !== "SUBSCRIBED") console.warn(`[SupportChatPopups] channel → ${status}`, err || "");
      });

    return () => supabase.removeChannel(channel);
  }, [user, canSeeSupport, loadRecentThreads, openPanel]);

  if (!canSeeSupport) return null;

  const toggleExpanded = (key) => {
    setThreads((prev) => prev.map((t) => (t.key === key ? { ...t, expanded: !t.expanded, unread: t.expanded ? t.unread : false } : t)));
    const target = threads.find((t) => t.key === key);
    if (target && !target.expanded) {
      // Expanding a thread claims the dock (auto-collapses Pipeline if
      // it's open) and closes the recent-threads list — the two used to
      // be able to render at once, and since the list pops up directly
      // above the launcher while panels sit in the row next to it, an
      // open list would land right on top of whatever panel happened to
      // be there. Only one floating surface shows at a time now, same
      // reasoning as FloatingDockContext.jsx's cross-widget rule.
      openPanel("chat");
      setShowList(false);
    }
  };

  const closeThread = (key) => {
    setThreads((prev) => prev.filter((t) => t.key !== key));
  };

  const openFromList = (t) => {
    const key = t.clientId ? `client:${t.clientId}` : `company:${t.companyId}`;
    setThreads((prev) => {
      const existing = prev.find((p) => p.key === key);
      if (existing) return prev.map((p) => (p.key === key ? { ...p, expanded: true, unread: false } : p));
      return [...prev, { key, clientId: t.clientId, companyId: t.companyId, ownerType: t.ownerType, ownerName: t.ownerName, expanded: true, unread: false }];
    });
    setShowList(false);
    openPanel("chat");
  };

  const totalUnread = recentThreads.reduce((sum, t) => sum + t.unreadCount, 0);

  return (
    <div
      className="d-flex align-items-end"
      // The literal bottom-right corner, same as any other floating chat
      // widget — CORNER_OFFSET is shared with ClientSubmissionListener.jsx's
      // Pipeline widget (utils/floatingDock.js) so the two stack
      // consistently. Not trying to dodge AdminLayout.jsx's pinned
      // AppFooter here — the dock's mutual-exclusion logic above is what
      // actually prevents this widget from blocking anything, not this
      // offset.
      style={{ position: "fixed", bottom: CORNER_OFFSET, right: 16, gap: 10, zIndex: 2000 }}
    >
      {/* Expanded threads render as the full panel — one per open,
          non-minimized conversation, stacking left of the launcher column. */}
      {threads.filter((t) => t.expanded).map((t) => {
        const typeStyle = TYPE_STYLE[t.ownerType];
        return (
        <div key={t.key} className="animate-fade-in" style={{ width: BUBBLE_WIDTH }}>
          <div
            className="rounded-top-3 shadow-lg d-flex flex-column"
            style={{ background: "var(--bg-card, #151E32)", border: "1px solid var(--border-color, #334155)", borderTop: `3px solid ${typeStyle.color}` }}
          >
            <div
              className="d-flex align-items-center justify-content-between px-3 py-2"
              style={{ cursor: "pointer" }}
              onClick={() => toggleExpanded(t.key)}
            >
              <div className="d-flex align-items-center gap-2 text-truncate">
                <span
                  className="rounded-circle d-inline-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: 26, height: 26, background: typeStyle.color, color: "#fff", fontSize: "0.75rem", fontWeight: 700 }}
                >
                  {t.ownerName.charAt(0).toUpperCase()}
                </span>
                <div className="text-truncate">
                  <div className="fw-bold text-truncate" style={{ fontSize: "0.85rem", lineHeight: 1.2 }}>{t.ownerName}</div>
                  <div className="text-uppercase" style={{ fontSize: "0.6rem", letterSpacing: "0.4px", color: typeStyle.color }}>{typeStyle.label}</div>
                </div>
              </div>
              <div className="d-flex align-items-center gap-2 flex-shrink-0">
                <i className="bi bi-dash-lg small" />
                <i
                  className="bi bi-x-lg small"
                  onClick={(e) => { e.stopPropagation(); closeThread(t.key); }}
                />
              </div>
            </div>

            <SupportChatThread
              clientId={t.clientId}
              companyId={t.companyId}
              senderId={userId}
              senderName={adminName}
              senderType="admin"
              height={360}
            />
          </div>
        </div>
        );
      })}

      {/* Launcher column — minimized "chat heads" stack directly above the
          button, Facebook Messenger's actual chat-heads style: bigger
          circles (64px, not a small badge-sized dot), overlapping by
          about a third, each with a colored ring standing in for a
          profile photo since threads don't have one. Expanded panels stay
          in the horizontal row to this column's left. */}
      <div className="d-flex flex-column align-items-end" style={{ gap: 14 }}>
        {threads.filter((t) => !t.expanded).length > 0 && (
          <div className="d-flex flex-column align-items-center animate-fade-in">
            {threads.filter((t) => !t.expanded).map((t, i) => {
              const typeStyle = TYPE_STYLE[t.ownerType];
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => toggleExpanded(t.key)}
                  title={t.ownerName}
                  className="rounded-circle border-0 shadow-lg d-flex align-items-center justify-content-center position-relative flex-shrink-0"
                  style={{
                    width: 64,
                    height: 64,
                    marginTop: i === 0 ? 0 : -24,
                    background: typeStyle.color,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: "1.3rem",
                    border: "3px solid var(--bg-card, #151E32)",
                    boxShadow: `0 0 0 2px ${typeStyle.color}, 0 4px 10px rgba(0,0,0,0.4)`,
                  }}
                >
                  {t.ownerName.charAt(0).toUpperCase()}
                  {t.unread && (
                    <span
                      className="rounded-circle position-absolute"
                      style={{ width: 16, height: 16, background: "var(--accent-red, #EF4444)", bottom: 0, right: 0, border: "3px solid var(--bg-card, #151E32)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

      <div style={{ position: "relative" }}>
        <div
          className="rounded-3 shadow-lg overflow-hidden d-flex flex-column"
          style={{
            width: BUBBLE_WIDTH,
            maxHeight: 420,
            position: "absolute",
            bottom: 72,
            right: 0,
            background: "var(--bg-card, #151E32)",
            border: "1px solid var(--border-color, #334155)",
            borderTop: "3px solid var(--primary-blue, #0EA5E9)",
            transformOrigin: "bottom right",
            opacity: showList ? 1 : 0,
            transform: showList ? "translateY(0) scale(1)" : "translateY(12px) scale(0.96)",
            pointerEvents: showList ? "auto" : "none",
            transition: "opacity 0.2s ease, transform 0.2s ease",
          }}
        >
            {/* Same dark-card + colored-accent style as an expanded panel's
                own header, not a solid banner — this list and a panel never
                show at once anymore, but they should still read as the same
                widget family when you flip between them. */}
            <div className="px-3 py-2 fw-bold" style={{ borderBottom: "1px solid var(--border-color, #334155)" }}>
              <i className="bi bi-chat-dots-fill me-2 text-primary" />Support Chat
            </div>
            <div style={{ overflowY: "auto" }}>
              {recentThreads.length === 0 ? (
                <div className="text-muted text-center small p-3">No conversations yet.</div>
              ) : (
                recentThreads.map((t) => {
                  const key = t.clientId ? `client:${t.clientId}` : `company:${t.companyId}`;
                  const typeStyle = TYPE_STYLE[t.ownerType];
                  return (
                    <div
                      key={key}
                      onClick={() => openFromList(t)}
                      className="px-3 py-2 border-bottom d-flex align-items-start gap-2"
                      style={{ cursor: "pointer", borderColor: "var(--border-color, #334155)", borderLeft: `3px solid ${typeStyle.color}` }}
                    >
                      <div className="text-truncate flex-grow-1">
                        <div className="d-flex align-items-center gap-2">
                          <span className="fw-bold text-truncate" style={{ fontSize: "0.85rem" }}>{t.ownerName}</span>
                          <span className="text-uppercase flex-shrink-0" style={{ fontSize: "0.58rem", letterSpacing: "0.4px", color: typeStyle.color }}>{typeStyle.label}</span>
                        </div>
                        <div className="text-muted text-truncate small">{t.lastMessage}</div>
                      </div>
                      {t.unreadCount > 0 && (
                        <span className="badge rounded-pill flex-shrink-0" style={{ background: "var(--accent-red, #EF4444)" }}>{t.unreadCount}</span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
        </div>

        {/* Rounded-square, not a circle — same silhouette Facebook uses for
            its own chat-heads launcher button, deliberately distinct from
            the round avatar heads stacked above it. */}
        <button
          type="button"
          className="border-0 shadow-lg d-flex align-items-center justify-content-center position-relative"
          style={{ width: 60, height: 60, borderRadius: 20, background: "var(--primary-blue, #0EA5E9)" }}
          onClick={() => {
            setShowList((prev) => !prev);
            if (!showList) {
              loadRecentThreads();
              openPanel("chat");
              // Same reasoning as toggleExpanded above, the other
              // direction: opening the list collapses every expanded
              // panel back to a head, so the list never has to render on
              // top of one.
              setThreads((prev) => (prev.some((t) => t.expanded) ? prev.map((t) => ({ ...t, expanded: false })) : prev));
            }
          }}
          title="Support Chat"
        >
          <i className={`bi ${showList ? "bi-chevron-down" : "bi-chat-dots-fill"} text-white fs-4`} />
          {totalUnread > 0 && !showList && (
            <span
              className="badge rounded-pill position-absolute"
              style={{ background: "var(--accent-red, #EF4444)", top: -4, right: -4, fontSize: "0.65rem" }}
            >
              {totalUnread}
            </span>
          )}
        </button>
      </div>
      </div>
    </div>
  );
}
