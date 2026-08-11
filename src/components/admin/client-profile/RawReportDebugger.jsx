import { useEffect, useState } from "react";
import { Modal, Button, Form, Spinner } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { runAuditEngine } from "../../../utils/auditEngine";
import { saveUpdateAudit } from "../../../utils/reportStorage";
import { useToast } from "../../shared/ui/ToastNotifier";

export default function RawReportDebugger({ clientId, show = true, onClose }) {
  const { addToast } = useToast();
  const [files, setFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [rawJson, setRawJson] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setLoadingFiles(true);
      try {
        const { data, error } = await supabase.storage.from("clients").list(clientId);
        if (error) throw error;
        setFiles((data || []).map(d => d.name));
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoadingFiles(false);
      }
    };
    load();
  }, [clientId]);

  const handleDownloadAndParse = async () => {
    if (!selectedFile) return setError("Select a file first");
    setError(null);
    setDownloading(true);
    try {
      const path = `${clientId}/${selectedFile}`;
      const { data, error } = await supabase.storage.from("clients").download(path);
      if (error) throw error;
      const text = await data.text();
      const json = JSON.parse(text);
      setRawJson(json);
      const result = runAuditEngine(json);
      setAudit(result);
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setDownloading(false);
    }
  };

  const handleSaveAnalysis = async () => {
    if (!rawJson || !audit) return setError("Nothing to save");
    setSaving(true);
    try {
      await saveUpdateAudit(clientId, rawJson, audit);
      addToast({ title: "Saved", message: "Saved parsed analysis to storage/database.", variant: "success", icon: "bi-check-circle-fill" });
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Raw Report Debugger</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="mb-3">
          <label className="form-label">Files in `clients/{clientId}`</label>
          {loadingFiles ? (
            <div><Spinner animation="border" size="sm" /> Loading files...</div>
          ) : (
            <Form.Select value={selectedFile || ""} onChange={e => setSelectedFile(e.target.value)}>
              <option value="">-- select file --</option>
              {files.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </Form.Select>
          )}
        </div>

        <div className="d-flex gap-2 mb-3">
          <Button onClick={handleDownloadAndParse} disabled={!selectedFile || downloading}>
            {downloading ? <><Spinner animation="border" size="sm"/> Downloading...</> : 'Download & Parse'}
          </Button>
          <Button variant="success" onClick={handleSaveAnalysis} disabled={!audit || saving}>
            {saving ? <><Spinner animation="border" size="sm"/> Saving...</> : 'Save Parsed Analysis'}
          </Button>
        </div>

        <div style={{ maxHeight: '40vh', overflow: 'auto' }}>
          {rawJson && (
            <div>
              <h6>Raw JSON ({selectedFile})</h6>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(rawJson, null, 2)}</pre>
            </div>
          )}

          {audit && (
            <div>
              <h6 className="mt-3">Parsed Audit Result</h6>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(audit, null, 2)}</pre>
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </Modal.Footer>
    </Modal>
  );
}
