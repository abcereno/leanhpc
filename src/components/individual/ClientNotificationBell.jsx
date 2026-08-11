import React, { useState, useEffect } from "react";
import { Badge, Dropdown, Modal, Button, Form, Spinner, Alert } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useAuth } from '../../context/AuthContext';
import { useToast } from "../shared/ui/ToastNotifier";

export default function ClientNotificationBell() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [clientId, setClientId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Admin Assist Modal State
  const [showAssistModal, setShowAssistModal] = useState(false);
  const [selectedNotif, setSelectedNotif] = useState(null);
  const [assistNotes, setAssistNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchClientAndNotifs = async () => {
      // 1. Get the actual Client ID from the Auth User ID
      const { data: clientData } = await supabase
        .from('clients')
        .select('id')
        .eq('auth_user_id', user.id)
        .single();
        
      if (!clientData) return;
      setClientId(clientData.id);

      // 2. Fetch their notifications
      const { data: notifs } = await supabase
        .from('client_notifications')
        .select('*')
        .eq('client_id', clientData.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (notifs) {
        setNotifications(notifs);
        setUnreadCount(notifs.filter(n => !n.is_read).length);
      }
    };

    fetchClientAndNotifs();
  }, [user]);

  const handleNotificationClick = async (notif) => {
    setSelectedNotif(notif);
    setShowAssistModal(true);

    // Mark as read in the background
    if (!notif.is_read) {
      setUnreadCount(prev => Math.max(0, prev - 1));
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      await supabase.from('client_notifications').update({ is_read: true }).eq('id', notif.id);
    }
  };

  const handleSubmitAssist = async () => {
    if (!clientId || !selectedNotif) return;
    setSubmitting(true);
    
    try {
      const { error } = await supabase.from('admin_assist_requests').insert({
        client_id: clientId,
        notification_id: selectedNotif.id,
        topic: `Help with: ${selectedNotif.title}`,
        status: 'pending'
      });

      if (error) throw error;

      addToast({ title: "Request Submitted", message: "Our team will review your file and contact you about next steps and any applicable fees.", variant: "success", icon: "bi-check-circle-fill" });
      setShowAssistModal(false);
      setAssistNotes("");
    } catch (err) {
      console.error("Error submitting request:", err);
      addToast({ title: "Submission Failed", message: "Please try again.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSubmitting(false);
    }
  };

  // Format timestamp nicely
  const timeAgo = (dateString) => {
    const diff = new Date() - new Date(dateString);
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return "Just now";
  };

  return (
    <>
      {/* THE NOTIFICATION BELL */}
      <Dropdown align="end">
        <Dropdown.Toggle variant="link" className="text-dark border-0 p-2 position-relative" bsPrefix="p-0">
          <i className="bi bi-bell fs-5"></i>
          {unreadCount > 0 && (
            <Badge bg="danger" className="notif-badge">{unreadCount}</Badge>
          )}
        </Dropdown.Toggle>

        <Dropdown.Menu className="notif-dropdown-menu p-0 mt-2">
          <div className="p-3 bg-light border-bottom d-flex justify-content-between align-items-center">
            <h6 className="mb-0 fw-bold">Notifications</h6>
            {unreadCount > 0 && <Badge bg="primary">{unreadCount} New</Badge>}
          </div>

          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted">
              <i className="bi bi-bell-slash fs-3 d-block mb-2 opacity-50"></i>
              <small>No recent notifications</small>
            </div>
          ) : (
            notifications.map(notif => (
              <div 
                key={notif.id} 
                className={`notif-item d-flex gap-3 ${!notif.is_read ? 'unread' : ''}`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="notif-icon-circle flex-shrink-0">
                  <i className={`bi ${notif.title.includes("Positive") ? "bi-graph-up-arrow text-success" : notif.title.includes("Inquiry") ? "bi-search text-warning" : "bi-exclamation-circle text-danger"}`}></i>
                </div>
                <div>
                  <h6 className="mb-1 fw-bold small text-dark">{notif.title}</h6>
                  <p className="mb-1 text-muted" style={{fontSize: '0.75rem', lineHeight: '1.4'}}>{notif.message}</p>
                  <small className="text-primary fw-bold" style={{fontSize: '0.7rem'}}>{timeAgo(notif.created_at)}</small>
                </div>
              </div>
            ))
          )}
        </Dropdown.Menu>
      </Dropdown>

      {/* THE ADMIN ASSIST MODAL */}
      <Modal show={showAssistModal} onHide={() => setShowAssistModal(false)} centered backdrop="static">
        <Modal.Header closeButton className="border-0 pb-0">
        </Modal.Header>
        <Modal.Body className="px-4 pb-4 pt-1">
          <div className="text-center mb-4">
            <div className="bg-primary bg-opacity-10 text-primary rounded-circle d-inline-flex align-items-center justify-content-center mb-3" style={{width: '60px', height: '60px'}}>
              <i className="bi bi-headset fs-2"></i>
            </div>
            <h4 className="fw-bold text-dark">Admin Assist</h4>
            <p className="text-muted small px-3">Would you like our backend team to help review and process this recent profile change?</p>
          </div>

          <div className="p-3 bg-light border rounded-3 mb-4">
            <h6 className="fw-bold mb-1 small text-muted text-uppercase">Alert Selected:</h6>
            <h6 className="fw-bold text-dark mb-0">{selectedNotif?.title}</h6>
          </div>

          <Alert variant="warning" className="border-0 shadow-sm small fw-bold">
            <i className="bi bi-info-circle-fill me-2"></i>
            Please Note: Admin Assist requests are considered separate service requests and may require an additional processing fee.
          </Alert>

        </Modal.Body>
        <Modal.Footer className="bg-light border-0">
          <Button variant="outline-secondary" className="fw-bold w-100 mb-2" onClick={() => setShowAssistModal(false)}>
            Close
          </Button>
          <Button variant="primary" className="fw-bold w-100 m-0 shadow-sm" onClick={handleSubmitAssist} disabled={submitting}>
            {submitting ? <Spinner size="sm" /> : "Submit Assist Request"}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}