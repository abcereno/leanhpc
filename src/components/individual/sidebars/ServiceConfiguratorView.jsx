import React, { useState, useMemo } from 'react';
import { Card, Form, Button, ProgressBar, Badge, Row, Col, Spinner } from 'react-bootstrap';
import { supabase } from "../../../supabaseClient";
import { useToast } from "../../shared/ui/ToastNotifier";

export default function ServiceConfiguratorView({ client, auditReport }) {
  const { addToast } = useToast();
  // --- PRICING CONFIGURATION (Kept for backend math, hidden from UI) ---
  const PRICING = {
    baseFactual: 99,
    baseConsumerLaw: 199,
    lexisNexis: 50,
    addressUpdate: 25,
    perNegativeItem: 15,
    perInquiry: 5,
    maxInquiryFee: 50
  };

  // --- STATE ---
  const [step, setStep] = useState(1);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [selections, setSelections] = useState({
    strategy: 'factual', // 'factual' | 'consumerLaw'
    lexisNexis: false,
    addressUpdate: false,
    inquiries: false,
    scope: 'all' // 'all' | 'top5'
  });

  // --- EXTRACTED REPORT DATA ---
  const totalNegatives = auditReport?.negatives?.length || 0;
  const totalInquiries = auditReport?.inquiries?.length || 0;

  // --- DYNAMIC CALCULATIONS ---
  const totals = useMemo(() => {
    let base = selections.strategy === 'consumerLaw' ? PRICING.baseConsumerLaw : PRICING.baseFactual;
    let addons = 0;
    
    if (selections.lexisNexis) addons += PRICING.lexisNexis;
    if (selections.addressUpdate) addons += PRICING.addressUpdate;
    
    let inquiryFee = 0;
    if (selections.inquiries && totalInquiries > 0) {
      inquiryFee = Math.min(totalInquiries * PRICING.perInquiry, PRICING.maxInquiryFee);
      addons += inquiryFee;
    }

    let itemsToDispute = totalNegatives;
    if (selections.scope === 'top5' && totalNegatives > 5) {
      itemsToDispute = 5;
    }
    const itemFee = itemsToDispute * PRICING.perNegativeItem;

    return {
      base,
      addons,
      inquiryFee,
      itemFee,
      itemsToDispute,
      grandTotal: base + addons + itemFee
    };
  }, [selections, totalNegatives, totalInquiries]);

  // --- HANDLERS ---
  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const toggleSelection = (key, value) => {
    setSelections(prev => ({ ...prev, [key]: value }));
  };

  // 👇 SECURE STRIPE CHECKOUT HANDLER 👇
  const handleCheckout = async () => {
    setIsCheckingOut(true);
    
    const payload = {
      type: 'custom_service',
      clientId: client?.id,
      clientEmail: client?.email,
      totalPrice: totals.grandTotal,
      productName: 'Custom Credit Audit & Processing',
      returnUrl: window.location.href.split('?')[0], // The exact page they are on
      metadata: {
        strategy: selections.strategy,
        lexisNexis: String(selections.lexisNexis),
        addressUpdate: String(selections.addressUpdate),
        inquiries: String(selections.inquiries),
        scope: selections.scope,
        totalItems: String(totals.itemsToDispute)
      }
    };

    try {
      // Use Supabase Invoke to securely pass the bouncer and prevent 401 errors
      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: payload
      });

      if (error) throw error; // Catch Edge Function errors

      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl; // Go to Stripe!
      } else {
        throw new Error(data?.error || "Failed to generate checkout link.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      addToast({ title: "Checkout Failed", message: "Please try again.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (!auditReport) {
    return <div className="text-warning p-4 fs-5 text-center fw-bold">Please import your credit report before building your service.</div>;
  }

  // --- STEP RENDERERS ---

  const renderStep1 = () => (
    <div className="animate-fade-in">
      <h3 className="fw-bold text-white mb-3">Step 1: Choose Your Strategy</h3>
      <p className="text-light  fs-5 mb-4">How aggressively would you like us to challenge the bureaus?</p>
      
      <Row className="g-4">
        <Col xs={12} md={6}>
          <Card 
            className={`h-100 cursor-pointer border-2 transition-all ${selections.strategy === 'factual' ? 'border-primary bg-primary bg-opacity-10 shadow-lg' : 'border-secondary bg-dark'}`}
            onClick={() => toggleSelection('strategy', 'factual')}
          >
            <Card.Body className="d-flex flex-column p-4 p-lg-5">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <h4 className="fw-bold text-white mb-0">Standard Audit</h4>
                <Form.Check type="radio" className="fs-4" checked={selections.strategy === 'factual'} readOnly />
              </div>
              <Badge bg="secondary" className="mb-4 fs-6 w-50 text-white">Factual Dispute</Badge>
              <p className="text-light  fs-6 mb-0">We challenge inaccuracies and unverifiable data directly with the credit bureaus using standard validation methods.</p>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card 
            className={`h-100 cursor-pointer border-2 transition-all ${selections.strategy === 'consumerLaw' ? 'border-primary bg-primary bg-opacity-10 shadow-lg' : 'border-secondary bg-dark'}`}
            onClick={() => toggleSelection('strategy', 'consumerLaw')}
          >
            <Card.Body className="d-flex flex-column p-4 p-lg-5">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <h4 className="fw-bold text-white mb-0">Deep Legal Audit</h4>
                <Form.Check type="radio" className="fs-4" checked={selections.strategy === 'consumerLaw'} readOnly />
              </div>
              <Badge bg="info" className="mb-4 fs-6 w-50 text-dark fw-bold">Consumer Law</Badge>
              <p className="text-light  fs-6 mb-0">We leverage specific FCRA and FDCPA consumer protection laws to aggressively challenge the creditor's legal right to report the data.</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );

  const renderStep2 = () => (
    <div className="animate-fade-in">
      <h3 className="fw-bold text-white mb-3">Step 2: Recommended Add-Ons</h3>
      <p className="text-light  fs-5 mb-4">Enhance your audit for better results.</p>

      <Card className="bg-dark border-secondary mb-4 shadow-sm">
        <Card.Body className="d-flex justify-content-between align-items-center p-4 p-lg-5">
          <div className="pe-4">
            <h5 className="fw-bold text-white mb-2">Update Personal Info (Address/Names)</h5>
            <div className="text-light  fs-6">Removing old addresses prevents creditors from verifying old debts.</div>
          </div>
          <Form.Check type="switch" style={{ transform: 'scale(1.5)' }} checked={selections.addressUpdate} onChange={(e) => toggleSelection('addressUpdate', e.target.checked)} />
        </Card.Body>
      </Card>

      <Card className="bg-dark border-secondary mb-4 shadow-sm">
        <Card.Body className="d-flex justify-content-between align-items-center p-4 p-lg-5">
          <div className="pe-4">
            <h5 className="fw-bold text-white mb-2 d-flex flex-wrap align-items-center gap-2">
              Include LexisNexis 
              <Badge bg="secondary" className="fw-normal text-white" style={{fontSize: '0.75rem'}}>SECONDARY BUREAU</Badge>
            </h5>
            <div className="text-light  fs-6">Crucial if you have public records or bankruptcies.</div>
          </div>
          <Form.Check type="switch" style={{ transform: 'scale(1.5)' }} checked={selections.lexisNexis} onChange={(e) => toggleSelection('lexisNexis', e.target.checked)} />
        </Card.Body>
      </Card>

      <Card className={`bg-dark border-secondary mb-4 shadow-sm ${totalInquiries === 0 ? 'opacity-50' : ''}`}>
        <Card.Body className="d-flex justify-content-between align-items-center p-4 p-lg-5">
          <div className="pe-4">
            <h5 className="fw-bold text-white mb-2">Dispute Hard Inquiries</h5>
            <div className="text-light  fs-6">We found <strong className="text-white">{totalInquiries}</strong> hard inquiries. Challenge them to recover lost points.</div>
          </div>
          <Form.Check type="switch" style={{ transform: 'scale(1.5)' }} checked={selections.inquiries} disabled={totalInquiries === 0} onChange={(e) => toggleSelection('inquiries', e.target.checked)} />
        </Card.Body>
      </Card>
    </div>
  );

  const renderStep3 = () => (
    <div className="animate-fade-in">
      <h3 className="fw-bold text-white mb-3">Step 3: Select Scope</h3>
      <p className="text-light  fs-5 mb-4">We found <strong className="text-white">{totalNegatives} negative accounts</strong> dragging your score down.</p>

      <Row className="g-4">
        <Col xs={12} md={6}>
          <Card 
            className={`h-100 cursor-pointer border-2 transition-all ${selections.scope === 'all' ? 'border-primary bg-primary bg-opacity-10 shadow-lg' : 'border-secondary bg-dark'}`}
            onClick={() => toggleSelection('scope', 'all')}
          >
            <Card.Body className="d-flex flex-column p-4 p-lg-5">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <h4 className="fw-bold text-white mb-0">Dispute All Accounts</h4>
                <Form.Check type="radio" className="fs-4" checked={selections.scope === 'all'} readOnly />
              </div>
              <p className="text-light  fs-6 mb-0">Maximize your score increase by challenging every negative item on your report.</p>
            </Card.Body>
          </Card>
        </Col>
        
        <Col xs={12} md={6}>
          <Card 
            className={`h-100 cursor-pointer border-2 transition-all ${selections.scope === 'top5' ? 'border-primary bg-primary bg-opacity-10 shadow-lg' : 'border-secondary bg-dark'} ${totalNegatives <= 5 ? 'opacity-50' : ''}`}
            onClick={() => totalNegatives > 5 && toggleSelection('scope', 'top5')}
          >
            <Card.Body className="d-flex flex-column p-4 p-lg-5">
              <div className="d-flex justify-content-between align-items-start mb-3">
                <h4 className="fw-bold text-white mb-0">Top 5 Accounts Only</h4>
                <Form.Check type="radio" className="fs-4" checked={selections.scope === 'top5'} disabled={totalNegatives <= 5} readOnly />
              </div>
              <p className="text-light  fs-6 mb-0">Budget-friendly. We will target only the 5 most damaging accounts on your report.</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </div>
  );

const renderStep4 = () => (
    <div className="animate-fade-in">
      <h3 className="fw-bold text-white mb-3">Step 4: Review Request</h3>
      <p className="text-light  fs-5 mb-4">Please review your selected processing request before checking out.</p>

      <Card className="bg-dark border-secondary shadow-lg overflow-hidden">
        <Card.Body className="p-0">
          <ul className="list-group list-group-flush bg-transparent">
            {/* BASE STRATEGY */}
            <li className="list-group-item bg-transparent border-secondary text-white d-flex justify-content-between align-items-center p-4">
              <div>
                <h5 className="fw-bold text-white mb-1">{selections.strategy === 'factual' ? 'Standard Audit (Factual)' : 'Deep Legal Audit (Consumer Law)'}</h5>
                <div className="text-light ">Base Processing</div>
              </div>
              <i className="bi bi-check-circle-fill text-success fs-4"></i>
            </li>

            {/* ADD-ONS */}
            {selections.addressUpdate && (
              <li className="list-group-item bg-transparent border-secondary text-white d-flex justify-content-between align-items-center p-4">
                <div className="text-light  fs-5">Personal Info Update</div>
                <i className="bi bi-check-circle-fill text-success fs-4"></i>
              </li>
            )}
            {selections.lexisNexis && (
              <li className="list-group-item bg-transparent border-secondary text-white d-flex justify-content-between align-items-center p-4">
                <div className="text-light  fs-5">Include LexisNexis</div>
                <i className="bi bi-check-circle-fill text-success fs-4"></i>
              </li>
            )}
            {selections.inquiries && totalInquiries > 0 && (
              <li className="list-group-item bg-transparent border-secondary text-white d-flex justify-content-between align-items-center p-4">
                <div className="text-light  fs-5">Dispute Hard Inquiries ({totalInquiries})</div>
                <i className="bi bi-check-circle-fill text-success fs-4"></i>
              </li>
            )}

            {/* SCOPE ITEMS */}
            <li className="list-group-item bg-transparent border-secondary text-white d-flex justify-content-between align-items-center p-4">
              <div>
                <h5 className="fw-bold text-white mb-1">Negative Accounts</h5>
                <div className="text-light ">Disputing {totals.itemsToDispute} items</div>
              </div>
              <i className="bi bi-check-circle-fill text-success fs-4"></i>
            </li>

            {/* TOTAL */}
            <li className="list-group-item bg-primary bg-opacity-25 border-0 text-white d-flex justify-content-between align-items-center p-4 p-lg-5">
              <h3 className="mb-0 fw-bold text-white">Grand Total</h3>
              <h2 className="mb-0 fw-bold text-white display-6">${totals.grandTotal}</h2>
            </li>
          </ul>
        </Card.Body>
      </Card>
    </div>
  );

  // --- MAIN RENDER ---
  return (
    <div className="mx-auto mt-2 px-2 px-md-0" style={{ maxWidth: '1000px' }}>
      
      {/* HEADER & PROGRESS BAR */}
      <div className="mb-5">
        <h2 className="fw-bold text-white display-6 mb-4">
          <i className="bi bi-sliders2 text-primary me-3"></i> 
          Build Your Service
        </h2>
        <div className="d-flex justify-content-between text-light  fs-6 mt-4 mb-2 fw-bold text-uppercase tracking-wider">
          <span>Step {step} of 4</span>
          <span className="text-primary">{['Strategy', 'Add-Ons', 'Scope', 'Checkout'][step - 1]}</span>
        </div>
        <ProgressBar variant="primary" now={(step / 4) * 100} style={{ height: '8px' }} className="bg-dark border border-secondary rounded-pill" />
      </div>

      {/* CONTENT AREA */}
      <div className="mb-5" style={{ minHeight: '400px' }}>
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
      </div>

      {/* NAVIGATION FOOTER */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-stretch align-items-sm-center border-top border-secondary pt-4 mt-auto gap-3">
        <Button 
          variant="outline-light" 
          size="lg"
          onClick={prevStep} 
          disabled={step === 1 || isCheckingOut}
          className="fw-bold order-2 order-sm-1 text-white"
        >
          <i className="bi bi-arrow-left me-2"></i> Back
        </Button>
        
        {step < 4 ? (
          <Button 
            variant="primary" 
            size="lg"
            onClick={nextStep}
            className="fw-bold shadow-lg order-1 order-sm-2 px-md-5 text-white"
          >
            Next Step <i className="bi bi-arrow-right ms-2"></i>
          </Button>
        ) : (
          <Button 
            variant="success" 
            size="lg"
            onClick={handleCheckout}
            disabled={isCheckingOut}
            className="fw-bold shadow-lg order-1 order-sm-2 px-md-5 text-white"
          >
            {isCheckingOut ? (
              <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" /> Connecting...</>
            ) : (
              <>Proceed to Checkout <i className="bi bi-lock-fill ms-2"></i></>
            )}
          </Button>
        )}
      </div>

      {/* Helper Styles */}
    </div>
  );
}