import React, { useEffect, useState } from 'react';
import { Container, Card, Table, Button, Badge, Tabs, Tab, Spinner, Alert } from 'react-bootstrap';
import { supabase } from '../../supabaseClient';

// Define your webhook URL here
const WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/99d2a895-5978-474b-8667-464e4a0c780b"; 

export default function PendingApprovals() {
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [affiliates, setAffiliates] = useState([]);
  const [message, setMessage] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [resClients, resCompanies, resAffiliates] = await Promise.all([
        supabase.from('clients').select('*').eq('status', 'pending'),
        supabase.from('companies').select('*').eq('status', 'pending'),
        supabase.from('affiliates').select('*').eq('status', 'pending')
      ]);

      setClients(resClients.data || []);
      setCompanies(resCompanies.data || []);
      setAffiliates(resAffiliates.data || []);
    } catch (err) {
      console.error("Error fetching pending:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAction = async (table, item, action) => {
    if (!window.confirm(`Are you sure you want to ${action} this user?`)) return;
    
    setApproving(item.id);
    setMessage(null);

    try {
      if (action === 'approve') {
        // 1. Update Database Status
        const { error } = await supabase
          .from(table)
          .update({ status: 'active' })
          .eq('id', item.id);
          
        if (error) throw error;

        // 2. Fire Webhook
        try {
          await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event: 'user_approved',
              table_type: table,
              user_id: item.id,
              name: item.full_name || item.company_name || item.affiliate_name,
              email: item.email || item.contact_email,
              phone: item.phone || item.contact_phone || '',
              approved_at: new Date().toISOString()
            })
          });
        } catch (webhookErr) {
            console.error("Webhook failed to send, but database was updated:", webhookErr);
            // We intentionally don't throw this error to the user, as the approval still succeeded in the database.
        }

        setMessage({ type: 'success', text: 'User approved successfully!' });
        
      } else {
        // Reject - Delete the record
        const { error } = await supabase.from(table).delete().eq('id', item.id);
        if (error) throw error;
        setMessage({ type: 'info', text: 'User rejected and removed.' });
      }
      
      await fetchData();
    } catch (err) {
      setMessage({ type: 'danger', text: err.message });
    } finally {
      setApproving(null);
    }
  };

  const renderTable = (data, table) => (
    <div className="table-responsive">
      <Table hover className="align-middle">
        <thead className="bg-light">
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Date</th>
            <th className="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr><td colSpan="5" className="text-center py-4 text-muted">No pending approvals</td></tr>
          ) : (
            data.map(item => (
              <tr key={item.id}>
                <td className="fw-bold">{item.full_name || item.company_name || item.affiliate_name}</td>
                <td>{item.email || item.contact_email}</td>
                <td>{item.phone || item.contact_phone || '-'}</td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
                <td className="text-end">
                  <Button 
                    variant="success" 
                    size="sm" 
                    className="me-2"
                    disabled={approving === item.id}
                    onClick={() => handleAction(table, item, 'approve')}
                  >
                    {approving === item.id ? <Spinner size="sm" /> : <i className="bi bi-check-lg"></i>} Approve
                  </Button>
                  <Button 
                    variant="danger" 
                    size="sm"
                    disabled={approving === item.id}
                    onClick={() => handleAction(table, item, 'reject')}
                  >
                    <i className="bi bi-x-lg"></i>
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );

  return (
    <Container className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h3 className="fw-bold"><i className="bi bi-person-check-fill me-2 text-primary"></i>Pending Approvals</h3>
        <Button variant="outline-secondary" size="sm" onClick={fetchData}><i className="bi bi-arrow-clockwise"></i> Refresh</Button>
      </div>

      {message && <Alert variant={message.type} onClose={() => setMessage(null)} dismissible>{message.text}</Alert>}

      <Card className="shadow-sm border-0">
        <Card.Body className="p-0">
          <Tabs defaultActiveKey="clients" className="nav-tabs-custom px-3 pt-3">
            <Tab eventKey="clients" title={<>Individuals <Badge bg="secondary" pill className="ms-1">{clients.length}</Badge></>}>
              {loading ? <div className="p-5 text-center"><Spinner animation="border" /></div> : renderTable(clients, 'clients')}
            </Tab>
            <Tab eventKey="companies" title={<>Partners <Badge bg="secondary" pill className="ms-1">{companies.length}</Badge></>}>
              {loading ? <div className="p-5 text-center"><Spinner animation="border" /></div> : renderTable(companies, 'companies')}
            </Tab>
            <Tab eventKey="affiliates" title={<>Affiliates <Badge bg="secondary" pill className="ms-1">{affiliates.length}</Badge></>}>
              {loading ? <div className="p-5 text-center"><Spinner animation="border" /></div> : renderTable(affiliates, 'affiliates')}
            </Tab>
          </Tabs>
        </Card.Body>
      </Card>
    </Container>
  );
}