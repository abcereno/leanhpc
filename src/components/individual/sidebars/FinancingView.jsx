import React from 'react';
import { Card, Row, Col, Button, Badge } from 'react-bootstrap';

export default function FinancingView({ client }) {
  
  // 👇 PASTE YOUR FLEXXBUY LINK RIGHT HERE 👇
  const FLEXXBUY_LINK = "https://app.flexxbuy.com/lt-student-credit-sch/apply/";

  const handleApplyNow = () => {
    window.open(FLEXXBUY_LINK, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="animate-fade-in pb-5">
      
      {/* Header Section */}
      <div className="mb-4 border-bottom border-secondary border-opacity-25 pb-3">
        <h3 className="fw-bold text-success mb-1">
          <i className="bi bi-cash-coin me-2"></i> 
          Flexible Financing
        </h3>
        <p className="text-muted mb-0">
          Need help covering the cost of your credit repair journey? We've got you covered.
        </p>
      </div>

      <Row className="justify-content-center">
        <Col lg={10} xl={8}>
          
          {/* Main Offer Card */}
          <Card className="shadow-lg border-secondary bg-dark text-white overflow-hidden hover-lift mt-2">
            
            {/* Decorative Top Gradient */}
            <div 
              className="bg-success bg-opacity-25 w-100" 
              style={{ height: '6px', background: 'linear-gradient(90deg, #10B981, #34D399)' }}
            />

            <Card.Body className="p-4 p-md-5 position-relative">
              
              {/* Floating Badge */}
              <Badge bg="success" className="position-absolute top-0 end-0 m-4 px-3 py-2 shadow-sm rounded-pill letter-spacing-1">
                <i className="bi bi-check-circle-fill me-1"></i> Pre-Qualify Now
              </Badge>

              <div className="text-center mb-5 mt-3">
                <div 
                  className="bg-success bg-opacity-10 text-success rounded-circle d-inline-flex align-items-center justify-content-center mb-4 shadow-sm"
                  style={{ width: '90px', height: '90px' }}
                >
                  <i className="bi bi-bank" style={{ fontSize: '3rem' }}></i>
                </div>
                <h2 className="fw-bold mb-3">Get Funded with Flexxbuy</h2>
                <p className="text-muted fs-5 mx-auto" style={{ maxWidth: '600px' }}>
                  Don't let upfront costs delay your financial freedom. Apply for a small, flexible loan to cover your services today.
                </p>
              </div>

              {/* Benefits Grid */}
              <Row className="g-4 mb-5">
                <Col md={4} className="text-center">
                  <i className="bi bi-shield-check display-6 text-info mb-2 d-block"></i>
                  <h6 className="fw-bold">No Hard Pull</h6>
                  <p className="text-muted small mb-0">Checking your rates will not affect your credit score.</p>
                </Col>
                <Col md={4} className="text-center">
                  <i className="bi bi-lightning-charge display-6 text-warning mb-2 d-block"></i>
                  <h6 className="fw-bold">Instant Decisions</h6>
                  <p className="text-muted small mb-0">Get approved in seconds with our streamlined application.</p>
                </Col>
                <Col md={4} className="text-center">
                  <i className="bi bi-calendar3 display-6 text-primary mb-2 d-block"></i>
                  <h6 className="fw-bold">Flexible Terms</h6>
                  <p className="text-muted small mb-0">Choose a monthly payment plan that fits your budget.</p>
                </Col>
              </Row>

              {/* CTA Section */}
              <div className="bg-light bg-opacity-10 rounded-3 p-4 text-center border border-secondary border-opacity-25">
                <h5 className="fw-bold mb-3">Ready to get started?</h5>
                <Button 
                  variant="success" 
                  size="lg" 
                  className="fw-bold px-5 py-3 shadow-lg rounded-pill"
                  onClick={handleApplyNow}
                >
                  Apply For Financing <i className="bi bi-box-arrow-up-right ms-2"></i>
                </Button>
                <p className="text-muted small mt-3 mb-0">
                  Application takes less than 2 minutes to complete.
                </p>
              </div>

            </Card.Body>
          </Card>

        </Col>
      </Row>
    </div>
  );
}