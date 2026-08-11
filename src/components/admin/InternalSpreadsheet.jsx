import React from 'react';
import { Container, Card } from 'react-bootstrap';

export default function InternalSpreadsheet() {
  // 🔴 REPLACE THIS with your actual Google Sheet URL
  // TIP: Use the URL from your browser address bar when editing the sheet.
  const GOOGLE_SHEET_URL = "https://docs.google.com/spreadsheets/d/1vW7nAykQLEE1l2ZydDtiVESA3IrA-5dNONkkXTcGV7Q/edit"; 

  return (
    <Container fluid className="p-3 h-100" style={{ minHeight: '100vh' }}>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3 className="fw-bold text-primary mb-0">
          <i className="bi bi-file-earmark-spreadsheet-fill me-2"></i>
          Master Spreadsheet
        </h3>
        <a 
          href={GOOGLE_SHEET_URL} 
          target="_blank" 
          rel="noreferrer" 
          className="btn btn-sm btn-outline-primary"
        >
          Open in New Tab <i className="bi bi-box-arrow-up-right ms-1"></i>
        </a>
      </div>

      <Card className="shadow-lg border-0 overflow-hidden h-100">
        <iframe 
          src={GOOGLE_SHEET_URL}
          title="Internal Spreadsheet"
          width="100%"
          height="100%"
          style={{ minHeight: '85vh', border: 'none' }}
          allow="autoplay"
        ></iframe>
      </Card>
    </Container>
  );
}