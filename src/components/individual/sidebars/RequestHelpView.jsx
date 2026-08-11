import React, { useState } from 'react';
import { supabase } from "../../../supabaseClient";
import { Spinner, Alert } from "react-bootstrap";

export default function RequestHelpView({ user }) {
    const [sending, setSending] = useState(false);
    const [status, setStatus] = useState(null); // 'success' or 'error'

    const handleSendRequest = async () => {
        setSending(true);
        setStatus(null);
        try {
            await supabase.from('notifications').insert({
                type: 'admin_help_request',
                message: `User ${user?.email} requested help via the sidebar.`, 
                status: 'unread',
            });

            try {
                await fetch("https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/36c7c9da-355a-46ad-826b-2b378a560212", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: user?.email, source: "sidebar_help_request" })
                });
            } catch (e) { console.error("Webhook failed", e); }

            setStatus('success');
        } catch (err) {
            console.error(err);
            setStatus('error');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="container py-5 max-w-lg mx-auto">
            <div className="card shadow-sm border-0 rounded-4">
                <div className="card-body text-center p-5">
                    <div className="bg-danger bg-opacity-10 rounded-circle d-inline-flex align-items-center justify-content-center mb-4" style={{width: 80, height: 80}}>
                        <i className="bi bi-headset display-4 text-danger"></i>
                    </div>
                    <h2 className="fw-bold mb-3">Need Assistance?</h2>
                    <p className="text-muted mb-4">
                        If you have questions about your dispute process or need to update your file, 
                        click below to notify your account administrator.
                    </p>

                    {status === 'success' && (
                        <Alert variant="success" className="mb-4 fw-bold">
                            <i className="bi bi-check-circle-fill me-2"></i> Request Sent! An admin will contact you shortly.
                        </Alert>
                    )}
                    {status === 'error' && (
                        <Alert variant="danger" className="mb-4">
                            Error sending request. Please try again.
                        </Alert>
                    )}

                    <button 
                        className="btn btn-danger btn-lg px-5 py-3 fw-bold rounded-pill shadow-sm w-100"
                        onClick={handleSendRequest}
                        disabled={sending || status === 'success'}
                    >
                        {sending ? <Spinner size="sm" animation="border" className="me-2"/> : <i className="bi bi-exclamation-circle me-2"></i>} 
                        {status === 'success' ? "Help Requested" : "Request Admin Help"}
                    </button>
                </div>
            </div>
        </div>
    );
}