import React from 'react';
import SupportChatThread from '../../shared/support/SupportChatThread';

// Was a one-way "Request Admin Help" notify button (fired a notification +
// webhook, no reply path in-app). Replaced with the real two-way support
// chat (see sql/add_support_chat.sql, src/utils/supportChat.js) — admin
// sees and can reply to this in SupportInbox.jsx instead of just getting a
// ping to call the client back.
export default function RequestHelpView({ user, clientId, client }) {
    return (
        <div className="container py-4" style={{ maxWidth: 720 }}>
            <div className="text-center mb-4">
                <div className="bg-danger bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{ width: 64, height: 64 }}>
                    <i className="bi bi-headset fs-3 text-danger"></i>
                </div>
                <h4 className="fw-bold mb-1">Need Assistance?</h4>
                <p className="text-muted mb-0">Chat with our support team below — we'll reply here.</p>
            </div>

            <SupportChatThread
                clientId={clientId}
                senderId={user?.id}
                senderName={client?.full_name || user?.email}
                senderType="individual"
                emptyText="No messages yet — ask us anything about your dispute process or file."
            />
        </div>
    );
}
