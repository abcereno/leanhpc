import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { Spinner, Container } from "react-bootstrap";

export default function RequireAdmin() {
  const { isAuthenticated, loadingAuth, isAdmin, isOwner, isSubAdmin } = useAuth();

  if (loadingAuth) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  // Check if logged in AND has an Admin-like role.
  // This effectively blocks Affiliates/Companies from Admin pages.
  const hasAdminAccess = isAuthenticated && (isAdmin || isOwner || isSubAdmin);

  if (!hasAdminAccess) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}