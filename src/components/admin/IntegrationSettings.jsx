// src/components/admin/IntegrationSettings.jsx
//
// Admin page for the integration_settings table (sql/add_integration_settings.sql)
// — every outbound HighLevel webhook URL this app sends to, editable here
// instead of hardcoded in source (see highlevelWebhook.js for the sender
// this feeds). Each row has its own Save and a "Send Test" button that
// POSTs a realistic sample payload to whatever URL is currently typed in
// (even before it's saved) and shows the result + exact payload sent.
import { useEffect, useState } from "react";
import { Card, Form, Button, Alert, Spinner, Badge } from "react-bootstrap";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../shared/ui/ToastNotifier";
import {
  listIntegrationSettings,
  setIntegrationSettingValue,
} from "../../utils/integrationSettings";
import { sendTestPayload } from "../../utils/highlevelWebhook";

function IntegrationRow({ row, userId, addToast }) {
  const [value, setValue] = useState(row.value || "");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, status, statusText, body, payload }
  const dirty = value !== (row.value || "");

  const handleSave = async () => {
    setSaving(true);
    const { error } = await setIntegrationSettingValue(row.key, value.trim(), userId);
    setSaving(false);
    if (error) {
      addToast({ title: "Save Failed", message: error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    row.value = value.trim();
    addToast({ title: "Saved", message: `${row.label} updated.`, variant: "success", icon: "bi-check-circle-fill" });
  };

  const handleTest = async () => {
    const target = value.trim();
    if (!target) {
      addToast({ title: "No URL", message: "Enter a webhook URL before sending a test.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    const result = await sendTestPayload(row.key, target);
    setTesting(false);
    setTestResult(result);
  };

  return (
    <Card className="mb-3">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start mb-2">
          <div>
            <Card.Title className="mb-0 h6">{row.label}</Card.Title>
            {row.description && <Card.Text className="text-muted small mb-0">{row.description}</Card.Text>}
          </div>
          {!row.value && <Badge bg="secondary">Not configured</Badge>}
        </div>

        <Form.Group className="mb-2">
          <Form.Control
            type="text"
            placeholder="https://services.leadconnectorhq.com/hooks/..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Form.Group>

        <div className="d-flex gap-2">
          <Button size="sm" variant="primary" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <><Spinner size="sm" animation="border" className="me-1" />Saving...</> : "Save"}
          </Button>
          <Button size="sm" variant="outline-secondary" onClick={handleTest} disabled={testing}>
            {testing ? <><Spinner size="sm" animation="border" className="me-1" />Sending...</> : "Send Test"}
          </Button>
        </div>

        {testResult && (
          <Alert
            variant={testResult.ok === false ? "danger" : testResult.ok === true ? "success" : "warning"}
            className="mt-3 mb-0 small"
          >
            <div className="fw-bold mb-1">
              {testResult.ok === true && "Test sent — response OK"}
              {testResult.ok === false && "Test failed to send"}
              {testResult.ok === null && "Test sent (response not readable — likely still delivered)"}
            </div>
            {testResult.status != null && <div>Status: {testResult.status} {testResult.statusText}</div>}
            {testResult.ok === null && <div>{testResult.statusText}</div>}
            {testResult.body && <div>Response body: <code>{testResult.body}</code></div>}
            <details className="mt-2">
              <summary style={{ cursor: "pointer" }}>Payload sent</summary>
              <pre className="mb-0 mt-1" style={{ whiteSpace: "pre-wrap", fontSize: "0.8em" }}>
                {JSON.stringify(testResult.payload, null, 2)}
              </pre>
            </details>
          </Alert>
        )}
      </Card.Body>
    </Card>
  );
}

export default function IntegrationSettings() {
  const { userId } = useAuth();
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await listIntegrationSettings();
      setRows(data);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-center">
        <Spinner animation="border" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-4">
        <Alert variant="warning">
          No integration settings found. Run <code>sql/add_integration_settings.sql</code> against the database, then reload this page.
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4" style={{ maxWidth: 760 }}>
      <h4 className="mb-1"><i className="bi bi-plug-fill me-2 text-primary"></i>Integration Settings</h4>
      <p className="text-muted mb-4">
        HighLevel webhook destinations used throughout the app. Editing a URL here takes effect immediately for new events — no deploy needed.
      </p>
      {rows.map((row) => (
        <IntegrationRow key={row.key} row={row} userId={userId} addToast={addToast} />
      ))}
    </div>
  );
}
