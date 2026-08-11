import { useState } from "react";
import { Container, Row, Col, Form, Button } from "react-bootstrap";
import RawReportDebugger from "./client-profile/RawReportDebugger";

export default function DebugRawReportPage() {
  const [clientId, setClientId] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Container className="py-4">
      <Row>
        <Col md={8} className="mx-auto">
          <h3>Raw Report Debugger</h3>
          <p className="text-muted">Enter a `clientId` (folder in Supabase storage) to inspect raw files and parsed output.</p>

          <Form onSubmit={(e) => { e.preventDefault(); setOpen(true); }}>
            <Form.Group className="mb-3">
              <Form.Label>Client ID</Form.Label>
              <Form.Control value={clientId} onChange={e => setClientId(e.target.value)} placeholder="Enter client id (folder name)" />
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" disabled={!clientId}>Open Debugger</Button>
              <Button variant="secondary" onClick={() => { setClientId(""); setOpen(false); }}>Clear</Button>
            </div>
          </Form>

          {open && clientId && (
            <RawReportDebugger show onClose={() => setOpen(false)} clientId={clientId} />
          )}
        </Col>
      </Row>
    </Container>
  );
}
