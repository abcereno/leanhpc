import React from 'react';
import { Modal, Button, Row, Col, Card, Badge, ListGroup } from 'react-bootstrap';

export default function ServiceSelectionModal({ show, onHide, onSelectService, auditReport }) {
  // 1. DYNAMIC PRICING LOGIC
  const itemCount = auditReport?.negatives?.length || 0;

  const calculateTier = (count) => {
    if (count <= 10) return { price: 1500, label: "Up to 10 items", id: 'tier_1' };
    if (count <= 20) return { price: 1800, label: "11–20 items", id: 'tier_2' };
    if (count <= 30) return { price: 2200, label: "21–30 items", id: 'tier_3' };
    return { price: 2500, label: "31+ items", id: 'tier_4' };
  };

  const adminTier = calculateTier(itemCount);

  return (
    <Modal show={show} onHide={onHide} size="xl" centered scrollable>
      <Modal.Header closeButton className="border-0 pb-0">
        <Modal.Title className="fw-bold fs-3">Choose How You Want To Proceed</Modal.Title>
      </Modal.Header>
      <Modal.Body className="pt-2">
        <p className="text-muted mb-4">
          You can manage your credit file independently using our tools and education resources, 
          or request administrative processing support to assist with documentation preparation.
        </p>

        <Row className="g-4">
          {/* OPTION 1: DIY BOOTCAMP */}
          <Col lg={4}>
            <Card className="h-100 border-0 shadow-sm hover-shadow transition">
              <Card.Body className="d-flex flex-column p-4">
                <div className="mb-3">
                  <Badge bg="primary" className="mb-2">Independent</Badge>
                  <h4 className="fw-bold">DIY Credit Bootcamp</h4>
                  <div className="display-6 fw-bold text-dark">$79</div>
                </div>
                <p className="small text-muted flex-grow-1">
                  Step-by-step guidance for navigating your credit file and using platform tools independently.
                </p>
                <ListGroup variant="flush" className="small mb-4">
                  <ListGroup.Item className="px-0 border-0"><i className="bi bi-check2-circle text-primary me-2"></i> Letter Generator Access</ListGroup.Item>
                  <ListGroup.Item className="px-0 border-0"><i className="bi bi-check2-circle text-primary me-2"></i> Report Walkthrough</ListGroup.Item>
                  <ListGroup.Item className="px-0 border-0"><i className="bi bi-check2-circle text-primary me-2"></i> Platform Tutorials</ListGroup.Item>
                </ListGroup>
                <Button variant="outline-primary" className="fw-bold py-2 rounded-pill" onClick={() => onSelectService('bootcamp')}>
                  Start DIY Bootcamp
                </Button>
              </Card.Body>
            </Card>
          </Col>

          {/* OPTION 2: EDUCATION VAULT */}
          <Col lg={4}>
            <Card className="h-100 border-primary border-2 shadow-sm">
              <Card.Body className="d-flex flex-column p-4">
                <div className="mb-3">
                  <Badge bg="info" className="mb-2 text-white">Recommended</Badge>
                  <h4 className="fw-bold">Education Vault</h4>
                  <div className="display-6 fw-bold text-dark">$149</div>
                  <small className="text-muted">One-time payment</small>
                </div>
                <p className="small text-muted flex-grow-1">
                  Full access to structured training modules designed to help you understand credit systems.
                </p>
                <ListGroup variant="flush" className="small mb-4">
                  <ListGroup.Item className="px-0 border-0"><i className="bi bi-check2-circle text-info me-2"></i> Credit Education Courses</ListGroup.Item>
                  <ListGroup.Item className="px-0 border-0"><i className="bi bi-check2-circle text-info me-2"></i> Funding Education</ListGroup.Item>
                  <ListGroup.Item className="px-0 border-0"><i className="bi bi-check2-circle text-info me-2"></i> Business Credit Training</ListGroup.Item>
                </ListGroup>
                <Button variant="info" className="text-white fw-bold py-2 rounded-pill" onClick={() => onSelectService('vault')}>
                  Unlock Education Vault
                </Button>
              </Card.Body>
            </Card>
          </Col>

          {/* OPTION 3: ADMIN PROCESSING */}
          <Col lg={4}>
            <Card className="h-100 border-0 shadow-sm bg-light">
              <Card.Body className="d-flex flex-column p-4">
                <div className="mb-3">
                  <Badge bg="dark" className="mb-2">Full Support</Badge>
                  <h4 className="fw-bold">Administrative Processing</h4>
                  <div className="display-6 fw-bold text-success">${adminTier.price.toLocaleString()}</div>
                  <small className="text-primary fw-bold">Based on {itemCount} items found.</small>
                </div>
                <p className="small text-muted flex-grow-1">
                  Professional assistance organizing and preparing documentation related to your credit file.
                </p>
                <ListGroup variant="flush" className="small mb-4 bg-transparent">
                  <ListGroup.Item className="px-0 border-0 bg-transparent"><i className="bi bi-check2-circle text-success me-2"></i> Document Preparation</ListGroup.Item>
                  <ListGroup.Item className="px-0 border-0 bg-transparent"><i className="bi bi-check2-circle text-success me-2"></i> Follow-up Processing</ListGroup.Item>
                  <ListGroup.Item className="px-0 border-0 bg-transparent"><i className="bi bi-check2-circle text-success me-2"></i> Correspondence Org.</ListGroup.Item>
                </ListGroup>
                <Button variant="success" className="fw-bold py-2 rounded-pill shadow-sm" onClick={() => onSelectService('processing')}>
                  Request Processing
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* COMPLIANCE DISCLAIMER */}
        <div className="mt-5 p-3 bg-white border rounded shadow-sm">
          <h6 className="fw-bold small text-uppercase text-muted mb-2">Compliance Disclaimer</h6>
          <p className="mb-0 text-muted" style={{ fontSize: '0.75rem' }}>
            Our role is strictly administrative in nature. We assist with organizing and preparing documentation 
            through our system tools. We do not provide legal or financial advice, nor do we guarantee outcomes 
            or specific changes to any credit report.
          </p>
        </div>
      </Modal.Body>
      <Modal.Footer className="border-0">
        <Button variant="link" className="text-muted text-decoration-none" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}