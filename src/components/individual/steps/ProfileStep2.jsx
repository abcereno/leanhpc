import React, { useState } from "react";
import { Container, Card, Button } from "react-bootstrap";
import CoverLetterAssets from "../../admin/client-profile/CoverLetterAssets";
import ConsumerDocuments from "../sub-components/ConsumerDocuments";
export default function ProfileStep2({ clientId, onNext, onBack }) {
    // Placeholder state if you need to validate uploads before proceeding
    const [links, setLinks] = useState({}); 
    console.log(links);
    return (
      <>
         <Card className="shadow-lg border-0">
              <Card.Header className="bg-primary text-white py-3"><h4 className="mb-0">Step 2: Upload Documents</h4></Card.Header>
              <Card.Body className="p-4">
                  <p className="text-muted mb-4">Please upload <strong>Driver's License</strong> and <strong>Proof of Address</strong>.</p>
                  
                  {/* Wrapper for horizontal scroll on small screens */}
                  <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
                     {/* AI validation results are admin-only — see CoverLetterAssets.jsx's showAiResults doc comment. */}
                     <CoverLetterAssets clientId={clientId} onChange={setLinks} showAiResults={false} />
                  </div>
                  {/* Drop the Consumer Component Here! */}
                  <div className="mb-4">
                     <ConsumerDocuments clientId={clientId} />
                  </div>
                  <hr className="my-4"/>
                  <div className="d-flex justify-content-between">
                    <Button variant="link" onClick={onBack}>&larr; Profile</Button>
                    <Button variant="outline-secondary" onClick={onNext}>I've Uploaded Them &rarr;</Button>
                  </div>
              </Card.Body>
         </Card>
      </>
    );
}