import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../supabaseClient";
import { useToast } from "../../shared/ui/ToastNotifier";

const CLIENT_BUCKET = "client-uploads";

export default function ConsumerDocuments({ clientId }) {
  const { addToast } = useToast();
  const [documents, setDocuments] = useState([]);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!clientId) return;
    
    const fetchClientFiles = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("client_portal_documents")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (!error && data) setDocuments(data);
      setLoading(false);
    };
    
    fetchClientFiles();
  }, [clientId]);

  const handleViewFile = async (doc) => {
    try {
      if (doc.file_url.startsWith("http")) return window.open(doc.file_url, "_blank");

      let path = doc.file_url;
      if (path.includes(`${CLIENT_BUCKET}/`)) {
        path = path.split(`${CLIENT_BUCKET}/`).pop();
      }
      path = decodeURIComponent(path);

      const { data, error } = await supabase.storage
        .from(CLIENT_BUCKET)
        .createSignedUrl(path, 60);
        
      if (error || !data?.signedUrl) throw new Error("Could not locate file.");
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      addToast({ title: "Could Not Open File", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  const handleFileUpload = async () => {
    if (!files.length) return;
    setUploading(true);
    setMessage("");

    const uploadedDocs = [];
    
    for (const file of files) {
      // Clean the filename to prevent URL issues
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const storagePath = `${clientId}/${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(CLIENT_BUCKET)
        .upload(storagePath, file);
        
      if (upErr) continue;

      uploadedDocs.push({
        client_id: clientId,
        file_name: file.name,
        file_url: storagePath,
        uploaded_by: "Consumer Portal" 
      });
    }

    if (uploadedDocs.length > 0) {
      // 1. Save to the database
      await supabase.from("client_portal_documents").insert(uploadedDocs);
      
      // 2. Pull the fresh list to update the UI
      const { data } = await supabase
        .from("client_portal_documents")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });
        
      setDocuments(data || []);
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = null;
      setMessage("✅ Document securely uploaded.");
      addToast({ title: "Uploaded", message: "Document securely uploaded.", variant: "success", icon: "bi-file-earmark-check-fill" });
    } else {
      setMessage("❌ Failed to upload documents.");
      addToast({ title: "Upload Failed", message: "Please try again.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
    setUploading(false);
  };

  if (loading) return <div className="p-4 text-center text-muted">Loading your documents...</div>;

  return (
    <div className="card shadow-sm border-0">
      <div className="card-header bg-white border-bottom py-3">
        <h5 className="mb-0 fw-bold"><i className="bi bi-person-vcard text-primary me-2"></i> My Documents</h5>
      </div>
      
      <div className="card-body">
        {message && <div className={`alert py-2 small fw-bold ${message.includes("❌") ? "alert-danger" : "alert-success"}`}>{message}</div>}
        
        {documents.length === 0 ? (
          <div className="text-center py-4">
            <i className="bi bi-file-earmark-x fs-1 text-muted opacity-50 mb-2 d-block"></i>
            <p className="text-muted small mb-0">No documents uploaded yet.</p>
          </div>
        ) : (
          <ul className="list-group list-group-flush mb-3">
            {documents.map((doc) => (
              <li key={doc.id} className="list-group-item d-flex justify-content-between align-items-center px-0 py-3">
                <div className="d-flex align-items-center text-truncate pe-3">
                  <i className="bi bi-file-earmark-check fs-4 text-success me-3"></i>
                  <span className="fw-semibold text-truncate" title={doc.file_name}>{doc.file_name}</span>
                </div>
                <div className="d-flex gap-2 flex-shrink-0">
                  {/* View button remains, Delete button removed */}
                  <button className="btn btn-sm btn-outline-primary" onClick={() => handleViewFile(doc)} title="View Document">
                    <i className="bi bi-eye"></i> View
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      
      <div className="card-footer bg-light p-3">
        <label className="form-label small fw-bold text-muted">Upload Identification or Proof of Address</label>
        <div className="input-group">
          <input 
            type="file" 
            className="form-control" 
            ref={fileInputRef} 
            onChange={(e) => setFiles(Array.from(e.target.files))} 
            multiple 
            accept="image/*,.pdf"
          />
          <button 
            className="btn btn-primary fw-bold px-4" 
            onClick={handleFileUpload} 
            disabled={uploading || !files.length}
          >
            {uploading ? <span className="spinner-border spinner-border-sm"></span> : "Upload"}
          </button>
        </div>
        <small className="text-muted mt-2 d-block">Accepted files: PDF, JPG, PNG.</small>
      </div>
    </div>
  );
}