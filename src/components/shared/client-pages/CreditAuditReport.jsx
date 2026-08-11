import React from 'react';
import { Card, Row, Col, Table, Badge, Alert } from 'react-bootstrap';

// Helper to extract score safely from objects or strings
const getSafeScore = (bureauScore) => {
  if (!bureauScore) return 0;
  if (typeof bureauScore === 'number') return bureauScore;
  if (typeof bureauScore === 'string') return parseInt(bureauScore, 10) || 0;
  if (typeof bureauScore === 'object' && bureauScore.score) return parseInt(bureauScore.score, 10) || 0;
  return 0;
};

// Helper to color-code scores
const getScoreColor = (s) => {
  if (!s || s === 0) return 'secondary';
  if (s >= 750) return 'success';
  if (s >= 700) return 'primary';
  if (s >= 650) return 'warning';
  return 'danger';
};

const safeArray = (arr) => (Array.isArray(arr) ? arr : []);

export default function CreditAuditReport({ data }) {
    React.useEffect(() => {
        console.group("🔍 CreditAuditReport Debug");
        console.debug("CreditAuditReport received data:", data);
        console.groupEnd();
    }, [data]);
    
  if (!data) return <div className="p-5 text-center text-muted">No Audit Data Available</div>;

  const { scores, summary, negatives, personal, inquiries, meta } = data;
  
  const safeInquiries = safeArray(inquiries);
  const safeNegatives = safeArray(negatives);

  // DARK MODE THEME
  const theme = {
      bg: '#0B1121',
      cardBg: '#0f172a',
      border: '#1e293b',
      textMain: '#f8fafc',
      textMuted: '#94a3b8'
  };

  return (
    <div className="credit-audit-report p-4 rounded-3" style={{ backgroundColor: theme.bg, color: theme.textMain }}>
      
      {/* --- HEADER --- */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h4 className="fw-bold mb-0" style={{ color: theme.textMain }}>Credit Health Audit</h4>
            <small style={{ color: theme.textMuted }}>
                Source: {meta?.source || 'Unknown'} • Generated: {new Date(meta?.audit_date || Date.now()).toLocaleDateString()}
            </small>
        </div>
        <Badge bg="primary" className="px-3 py-2">v{meta?.version || '1.0'}</Badge>
      </div>

      {/* --- 1. SCORES --- */}
      <Row className="mb-4 g-3">
        {['EX', 'TU', 'EQ'].map(bureau => {
            const rawScore = scores?.[bureau];
            const displayScore = getSafeScore(rawScore);
            
            return (
                <Col key={bureau} md={4}>
                    <Card className="text-center h-100 shadow-sm" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                        <Card.Body className="py-4">
                            <h6 className="fw-bold mb-2" style={{ color: theme.textMuted }}>{bureau === 'EX' ? 'EXPERIAN' : bureau === 'TU' ? 'TRANSUNION' : 'EQUIFAX'}</h6>
                            <div className={`display-4 fw-bold text-${getScoreColor(displayScore)}`}>
                                {displayScore || '—'}
                            </div>
                        </Card.Body>
                    </Card>
                </Col>
            );
        })}
      </Row>

      {/* --- 2. SUMMARY STATS --- */}
      <Card className="shadow-sm mb-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
        <Card.Header className="fw-bold py-3" style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderBottom: `1px solid ${theme.border}` }}>
            <i className="bi bi-speedometer2 me-2 text-primary"></i>
            Account Summary
        </Card.Header>
        <Card.Body>
            <Row className="text-center">
                <Col>
                    <div className="small text-uppercase fw-bold" style={{ color: theme.textMuted }}>Open Accounts</div>
                    <div className="h3 mb-0" style={{ color: theme.textMain }}>{summary?.open_accounts || 0}</div>
                </Col>
                <Col>
                    <div className="small text-uppercase fw-bold" style={{ color: theme.textMuted }}>Total Debt</div>
                    <div className="h3 mb-0" style={{ color: theme.textMain }}>${(summary?.total_debt || 0).toLocaleString()}</div>
                </Col>
                <Col>
                    <div className="small text-uppercase fw-bold" style={{ color: theme.textMuted }}>Utilization</div>
                    <div className={`h3 mb-0 text-${(summary?.utilization_pct || 0) > 30 ? 'danger' : 'success'}`}>
                        {(summary?.utilization_pct || 0).toFixed(1)}%
                    </div>
                </Col>
                <Col>
                    <div className="small text-uppercase fw-bold" style={{ color: theme.textMuted }}>Negatives</div>
                    <div className="h3 mb-0 text-danger">{summary?.negatives_count || safeNegatives.length}</div>
                </Col>
            </Row>
        </Card.Body>
      </Card>

      {/* --- 3. PERSONAL & INQUIRIES --- */}
      <Row className="mb-4 g-3">
        <Col lg={6}>
            <Card className="shadow-sm h-100" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <Card.Header className="fw-bold py-3" style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderBottom: `1px solid ${theme.border}` }}>
                    Personal Info Analysis
                </Card.Header>
                <Card.Body>
                    <div className="mb-3">
                        <small className="d-block" style={{ color: theme.textMuted }}>Detected Names</small>
                        <div className="fw-medium small text-truncate" style={{ color: theme.textMain }} title={personal?.names?.join(', ')}>
                            {safeArray(personal?.names).length > 0 ? safeArray(personal?.names).join(', ') : "None"}
                        </div>
                    </div>
                    <div>
                        <small className="d-block" style={{ color: theme.textMuted }}>Address Count</small>
                        <div className="h4 mb-0" style={{ color: theme.textMain }}>{personal?.address_count || 0}</div>
                        {(personal?.address_count || 0) > 3 && (
                            <Alert variant="warning" className="mt-2 py-2 small mb-0 bg-transparent border-warning text-warning">
                                <i className="bi bi-exclamation-circle me-1"></i> High number of addresses detected.
                            </Alert>
                        )}
                    </div>
                </Card.Body>
            </Card>
        </Col>

        <Col lg={6}>
            <Card className="shadow-sm h-100" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <Card.Header className="fw-bold py-3 d-flex justify-content-between" style={{ backgroundColor: theme.cardBg, color: theme.textMain, borderBottom: `1px solid ${theme.border}` }}>
                    <span>Recent Inquiries</span>
                    <Badge bg="primary">{safeInquiries.length}</Badge>
                </Card.Header>
                <Card.Body className="p-0" style={{maxHeight: '200px', overflowY: 'auto'}}>
                    <Table size="sm" variant="dark" className="mb-0" style={{ backgroundColor: 'transparent' }}>
                        <thead style={{ position: 'sticky', top: 0, backgroundColor: theme.cardBg, zIndex: 1 }}>
                            <tr>
                                <th className="ps-3" style={{ borderBottom: `1px solid ${theme.border}` }}>Creditor</th>
                                <th className="text-end pe-3" style={{ borderBottom: `1px solid ${theme.border}` }}>Bureau</th>
                            </tr>
                        </thead>
                        <tbody>
                            {safeInquiries.length === 0 ? (
                                <tr><td colSpan="2" className="text-center py-3" style={{ color: theme.textMuted, borderColor: theme.border }}>No recent inquiries</td></tr>
                            ) : (
                                safeInquiries.map((inq, i) => (
                                    <tr key={i}>
                                        <td className="ps-3" style={{ borderColor: theme.border }}>
                                            <div className="fw-bold small text-truncate" style={{maxWidth: '180px', color: theme.textMain}} title={inq.creditor}>
                                                {inq.creditor || "Unknown"}
                                            </div>
                                            <div style={{fontSize: '0.7rem', color: theme.textMuted}}>{inq.date || "No Date"}</div>
                                        </td>
                                        <td className="text-end pe-3 align-middle" style={{ borderColor: theme.border }}>
                                            <Badge bg="secondary" className="border border-secondary">{inq.bureau || "N/A"}</Badge>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </Card.Body>
            </Card>
        </Col>
      </Row>

      {/* --- 4. NEGATIVE ITEMS --- */}
      <Card className="shadow-sm mb-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
          <Card.Header className="bg-danger text-white fw-bold py-3 d-flex justify-content-between align-items-center" style={{ borderBottom: `1px solid ${theme.border}` }}>
              <span><i className="bi bi-exclamation-triangle-fill me-2"></i>Negative Items</span>
              <Badge bg="light" text="dark">{safeNegatives.length} Items</Badge>
          </Card.Header>
          <Card.Body className="p-0" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {safeNegatives.length === 0 ? (
                  <div className="text-center p-5" style={{ color: theme.textMuted }}>
                      <i className="bi bi-check-circle display-4 text-success mb-3"></i>
                      <p>No negative items found! Great job.</p>
                  </div>
              ) : (
                  <Table hover responsive variant="dark" className="mb-0 align-middle text-nowrap" style={{ backgroundColor: 'transparent' }}>
                      <thead style={{ position: 'sticky', top: 0, backgroundColor: theme.cardBg, zIndex: 1 }}>
                          <tr>
                              <th className="ps-4" style={{ borderBottom: `1px solid ${theme.border}` }}>Creditor</th>
                              <th style={{ borderBottom: `1px solid ${theme.border}` }}>Acct #</th>
                              <th style={{ borderBottom: `1px solid ${theme.border}` }}>Opened</th>
                              <th style={{ borderBottom: `1px solid ${theme.border}` }}>Balance</th>
                              <th style={{ borderBottom: `1px solid ${theme.border}` }}>Issue</th>
                              <th className="pe-4" style={{ borderBottom: `1px solid ${theme.border}` }}>Bureau</th>
                          </tr>
                      </thead>
                      <tbody>
                          {safeNegatives.map((item, idx) => {
                              // Hard inquiries genuinely don't carry an account
                              // number or balance in a credit report — they're a
                              // record of who checked the file, not an account —
                              // so "—" there reads as broken/missing data instead
                              // of "not applicable." Distinguish the two instead
                              // of showing the same dash for both cases.
                              const isInquiry = item.category === "INQUIRY" || item.type === "INQUIRY" || item.issue === "INQUIRY";
                              const naLabel = isInquiry ? "N/A" : "—";
                              return (
                              <tr key={idx}>
                                  <td className="fw-bold ps-4" style={{ color: theme.textMain, borderColor: theme.border }}>{item.name || item.account || "Unknown"}</td>
                                  <td className="small font-monospace" style={{ color: theme.textMuted, borderColor: theme.border }}>{item.account_num || item.account_number || naLabel}</td>
                                  <td className="small" style={{ color: theme.textMuted, borderColor: theme.border }}>{item.date || item.opened || "—"}</td>
                                  <td className="fw-medium text-danger" style={{ borderColor: theme.border }}>
                                      {isInquiry
                                          ? "N/A"
                                          : item.balance !== undefined && item.balance !== null && item.balance !== ""
                                          ? `$${Number(item.balance).toLocaleString()}`
                                          : "—"}
                                  </td>
                                  <td style={{ borderColor: theme.border }}>
                                      <Badge bg="danger" className="text-wrap" style={{maxWidth: '150px'}}>
                                          {item.type || item.category || item.issue || "Negative"}
                                      </Badge>
                                  </td>
                                  <td className="pe-4" style={{ borderColor: theme.border }}>
                                      <Badge bg={item.bureau === 'EX' || item.bureau?.includes('Exp') ? 'primary' : item.bureau === 'TU' || item.bureau?.includes('Trans') ? 'info' : 'warning'} text="white">
                                          {item.bureau || "N/A"}
                                      </Badge>
                                  </td>
                              </tr>
                              );
                          })}
                      </tbody>
                  </Table>
              )}
          </Card.Body>
      </Card>

    </div>
  );
}