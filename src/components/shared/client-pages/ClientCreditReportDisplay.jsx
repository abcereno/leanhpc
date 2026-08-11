// src/components/ClientCreditReportDisplay.jsx
import React, { useEffect } from 'react';
import { Spinner, Alert } from 'react-bootstrap';
import { useClientCreditFiles } from '../../../hooks/useClientCreditFiles';
import CreditAuditReport from './CreditAuditReport';

export default function ClientCreditReportDisplay({ clientId }) {
  // Use the hook that fetches 'raw_credit_report.json' and processes it
  const { loading, error, auditReport, normalized } = useClientCreditFiles(clientId);

  // --- DEBUG LOGGING ---
  useEffect(() => {
    console.group("🔍 ClientCreditReportDisplay Debug");
    console.log("Client ID:", clientId);
    console.log("Loading State:", loading);
    console.log("Error State:", error);
    console.log("Audit Report (Parsed):", auditReport);
    console.log("Legacy Normalized Data:", normalized);
    console.groupEnd();
  }, [clientId, loading, error, auditReport, normalized]);
  // ---------------------

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-2 text-muted">Analyzing Credit File...</p>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" className="m-4">
        <i className="bi bi-exclamation-triangle-fill me-2"></i>
        <strong>Error loading report:</strong> {error.message || String(error)}
      </Alert>
    );
  }

  if (!auditReport) {
    return (
      <div className="text-center p-5 m-4 bg-light rounded-3 border border-dashed">
        <i className="bi bi-file-earmark-x display-4 text-muted mb-3"></i>
        <h5>No Audit Generated</h5>
        <p className="text-muted">
          We could not generate an audit from the available files. <br />
          Please ensure a raw <strong>SmartCredit JSON</strong> file has been uploaded.
        </p>
        <div className="text-muted small mt-2">
           (Check the console logs to see what data <em>did</em> load)
        </div>
      </div>
    );
  }

  return (
    <div className="client-credit-report-section">
       <CreditAuditReport data={auditReport} />
    </div>
  );
}