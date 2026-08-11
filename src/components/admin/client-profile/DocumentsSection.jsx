import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../supabaseClient";
import { useAuth } from "../../../context/AuthContext";
import useLogger from "../../../hooks/useLogger"; // 1. Import Logger

// Primary bucket for NEW uploads
const PRIMARY_BUCKET = "cover-letter-assets";
// Legacy bucket for OLD uploads (Admin side)
const LEGACY_BUCKET = "clients";

// 👇 Added refreshKey to props 👇
export default function DocumentsSection({ clientId, readonly = false, refreshKey }) {
  const [documents, setDocuments] = useState([]);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [currentAdminId, setCurrentAdminId] = useState(null);
  const [clientName, setClientName] = useState("Client"); // For logs
  const fileInputRef = useRef(null);
  const { hasPermission } = useAuth();
  const canDeleteDocuments = hasPermission("reject_documents");
  
  // 2. Initialize Logger
  const logAction = useLogger();

  useEffect(() => {
    if (!clientId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        setCurrentAdminId(user?.id || null);

        // Fetch Client Name for Logs
        const { data: clientData } = await supabase.from("clients").select("full_name").eq("id", clientId).single();
        if (clientData) setClientName(clientData.full_name);

        const { data, error } = await supabase
          .from("client_documents")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setDocuments(data || []);
      } catch (error) {
        console.error("Error fetching documents:", error);
        setMessage(`❌ ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  // 👇 Added refreshKey to the dependency array 👇
  }, [clientId, refreshKey]);

  // --- HELPER: ROBUST PATH CLEANER ---
  const cleanPath = (url) => {
    try {
      if (!url) return "";
      if (!url.startsWith('http')) {
          return decodeURIComponent(url);
      }

      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      
      let bucketIndex = pathParts.indexOf(PRIMARY_BUCKET);
      if (bucketIndex === -1) bucketIndex = pathParts.indexOf(LEGACY_BUCKET);
      
      if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
        return decodeURIComponent(pathParts.slice(bucketIndex + 1).join('/'));
      }
      
      return decodeURIComponent(urlObj.pathname.substring(1));
      
    } catch (e) {
      console.error("Error cleaning path:", e);
      return url;
    }
  };

// --- HELPER: SMART OPEN SECURE LINK ---
  const handleViewFile = async (doc) => {
    try {
      setMessage("");
      
      // 1. CHECK FOR EXTERNAL LINKS (Google Docs, Drive, etc.)
      // If it starts with http/https, just open it!
      if (doc.file_url && (doc.file_url.startsWith("http://") || doc.file_url.startsWith("https://"))) {
          console.log("🔗 Opening external link:", doc.file_url);
          window.open(doc.file_url, "_blank");
          return;
      }

      // 2. INTERNAL SUPABASE FILES (Legacy Logic)
      const path = cleanPath(doc.file_url);
      console.log(`🔍 Opening file. Original: ${doc.file_url} -> Cleaned: ${path}`);

      // Try Primary Bucket
      let { data, error } = await supabase.storage
        .from(PRIMARY_BUCKET)
        .createSignedUrl(path, 60);

      // Try Legacy Bucket if primary fails
      if (error || !data?.signedUrl) {
         console.log("⚠️ Not found in primary bucket, checking legacy...");
         const { data: legacyData, error: legacyError } = await supabase.storage
            .from(LEGACY_BUCKET)
            .createSignedUrl(path, 60);
         
         if (!legacyError && legacyData?.signedUrl) {
             data = legacyData;
             error = null;
         }
      }

      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Could not locate file in any storage bucket.");

      window.open(data.signedUrl, "_blank");

    } catch (err) {
      console.error("Error opening file:", err);
      setMessage("❌ Could not open file. It may have been deleted or moved.");
    }
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files);
    setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    setMessage("");
  };

  const handleFileUpload = async () => {
    if (!files.length) {
      setMessage("❌ Please select one or more files.");
      return;
    }

    try {
      setUploading(true);
      setMessage("");

      const uploadedDocs = [];

      for (const file of files) {
        const safeFileName = file.name
          .toLowerCase()
          .replace(/\s+/g, "_")
          .replace(/[^a-z0-9._-]/gi, "");

        const fileName = `${Date.now()}_${safeFileName}`;
        const storagePath = `${clientId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(PRIMARY_BUCKET)
          .upload(storagePath, file);

        if (uploadError) {
          console.error(`Upload failed for ${file.name}:`, uploadError);
          continue;
        }

        uploadedDocs.push({
          client_id: clientId,
          file_name: file.name,
          file_url: storagePath, 
          uploaded_by: currentAdminId,
        });
      }

      if (uploadedDocs.length) {
        const { error: insertError } = await supabase
          .from("client_documents")
          .insert(uploadedDocs);

        if (insertError) throw insertError;

        const { data: updatedDocs } = await supabase
          .from("client_documents")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });

        setDocuments(updatedDocs || []);
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = null;

        // [LOG UPLOAD]
        await logAction({
            action: "upload_document",
            targetId: clientId,
            targetName: clientName,
            details: `Uploaded ${uploadedDocs.length} file(s).`
        });

        setMessage("✅ Files uploaded successfully");
      } else {
        setMessage("❌ No files were uploaded.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setMessage(`❌ Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (doc) => {
    if (!doc) return;
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return;

    try {
      setUploading(true);
      setMessage("");

      const path = cleanPath(doc.file_url);

      await supabase.storage.from(PRIMARY_BUCKET).remove([path]);
      await supabase.storage.from(LEGACY_BUCKET).remove([path]);

      const { error: dbErr } = await supabase
        .from("client_documents")
        .delete()
        .eq("id", doc.id);
      
      if (dbErr) throw dbErr;

      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      
      // [LOG DELETE]
      await logAction({
        action: "delete_document",
        targetId: clientId,
        targetName: clientName,
        details: `Deleted file: ${doc.file_name}`
      });

      setMessage("✅ File deleted.");
    } catch (err) {
      console.error("Delete file error:", err);
      setMessage(`❌ Failed to delete file: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteAllFiles = async () => {
    if (!window.confirm("Are you sure you want to delete all documents?")) return;

    try {
      setMessage("");
      const count = documents.length; // Capture count before clearing state

      const { error: dbError } = await supabase
        .from("client_documents")
        .delete()
        .eq("client_id", clientId);

      if (dbError) throw dbError;

      setDocuments([]);

      // [LOG DELETE ALL]
      await logAction({
        action: "delete_all_documents",
        targetId: clientId,
        targetName: clientName,
        details: `Bulk deleted ${count} documents.`
      });

      setMessage("✅ All documents deleted successfully");
    } catch (error) {
      setMessage(`❌ Deletion failed: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="card shadow-sm h-100 d-flex flex-column">
        <div className="card-header"><h5 className="mb-0 placeholder col-4"></h5></div>
        <div className="card-body placeholder-glow flex-grow-1"><p className="placeholder col-12"></p></div>
      </div>
    );
  }

  return (
    <div className="card shadow-sm h-100 d-flex flex-column border-0">
      <div className="card-header border-bottom">
        <h5 className="mb-0">
          <i className="bi bi-folder me-2 text-primary"></i>
          Documents
        </h5>
      </div>
      
      <div className="card-body flex-grow-1" style={{ overflowY: "auto", minHeight: 0 }}>
        {message && (
          <div className={`alert alert-${message.includes("❌") ? "danger" : "success"} mb-3`}>
            {message}
          </div>
        )}

        {documents.length === 0 ? (
          <div className="text-center py-4">
            <i className="bi bi-folder-x fs-1 text-muted opacity-50"></i>
            <p className="mt-2 text-muted">No documents uploaded yet</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th style={{ width: '140px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        <i className="bi bi-file-earmark-text me-2 text-primary"></i>
                        <span className="text-truncate" style={{maxWidth: '200px'}} title={doc.file_name}>{doc.file_name}</span>
                      </div>
                    </td>
                    <td>
                      <div className="d-flex flex-nowrap gap-2 justify-content-end">
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleViewFile(doc)}
                          title="View"
                        >
                          <i className="bi bi-eye"></i>
                        </button>
                        
                        <button
                           type="button"
                           className="btn btn-sm btn-secondary"
                           onClick={() => handleViewFile(doc)}
                           title="Download"
                        >
                          <i className="bi bi-download"></i>
                        </button>

                        {(!readonly && canDeleteDocuments) && (
                          <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => handleDeleteFile(doc)}
                            disabled={uploading}
                            title="Delete"
                          >
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!readonly && (
        <div className="card-footer border-top">
          <div className="mb-3">
            <label className="form-label small text-muted">Upload New Documents</label>
            <div className="input-group input-group-sm">
              <input
                type="file"
                className="form-control"
                ref={fileInputRef}
                onChange={handleFileChange}
                multiple
              />
              <button
                className="btn btn-primary fw-bold"
                type="button"
                onClick={handleFileUpload}
                disabled={uploading || !files.length}
              >
                {uploading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"/>
                    Uploading...
                  </>
                ) : (
                  <>
                    <i className="bi bi-upload me-2"></i>
                    Upload
                  </>
                )}
              </button>

              {canDeleteDocuments && documents.length > 0 && (
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={handleDeleteAllFiles}
                  disabled={uploading}
                  title="Delete All Files"
                >
                  <i className="bi bi-trash-fill"></i>
                </button>
              )}
            </div>
          </div>
          {files.length > 0 && <small className="text-info">{files.length} file(s) ready to upload</small>}
        </div>
      )}
    </div>
  );
}