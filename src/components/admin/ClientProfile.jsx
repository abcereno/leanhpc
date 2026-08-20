import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { createPortal } from "react-dom"; 
import {
  Tabs,
  Tab,
  Row,
  Col,
  Spinner,
  Alert,
  Button,
  Modal,
  Form
} from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";

// Hooks
import { useClientProfilePage } from "../../hooks/useClientProfilePage";
import { useClientCreditFiles } from "../../hooks/useClientCreditFiles";
import useClientNotes from "../../hooks/useClientNotes";

// Existing Components
import ClientHeader from "./client-profile/ClientHeader";
import DocumentsSection from "./client-profile/DocumentsSection";
import CommentsSection from "./client-profile/CommentsSection";
import EditClientModal from "./client-profile/EditClientModal";
import InquiriesThread from "./client-profile/InquiriesThread";
import RemindersSidebar from "./client-profile/RemindersSidebar/RemindersSidebar";
import CoverLetterAssets from "./client-profile/CoverLetterAssets";
import AlignmentCheckPanel from "./client-profile/AlignmentCheckPanel";
import AdminCompanyTaskWidget from "./client-profile/AdminCompanyTaskWidget";
import AdminClientInvoices from "./client-profile/AdminClientInvoices";
import CreditAuditReport from "../shared/client-pages/CreditAuditReport";
import AdminClientPortalDocs from "./client-profile/AdminClientPortalDocs";
import ManagerNotesPanel from "./client-profile/ManagerNotesPanel";
import NoteComposer from "./client-profile/NoteComposer";
import { useToast } from "../shared/ui/ToastNotifier";
import { handleImagePaste } from "../../utils/pasteImageUpload";
import FormatWithImages from "../shared/ui/FormatWithImages";

// FormatNotes used to be a one-off local component here; it's now the
// shared FormatWithImages (src/components/shared/ui/FormatWithImages.jsx)
// so CommentsSection.jsx's Activity Thread can render embedded screenshots
// the same way instead of duplicating this regex logic. Thin wrapper kept
// so the two call sites below don't need to change.
const FormatNotes = ({ notes }) => (
  <FormatWithImages text={notes} lineClassName="d-block mb-1 fs-5 fw-medium text-dark" />
);

