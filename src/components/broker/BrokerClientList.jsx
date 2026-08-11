import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useCompanyAuth } from '../../context/CompanyAuthContext'; 
import { Table, Badge, Form, InputGroup, Row, Col, Spinner, Button } from 'react-bootstrap';
import ClientSummaryModal from '../admin/client-profile/modals/ClientSummaryModal';
import FunderEligibilityModal from '../shared/ui/FunderEligibilityModal';

export default function BrokerClientList({ companyId }) {
  const { user, isAgent } = useCompanyAuth(); 
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Summary Modal State
  const [showSummary, setShowSummary] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);

  // Eligibility Modal State
  const [showEligibility, setShowEligibility] = useState(false);
  const [eligibilityClient, setEligibilityClient] = useState(null);

  // Handler to open Eligibility Modal
  const handleOpenEligibility = (client) => {
    setEligibilityClient(client);
    setShowEligibility(true);
  };

  useEffect(() => {
    if (!companyId) return;

    const fetchClients = async () => {
      setLoading(true);

      const buildQuery = (fields) => {
        let q = supabase.from('clients').select(fields).eq('company_id', companyId);
        if (isAgent && user?.id) q = q.eq('agent_id', user.id);
        return q.order('created_at', { ascending: false });
      };

      const FIELDS = `
            id, full_name, created_at, status_stage,
            is_paid, paid_at,
            progress,
            all_completed,
            date_completed,
            dispute_method,
            service_id,
            counter,
            start_inquiries,
            start_date
        `;

      let { data, error } = await buildQuery(FIELDS);

      // Defensive: sql/add_services.sql may not have been run yet — degrade
      // gracefully rather than blanking out this whole list.
      if (error && /service_id/i.test(error.message || "")) {
        console.warn("clients.service_id not found (run sql/add_services.sql) — falling back without it.");
        ({ data, error } = await buildQuery(FIELDS.replace(/,\s*service_id/, "")));
      }

      if (error) {
        console.error("Error fetching broker clients:", error);
      } else {
        setClients(data || []);
      }
      setLoading(false);
    };

    fetchClients();
  }, [companyId, isAgent, user?.id]);

  const filteredClients = clients.filter(c => 
    c.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-3">
      <Row className="mb-3">
        <Col md={4}>
          <InputGroup>
            <InputGroup.Text className="bg-light border-end-0">
                <i className="bi bi-search text-muted"></i>
            </InputGroup.Text>
            <Form.Control 
                className="border-start-0 ps-0 bg-light" 
                placeholder="Search referrals..." 
                value={search} 
                onChange={e => setSearch(e.target.value)} 
            />
          </InputGroup>
        </Col>
      </Row>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" variant="primary" /></div>
      ) : (
        <div className="table-responsive">
          <Table hover className="align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="ps-3">Client Name</th>
                <th>Status</th>
                <th style={{width:'25%'}}>Progress</th>
                <th>Date Added</th>
                
                {/* [UPDATED] Added minWidth to prevent button wrapping */}
                <th className="text-center" style={{ minWidth: "180px" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length > 0 ? (
                filteredClients.map((client) => {
                  const progressPercent = client.progress 
                    ? (client.progress > 1 ? client.progress : Math.round(client.progress * 100)) 
                    : 0;

                  let statusBadge;
                  if (client.all_completed) {
                      statusBadge = <Badge bg="success">Completed</Badge>;
                  } else if (client.is_paid) {
                      statusBadge = <Badge bg="primary">In Progress</Badge>;
                  } else {
                      statusBadge = <Badge bg="secondary">Pending Setup</Badge>;
                  }

                  return (
                    <tr key={client.id}>
                      <td className="fw-bold ps-3 text-dark">
                        {client.full_name}
                      </td>
                      <td>{statusBadge}</td>
                      <td>
                        <div className="d-flex align-items-center">
                            <div className="flex-grow-1 me-2" style={{height:'8px', backgroundColor:'#e9ecef', borderRadius:'4px'}}>
                                <div 
                                    className={`h-100 rounded-pill ${progressPercent >= 100 ? 'bg-success' : 'bg-primary'}`} 
                                    style={{width: `${progressPercent}%`, transition:'width 0.5s'}}
                                />
                            </div>
                            <span className="small fw-bold text-muted">{progressPercent}%</span>
                        </div>
                      </td>
                      <td className="text-muted small">
                        {new Date(client.created_at).toLocaleDateString()}
                      </td>
                      
                      {/* Actions Column */}
                      <td className="text-center">
                        <div className="d-flex justify-content-center gap-2">
                            {/* Summary Button */}
                            <Button 
                                variant="outline-secondary" 
                                size="sm" 
                                className="btn-sm px-3 shadow-sm rounded-pill"
                                onClick={() => {
                                    setSelectedClient(client);
                                    setShowSummary(true);
                                }}
                                title="View Summary"
                                style={{ whiteSpace: "nowrap" }}
                            >
                                <i className="bi bi-eye me-1"></i> View
                            </Button>

                            {/* Eligibility Button */}
                            <Button 
                                variant="outline-success" 
                                size="sm" 
                                className="btn-sm px-2 shadow-sm rounded-pill"
                                onClick={() => handleOpenEligibility(client)}
                                title="Check Funding Eligibility"
                            >
                                <i className="bi bi-bank2"></i>
                            </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                    <td colSpan="5" className="text-center py-5 text-muted">
                        <i className="bi bi-folder2-open display-6 d-block mb-2 opacity-50"></i>
                        No referrals found.
                    </td>
                </tr>
              )}
            </tbody>
          </Table>
        </div>
      )}

      {/* Summary Modal */}
      <ClientSummaryModal 
        show={showSummary} 
        onClose={() => setShowSummary(false)} 
        client={selectedClient} 
      />

      {/* Eligibility Modal */}
      <FunderEligibilityModal
        show={showEligibility}
        onHide={() => setShowEligibility(false)}
        client={eligibilityClient}
      />
    </div>
  );
}