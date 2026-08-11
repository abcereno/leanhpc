import React, { useState, useEffect } from 'react';
import { Card, Form, Alert, Spinner } from 'react-bootstrap';
import { supabase } from '../../supabaseClient';
import { useToast } from '../shared/ui/ToastNotifier';

export default function CompanyClientTasks({ clientId }) {
  const { addToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTasks();
  }, [clientId]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('is_completed', { ascending: true }) // Pending first
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTasks(data || []);
    } catch (err) {
      console.error("Error loading tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (taskId, currentStatus) => {
    // Optimistic update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, is_completed: !currentStatus } : t));
    
    const { error } = await supabase
      .from('company_tasks')
      .update({ is_completed: !currentStatus })
      .eq('id', taskId);
      
    if (error) {
      addToast({ title: "Update Failed", message: "Could not update the task.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      fetchTasks(); // Revert on error
    }
  };

  if (loading) return <Spinner size="sm" animation="border" />;
  if (tasks.length === 0) return null; // Don't show if no tasks

  return (
    <Card className="shadow-sm border-0 mb-4">
      <Card.Header className="bg-warning bg-opacity-10 text-warning fw-bold border-0">
        <i className="bi bi-exclamation-triangle-fill me-2"></i>
        Admin Requests & Notes
      </Card.Header>
      <Card.Body>
        {tasks.map(task => (
          <Form.Check 
            key={task.id}
            type="checkbox"
            id={`task-${task.id}`}
            className="mb-2 d-flex align-items-center gap-2"
          >
            <Form.Check.Input 
              type="checkbox" 
              checked={task.is_completed}
              onChange={() => toggleTask(task.id, task.is_completed)}
            />
            <Form.Check.Label className={task.is_completed ? "text-decoration-line-through text-muted" : "fw-medium"}>
              {task.message}
            </Form.Check.Label>
          </Form.Check>
        ))}
      </Card.Body>
    </Card>
  );
}