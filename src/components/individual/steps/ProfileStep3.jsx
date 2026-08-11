import React, { useState } from "react";
import { Container, Card, Button } from "react-bootstrap";
import Fetch3BModal from "../../admin/client-profile/modals/Fetch3bModal";

export default function ProfileStep3({ clientId, onComplete, onBack, onSkip }) {
    const [showModal, setShowModal] = useState(false);

    return (
      <>
         <Card className="shadow-lg border-0">
              <Card.Header className="bg-primary text-white py-3">
                  <h4 className="mb-0">Step 3: Connect Credit Report</h4>
              </Card.Header>
              <Card.Body className="p-4 text-center">
                  <i className="bi bi-cloud-arrow-down display-1 text-primary mb-3"></i>
                  <p className="text-muted mb-4">
                      To generate accurate dispute letters, we need your current credit data.
                  </p>
                  
                  <div className="d-grid gap-3 col-md-8 mx-auto">
                      <Button variant="outline-primary" size="lg" onClick={() => setShowModal(true)}>
                          I have a Login (SmartCredit/IDIQ)
                      </Button>
                      <Button variant="success" size="lg" href="https://www.smartcredit.com/" target="_blank">
                          Sign Up for SmartCredit
                      </Button>
                  </div>
              </Card.Body>
         </Card>
         {showModal && <Fetch3BModal clientId={clientId} onClose={() => { setShowModal(false); onComplete(); }} />}
      </>
    );
}