import { Modal, Button } from "react-bootstrap";
import FunderEligibilityCard from "./FunderEligibilityCard";

export default function FunderEligibilityModal({ show, onHide, client }) {
  return (
    <Modal 
      show={show} 
      onHide={onHide} 
      centered 
      size="xl"
      backdrop="static" // Prevents accidental closing if they click outside
    >
      {/* 1. Subtle Header: No title (since the card has one), just the Close Button */}
      <Modal.Header closeButton className="bg-light border-0 pb-0 pt-3 pe-4">
      </Modal.Header>

      {/* 2. Contrast: bg-light makes the white Card inside pop */}
      <Modal.Body className="p-4 bg-light pt-2">
        {client ? (
          // Wrapper to ensure the inner card has a crisp shadow and rounded corners
          <div className="shadow-sm bg-white rounded-3 overflow-hidden border">
            <FunderEligibilityCard clientId={client.id} />
          </div>
        ) : (
          // Empty State Layout
          <div className="p-5 text-center text-muted bg-white rounded-3 shadow-sm border">
            <i className="bi bi-person-x display-4 text-muted opacity-50 mb-3 d-block"></i>
            <h5 className="fw-bold">No client selected</h5>
            <p className="small mb-0">Please select a client to view funder eligibility.</p>
          </div>
        )}
      </Modal.Body>

      {/* 3. Footer: Blends into the bg-light background */}
      <Modal.Footer className="border-0 bg-light rounded-bottom pb-4 px-4 pt-0">
        <Button 
          variant="outline-secondary" 
          onClick={onHide} 
          className="w-100 fw-bold py-2 shadow-sm bg-white"
        >
          Close Window
        </Button>
      </Modal.Footer>
    </Modal>
  );
}