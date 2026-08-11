import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Spinner, Alert, Button, Card } from 'react-bootstrap';
import { useClientCreditFiles } from '../../../hooks/useClientCreditFiles';

// Import the NEW Report Component
import CreditAuditReport from './CreditAuditReport';
// import ScoreHistoryChart from '../../ScoreHistoryChart'; // Assuming you have this

export default function ClientAuditPage({ clientId: propClientId, setActiveTab }) {
  // Bring the router hooks back for the admin side
  const params = useParams();
  const navigate = useNavigate();
  
  // THE MAGIC: If a prop is passed (Client side), use it. 
  // Otherwise, grab it from the URL (Admin side).
  const actualClientId = propClientId || params.clientId || params.id;

  const { loading, error, auditReport, scoreHistory } = useClientCreditFiles(actualClientId);

  // Smart Back Button
  const handleBack = () => {
      if (setActiveTab) {
          // We are in the tabbed Client Dashboard
          setActiveTab('dashboard');
      } else {
          // We are in the routed Admin Portal
          navigate(-1);
      }
  };

  if (loading) {
    return (
      <Container className="d-flex flex-column justify-content-center align-items-center vh-100">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted">Loading Audit Report...</p>
      </Container>
    );
  }

  return (
    <Container fluid="xl" className="py-4">
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
            {/* Call our smart back function */}
            <Button variant="outline-secondary" size="sm" onClick={handleBack}>
                <i className="bi bi-arrow-left me-2"></i> Back
            </Button>
            <h2 className="fw-bold mb-0">Credit Audit Report</h2>
        </div>
        <div className="text-muted small">
            Generated: {auditReport?.meta?.generated_at ? new Date(auditReport.meta.generated_at).toLocaleDateString() : 'N/A'}
        </div>
      </div>

      {error && <Alert variant="warning">Note: {error}</Alert>}

      {/* 1. Score History Graph */}
      {scoreHistory && scoreHistory.length > 0 && (
        <ScoreHistoryChart history={scoreHistory} />
      )}

      {/* 2. The NEW Report View */}
      {auditReport ? (
        <CreditAuditReport data={auditReport} />
      ) : (
        <Card className="text-center py-5 border-0 shadow-sm">
            <Card.Body className="text-muted">
                <i className="bi bi-file-earmark-x display-4 opacity-25 mb-3"></i>
                <h4>No Audit Data Found</h4>
                <p>Please import a report (SmartCredit/IDIQ) to generate this audit.</p>
            </Card.Body>
        </Card>
      )}
    </Container>
  );
}