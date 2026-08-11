import { useState, useEffect } from "react";
import { supabase } from "../../../supabaseClient";
import { useToast } from "../../shared/ui/ToastNotifier";

const CLIENT_BUCKET = "client-uploads";

// 👇 Added refreshKey to props 👇
export default function AdminClientPortalDocs({ clientId, refreshKey }) {
  const { addToast } = useToast();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);

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
  // 👇 Added refreshKey to the dependency array 👇
  }, [clientId, refreshKey]);

  const handleViewFile = async (doc) => {
    try {
      let path = doc.file_url;
      if (path.includes(`${CLIENT_BUCKET}/`)) path = path.split(`${CLIENT_BUCKET}/`).pop();
      path = decodeURIComponent(path);

      const { data, error } = await supabase.storage
        .from(CLIENT_BUCKET)
        .createSignedUrl(path, 60);
        
      if (error || !data?.signedUrl) throw new Error("Could not locate file.");
      window.open(data.signedUrl, "_blank");
    } catch (err) {
      addToast({ title: "Open Failed", message: "Could not open file. It may have been deleted.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  if (loading) return <div className="placeholder-glow"><p className="placeholder col-12"></p></div>;

  return (
    <div className="card shadow-sm h-100 border-info border-2">
      <div className="card-header bg-info text-dark border-bottom">
        <h5 className="mb-0 fw-bold">
          <i className="bi bi-person-bounding-box me-2"></i>
          Client Uploaded IDs
        </h5>
      </div>
      
      <div className="card-body" style={{ overflowY: "auto", minHeight: "150px" }}>
        {documents.length === 0 ? (
          <p className="text-muted small text-center mb-0 mt-3">The client has not uploaded any documents yet.</p>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        <i className="bi bi-file-person me-2 text-info fs-5"></i>
                        <span className="text-truncate fw-semibold" style={{maxWidth: '200px'}}>{doc.file_name}</span>
                      </div>
                      <small className="text-muted d-block">{new Date(doc.created_at).toLocaleDateString()}</small>
                    </td>
                    <td className="text-end">
                      <button className="btn btn-sm btn-info text-white fw-bold" onClick={() => handleViewFile(doc)} title="View Document">
                        <i className="bi bi-eye me-1"></i> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}