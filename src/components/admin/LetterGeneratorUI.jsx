import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Row, Col, Badge } from 'react-bootstrap';
import { CreditRepairEngine, BUREAU_ADDRESSES, TEMPLATES, METRO_2_REASONS } from '../CreditLetterEngine'; // Adjust path

export default function LetterGeneratorUI({ client, account, onGenerate }) {
  // Wizard State
  const [round, setRound] = useState(1);
  const [accountType, setAccountType] = useState(account?.type || 'Collection');
  const [isFastResolution, setIsFastResolution] = useState(false);
  const [priorVerification, setPriorVerification] = useState(false);
  
  // Engine Outputs
  const [recommendedTemplate, setRecommendedTemplate] = useState('');
  const [compiledLetter, setCompiledLetter] = useState('');
  
  // Custom Overrides
  const [customReason, setCustomReason] = useState('');

  // 1. Re-evaluate strategy whenever inputs change
  useEffect(() => {
    const strategy = CreditRepairEngine.determineStrategy(accountType, parseInt(round), isFastResolution, priorVerification);
    setRecommendedTemplate(strategy);
  }, [round, accountType, isFastResolution, priorVerification]);

  // 2. Re-compile letter whenever strategy or data changes
  useEffect(() => {
    if (!recommendedTemplate) return;

    // Map your database fields to the Engine's required variables
    const letterData = {
      consumer_name: client?.full_name || 'John Doe',
      consumer_address: client?.address || '123 Main St',
      consumer_city_state_zip: client?.city_state_zip || 'Anytown, USA 12345',
      date: new Date().toLocaleDateString(),
      bureau_name: account?.bureau || 'Experian',
      bureau_address: BUREAU_ADDRESSES[account?.bureau] || BUREAU_ADDRESSES['Experian'],
      creditor_name: account?.creditor || 'Original Creditor LLC',
      collector_name: account?.collector || 'Collection Agency Inc.',
      collector_address: account?.collector_address || 'P.O. Box 999, Debt City, TX',
      account_name: account?.name || 'Bank of America',
      account_number: account?.account_num || 'XXXX-XXXX-XXXX-1234',
      current_balance: account?.balance || '$1,250.00',
      dispute_reason: customReason || "I have no knowledge of this account. Please validate or remove it.",
    };

    const finalLetter = CreditRepairEngine.compileLetter(recommendedTemplate, letterData);
    setCompiledLetter(finalLetter);
  }, [recommendedTemplate, client, account, customReason]);

  return (
    <div className="letter-engine-container">
      <Row className="g-4">
        {/* LEFT COLUMN: The Smart Workflow Controls */}
        <Col lg={4}>
          <Card className="shadow-sm border-0 bg-dark text-white">
            <Card.Header className="bg-primary text-white fw-bold py-3">
              <i className="bi bi-cpu me-2"></i> Engine Settings
            </Card.Header>
            <Card.Body>
              
              <Form.Group className="mb-3">
                <Form.Label className="small text-uppercase fw-bold text-muted">Dispute Round</Form.Label>
                <Form.Select value={round} onChange={(e) => setRound(e.target.value)} className="bg-black text-white border-secondary">
                  <option value={1}>Round 1 (Month 1)</option>
                  <option value={2}>Round 2 (Month 2)</option>
                  <option value={3}>Round 3 (Month 3+)</option>
                </Form.Select>
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label className="small text-uppercase fw-bold text-muted">Account Type</Form.Label>
                <Form.Select value={accountType} onChange={(e) => setAccountType(e.target.value)} className="bg-black text-white border-secondary">
                  <option value="Collection">Collection</option>
                  <option value="Charge-Off">Charge-Off</option>
                  <option value="Late Payment">Late Payment</option>
                  <option value="Bankruptcy">Bankruptcy</option>
                </Form.Select>
              </Form.Group>

              <div className="mb-4">
                <Form.Label className="small text-uppercase fw-bold text-muted">Automation Triggers</Form.Label>
                <Form.Check 
                  type="switch" 
                  label="Client wants Fast Resolution (Settlement)" 
                  checked={isFastResolution} 
                  onChange={(e) => setIsFastResolution(e.target.checked)} 
                  className="mb-2"
                />
                <Form.Check 
                  type="switch" 
                  label="Bureau previously verified this account" 
                  checked={priorVerification} 
                  onChange={(e) => setPriorVerification(e.target.checked)} 
                />
              </div>

              {/* Metro 2 Quick-Select (Only shows if relevant) */}
              {recommendedTemplate.includes('metro2') && (
                  <Form.Group className="mb-4">
                    <Form.Label className="small text-uppercase fw-bold text-info">Smart Metro 2 Reason</Form.Label>
                    <Form.Select onChange={(e) => setCustomReason(e.target.value)} className="bg-black text-white border-info">
                      <option value="">-- Select Inconsistency --</option>
                      {METRO_2_REASONS.map((r, i) => <option key={i} value={r}>{r}</option>)}
                    </Form.Select>
                  </Form.Group>
              )}

              {/* Recommended Action Badge */}
              <div className="p-3 bg-black rounded border border-secondary">
                <div className="small text-muted mb-1">System Recommendation:</div>
                <Badge bg="success" className="fs-6 text-wrap text-start lh-base">
                  {recommendedTemplate.replace(/_/g, ' ').toUpperCase()}
                </Badge>
              </div>

            </Card.Body>
          </Card>
        </Col>

        {/* RIGHT COLUMN: The Live Preview & Editor */}
        <Col lg={8}>
          <Card className="shadow-sm border-0 h-100">
            <Card.Header className="bg-light d-flex justify-content-between align-items-center py-3">
              <span className="fw-bold text-dark"><i className="bi bi-file-earmark-text me-2"></i> Live Letter Preview</span>
              <Button variant="primary" size="sm" className="fw-bold px-3" onClick={() => onGenerate(compiledLetter)}>
                <i className="bi bi-printer me-2"></i> Generate PDF
              </Button>
            </Card.Header>
            <Card.Body className="p-0">
              <Form.Control
                as="textarea"
                value={compiledLetter}
                onChange={(e) => setCompiledLetter(e.target.value)}
                style={{ height: '500px', border: 'none', resize: 'none', fontFamily: 'monospace', padding: '20px', backgroundColor: '#f8f9fa' }}
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );
}