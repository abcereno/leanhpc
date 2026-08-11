import React, { useState } from 'react';
import { Form, Button, Card, Alert, Spinner, Row, Col, ButtonGroup } from 'react-bootstrap';
import { supabase } from '../../supabaseClient';
import { PERMISSION_GROUPS } from '../../utils/permissions';
import { PERMISSION_PRESETS } from '../../utils/permissionPresets';
import { useToast } from '../shared/ui/ToastNotifier';

export default function AddEmployee() {
  const { addToast } = useToast();
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'staff' });
  // Permission-based access (see utils/permissions.js) replaces the old
  // 4-option role dropdown. Picking a preset below just prefills these
  // checkboxes — it's a one-time convenience, not a live-linked group, so
  // editing a box afterward (here or later on the Edit Employee page) never
  // affects anyone else and never gets silently reset by this preset list
  // changing in the future.
  const [permissions, setPermissions] = useState({});
  const [appliedPreset, setAppliedPreset] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const applyPreset = (preset) => {
    setPermissions({ ...preset.permissions });
    setAppliedPreset(preset.key);
  };

  const togglePermission = (key) => {
    setPermissions((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = true;
      }
      return next;
    });
    setAppliedPreset(null); // no longer exactly matches any preset once hand-edited
  };

  const toggleGroup = (group, checkAll) => {
    setPermissions((prev) => {
      const next = { ...prev };
      group.permissions.forEach((p) => {
        if (checkAll) next[p.key] = true;
        else delete next[p.key];
      });
      return next;
    });
    setAppliedPreset(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    try {
      const { error } = await supabase.rpc('create_staff_member', {
        target_email: formData.email.trim().toLowerCase(),
        target_password: formData.password,
        target_name: formData.name,
        target_role: formData.role,
        target_permissions: permissions,
      });

      if (error) throw error;
      setMsg({ type: 'success', text: `Successfully created employee: ${formData.email}` });
      addToast({ title: "Employee Created", message: `${formData.email} can now log in.`, variant: "success", icon: "bi-person-check-fill" });
      setFormData({ email: '', password: '', name: '', role: 'staff' });
      setPermissions({});
      setAppliedPreset(null);
    } catch (err) {
      setMsg({ type: 'danger', text: err.message });
      addToast({ title: "Failed to Create Employee", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setLoading(false);
    }
  };

  const checkedCount = Object.values(permissions).filter(Boolean).length;

  return (
    <Card className="shadow-sm border-0">
      <Card.Body>
        <h4 className="fw-bold mb-4">Add New Staff Member</h4>
        {msg && <Alert variant={msg.type}>{msg.text}</Alert>}

        <Form onSubmit={handleSubmit}>
          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Full Name</Form.Label>
                <Form.Control
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Email Address</Form.Label>
                <Form.Control
                  type="email" required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Temporary Password</Form.Label>
                <Form.Control
                  type="password" required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>Account Type</Form.Label>
                <Form.Select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                >
                  <option value="staff">Staff Member</option>
                  <option value="developer">Developer (internal engineering)</option>
                </Form.Select>
                <Form.Text className="text-muted">
                  This no longer determines what they can access — that's entirely the
                  checkboxes below. "Developer" only switches their sidebar into the
                  stripped-down engineering view.
                </Form.Text>
              </Form.Group>
            </Col>
          </Row>

          <hr className="my-4" />

          <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <div>
              <h5 className="fw-bold mb-1">Permissions</h5>
              <div className="text-muted small">{checkedCount} of {PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0)} checked</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="text-muted small text-uppercase fw-bold mb-2">Presets — click to prefill, then adjust as needed</div>
            <div className="d-flex flex-wrap gap-2">
              {PERMISSION_PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  size="sm"
                  variant={appliedPreset === preset.key ? "primary" : "outline-secondary"}
                  onClick={() => applyPreset(preset)}
                  title={preset.description}
                  type="button"
                >
                  {preset.label}
                </Button>
              ))}
              <Button size="sm" variant="outline-danger" type="button" onClick={() => { setPermissions({}); setAppliedPreset(null); }}>
                Clear All
              </Button>
            </div>
          </div>

          <Row>
            {PERMISSION_GROUPS.map((group) => {
              const allChecked = group.permissions.every((p) => permissions[p.key]);
              const someChecked = group.permissions.some((p) => permissions[p.key]);
              return (
                <Col md={6} key={group.key} className="mb-4">
                  <div className="border rounded-3 p-3 h-100">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div className="fw-bold">{group.label}</div>
                      <ButtonGroup size="sm">
                        <Button
                          variant={allChecked ? "secondary" : "outline-secondary"}
                          type="button"
                          onClick={() => toggleGroup(group, true)}
                        >
                          All
                        </Button>
                        <Button
                          variant="outline-secondary"
                          type="button"
                          onClick={() => toggleGroup(group, false)}
                          disabled={!someChecked}
                        >
                          None
                        </Button>
                      </ButtonGroup>
                    </div>
                    {group.permissions.map((p) => (
                      <Form.Check
                        key={p.key}
                        type="checkbox"
                        id={`perm-${p.key}`}
                        label={p.label}
                        checked={!!permissions[p.key]}
                        onChange={() => togglePermission(p.key)}
                        className="mb-1"
                      />
                    ))}
                  </div>
                </Col>
              );
            })}
          </Row>

          <Button variant="primary" type="submit" disabled={loading} className="w-100 fw-bold mt-2">
            {loading ? <Spinner size="sm" /> : "Create Staff Account"}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
}
