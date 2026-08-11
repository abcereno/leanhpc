import React from 'react';
import { Row, Col, Card, Table, Button, Badge, Form, ListGroup, FormCheck } from 'react-bootstrap';

export const OverviewTab = ({ client }) => (
  <Row className="g-3">
    <Col md={6}>
      <Card className="shadow-sm border-0 h-100">
        <Card.Body>
          <h6 className="fw-bold mb-3">Client Details</h6>
          <Table borderless size="sm">
            <tbody>
              <tr><td className="text-muted">Full Name:</td><td className="fw-bold">{client?.full_name}</td></tr>
              <tr><td className="text-muted">Email:</td><td className="fw-bold">{client?.email || 'N/A'}</td></tr>
              <tr><td className="text-muted">Phone:</td><td className="fw-bold">{client?.phone || 'N/A'}</td></tr>
              <tr><td className="text-muted">DOB:</td><td className="fw-bold">--/--/----</td></tr>
              <tr><td className="text-muted">SSN:</td><td className="fw-bold">***-**-****</td></tr>
            </tbody>
          </Table>
        </Card.Body>
      </Card>
    </Col>
    <Col md={6}>
      <Card className="shadow-sm border-0 h-100">
        <Card.Body>
          <h6 className="fw-bold mb-3">Score Overview</h6>
          <div className="d-flex justify-content-between text-center mb-3">
            <div className="p-3 bg-light rounded border"><div className="small text-muted">Experian</div><div className="fs-4 fw-bold text-primary">--</div></div>
            <div className="p-3 bg-light rounded border"><div className="small text-muted">Equifax</div><div className="fs-4 fw-bold text-primary">--</div></div>
            <div className="p-3 bg-light rounded border"><div className="small text-muted">TransUnion</div><div className="fs-4 fw-bold text-primary">--</div></div>
          </div>
        </Card.Body>
      </Card>
    </Col>
  </Row>
);

export const InquiryListTab = () => (
  <Card className="shadow-sm border-0"><Card.Body><h6 className="fw-bold">Disputable Inquiries</h6><p className="text-muted">List of inquiries will appear here.</p></Card.Body></Card>
);

export const TimelineTab = () => (
  <div className="p-2">
    <h6 className="fw-bold mb-3">Activity Log</h6>
    <div className="border-start border-2 ps-3 ms-2">
      <div className="mb-4 position-relative">
        <div className="position-absolute start-0 translate-middle-x bg-white" style={{left: '-17px', top: '0'}}><i className="bi bi-circle-fill text-primary small"></i></div>
        <div className="small text-muted">Today</div><div className="fw-bold">Dashboard Accessed</div>
      </div>
    </div>
  </div>
);

export const MessagesTab = () => (
    <Card className="shadow-sm border-0" style={{height: '400px'}}>
        <Card.Body className="d-flex flex-column">
            <h6 className="fw-bold mb-3 border-bottom pb-2">Communication</h6>
            <div className="flex-grow-1 text-center text-muted pt-5">No messages yet.</div>
            <div className="d-flex gap-2"><Form.Control size="sm" placeholder="Type a message..." /><Button size="sm" variant="primary">Send</Button></div>
        </Card.Body>
    </Card>
);

export const AutomationsTab = () => (
    <Card className="shadow-sm border-0"><Card.Body><h6 className="fw-bold">Active Automations</h6><ListGroup variant="flush"><ListGroup.Item>Welcome Email</ListGroup.Item></ListGroup></Card.Body></Card>
);

export const ResultsTab = () => (
    <div className="text-center p-5"><h5 className="fw-bold text-muted">No Results Yet</h5></div>
);