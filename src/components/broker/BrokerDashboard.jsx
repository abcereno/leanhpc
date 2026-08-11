import React, { useState, useEffect } from "react";
import { Container, Row, Col, Card, Button, Spinner, Modal, Stack } from "react-bootstrap";
import { useCompanyAuth } from "../../context/CompanyAuthContext"; 
import { supabase } from "../../supabaseClient";
import BrokerClientList from "./BrokerClientList";
import BrokerAddClientForm from "./BrokerAddClientForm"; 

// 👇 UPDATED: Import the new Broker-specific Add Agent Modal
import BrokerAddAgentModal from "./BrokerAddAgentModal"; 

export default function BrokerDashboard() {
  const { companyId, user, isAgent, isCompanyAdmin, loading: authLoading } = useCompanyAuth(); 
  
  const [metrics, setMetrics] = useState({ total: 0, active: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [showAddAgentModal, setShowAddAgentModal] = useState(false);

  useEffect(() => {
    if (!companyId) return;

    const fetchMetrics = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("clients")
          .select("id, all_completed")
          .eq("company_id", companyId);

        // If it's an Agent, ONLY count their specific referrals
        if (isAgent && user?.id) {
            query = query.eq('agent_id', user.id);
        }

        const { data, error } = await query;

        if (error) throw error;

        const total = data.length;
        const completed = data.filter(c => c.all_completed).length;
        const active = total - completed;

        setMetrics({ total, active, completed });
      } catch (err) {
        console.error("Error loading stats:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [companyId, isAgent, user?.id, refreshTrigger]);

  const handleClientAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };
  if (authLoading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

  return (
    <Container fluid className="py-4">
      
      {/* HEADER SECTION */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
        <div>
          <h2 className="fw-bold mb-0 text-primary">
            <i className="bi bi-speedometer2 me-2"></i>
            {isAgent ? "Agent Dashboard" : "Broker Portal"}
          </h2>
          <p className="text-muted mb-0">
            Welcome, {user?.user_metadata?.full_name || 'Partner'}
          </p>
        </div>
        
        <Stack direction="horizontal" gap={3} className="flex-wrap">
          {/* Only show "Add Agent" if the user is the Company Admin */}
          {isCompanyAdmin && (
            <Button 
              variant="outline-primary" 
              size="lg" 
              className="shadow-sm d-flex align-items-center bg-white" 
              onClick={() => setShowAddAgentModal(true)}
            >
              <i className="bi bi-person-badge-plus me-2"></i> Add Agent
            </Button>
          )}

          <Button 
            variant="primary" 
            size="lg" 
            className="shadow-sm d-flex align-items-center" 
            onClick={() => setShowAddModal(true)}
          >
            <i className="bi bi-person-plus-fill me-2"></i> New Referral
          </Button>
        </Stack>
      </div>

      {/* METRICS */}
      <Row className="g-3 mb-4">
        <Col md={4}>
          <Card className="h-100 border-0 shadow-sm bg-primary text-white">
            <Card.Body className="d-flex align-items-center justify-content-between">
              <div>
                <h6 className="opacity-75 mb-1">Total Referrals</h6>
                <h2 className="fw-bold mb-0">{loading ? "..." : metrics.total}</h2>
              </div>
              <i className="bi bi-people-fill fs-1 opacity-50"></i>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="h-100 border-0 shadow-sm border-start border-4 border-info">
            <Card.Body className="d-flex align-items-center justify-content-between">
              <div>
                <h6 className="text-muted mb-1">Active Cases</h6>
                <h2 className="fw-bold text-info mb-0">{loading ? "..." : metrics.active}</h2>
              </div>
              <i className="bi bi-hourglass-split fs-1 text-info opacity-25"></i>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="h-100 border-0 shadow-sm border-start border-4 border-success">
            <Card.Body className="d-flex align-items-center justify-content-between">
              <div>
                <h6 className="text-muted mb-1">Completed</h6>
                <h2 className="fw-bold text-success mb-0">{loading ? "..." : metrics.completed}</h2>
              </div>
              <i className="bi bi-check-circle-fill fs-1 text-success opacity-25"></i>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Card className="border-0 shadow-sm">
        <Card.Body className="p-0">
          <BrokerClientList companyId={companyId} key={refreshTrigger} />
        </Card.Body>
      </Card>

      {/* --- MODALS --- */}
      
      {/* Referral Modal */}
      <Modal show={showAddModal} onHide={() => setShowAddModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Submit New Referral</Modal.Title>
        </Modal.Header>
        <Modal.Body>
           <BrokerAddClientForm companyId={companyId} onSuccess={handleClientAdded} /> 
        </Modal.Body>
      </Modal>

      {/* 👇 UPDATED: Broker Add Agent Modal 👇 */}
      <BrokerAddAgentModal 
        show={showAddAgentModal}
        handleClose={() => setShowAddAgentModal(false)}
      />

    </Container>
  );
}