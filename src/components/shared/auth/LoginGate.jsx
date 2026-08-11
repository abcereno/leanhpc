import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner, Container } from "react-bootstrap";
import { useAuth } from "../../../context/AuthContext";
import { useCompanyAuth } from "../../../context/CompanyAuthContext";
import { useAffiliateAuth } from "../../../context/AffiliateAuthContext";
import LandingPage from "../public/LandingPage"; // <--- Imports the new page

export default function LoginGate() {
  const navigate = useNavigate();
  const { user, loadingAuth, hasAnyPermission } = useAuth();
  // Permission-based redirect targets (utils/permissions.js) — replaces the
  // old isCustomerService/isAdmin role checks. Anyone with a document
  // permission but no broader staff access goes to the docs-only console;
  // anyone with any other staff permission goes to the main admin shell.
  const isDocsOnlyStaff = hasAnyPermission(['view_documents', 'upload_documents', 'approve_documents', 'reject_documents', 'generate_cfpb_package', 'generate_postalocity_package', 'download_documents']);
  const isStaff = hasAnyPermission(['view_clients', 'view_call_queue', 'count_inquiries', 'view_employees', 'view_partners']) || isDocsOnlyStaff;
  const { companyId, loading: loadingCompany } = useCompanyAuth();
  const { affiliateId, loading: loadingAffiliate } = useAffiliateAuth();

  const loading = loadingAuth || loadingCompany || loadingAffiliate;

  // ✅ Auto-Redirect Logic for Logged-In Users
  useEffect(() => {
    if (loading) return;

    // If user is NOT logged in, do nothing (Rendering falls through to LandingPage)
    if (!user) return;
    // 1. Staff with broader access lands in the main admin shell; staff
    // whose only permissions are document-related land in the docs console.
    if (isStaff && !isDocsOnlyStaff) {
      navigate("/admin-dashboard", { replace: true });
      return;
    }
    if (isDocsOnlyStaff) {
      navigate("/cs-dashboard", { replace: true });
      return;
    }

    // 2. Affiliate
    if (affiliateId) {
      navigate(`/affiliate-portal/${affiliateId}/dashboard`, { replace: true });
      return;
    }

    // 3. Company
    if (companyId) {
      navigate(`/company-portal/${companyId}/dashboard`, { replace: true });
      return;
    }

    // 4. Fallback (Valid auth but no specific role found)
    navigate("/login", { replace: true });
  }, [user, isStaff, isDocsOnlyStaff, affiliateId, companyId, loading, navigate]);

  // --- Loading State ---
  if (loading) {
    return (
      <Container className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: "80vh" }}>
        <Spinner animation="border" variant="primary" style={{ width: "3rem", height: "3rem" }} />
      </Container>
    );
  }

  // --- Unauthenticated State -> Show Landing Page ---
  if (!user) {
    return <LandingPage />;
  }

  // --- Redirecting State ---
  return (
    <Container className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: "80vh" }}>
      <Spinner animation="border" size="sm" className="mb-2" />
      <p className="text-muted small">Redirecting...</p>
    </Container>
  );
}