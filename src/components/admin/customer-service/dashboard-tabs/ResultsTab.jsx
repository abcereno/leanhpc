import React, { useState, useEffect } from 'react';
import { Card, Table, Row, Col, Spinner, Alert, Badge } from 'react-bootstrap';
import { supabase } from '../../../../supabaseClient';
import dayjs from 'dayjs';

export default function ResultsTab({ clientId }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientId) return;

    const fetchClientResults = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch removals specifically for this client
        const { data, error } = await supabase
          .from("inquiry_removals")
          .select("*, profiles(full_name)")
          .eq("client_id", clientId)
          .order("saved_at", { ascending: false });

        if (error) throw error;
        setLogs(data || []);
      } catch (err) {
        console.error("Error fetching results:", err);
        setError("Failed to load result logs.");
      } finally {
        setLoading(false);
      }
    };

    fetchClientResults();
  }, [clientId]);

  // --- Data Processing ---
  const totalRemoved = logs.reduce((sum, log) => sum + log.removed_count, 0);

  const byBureau = logs.reduce((acc, log) => {
    acc[log.bureau] = (acc[log.bureau] || 0) + log.removed_count;
    return acc;
  }, {});

  // Group by date, bureau, and admin to match your original viewer
  const groupedTableData = {};
  logs.forEach((log) => {
    // Use saved_at, fallback to log_date or created_at if needed based on your DB schema
    const date = dayjs(log.saved_at || log.log_date || log.created_at).format("YYYY-MM-DD");
    const bureau = log.bureau || "Unknown";
    const admin = log.profiles?.full_name || "System";
    const key = `${date}-${bureau}-${admin}`;
    
    if (!groupedTableData[key]) {
      groupedTableData[key] = { date, bureau, admin, count: 0 };
    }
    groupedTableData[key].count += log.removed_count;
  });

  // Convert to array and sort newest first
  const groupedRows = Object.values(groupedTableData).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (loading) {
    return (
      <div className="text-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="text-muted mt-2">Loading client results...</p>
      </div>
    );
  }

  if (error) {
    return <Alert variant="danger"><i className="bi bi-exclamation-triangle-fill me-2"></i>{error}</Alert>;
  }

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Header className="bg-white fw-bold py-3 d-flex justify-content-between align-items-center">
        <span><i className="bi bi-trophy-fill text-warning me-2"></i> Removal Results</span>
      </Card.Header>
      <Card.Body>
        
        {/* Summary Cards */}
        <Row className="mb-4 g-3">
          <Col md={3}>
            <Card className="shadow-sm border-primary border-opacity-25 h-100 bg-primary bg-opacity-10">
              <Card.Body className="text-center">
                <Card.Title className="text-primary small text-uppercase fw-bold">Total Removed</Card.Title>
                <Card.Text style={{ fontSize: "2rem", fontWeight: "bold" }} className="text-dark mb-0">
                  {totalRemoved.toLocaleString()}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          
          {["Experian", "TransUnion", "Equifax"].map((bureau) => (
            <Col md={3} key={bureau}>
              <Card className="shadow-sm h-100 border-0 bg-light">
                <Card.Body className="text-center">
                  <Card.Title className="small text-uppercase fw-bold text-muted">{bureau}</Card.Title>
                  <Card.Text style={{ fontSize: "1.75rem", fontWeight: "bold" }} className="text-dark mb-0">
                    {(byBureau[bureau] || 0).toLocaleString()}
                  </Card.Text>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Timeline Table */}
        <h6 className="fw-bold mb-3 text-secondary">Removal History Log</h6>
        {groupedRows.length === 0 ? (
           <div className="text-center py-5 bg-light rounded border border-dashed">
             <i className="bi bi-inbox text-muted display-4 d-block mb-3"></i>
             <p className="text-muted mb-0">No successful removals logged for this client yet.</p>
           </div>
        ) : (
          <div className="table-responsive">
            <Table striped hover bordered className="align-middle bg-white">
              <thead className="bg-light text-muted small text-uppercase">
                <tr>
                  <th>Date</th>
                  <th>Bureau</th>
                  <th>Processed By</th>
                  <th className="text-center">Inquiries Removed</th>
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((row, idx) => (
                  <tr key={idx}>
                    <td className="fw-medium">{dayjs(row.date).format("MMM DD, YYYY")}</td>
                    <td>
                        <Badge bg={row.bureau === 'Experian' ? 'primary' : row.bureau === 'TransUnion' ? 'info' : row.bureau === 'Equifax' ? 'danger' : 'secondary'}>
                            {row.bureau}
                        </Badge>
                    </td>
                    <td><i className="bi bi-person-badge text-muted me-2"></i>{row.admin}</td>
                    <td className="text-center fw-bold text-success">
                        +{row.count}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card.Body>
    </Card>
  );
}