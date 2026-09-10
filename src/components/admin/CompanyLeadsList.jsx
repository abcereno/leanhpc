import React, { useState, useEffect } from "react";
import { Table, Badge, Spinner, Alert, Card, Button } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";
import { useConfirm } from "../shared/ui/ConfirmDialog";

export default function CompanyLeadsList({ companyId }) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [deletingId, setDeletingId] = useState(null); // Tracks active row deletion

    useEffect(() => {
        // Fetch runs immediately. If companyId is absent, it loads global admin records safely.
        fetchLeads();
    }, [companyId]);

    const fetchLeads = async () => {
        setLoading(true);
        setError("");
        try {
            // 1. Initialize base query selection wrapper
            let query = supabase
                .from("company_leads")
                .select("*");

            // 2. Only apply the filter if a valid companyId is present.
            // If undefined (like on your Admin layout route), it fetches all platform leads cleanly!
            if (companyId) {
                query = query.eq("company_id", companyId);
            }

            const { data, error: dbError } = await query.order("created_at", { ascending: false });

            if (dbError) throw dbError;
            setLeads(data || []);
        } catch (err) {
            console.error("Error reading lead payload rows:", err);
            setError("Failed to sync live pipeline leads from your public scanners.");
        } finally {
            setLoading(false);
        }
    };

    // 👇 NEW: Core Lead Deletion Handler Logic 👇
    const handleDeleteLead = async (leadId, leadName) => {
        const confirmed = await confirm(`Are you absolutely sure you want to permanently delete the lead record for "${leadName}"? This action cannot be undone.`);
        if (!confirmed) return;

        setDeletingId(leadId);
        try {
            const { error: deleteError } = await supabase
                .from("company_leads")
                .delete()
                .eq("id", leadId);

            if (deleteError) throw deleteError;

            // Instantly slice deleted item out of local state array to refresh UI seamlessly
            setLeads((prevLeads) => prevLeads.filter((lead) => lead.id !== leadId));
        } catch (err) {
            console.error("Error performing row termination:", err);
            addToast({ title: "Error", message: "System Error: Failed to remove lead record from the secure log pipeline.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
        } finally {
            setDeletingId(null);
        }
    };

    const formatTimestamp = (isoString) => {
        const date = new Date(isoString);
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    };

    const getStatusBadge = (status) => {
        if (status === "GREEN") return <Badge bg="success" className="text-uppercase fw-bold px-2 py-1 shadow-sm">Green / Ready</Badge>;
        if (status === "YELLOW") return <Badge bg="warning" text="dark" className="text-uppercase fw-bold px-2 py-1 shadow-sm">Yellow / Review</Badge>;
        return <Badge bg="danger" className="text-uppercase fw-bold px-2 py-1 shadow-sm">Red / High Risk</Badge>;
    };

    if (loading) {
        return (
            <div className="text-center py-5">
                <Spinner animation="border" variant="primary" />
                <p className="mt-2 text-muted small">Synchronizing pipeline logs...</p>
            </div>
        );
    }

    return (
        <Card className="border-0 shadow-sm rounded-4 overflow-hidden bg-white">
            <Card.Header className="bg-white border-bottom py-3 px-4 d-flex justify-content-between align-items-center">
                <div>
                    <h5 className="fw-bold mb-0 text-dark">
                        <i className="bi bi-funnel text-primary me-2"></i>Public Scanner Leads
                    </h5>
                    <small className="text-muted">Captured instantly from your embedded funnel widget pages</small>
                </div>
                <Button variant="light" size="sm" className="border fw-bold" onClick={fetchLeads}>
                    <i className="bi bi-arrow-clockwise me-1"></i> Refresh
                </Button>
            </Card.Header>
            <Card.Body className="p-0">
                {error && <Alert variant="danger" className="m-3 small fw-bold">{error}</Alert>}
                
                {leads.length === 0 ? (
                    <div className="text-center py-5 text-muted">
                        <i className="bi bi-person-fill-dash display-4 opacity-25 mb-2 d-block"></i>
                        <span className="small d-block fw-medium">No external traffic leads recorded yet.</span>
                        <small className="text-muted">When brokers evaluate reports on your landing page, details appear here.</small>
                    </div>
                ) : (
                    <Table responsive striped hover className="align-middle mb-0 text-start small">
                        <thead className="bg-light text-uppercase tracking-wider font-monospace" style={{ fontSize: '0.75rem' }}>
                            <tr>
                                <th className="ps-4 py-3">Timestamp</th>
                                <th>Applicant Details</th>
                                <th>Contact Information</th>
                                <th>Monitoring Account</th>
                                <th>Funder Status</th>
                                <th className="text-center pe-4" style={{ width: "100px" }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {leads.map((lead) => (
                                <tr key={lead.id}>
                                    <td className="ps-4 font-monospace text-muted">{formatTimestamp(lead.created_at)}</td>
                                    <td className="fw-bold text-dark">{lead.full_name}</td>
                                    <td>
                                        <div className="fw-medium text-dark">{lead.email}</div>
                                        <div className="text-muted font-monospace" style={{ fontSize: '0.75rem' }}>{lead.phone}</div>
                                    </td>
                                    <td className="font-monospace text-muted">{lead.monitoring_username}</td>
                                    <td>{getStatusBadge(lead.computed_status)}</td>
                                    {/* Action Row Column with loading guard interaction styles */}
                                    <td className="text-center pe-4">
                                        <Button 
                                            variant="outline-danger" 
                                            size="sm" 
                                            className="border-0 p-2 d-inline-flex align-items-center justify-content-center rounded-circle"
                                            disabled={deletingId === lead.id}
                                            onClick={() => handleDeleteLead(lead.id, lead.full_name)}
                                            title="Delete Lead Record"
                                        >
                                            {deletingId === lead.id ? (
                                                <Spinner animation="border" size="sm" style={{ width: "14px", height: "14px" }} />
                                            ) : (
                                                <i className="bi bi-trash fs-6"></i>
                                            )}
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </Card.Body>
        </Card>
    );
}