import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Table, Spinner, Badge } from "react-bootstrap";

export default function DocumentLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("document_logs")
        .select(
          `
          *,
          clients(full_name),
          profiles(full_name)
        `
        )
        .order("submitted_at", { ascending: false });

      if (error) {
        console.error("Error fetching document logs:", error);
        return;
      }

      setLogs(data);
      setLoading(false);
    };

    fetchLogs();
  }, []);

  const formatDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  // --- NEW LOGIC: Calculate +7 or +10 Days ---
  const calculateTargetDate = (submittedAt, note) => {
    if (!submittedAt) return { dateStr: "—", type: "standard" };

    const date = new Date(submittedAt);
    const isRedo = note && note.toLowerCase().includes("redo");
    
    // Add 10 days for Redo, 7 days for Standard
    const daysToAdd = isRedo ? 10 : 7;
    date.setDate(date.getDate() + daysToAdd);

    return {
      dateStr: date.toLocaleDateString("en-US", { year: 'numeric', month: '2-digit', day: '2-digit' }),
      type: isRedo ? "redo" : "standard",
      daysAdded: daysToAdd
    };
  };

  const filteredLogs = logs.filter((row) => {
    const client = row.clients?.full_name?.toLowerCase() || "";
    const admin = row.profiles?.full_name?.toLowerCase() || "";
    const note = row.note?.toLowerCase() || "";
    return (
      client.includes(searchTerm) ||
      admin.includes(searchTerm) ||
      note.includes(searchTerm)
    );
  });

  return (
    <div className="container mt-4 login-container">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h2 className="mb-1">📄 Document Logs</h2>
            <p className="text-muted small">Tracks document submissions and calculates callback priority.</p>
        </div>
        <input
          type="text"
          className="form-control w-25"
          placeholder="Search by client, admin, or note..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value.toLowerCase())}
        />
      </div>

      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Date Submitted</th>
              <th>Target Callback</th>
              <th>Client</th>
              <th>Note</th>
              <th>Submitted By</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((row) => {
              // Calculate date on the fly
              const target = calculateTargetDate(row.submitted_at, row.note);
              
              return (
                <tr key={row.id}>
                  <td>{formatDate(row.submitted_at)}</td>
                  
                  {/* Calculated Callback Column */}
                  <td>
                    <div className="d-flex align-items-center gap-2">
                        <span className="fw-bold">{target.dateStr}</span>
                        {target.type === "redo" ? (
                            <Badge bg="danger" title="Redo">2nd Attempt</Badge>
                        ) : (
                            <Badge bg="success" title="First Attempt">1st Attempt</Badge>
                        )}
                    </div>
                  </td>

                  <td>
                    {row.clients?.full_name ? (
                      <a href={`/clients/${row.client_id}`} className="text-decoration-none">
                        {row.clients.full_name}
                      </a>
                    ) : "—"}
                  </td>
                  <td>{row.note || "—"}</td>
                  <td>
                    {row.profiles?.full_name ? (
                      <a href={`/admin/${row.admin_id}`} className="text-decoration-none">
                        {row.profiles.full_name}
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}