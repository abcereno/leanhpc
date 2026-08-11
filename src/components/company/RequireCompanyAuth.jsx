import { useState } from "react";
import { useLocation, useNavigate, Navigate, Outlet, useParams } from "react-router-dom";
import { useCompanyAuth } from "../../context/CompanyAuthContext";
import { useAuth } from "../../context/AuthContext";
import { Spinner, Container } from "react-bootstrap";
import SubscriptionLocked from "../shared/access/SubscriptionLocked";
import CompanyPaymentModal from "./modals/CompanyPaymentModal";

export default function RequireCompanyAuth() {
  const { user, loadingAuth, signOut } = useAuth();
  const { companyId, companyName, isSubscriptionActive, loading: loadingCompany } = useCompanyAuth();
  const { companyId: urlCompanyId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  if (loadingAuth || loadingCompany) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" variant="primary" />
      </Container>
    );
  }

  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;

  if (!companyId || (urlCompanyId && companyId !== urlCompanyId)) {
    return <Navigate to="/" replace />;
  }

  // Full lock: an admin-managed flag (companies.is_subscription_active, set
  // via AddCompanyForm's "Manage Partner Subscriptions" tab) gates the whole
  // portal instead of just showing a banner — company has paid or they see
  // nothing but this screen. "Upload Payment Receipt" reuses the same
  // Zelle-receipt + payment_verifications pattern as the individual portal
  // (see CompanyPaymentModal.jsx), reviewed inline in AddCompanyForm.jsx.
  if (!isSubscriptionActive) {
    return (
      <>
        <SubscriptionLocked
          message="Your company's subscription is currently inactive. Upload a payment receipt below, or contact your account representative to reactivate access."
          actionLabel="Upload Payment Receipt"
          onAction={() => setShowPaymentModal(true)}
          onLogout={() => signOut().then(() => navigate('/login'))}
        />
        <CompanyPaymentModal
          show={showPaymentModal}
          onHide={() => setShowPaymentModal(false)}
          companyId={companyId}
          companyName={companyName}
        />
      </>
    );
  }

  return <Outlet />;
}