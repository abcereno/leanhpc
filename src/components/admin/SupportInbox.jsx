// src/components/admin/SupportInbox.jsx
//
// Admin side of the support chat feature (see sql/add_support_chat.sql,
// src/utils/supportChat.js) — one inbox covering both individual clients
// and partner companies, since both only ever talk to admin (no
// individual<->partner messaging, confirmed scope). Thread list on the
// left (fetchAdminThreads' client-side reduce, proportionate to a support
// inbox's actual volume), selected thread's full history + reply on the
// right via the same SupportChatThread used by both portals.
//
// Known v1 limitation: the thread list only re-fetches on an interval (see
// REFRESH_MS below), not live — a brand-new thread or updated preview text
// can take up to that long to show up in the list, even though the open
// thread itself updates instantly via realtime. Acceptable for a support
// inbox's volume; revisit if this ever needs to feel more like a live
// queue.
import React, { useEffect, useState, useCallback } from "react";
import { Card, ListGroup, Badge, Spinner, Alert } from "react-bootstrap";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminThreads } from "../../utils/supportChat";
import SupportChatThread from "../shared/support/SupportChatThread";

const REFRESH_MS = 15000;

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SupportInbox() {
  const { userId, adminName } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);

  const loadThreads = useCallback(async () => {
    const { data, error: fetchError } = await fetchAdminThreads();
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setError(null);
      setThreads(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadThreads();
    const interval = setInterval(loadThreads, REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadThreads]);

  const selected = threads.find((t) => (t.clientId ? `client:${t.clientId}` : `company:${t.companyId}`) === selectedKey);

  return (
    <div className="p-4">
      <h4 className="fw-bold mb-3">
        <i className="bi bi-chat-dots-fill me-2" style={{ color: "var(--primary-blue, #0EA5E9)" }} />
        Support Inbox
      </h4>

      {error && <Alert variant="danger">{error}</Alert>}

      <div className="d-flex gap-3" style={{ minHeight: 560 }}>
        <Card style={{ width: 320, flexShrink: 0 }} className="border-0 shadow-sm">
          <Card.Header className="fw-bold small text-uppercase">Threads</Card.Header>
          <Card.Body className="p-0" style={{ maxHeight: 600, overflowY: "auto" }}>
            {loading ? (
              <div className="d-flex justify-content-center p-4"><Spinner animation="border" size="sm" /></div>
            ) : threads.length === 0 ? (
              <div className="text-muted text-center small p-4">No support messages yet.</div>
            ) : (
              <ListGroup variant="flush">
                {threads.map((t) => {
                  const key = t.clientId ? `client:${t.clientId}` : `company:${t.companyId}`;
                  return (
                    <ListGroup.Item
                      key={key}
                      action
                      active={key === selectedKey}
                      onClick={() => setSelectedKey(key)}
                      className="d-flex justify-content-between align-items-start gap-2"
                    >
                      <div className="text-truncate">
                        <div className="fw-bold text-truncate" style={{ maxWidth: 200 }}>{t.ownerName}</div>
                        <Badge bg={t.ownerType === "individual" ? "info" : "secondary"} className="text-uppercase me-2" style={{ fontSize: "0.6rem" }}>
                          {t.ownerType}
                        </Badge>
                        <div className="text-muted text-truncate small" style={{ maxWidth: 220 }}>{t.lastMessage}</div>
                        <div className="text-muted" style={{ fontSize: "0.65rem" }}>{timeAgo(t.lastMessageAt)}</div>
                      </div>
                      {t.unreadCount > 0 && <Badge bg="danger" pill>{t.unreadCount}</Badge>}
                    </ListGroup.Item>
                  );
                })}
              </ListGroup>
            )}
          </Card.Body>
        </Card>

        <div className="flex-grow-1">
          {selected ? (
            <SupportChatThread
              key={selectedKey}
              clientId={selected.clientId}
              companyId={selected.companyId}
              senderId={userId}
              senderName={adminName}
              senderType="admin"
              height={600}
            />
          ) : (
            <Card className="border-0 shadow-sm h-100 d-flex align-items-center justify-content-center text-muted" style={{ minHeight: 400 }}>
              Select a thread to view the conversation.
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
