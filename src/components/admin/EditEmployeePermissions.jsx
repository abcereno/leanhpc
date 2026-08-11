import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Card, Row, Col, Button, ButtonGroup, Form, Alert, Spinner, Container } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { PERMISSION_GROUPS } from "../../utils/permissions";
import { PERMISSION_PRESETS } from "../../utils/permissionPresets";
import { useToast } from "../shared/ui/ToastNotifier";

// The employee edit view AddEmployee.jsx's own comment always assumed would
// exist eventually — AdminDirectory.jsx used to be read-only with nowhere to
// change an existing employee's access short of the Supabase dashboard.
// Gated on the `manage_permissions` permission (see App.jsx / AdminDirectory.jsx).
export default function EditEmployeePermissions() {
  const { employeeId } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [employee, setEmployee] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [appliedPreset, setAppliedPreset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, permissions")
        .eq("id", employeeId)
        .maybeSingle();

      if (!isMounted) return;

      if (error || !data) {
        setMsg({ type: "danger", text: error?.message || "Employee not found." });
      } else {
        setEmployee(data);
        setPermissions({ ...(data.permissions || {}) });
      }
      setLoading(false);
    })();
    return () => { isMounted = false; };
  }, [employeeId]);

  const applyPreset = (preset) => {
    setPermissions({ ...preset.permissions });
    setAppliedPreset(preset.key);
  };

  const togglePermission = (key) => {
    setPermissions((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
    setAppliedPreset(null);
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

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ permissions })
      .eq("id", employeeId);

    if (error) {
      setMsg({ type: "danger", text: "Failed to save: " + error.message });
      addToast({ title: "Save Failed", message: error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } else {
      setMsg({ type: "success", text: "Permissions saved." });
      addToast({ title: "Permissions Saved", message: employee?.full_name ? `Updated ${employee.full_name}'s permissions.` : "Updated.", variant: "success", icon: "bi-shield-check" });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Container className="text-center mt-5">
        <Spinner animation="border" />
      </Container>
    );
  }

  if (!employee) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">{msg?.text || "Employee not found."}</Alert>
        <Link to="/admin-directory">&larr; Back to Employee Directory</Link>
      </Container>
    );
  }

  const checkedCount = Object.values(permissions).filter(Boolean).length;

  return (
    <Card className="shadow-sm border-0">
      <Card.Body>
        <div className="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-2">
          <div>
            <h4 className="fw-bold mb-1">Edit Permissions</h4>
            <div className="text-muted">{employee.full_name} &mdash; {employee.email}</div>
          </div>
          <Button variant="outline-secondary" size="sm" onClick={() => navigate("/admin-directory")}>
            &larr; Back to Directory
          </Button>
        </div>

        {msg && <Alert variant={msg.type}>{msg.text}</Alert>}

        <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div className="text-muted small">{checkedCount} of {PERMISSION_GROUPS.reduce((n, g) => n + g.permissions.length, 0)} checked</div>
        </div>

        <div className="mb-4">
          <div className="text-muted small text-uppercase fw-bold mb-2">
            Presets — click to replace the checkboxes below, then adjust as needed
          </div>
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
                      id={`edit-perm-${p.key}`}
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

        <Button variant="primary" onClick={handleSave} disabled={saving} className="w-100 fw-bold mt-2">
          {saving ? <Spinner size="sm" /> : "Save Permissions"}
        </Button>
      </Card.Body>
    </Card>
  );
}
