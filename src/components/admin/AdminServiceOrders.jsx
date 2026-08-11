import React, { useState, useEffect } from 'react';
import { Card, Table, Badge, Button, Spinner, Form } from 'react-bootstrap';
import { supabase } from "../../supabaseClient"; // Adjust path as needed
import { useToast } from "../shared/ui/ToastNotifier";

export default function AdminServiceOrders() {
  const { addToast } = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  // Fetch the orders and join with the clients table to get their name/email
  const fetchOrders = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('client_service_requests')
        .select(`
          *,
          clients ( full_name, email )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Supabase Error:", error.message);
        throw error;
      }
      
      setOrders(data || []);
    } catch (err) {
      console.error("Error fetching orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();

    // Listen for new orders coming in from Stripe in real-time!
    const channel = supabase
      .channel('admin-new-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'client_service_requests' }, 
        () => {
          fetchOrders(); 
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Allow the admin to update the status
  const updateStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      const { error } = await supabase
        .from('client_service_requests')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      
      // Update local state to reflect change instantly
      setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err) {
      console.error("Error updating status:", err);
      addToast({ title: "Update Failed", message: "Failed to update status.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'paid_in_queue': return <Badge bg="danger">New Order (Paid)</Badge>;
      case 'processing': return <Badge bg="warning" text="dark">Processing</Badge>;
      case 'completed': return <Badge bg="success">Completed</Badge>;
      default: return <Badge bg="secondary">{status || 'Unknown'}</Badge>;
    }
  };

  if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" /></div>;

  return (
    <Card className="bg-dark text-white border-secondary shadow-sm">
      <Card.Header className="border-bottom border-secondary py-3">
        <h4 className="mb-0 fw-bold"><i className="bi bi-inbox-fill text-primary me-2"></i> Service Fulfillment Queue</h4>
      </Card.Header>
      <Card.Body className="p-0">
        <Table responsive hover variant="dark" className="mb-0 align-middle">
          <thead className="text-muted">
            <tr>
              <th>Date</th>
              <th>Client</th>
              <th>Strategy</th>
              <th>Add-ons Selected</th>
              <th>Scope</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan="8" className="text-center py-4 text-muted">No service orders yet.</td></tr>
            ) : (
              orders.map((order) => {
                // Safely handle null data based on the SQL query results
                const clientName = order.clients?.full_name || 'Unknown Client';
                const clientEmail = order.clients?.email || 'No email';
                const strategyName = order.strategy === 'consumerLaw' ? 'Consumer Law' : 'Factual';
                const itemCount = order.total_items_disputed || 0;
                const safeAmount = Number(order.amount_paid || 0).toFixed(2);

                return (
                  <tr key={order.id}>
                    <td>{new Date(order.created_at).toLocaleDateString()}</td>
                    <td>
                      <strong>{clientName}</strong><br/>
                      <small className="text-muted">{clientEmail}</small>
                    </td>
                    <td>
                      {order.strategy === 'consumerLaw' ? (
                          <Badge bg="info" text="dark">{strategyName}</Badge>
                      ) : (
                          <Badge bg="secondary">{strategyName}</Badge>
                      )}
                    </td>
                    <td>
                      <div className="d-flex flex-column gap-1 align-items-start">
                          {order.includes_address_update && <Badge bg="dark" className="border border-secondary">Address Update</Badge>}
                          {order.includes_lexis_nexis && <Badge bg="dark" className="border border-secondary">LexisNexis</Badge>}
                          {order.includes_inquiries && <Badge bg="dark" className="border border-secondary">Dispute Inquiries</Badge>}
                          {!order.includes_address_update && !order.includes_lexis_nexis && !order.includes_inquiries && <span className="text-muted small">None</span>}
                      </div>
                    </td>
                    <td>
                      {order.scope === 'all' ? 'All Accounts' : 'Top 5 Accounts'}<br/>
                      <small className="text-muted">({itemCount} items)</small>
                    </td>
                    <td className="fw-bold text-success">${safeAmount}</td>
                    <td>{getStatusBadge(order.status)}</td>
                    <td style={{ minWidth: "150px" }}>
                      {updatingId === order.id ? (
                        <Spinner animation="border" size="sm" variant="primary" />
                      ) : (
                        <Form.Select 
                          size="sm" 
                          className="bg-dark text-white border-secondary shadow-none"
                          value={order.status || 'paid_in_queue'}
                          onChange={(e) => updateStatus(order.id, e.target.value)}
                        >
                          <option value="paid_in_queue">Paid - In Queue</option>
                          <option value="processing">Currently Processing</option>
                          <option value="completed">Completed</option>
                        </Form.Select>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </Card.Body>
    </Card>
  );
}