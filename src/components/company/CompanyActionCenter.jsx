import React, { useEffect, useState } from 'react';
import { Card, ListGroup, Badge, Spinner } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useCompanyAuth } from '../../context/CompanyAuthContext';

export default function CompanyActionCenter({ refreshKey }) {
  const { companyId, isAgent, user } = useCompanyAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const fetchTasks = async () => {
      try {
        setLoading(true);
        const newTasks = [];

        // --- 1. Unpaid Clients ONLY ---
        let unpaidQuery = supabase
          .from('clients')
          .select('id, full_name, created_at, agent_id')
          .eq('company_id', companyId)
          .eq('is_paid', false);

        if (isAgent && user?.id) {
            unpaidQuery = unpaidQuery.eq('agent_id', user.id);
        }

        const { data: unpaidClients } = await unpaidQuery;

        if (unpaidClients) {
          unpaidClients.forEach(c => {
            newTasks.push({
              id: `pay-${c.id}`,
              type: 'payment',
              title: 'Payment Pending',
              desc: `${c.full_name} has not been marked as paid.`,
              link: `/company-portal/${companyId}/clients/${c.id}`,
              date: c.created_at,
              icon: 'bi-currency-dollar',
              color: 'text-warning' // Gold/Yellow for money
            });
          });
        }

        // Sort by date descending (Newest first)
        newTasks.sort((a, b) => new Date(b.date) - new Date(a.date));
        setTasks(newTasks);

      } catch (err) {
        console.error("Error fetching tasks", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, [companyId, refreshKey, isAgent, user?.id]);

  if (loading) return <div className="py-3 text-center"><Spinner size="sm" animation="border" variant="primary"/></div>;

  return (
    <Card className="shadow-sm border-0 h-100">
      <Card.Header className="bg-white border-bottom pt-3 d-flex justify-content-between align-items-center">
        <h6 className="fw-bold mb-0 text-warning">
          <i className="bi bi-wallet2 me-2"></i>
          Pending Payments
        </h6>
        {tasks.length > 0 && <Badge bg="warning" text="dark" pill>{tasks.length}</Badge>}
      </Card.Header>
      
      <Card.Body className="p-0" style={{ maxHeight: '350px', overflowY: 'auto' }}>
        {tasks.length === 0 ? (
          <div className="text-center py-5 text-muted">
            <i className="bi bi-check-circle-fill display-4 text-success mb-3 opacity-50"></i>
            <p className="mb-0 fw-medium">All Paid Up!</p>
            <small>No pending payments found.</small>
          </div>
        ) : (
          <ListGroup variant="flush">
            {tasks.map(task => (
              <ListGroup.Item 
                key={task.id} 
                action 
                onClick={() => navigate(task.link)} 
                className="border-0 border-bottom py-3 hover-lift"
              >
                <div className="d-flex w-100 justify-content-between align-items-center mb-1">
                  <div className={`fw-bold small ${task.color} d-flex align-items-center`}>
                    <i className={`bi ${task.icon} me-2 fs-6`}></i>
                    {task.title}
                  </div>
                  <small className="text-muted" style={{fontSize: '0.7rem'}}>
                    {new Date(task.date).toLocaleDateString()}
                  </small>
                </div>
                <p className="mb-1 small text-secondary">{task.desc}</p>
                <div className="d-flex align-items-center">
                   <small className="text-primary fw-bold" style={{fontSize: '0.75rem'}}>
                     Mark Paid <i className="bi bi-arrow-right ms-1"></i>
                   </small>
                </div>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}