export default function ClientProfile({ overrideId }) {
  const { id: paramId } = useParams();
  const id = overrideId || paramId;
  const { hasPermission } = useAuth();
  const { addToast } = useToast();
  const canViewClient = hasPermission("view_clients");
  const [activeTab, setActiveTab] = useState("workspace");
  const [agentCode, setAgentCode] = useState(""); 
  
  const [showNotesPopup, setShowNotesPopup] = useState(false);
  const [importantNotes, setImportantNotes] = useState(null);
  const [isSpecialPriority, setIsSpecialPriority] = useState(false);
  // Which clients column importantNotes actually came from (special_forms_notes
  // takes priority, logins_notes is the fallback shown when there's no
  // special note — see fetchClientData below) — needed so the inline edit
  // below writes back to the right column instead of guessing.
  const [importantNotesField, setImportantNotesField] = useState(null);
  const [editingImportantNotes, setEditingImportantNotes] = useState(false);
  const [editedNotesText, setEditedNotesText] = useState("");
  const [savingImportantNotes, setSavingImportantNotes] = useState(false);

  // Pinned Manager Notes (client_notes table) now feed the same Attention
  // popup as the legacy logins_notes/special_forms_notes fields below —
  // pin a note from here or the Manager Notes tab and it'll surface the
  // next time anyone opens this client. The popup is also how you add a
  // new note without leaving it (see NoteComposer usage in the Modal below).
  const { notes: managerNotes, addNote: addManagerNote } = useClientNotes(id);
  const pinnedNotes = managerNotes.filter((n) => n.is_pinned);

  // Refresh Key State
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = () => setRefreshKey((prev) => prev + 1);

  const {
    isEditModalOpen,
    isRemindersSidebarOpen,
    letterAssets,
    setLetterAssets,
    openEditModal,
    closeEditModal,
    openReminders,
    closeReminders,
  } = useClientProfilePage();

  useEffect(() => {
    if (!id || !canViewClient) return;
    
    const fetchClientData = async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("agent, logins_notes, special_forms_notes") 
        .eq("id", id)
        .single();
        
      if (error) {
          console.error("❌ Error fetching client data:", error);
          return;
      }
        
      if (data) {
          setAgentCode(data.agent);

          const specialNote = data.special_forms_notes?.trim();
          const loginNote = data.logins_notes?.trim();

          if (specialNote) {
              setImportantNotes(specialNote);
              setImportantNotesField("special_forms_notes");
              setIsSpecialPriority(true);
              setShowNotesPopup(true);
          } else if (loginNote) {
              setImportantNotes(loginNote);
              setImportantNotesField("logins_notes");
              setIsSpecialPriority(false);
              setShowNotesPopup(true);
          } else {
              setImportantNotes(null);
              setImportantNotesField(null);
          }
      }
    };

    fetchClientData();
  }, [id, canViewClient, refreshKey]);

  const startEditingImportantNotes = () => {
    setEditedNotesText(importantNotes || "");
    setEditingImportantNotes(true);
  };

  const cancelEditingImportantNotes = () => {
    setEditingImportantNotes(false);
    setEditedNotesText("");
  };

  // Lets staff paste a screenshot straight into this popup's inline edit
  // box too — same upload helper as EditClientModal.jsx's Special Forms
  // Notes field (uses the same underlying special_forms_notes/logins_notes
  // column), appended on a new line. FormatNotes above already renders any
  // image URL found in the text, so the paste just needs to land in the
  // field — no rendering changes needed here.
  const handleImportantNotesPaste = (e) => {
    handleImagePaste(
      e,
      (url) => setEditedNotesText((prev) => (prev ? `${prev}\n${url}` : url)),
      (err) =>
        addToast({
          title: "Image Upload Failed",
          message: err.message,
          variant: "danger",
          icon: "bi-exclamation-triangle-fill",
        })
    );
  };

  // Saves straight back to whichever column populated importantNotes
  // (special_forms_notes or logins_notes) — same fields EditClientModal.jsx
  // edits, just reachable without leaving this popup. Clearing it here
  // stops the popup from reappearing, same as clearing it in Edit Info.
  const handleSaveImportantNotes = async () => {
    if (!importantNotesField) return;
    setSavingImportantNotes(true);
    const trimmed = editedNotesText.trim();
    const { error } = await supabase
      .from("clients")
      .update({ [importantNotesField]: trimmed || null })
      .eq("id", id);
    setSavingImportantNotes(false);

    if (error) {
      console.error("Failed to save note:", error);
      return;
    }

    setImportantNotes(trimmed || null);
    setEditingImportantNotes(false);
    handleRefresh();
  };

  // Separate trigger: at least one pinned Manager Note also opens the
  // Attention popup, independent of the legacy fields above.
  useEffect(() => {
    if (pinnedNotes.length > 0) setShowNotesPopup(true);
  }, [pinnedNotes.length]);

  return (
    <div className="py-2"> 
      
      {/* Top Action Bar */}
      <div className="d-flex justify-content-end mb-3">
        <Button variant="primary" onClick={openReminders} className="d-flex align-items-center gap-2 shadow-sm fw-bold">
          <i className="bi bi-bell"></i> Reminders
        </Button>
      </div>

      <ClientHeader clientId={id} onEdit={openEditModal} onRefresh={handleRefresh} refreshKey={refreshKey} />

      {/* MR AGENT ALERT BANNER */}
      {agentCode === "MR" && (
        <Alert variant="danger" className="d-flex align-items-center shadow-sm border-danger mt-3 mb-0">
          <div className="bg-danger text-black rounded-circle d-flex align-items-center justify-content-center me-3 flex-shrink-0" style={{width: '48px', height: '48px'}}>
             <span className="fw-bold fs-5">MR</span>
          </div>
          <div>
            <h5 className="alert-heading fw-bold mb-1 text-black">
                <i className="bi bi-exclamation-triangle-fill me-2"></i>
                Assigned to MR
            </h5>
            <p className="mb-0 text-black">
              Auto loans older than 2 months will be disputed.
            </p>
          </div>
        </Alert>
      )}

      {/* Main Content Tabs */}
      <div style={{ minHeight: '70vh' }} className="mt-4">
        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k)}
          className="mb-4 border-bottom-0"
          variant="pills"
        >
          <Tab
            eventKey="workspace"
            title={<span className="fw-medium px-2"><i className="bi bi-briefcase me-2"></i>Workspace</span>}
          >
            <div className="animate-fade-in d-flex flex-column gap-4">
              
              <Row className="mx-0 g-4">
                <Col className="px-0 pe-lg-2">
                  <AdminCompanyTaskWidget clientId={id} refreshKey={refreshKey} />
                </Col>
              </Row>
              <Row>
                <Col className="px-0 ps-lg-2">
                  <CoverLetterAssets clientId={id} onChange={setLetterAssets} refreshKey={refreshKey} />
                </Col>
              </Row>
              <Row>
                <Col className="px-0 ps-lg-2">
                  <AlignmentCheckPanel clientId={id} refreshKey={refreshKey} />
                </Col>
              </Row>
              <Row className="mx-0 g-4">
                <Col lg={7} className="px-0 pe-lg-2">
                  <div style={{ minHeight: "400px", height: "100%", maxHeight: "606px" }}>
                    <DocumentsSection clientId={id} refreshKey={refreshKey} />
                  </div>
                </Col>
                <Col lg={5} className="px-0 ps-lg-2">
                  <div style={{ minHeight: "400px", height: "100%", maxHeight: "606px" }}>
                    <CommentsSection clientId={id} refreshKey={refreshKey} />
                  </div>
                </Col>
              </Row>

              <div className="w-100">
                <InquiriesThread clientId={id} letterAssets={letterAssets} refreshKey={refreshKey} onRefresh={handleRefresh} />
              </div>
              
            </div>
          </Tab>

          <Tab
            eventKey="billing"
            title={<span className="fw-medium px-2"><i className="bi bi-receipt me-2"></i>Billing & Portal</span>}
          >
             <div className="animate-fade-in d-flex flex-column gap-4">
               <div className="w-100">
                 <AdminClientInvoices clientId={id} refreshKey={refreshKey} />
               </div>
               <div className="w-100">
                 <AdminClientPortalDocs clientId={id} refreshKey={refreshKey} />
               </div>
             </div>
          </Tab>

          <Tab
            eventKey="audit"
            title={<span className="fw-medium px-2"><i className="bi bi-file-earmark-bar-graph me-2"></i>Credit Audit</span>}
          >
            <div className="bg-white p-4 rounded-3 shadow-sm border animate-fade-in" style={{ minHeight: '500px' }}>
              <ClientAuditTabContent clientId={id} refreshKey={refreshKey} />
            </div>
          </Tab>

          <Tab
            eventKey="notes"
            title={<span className="fw-medium px-2"><i className="bi bi-sticky me-2"></i>Manager Notes</span>}
          >
            <div className="animate-fade-in" style={{ maxWidth: 700 }}>
              <ManagerNotesPanel clientId={id} />
            </div>
          </Tab>
        </Tabs>
      </div>

      <EditClientModal clientId={id} show={isEditModalOpen} onClose={closeEditModal} onSaved={handleRefresh} />

      {/* GUARANTEED FIXED SIDEBAR WRAPPER */}
      {isRemindersSidebarOpen && createPortal(
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, zIndex: 1050, display: 'flex', justifyItems: 'flex-end', justifyContent: 'flex-end' }}>
          
          <div 
            onClick={closeReminders} 
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }} 
          />
          
          <div 
            className="card rounded-0 border-top-0 border-bottom-0 border-end-0 shadow-lg animate-fade-in position-relative" 
            style={{ width: '100%', maxWidth: '450px', height: '100%', overflowY: 'auto', zIndex: 1051 }}
          >
            <RemindersSidebar clientId={id} isOpen={isRemindersSidebarOpen} onClose={closeReminders} onRefresh={handleRefresh} />
          </div>
          
        </div>,
        document.body
      )}

      {/* 👇 FIXED MODAL UI: Notes pulled out of Alert box to let images shine 👇 */}
      <Modal show={showNotesPopup} onHide={() => setShowNotesPopup(false)} backdrop="static" keyboard={false} centered size="lg">
        <Modal.Header className={`${isSpecialPriority ? 'bg-danger text-white' : 'bg-warning text-dark'} border-bottom-0`}>
          <Modal.Title className="fw-bold">
              <i className={`bi ${isSpecialPriority ? 'bi-exclamation-triangle-fill' : 'bi-exclamation-octagon-fill'} me-2 fs-4`}></i>
              {isSpecialPriority ? "HIGH PRIORITY: Special Instructions" : "ATTENTION: Client Notes"}
          </Modal.Title>
        </Modal.Header>

        <Modal.Body className="bg-white p-4">
            <p className="text-muted mb-4 fs-6">
              {isSpecialPriority
                ? "🚨 CRITICAL: This client has special forms or processing requirements that MUST be followed."
                : "📋 NOTICE: Please review the pinned notes and login information below for this client."}
            </p>

            {(importantNotes || editingImportantNotes) && (
              <div className="client-notes-container mt-2 mb-4">
                {editingImportantNotes ? (
                  <>
                    <Form.Control
                      as="textarea"
                      rows={4}
                      value={editedNotesText}
                      onChange={(e) => setEditedNotesText(e.target.value)}
                      onPaste={handleImportantNotesPaste}
                      placeholder="Paste a screenshot to attach it..."
                      disabled={savingImportantNotes}
                      autoFocus
                    />
                    <div className="d-flex justify-content-end gap-2 mt-2">
                      <Button variant="outline-secondary" size="sm" onClick={cancelEditingImportantNotes} disabled={savingImportantNotes}>
                        Cancel
                      </Button>
                      <Button variant="primary" size="sm" className="fw-bold" onClick={handleSaveImportantNotes} disabled={savingImportantNotes}>
                        {savingImportantNotes ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <FormatNotes notes={importantNotes} />
                    <Button variant="link" size="sm" className="ps-0 fw-bold text-decoration-none" onClick={startEditingImportantNotes}>
                      <i className="bi bi-pencil-square me-1"></i>Edit
                    </Button>
                  </>
                )}
              </div>
            )}

            {pinnedNotes.length > 0 && (
              <div className="mb-4">
                <h6 className="fw-bold text-uppercase text-muted small mb-2">
                  <i className="bi bi-pin-fill me-1"></i>Pinned Manager Notes
                </h6>
                <div className="d-flex flex-column gap-2">
                  {pinnedNotes.map((n) => (
                    <div key={n.id} className="border border-warning rounded p-2 bg-warning bg-opacity-10">
                      <div className="small mb-1">
                        <strong>{n.author_name || "Unknown"}</strong>{" "}
                        <span className="text-muted">({new Date(n.created_at).toLocaleString()})</span>
                      </div>
                      <div>{n.text}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-top pt-3">
              <h6 className="fw-bold text-uppercase text-muted small mb-2">Add a Note</h6>
              <NoteComposer onAdd={addManagerNote} submitLabel="Add Note" pinnable />
            </div>
        </Modal.Body>

        <Modal.Footer className="bg-light border-top d-flex justify-content-center pb-4">
          <Button
              variant={isSpecialPriority ? "danger" : "warning"}
              size="lg"
              className={`fw-bold px-5 shadow-sm ${!isSpecialPriority && 'text-dark'}`}
              onClick={() => setShowNotesPopup(false)}
          >
            I Have Read & Understand
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

// 👇 UPDATED: Added selectedVersion state and dropdown UI 👇
function ClientAuditTabContent({ clientId, refreshKey }) {
  // New state to track which historical report is currently selected
  const [selectedVersion, setSelectedVersion] = useState(null);
  
  // Pass the selected version to the hook, and extract availableReports
  const { loading, error, auditReport, availableReports } = useClientCreditFiles(clientId, refreshKey, selectedVersion);

  if (loading) {
    return (
      <div className="text-center d-flex flex-column justify-content-center align-items-center h-100 py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted fw-bold">Analyzing Credit Report...</p>
      </div>
    );
  }
  if (error) {
    return (
      <Alert variant="warning" className="d-flex align-items-center shadow-sm">
        <i className="bi bi-exclamation-triangle-fill me-3 fs-4"></i>
        <div><strong>Could not load audit data.</strong><div className="small mt-1">{error}</div></div>
      </Alert>
    );
  }
  if (!auditReport) {
    return (
      <div className="text-center py-5">
        <i className="bi bi-file-earmark-x display-4 text-muted opacity-50 mb-3"></i>
        <h4 className="text-muted fw-bold">No Audit Data Found</h4>
        <p className="text-muted">Import a credit report (SmartCredit or IdentityIQ) to generate this audit.</p>
      </div>
    );
  }
  
  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <h4 className="fw-bold mb-0 text-primary">Credit Analysis</h4>
        
        <div className="d-flex align-items-center gap-2">
          
          {/* 👇 Time Travel Dropdown 👇 */}
          {availableReports && availableReports.length > 0 && (
            <Form.Select 
              size="sm" 
              className="fw-bold shadow-sm border-secondary"
              style={{ width: 'auto', minWidth: '180px', cursor: 'pointer' }}
              value={selectedVersion || ""}
              onChange={(e) => setSelectedVersion(e.target.value || null)}
            >
              <option value="">Latest Report (Active)</option>
              {availableReports.map(filename => {
                // Extracts just the YYYY-MM-DD from 'YYYY-MM-DD_summary_report.json'
                const dateStr = filename.split('_')[0];
                return (
                  <option key={filename} value={filename}>
                    Snapshot: {dateStr}
                  </option>
                );
              })}
            </Form.Select>
          )}

          <span className="badge bg-light text-secondary border shadow-sm px-3 py-2">
            Generated: {auditReport?.meta?.generated_at ? new Date(auditReport.meta.generated_at).toLocaleDateString() : "N/A"}
          </span>
        </div>
      </div>
      <CreditAuditReport data={auditReport} />
    </div>
  );
}