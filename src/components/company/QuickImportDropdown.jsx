import { useState } from "react";
import { Dropdown, Spinner, Modal, Button } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useNavigate } from "react-router-dom";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { useToast } from "../shared/ui/ToastNotifier"; 

// Modals & Hooks
import Fetch3BModal from "../admin/client-profile/modals/Fetch3bModal";
import ParseReportModal from "../admin/client-profile/modals/ParseRreportModal";
import { useClientCreditFiles } from "../../hooks/useClientCreditFiles";
import { deriveServiceId } from "../../utils/services";

import CreditAuditReport from "../shared/client-pages/CreditAuditReport"; 

export default function QuickImportDropdown() {
  const { companyId, user, fullName, agentCode } = useCompanyAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null); 
  const [tempClientId, setTempClientId] = useState(null);

  const handleQuickImport = async (type) => {
    setLoading(true);
    try {
      const displayFullName = fullName || user?.user_metadata?.full_name || user?.email || "Unknown";

      const insertPayload = {
        full_name: `QUICK IMPORT - ${new Date().toLocaleTimeString()}`,
        company_id: companyId,
        agent_id: user.id,
        agent: displayFullName,
        agent_code: agentCode || null,
        dispute_method: "inquiry deletion",
        service_id: deriveServiceId("inquiry deletion"),
        is_paid: false,
      };

      let { data, error } = await supabase.from("clients").insert(insertPayload).select("id").single();

      // Defensive: sql/add_services.sql may not have been run yet against
      // this database — degrade gracefully rather than blocking quick-add.
      if (error && /service_id/i.test(error.message || "")) {
        console.warn("clients.service_id not found (run sql/add_services.sql) — inserting without it.");
        const { service_id: _omit, ...withoutServiceId } = insertPayload;
        ({ data, error } = await supabase.from("clients").insert(withoutServiceId).select("id").single());
      }

      if (error) throw error;

      setTempClientId(data.id);
      setActiveModal(type);

    } catch (err) {
      console.error(err);
      addToast({ 
        message: "Failed to initialize quick import: " + err.message, 
        variant: "danger", 
        title: "Error" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleModalClose = () => {
    setActiveModal((prev) => (prev === 'results' ? 'results' : null));
    if (activeModal !== 'results') {
        setTempClientId(null);
    }
  };

  const handleFetchComplete = () => {
    setTimeout(() => {
      setActiveModal("results");
    }, 1500); // Note: Keep this at 1500ms to prevent the Supabase caching error!
  };

  return (
    <>
{/* Replaced the Dropdown with a standard Button styled to look the same.
        This prevents empty menus from opening and easily fires the Toast instead!
      */}
<Button 
          variant="secondary" 
          onClick={() => addToast({ 
            title: "Feature Locked", 
            message: "Fast Inquiry Count is currently disabled. Please contact your Admin Assistant.", 
            variant: "warning", 
            icon: "bi-shield-lock" 
          })}
          // 👇 Added py-1 to shrink the vertical padding to match standard buttons
          className="fw-bold shadow-sm d-flex align-items-center opacity-75 py-1 px-3" 
      >
        <i className="bi bi-lightning-charge-fill me-2 text-warning fs-5"></i>
        
        {/* 👇 Tightened the line-height and font sizes so it fits in a standard button height */}
        <div className="d-flex flex-column text-start" style={{ lineHeight: '1.1' }}>
          <span style={{ fontSize: '0.85rem' }}>Fast Inquiry Count</span>
          <span className="fw-normal text-white-50" style={{ fontSize: '0.65rem' }}>
            Click for details
          </span>
        </div>
      </Button>

      {activeModal === 'fetch3b' && (
        <Fetch3BModal 
            show={true} 
            onClose={handleModalClose} 
            onSaved={handleFetchComplete} 
            clientId={tempClientId} 
            isUpdateMode={false} 
        />
      )}
      
      {activeModal === 'parseIq' && (
        <ParseReportModal 
            show={true} 
            onClose={handleModalClose} 
            onSaved={handleFetchComplete} 
            clientId={tempClientId} 
            isUpdateMode={false} 
        />
      )}

      {activeModal === 'results' && tempClientId && (
        <QuickImportResultsModal 
          clientId={tempClientId} 
          companyId={companyId}
          onClose={() => { setActiveModal(null); setTempClientId(null); }} 
        />
      )}
    </>
  );
}


// ==========================================
// FULL AUDIT RESULTS MODAL
// ==========================================
function QuickImportResultsModal({ clientId, companyId, onClose }) {
  const navigate = useNavigate();
  const [isDiscarding, setIsDiscarding] = useState(false);
  
  const { loading, error, auditReport } = useClientCreditFiles(clientId);

  const handleKeepClient = () => {
    onClose();
    navigate(`/company-portal/${companyId}/clients/${clientId}`);
  };

  const handleDiscardClient = async () => {
    setIsDiscarding(true);
    try {
      const filesToDelete = [
        `${clientId}/raw_credit_report.json`,
        `${clientId}/client_audit_report.json`,
        `${clientId}/thread.json`,
        `${clientId}/credit_analysis.json`,
        `${clientId}/credit_analysis.parsed.json`
      ];
      await supabase.storage.from("clients").remove(filesToDelete);
      
      await supabase.from("clients").delete().eq("id", clientId);
      onClose();
    } catch (err) {
      console.error("Failed to discard temp client:", err);
      onClose(); 
    }
  };

  return (
    <Modal show={true} onHide={onClose} backdrop="static" centered size="xl">
      <Modal.Header className="bg-light">
        <Modal.Title className="fw-bold text-dark">
          <i className="bi bi-file-earmark-bar-graph me-2 text-primary"></i>
          Import Audit Summary
        </Modal.Title>
      </Modal.Header>
      
      <Modal.Body className="bg-light p-4" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
        {loading ? (
          <div className="text-center py-5">
            <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
            <h5 className="mt-4 text-muted fw-bold">Generating Audit Report...</h5>
            <p className="text-muted small">Parsing scores, accounts, and negative items.</p>
          </div>
        ) : error ? (
           <div className="alert alert-danger d-flex align-items-center">
               <i className="bi bi-exclamation-triangle-fill fs-4 me-3"></i>
               <div>
                   <strong>Error loading audit data:</strong> {error}
               </div>
           </div>
        ) : auditReport ? (
           <CreditAuditReport data={auditReport} />
        ) : (
           <div className="text-center py-5 text-muted">
               <i className="bi bi-folder-x display-4 opacity-50 mb-3"></i>
               <h5>No audit data could be generated.</h5>
           </div>
        )}
      </Modal.Body>
      
      <Modal.Footer className="bg-white border-top d-flex justify-content-between">
        <Button variant="outline-danger" onClick={handleDiscardClient} disabled={loading || isDiscarding}>
          {isDiscarding ? <Spinner size="sm" /> : <><i className="bi bi-trash me-2"></i> Discard Report</>}
        </Button>
        <Button variant="success" onClick={handleKeepClient} disabled={loading || isDiscarding} className="fw-bold px-4 shadow-sm">
          Keep & Proceed to Profile <i className="bi bi-arrow-right-circle-fill ms-2"></i>
        </Button>
      </Modal.Footer>
    </Modal>
  );
}