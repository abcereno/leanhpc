// src/components/AffiliatePortal/RequireAffiliateAuth.jsx
import { useLocation, Navigate, Outlet } from "react-router-dom";
import { Spinner, Container, Alert } from "react-bootstrap";
import { useAffiliateAuth } from "../../context/AffiliateAuthContext";

export default function RequireAffiliateAuth() {
  const { affiliateId, loading, error } = useAffiliateAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Container
        className="d-flex flex-column justify-content-center align-items-center"
        style={{ height: "100vh" }}
      >
        <Spinner animation="border" variant="primary" />
        <div className="mt-3 text-muted small">
          Checking affiliate access…
        </div>
      </Container>
    );
  }

  if (error || !affiliateId) {
    // optional: show one-frame message before redirecting
    return (
      <Navigate
        to="/affiliate-portal/login"
        state={{ from: location, reason: error || "no_affiliate_id" }}
        replace
      />
    );
  }

  return <Outlet />;
}
