import React, { useState, useEffect } from 'react';
import { Card, Form, Button, ListGroup, Badge, Spinner } from 'react-bootstrap';
import { supabase } from '../../../supabaseClient';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../shared/ui/ToastNotifier';
import { useConfirm } from '../../shared/ui/ConfirmDialog';

// 👇 Added refreshKey to props 👇
export default function AdminCompanyTaskWidget({ clientId, refreshKey }) {
  const { addToast } = useToast();
  const { confirm } = useConfirm();
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);

  // 👇 Added refreshKey to the dependency array 👇
  useEffect(() => {
    fetchTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, refreshKey]); 

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('company_tasks')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setTasks(data || []);
    } catch (err) {
      console.error("Error fetching tasks:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    try {
      const { error } = await supabase.from('company_tasks').insert({
        client_id: clientId,
        message: newTask,
        created_by: user.id
      });

      if (error) throw error;
      setNewTask('');
      fetchTasks(); // Refresh list
    } catch (err) {
      addToast({ title: "Error", message: "Error creating task: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  const handleDelete = async (id) => {
    if(!(await confirm("Delete this task?"))) return;
    const { error } = await supabase.from('company_tasks').delete().eq('id', id);
    if (!error) fetchTasks();
  };

  return (
    <Card className="shadow-sm mb-4 p-0 mt-3">
      <Card.Header className="bg-light fw-bold">
        <i className="bi bi-list-task me-2"></i>
        Tasks for Company
      </Card.Header>
      <Card.Body>
        {/* Add Task Form */}
        <Form onSubmit={handleAddTask} className="mb-3">
          <Form.Group className="d-flex gap-2">
            <Form.Control
              type="text"
              placeholder="e.g. Upload Utility Bill..."
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
            />
            <Button variant="primary" type="submit">Add</Button>
          </Form.Group>
        </Form>

        {/* Task List */}
        {loading ? (
          <div className="text-center py-2"><Spinner size="sm" animation="border"/></div>
        ) : tasks.length === 0 ? (
          <p className="text-muted text-center small mb-0">No active tasks for the company.</p>
        ) : (
          <ListGroup variant="flush">
            {tasks.map(task => (
              <ListGroup.Item key={task.id} className="d-flex justify-content-between align-items-center px-0">
                <div>
                  <div className={task.is_completed ? "text-decoration-line-through text-muted" : "fw-medium"}>
                    {task.message}
                  </div>
                  <small className="text-muted" style={{fontSize: '0.75rem'}}>
                    {new Date(task.created_at).toLocaleDateString()} • 
                    {task.is_completed ? <span className="text-success ms-1">Completed</span> : <span className="text-warning ms-1">Pending</span>}
                  </small>
                </div>
                <Button variant="link" size="sm" className="text-danger p-0" onClick={() => handleDelete(task.id)}>
                  <i className="bi bi-x-lg"></i>
                </Button>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Card.Body>
    </Card>
  );
}