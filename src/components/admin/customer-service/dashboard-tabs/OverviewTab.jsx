import React, { useState } from 'react';
import { Row, Col, Card, Table, Spinner } from 'react-bootstrap';
import { useClientCreditFiles } from '../../../../hooks/useClientCreditFiles';

// Helper for masking sensitive info (SSN/DOB)
const MaskedValue = ({ value, label }) => {
    const [revealed, setRevealed] = useState(false);
    
    if (!value) return <span className="text-muted fst-italic">--</span>;

    return (
        <span 
            onClick={() => setRevealed(!revealed)} 
            style={{ cursor: 'pointer' }}
            className="d-inline-flex align-items-center"
            title={`Click to ${revealed ? 'hide' : 'reveal'} ${label}`}
        >
            <span className={revealed ? "fw-bold text-dark" : "text-muted"}>
                {revealed ? value : '••••••••'}
            </span>
            <i className={`bi ${revealed ? 'bi-eye-slash' : 'bi-eye'} ms-2 text-primary small opacity-50`}></i>
        </span>
    );
};

export default function OverviewTab({ client }) {
  // Use existing hook to fetch the parsed credit report
  // This automatically handles signed URLs, JSON parsing, and the audit engine
  const { auditReport, loading: loadingScores } = useClientCreditFiles(client?.id);

  // Extract scores safely from the audit report structure
  // Handles variations like 'EX' vs 'experian' depending on your auditEngine version
  const scores = {
      exp: auditReport?.scores?.EX || auditReport?.scores?.experian || '--',
      eq:  auditReport?.scores?.EQ || auditReport?.scores?.equifax || '--',
      tu:  auditReport?.scores?.TU || auditReport?.scores?.transunion || '--'
  };

  return (
    <Row className="g-3">
      {/* COLUMN 1: CLIENT DETAILS */}
      <Col md={6}>
        <Card className="shadow-sm border-0 h-100">
          <Card.Body>
            <h6 className="fw-bold mb-3 text-primary">
                <i className="bi bi-person-lines-fill me-2"></i>Client Details
            </h6>
            <Table borderless size="sm" className="mb-0">
              <tbody>
                <tr>
                    <td className="text-muted w-25">Full Name:</td>
                    <td className="fw-bold text-dark">{client?.full_name}</td>
                </tr>
                <tr>
                    <td className="text-muted">Email:</td>
                    <td>
                        {client?.email ? (
                            <a href={`mailto:${client.email}`} className="text-decoration-none fw-bold">
                                {client.email}
                            </a>
                        ) : <span className="text-muted">N/A</span>}
                    </td>
                </tr>
                <tr>
                    <td className="text-muted">Phone:</td>
                    <td className="fw-bold">{client?.phone || 'N/A'}</td>
                </tr>
                <tr>
                    <td className="text-muted">Address:</td>
                    <td className="fw-bold text-wrap" style={{maxWidth: '200px'}}>
                        {client?.address || 'N/A'}
                    </td>
                </tr>
                <tr>
                    <td className="text-muted">DOB:</td>
                    <td><MaskedValue value={client?.dob} label="DOB" /></td>
                </tr>
                <tr>
                    <td className="text-muted">SSN:</td>
                    <td><MaskedValue value={client?.ssn} label="SSN" /></td>
                </tr>
              </tbody>
            </Table>
          </Card.Body>
        </Card>
      </Col>

      {/* COLUMN 2: SCORE OVERVIEW */}
      <Col md={6}>
        <Card className="shadow-sm border-0 h-100">
          <Card.Body>
            <div className="d-flex justify-content-between align-items-center mb-4">
                <h6 className="fw-bold mb-0 text-primary">
                    <i className="bi bi-speedometer2 me-2"></i>Score Overview
                </h6>
                {loadingScores && <Spinner size="sm" animation="border" className="text-muted" />}
            </div>
            
            <div className="d-flex justify-content-between text-center gap-2">
              {/* EXPERIAN */}
              <div className="p-3 bg-light rounded border flex-fill position-relative overflow-hidden">
                <div className="small text-muted fw-bold text-uppercase mb-1" style={{letterSpacing:'1px'}}>Experian</div>
                <div className={`fs-2 fw-bold ${scores.exp !== '--' ? 'text-primary' : 'text-muted'}`}>
                    {scores.exp}
                </div>
                {scores.exp !== '--' && <div className="position-absolute bottom-0 start-0 w-100 bg-primary" style={{height:'4px'}}></div>}
              </div>

              {/* EQUIFAX */}
              <div className="p-3 bg-light rounded border flex-fill position-relative overflow-hidden">
                <div className="small text-muted fw-bold text-uppercase mb-1" style={{letterSpacing:'1px'}}>Equifax</div>
                <div className={`fs-2 fw-bold ${scores.eq !== '--' ? 'text-primary' : 'text-muted'}`}>
                    {scores.eq}
                </div>
                {scores.eq !== '--' && <div className="position-absolute bottom-0 start-0 w-100 bg-primary" style={{height:'4px'}}></div>}
              </div>

              {/* TRANSUNION */}
              <div className="p-3 bg-light rounded border flex-fill position-relative overflow-hidden">
                <div className="small text-muted fw-bold text-uppercase mb-1" style={{letterSpacing:'1px'}}>TransUnion</div>
                <div className={`fs-2 fw-bold ${scores.tu !== '--' ? 'text-primary' : 'text-muted'}`}>
                    {scores.tu}
                </div>
                {scores.tu !== '--' && <div className="position-absolute bottom-0 start-0 w-100 bg-primary" style={{height:'4px'}}></div>}
              </div>
            </div>

            <div className="mt-4 pt-3 border-top">
                <div className="d-flex justify-content-between small text-muted">
                    <span><i className="bi bi-calendar-event me-1"></i> Start Date:</span>
                    <span className="fw-bold">{client?.created_at ? new Date(client.created_at).toLocaleDateString() : 'N/A'}</span>
                </div>
                <div className="d-flex justify-content-between small text-muted mt-2">
                    <span><i className="bi bi-building me-1"></i> Company:</span>
                    <span className="fw-bold">{client?.company_name || 'Direct Client'}</span>
                </div>
            </div>

          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}