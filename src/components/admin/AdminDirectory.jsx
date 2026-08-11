import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Card, Container, Row, Col, Spinner, Alert, Button } from "react-bootstrap";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function AdminDirectory() {
  const { hasPermission } = useAuth();
  const canManagePermissions = hasPermission("manage_permissions");
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchAdmins = async () => {
      const { data, error } = await supabase
.from("profiles")
.select("id, full_name, email, role, created_at, profile_picture_url")
        .order("created_at", { ascending: true });

      if (error) {
        setError("Failed to load admins");
        console.error(error);
      } else {
        setAdmins(data);
      }

      setLoading(false);
    };

    fetchAdmins();
  }, []);

  if (loading) {
    return (
      <Container className="text-center mt-5">
        <Spinner animation="border" />
        <p className="mt-3">Loading admin list...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <h3 className="mb-4">Employees Directory</h3>
      <Row xs={1} md={2} lg={3} className="g-4">
        {admins.map((admin) => (
          <Col key={admin.id}>
            <Card className="h-100 shadow-sm border-0">
              <Card.Body className="d-flex align-items-center gap-3">
                <Link to={`/admin/${admin.id}`} className="text-decoration-none text-dark d-flex align-items-center gap-3 flex-grow-1">
                  <img
                    src={admin.profile_picture_url || "/default-avatar.png"}
                    alt="Profile"
                    className="rounded-circle"
                    style={{ width: "60px", height: "60px", objectFit: "cover" }}
                  />
                  <div>
                    <h5 className="mb-1">{admin.full_name}</h5>
                    <p className="mb-1 text-muted">{admin.email}</p>
                    <p className="mb-1"><strong>Role:</strong> {admin.role}</p>
                    <small className="text-muted">
                      Joined: {new Date(admin.created_at).toLocaleDateString()}
                    </small>
                  </div>
                </Link>
                {canManagePermissions && (
                  <Button
                    as={Link}
                    to={`/admin-directory/${admin.id}/permissions`}
                    variant="outline-primary"
                    size="sm"
                  >
                    Permissions
                  </Button>
                )}
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
}
