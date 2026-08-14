import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Suspense, lazy } from "react";
import { AuthProvider } from "./context/AuthContext";
import { CompanyAuthProvider, useCompanyAuth } from "./context/CompanyAuthContext";
import { AffiliateAuthProvider } from "./context/AffiliateAuthContext";
import { ThemeProvider } from "./components/shared/ui/ThemeContext";
import { Spinner } from "react-bootstrap";

// Components & Listeners
import ToastProvider from "./components/shared/ui/ToastNotifier";
import ClientSubmissionListener from "./components/admin/ClientSubmissionListener";
import AdminServiceOrders from "./components/admin/AdminServiceOrders";
import CountReviewQueue from "./components/admin/CountReviewQueue";
import AdminNotificationWatcher from "./components/admin/AdminNotificationWatcher";
// Layouts & Guards
import AdminLayout from "./components/admin/AdminLayout";
import MainLayout from "./components/shared/layout/MainLayout";
import AuthLayout from "./components/shared/layout/AuthLayout";
import PermissionGuard from "./components/shared/layout/PermissionGuard";

// Individual Portal
import RequireIndividualAuth from "./components/individual/RequireIndividualAuth";
import IndividualLayout from "./components/individual/IndividualLayout";
import IndividualDashboard from "./components/individual/IndividualDashboard";
import IndividualCreditFileLoader from "./components/individual/IndividualCreditFileLoader";
import FreshStartClassroom from "./components/individual/sidebars/FreshStartClassroom";

// Company Portal
import RequireCompanyAuth from "./components/company/RequireCompanyAuth";
import CompanyPortalLayout from "./components/company/CompanyPortalLayout";
import CompanyPortalDashboard from "./components/company/CompanyPortalDashboard";
import ClientProfilePage from "./components/company/ClientProfilePage";
const CompanyProfile = lazy(() => import("./components/company/CompanyProfile"));

// Broker Portal
const BrokerDashboard = lazy(() => import("./components/broker/BrokerDashboard"));

// Affiliate Portal
import RequireAffiliateAuth from "./components/affiliate/RequireAffiliateAuth";
import AffiliatePortalLayout from "./components/affiliate/AffiliatePortalLayout";
import AffiliatePortalDashboard from "./components/affiliate/AffiliatePortalDashboard";
const AffiliateProfile = lazy(() => import("./components/affiliate/AffiliateProfile"));

// Public & Auth Pages
import LoginGate from "./components/shared/auth/LoginGate";
import TermsAndConditions from "./components/shared/auth/TermsAndConditions";
import PrivacyPolicy from "./components/shared/auth/PrivacyPolicy";
import Login from "./components/shared/auth/Login";
import ResetPassword from "./components/shared/auth/ResetPassword";
import UpdatePassword from "./components/shared/auth/UpdatePassword";
import PublicClientReceipt from "./components/shared/public/PublicClientReceipt";
import ClientReportPage from "./components/shared/client-pages/ClientReportPage";
import CompanyDirectory from "./components/admin/CompanyDirectory";
import CompanyLayout from "./components/shared/public/CompanyLayout";
import AddClientForm from "./components/shared/public/AddClientForm";
import UnderReview from "./components/shared/auth/UnderReview";
import EmbeddableEligibilityChecker from "./components/shared/public/EmbeddableEligibilityChecker";
// Internal/Admin Shared
import InquiryLoader from "./components/shared/ui/InquiryLoader";
import ClientCreditReportDisplay from "./components/shared/client-pages/ClientCreditReportDisplay";
import ClientAuditPage from "./components/shared/client-pages/ClientAuditPage";
import ClientProgressPage from "./components/shared/client-pages/ClientProgressPage";
import DebugRawReportPage from "./components/admin/DebugRawReportPage";
import ClientDocumentDashboard from "./components/admin/customer-service/ClientDocumentsDashboard";

// Admin Specific
import DocumentRouting from "./components/admin/DocumentRouting";
import OutstandingClients from "./components/admin/OutstandingClients";
import AddEmployee from "./components/admin/AddEmployee";
import PendingApprovals from "./components/admin/PendingApprovals";
import CallRouting from "./components/admin/CallRouting";
import AITestingPlayground from "./components/admin/AITestingPlayground";
import CallQueue from "./components/admin/CallQueue";
import LeadEligibilityFunnel from "./components/shared/public/LeadEligibilityFunnel";
import CompanyLeadsList from "./components/admin/CompanyLeadsList";
import ClientFundingBlueprintPage from "./components/shared/client-pages/ClientFundingBlueprintPage";
import ClientIntakeForm from "./components/shared/public/ClientIntakeForm";

import EmergencyRescue from "./context/EmergencyRescue";

// Lazy-loaded Admin Pages
const AdminDashboard = lazy(() => import("./components/admin/AdminDashboard"));
const AdminClientList = lazy(() => import("./components/admin/AdminClientList"));
const ClientProfile = lazy(() => import("./components/admin/ClientProfile"));
const AddCompanyForm = lazy(() => import("./components/admin/AddCompanyForm"));
const InviteAdmin = lazy(() => import("./components/admin/InviteAdmin"));
const UploadReportForm = lazy(() => import("./components/admin/UploadReportForm"));
const SetAdminName = lazy(() => import("./components/admin/SetAdminName"));
const PendingCallbacks = lazy(() => import("./components/admin/PendingCallbacks"));
const Payroll = lazy(() => import("./components/admin/FinancialDashboard"));
const AdminDirectory = lazy(() => import("./components/admin/AdminDirectory"));
const EditEmployeePermissions = lazy(() => import("./components/admin/EditEmployeePermissions"));
const EmployeeTimeTracker = lazy(() => import("./components/admin/AdminActivityLog"));
const InquiryRemovalsTable = lazy(() => import("./components/admin/InquiryRemovalsTable"));
const CallLogs = lazy(() => import("./components/admin/CallLogs"));
const DocumentLogs = lazy(() => import("./components/admin/DocumentLogs"));
const IntakeDashboard = lazy(() => import("./components/admin/IntakeDashboard"));
const AdminProfile = lazy(() => import("./components/admin/AdminProfile"));
const AddAffiliateForm = lazy(() => import("./components/admin/AddAffiliateForm"));
const CompanyHolidays = lazy(() => import("./components/admin/CompanyHolidays"));
const FunderEligibilityCard = lazy(() => import("./components/shared/ui/FunderEligibilityCard"));
const InternalSpreadsheet = lazy(() => import("./components/admin/InternalSpreadsheet"));
const ManagementLogs = lazy(() => import("./components/admin/ManagementLogs"));
const AdminPaymentVerifications = lazy(() => import("./components/admin/AdminPaymentVerifications"));
const AdminNewLeads = lazy(() => import("./components/admin/AdminNewLeads"));
const SupportConsole = lazy(() => import("./components/admin/SupportConsole"));
const CreditReportWorkspace = lazy(() => import("./components/admin/CreditReportWorkspace"));
function CreditFileViewer() {
  const { clientId } = useParams();
  return <ClientCreditReportDisplay clientId={clientId} />;
}

// Wrapper Component to Route Between Company vs Broker Dashboard
function CompanyDashboardRouter() {
  const { companyType, loading } = useCompanyAuth();

  if (loading) return <div className="text-center p-5"><Spinner animation="border" variant="primary" /></div>;

  if (companyType === 'broker') {
    return <BrokerDashboard />;
  }

  return <CompanyPortalDashboard />;
}

export default function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <CompanyAuthProvider>
              <AffiliateAuthProvider>
                
                {/* Cleaned up listener (no more props) */}
                <ClientSubmissionListener /> 
                
                {/* NEW: Background watcher for Document & Payment notifications! */}
                <AdminNotificationWatcher />
                
                <AppRoutes />

              </AffiliateAuthProvider>
            </CompanyAuthProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<InquiryLoader />}>
      <Routes>
<Route path="/rescue" element={<EmergencyRescue />} />
        {/* === INDIVIDUAL PORTAL === */}
        <Route element={<RequireIndividualAuth />}>
          <Route path="/my-dashboard" element={<IndividualLayout />}>
            <Route index element={<IndividualDashboard />} />
            <Route path="credit-file" element={<IndividualCreditFileLoader />} />
            <Route path="classroom" element={<FreshStartClassroom />} />
            <Route path="*" element={<h4 className="text-center mt-5">❌ Individual Page Not Found</h4>} />
          </Route>
        </Route>

        {/* === COMPANY PORTAL === */}
        <Route element={<RequireCompanyAuth />}>
          <Route path="/company-portal/:companyId" element={<CompanyPortalLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<CompanyDashboardRouter />} />
            <Route path="clients/:clientId" element={<ClientProfilePage />} />
            <Route path="clients/:clientId/audit-report" element={<ClientAuditPage />} />
            <Route path="clients/:clientId/credit-file" element={<CreditFileViewer />} />
            <Route path="clients/:clientId/progress-report" element={<ClientProgressPage />} />
            <Route path="profile" element={<CompanyProfile />} />
            <Route path="*" element={<h4 className="text-center mt-5">❌ Company Portal Page Not Found</h4>} />
          </Route>
        </Route>

        {/* === AFFILIATE PORTAL === */}
        <Route element={<RequireAffiliateAuth />}>
          <Route path="/affiliate-portal/:affiliateId" element={<AffiliatePortalLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AffiliatePortalDashboard />} />
            <Route path="profile" element={<AffiliateProfile />} />
            <Route path="*" element={<h4 className="text-center mt-5">❌ Affiliate Page Not Found</h4>} />
          </Route>
        </Route>

        {/* === INTERNAL STAFF: CUSTOMER SERVICE === */}
        {/* Permission-based: any document-handling capability gets in — see
            utils/permissions.js. Previously a hard-coded role allowlist. */}
        <Route element={<PermissionGuard permissions={['view_documents', 'upload_documents', 'approve_documents', 'reject_documents', 'generate_cfpb_package', 'generate_postalocity_package', 'download_documents']} />}>
            <Route path="/cs-dashboard" element={<ClientDocumentDashboard />} />
        </Route>

        {/* === INTERNAL STAFF: ADMIN / DEVELOPER PORTAL === */}
        {/* Outer gate: any staff member with at least one permission at all
            (or the "developer" account type) can enter the admin shell —
            individual pages/nav items gate more specifically below and in
            AdminSidebar.jsx. */}
        <Route element={<PermissionGuard permissions={[]} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/:adminid" element={<AdminProfile />} />

            {/* Core internal views — gated on view_clients, which every
                staff preset (Caller/Counter/Documents Team/Operations
                Manager/Owner) grants. */}
            <Route element={<PermissionGuard permissions={['view_clients']} />}>
              <Route path="/admin-dashboard" element={<AdminDashboard />} />
              <Route path="/clients" element={<AdminClientList />} />
              <Route path="/funding-workspace" element={<CreditReportWorkspace />} />
              <Route path="/funding-workspace/:urlClientId" element={<CreditReportWorkspace />} />
              <Route path="/clients/:id" element={<ClientProfile />} />
              <Route path="/clients/:clientId/audit-report" element={<ClientAuditPage />} />
              <Route path="/clients/:clientId/credit-file" element={<CreditFileViewer />} />
              <Route path="/clients/:clientId/progress-report" element={<ClientProgressPage />} />
            </Route>

            {/* Everything below used to share the same broad role list as
                the block above with no further narrowing — meaning e.g. a
                caller could reach /payroll or /add-employee directly by URL
                even though the sidebar never linked to it. Each is now
                gated on the specific permission it actually needs. */}
            <Route element={<PermissionGuard permissions={['view_clients']} />}>
              <Route path="/service-orders" element={<AdminServiceOrders />} />
              <Route path="/inquiry-removals" element={<InquiryRemovalsTable />} />
              <Route path="/intake" element={<IntakeDashboard />} />
              <Route path="/funder-eligibility" element={<FunderEligibilityCard />} />
            </Route>

            <Route element={<PermissionGuard permissions={['add_partners']} />}>
              <Route path="/add-company" element={<AddCompanyForm />} />
              <Route path="/add-affiliate" element={<AddAffiliateForm />} />
            </Route>

            <Route element={<PermissionGuard permissions={['view_partners']} />}>
              <Route path="/company" element={<CompanyDirectory />} />
              <Route path="/company-leads" element={<CompanyLeadsList />} />
            </Route>

            <Route element={<PermissionGuard permissions={['add_employees']} />}>
              <Route path="/invite" element={<InviteAdmin />} />
              <Route path="/add-employee" element={<AddEmployee />} />
            </Route>

            <Route element={<PermissionGuard permissions={['count_inquiries']} />}>
              <Route path="/identify-inquiries" element={<UploadReportForm />} />
            </Route>

            <Route element={<PermissionGuard permissions={['approve_count_reviews']} />}>
              <Route path="/count-reviews" element={<CountReviewQueue />} />
            </Route>

            {/* Setting your own display name — no specific capability
                needed beyond being staff at all. */}
            <Route path="/set-admin-name" element={<SetAdminName />} />

            <Route element={<PermissionGuard permissions={['view_call_queue', 'complete_call_task']} />}>
              <Route path="/pending-callbacks" element={<PendingCallbacks />} />
              <Route path="/call-routing" element={<CallRouting />} />
              <Route path="/call-queue" element={<CallQueue />} />
            </Route>

            <Route element={<PermissionGuard permissions={['billing']} />}>
              <Route path="/payroll" element={<Payroll />} />
            </Route>

            <Route element={<PermissionGuard permissions={['view_employees']} />}>
              <Route path="/admin-directory" element={<AdminDirectory />} />
              <Route path="/employee-time-tracker" element={<EmployeeTimeTracker />} />
              <Route path="/activity-logs" element={<ManagementLogs />} />
            </Route>

            <Route element={<PermissionGuard permissions={['manage_permissions']} />}>
              <Route path="/admin-directory/:employeeId/permissions" element={<EditEmployeePermissions />} />
            </Route>

            <Route element={<PermissionGuard permissions={['view_call_notes']} />}>
              <Route path="/call-logs" element={<CallLogs />} />
            </Route>

            <Route element={<PermissionGuard permissions={['view_documents']} />}>
              <Route path="/document-submissions" element={<DocumentLogs />} />
              <Route path="/docs-routing" element={<DocumentRouting />} />
              <Route path="/outstanding-clients" element={<OutstandingClients />} />
            </Route>

            <Route element={<PermissionGuard permissions={['reports', 'analytics']} />}>
              <Route path="/master-sheet" element={<InternalSpreadsheet />} />
            </Route>

            <Route element={<PermissionGuard permissions={['add_client']} />}>
              <Route path="/approve-signups" element={<PendingApprovals />} />
            </Route>

            <Route element={<PermissionGuard permissions={['settings']} />}>
              <Route path="/ai-testing" element={<AITestingPlayground />} />
              <Route path="/company-holidays" element={<CompanyHolidays />} />
            </Route>

            <Route element={<PermissionGuard permissions={['verify_payments']} />}>
              <Route path="/pending-payments" element={<AdminPaymentVerifications />} />
              <Route path="/new-leads" element={<AdminNewLeads />} />
            </Route>

            <Route element={<PermissionGuard permissions={['view_call_queue', 'view_clients']} />}>
              <Route path="/support-console" element={<SupportConsole />} />
            </Route>

            {/* Local 404 for Admin Layout */}
            <Route path="*" element={<h4 className="text-center mt-5">❌ Admin Page Not Found</h4>} />
          </Route>
        </Route>

        {/* === AUTHENTICATION LAYOUT (Login/Signup/Password) === */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/under-review" element={<UnderReview />} />
          <Route path="/signup/consumer" element={<Login initialMode="signup" initialType="individual" />} />
          <Route path="/signup/partner" element={<Login initialMode="signup" initialType="company" />} />
          <Route path="/signup/affiliate" element={<Login initialMode="signup" initialType="affiliate" />} />
          
          {/* 👇 MOVED: Better suited here than MainLayout so no weird navbars overlay the password forms 👇 */}
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/update-password" element={<UpdatePassword />} />
        </Route>

        {/* === PUBLIC SITE LAYOUT (Main Website) === */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<LoginGate />} />
          <Route path="/terms-and-conditions" element={<TermsAndConditions />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/receipt/:token" element={<PublicClientReceipt />} />
          <Route path="/clients/:clientId/report" element={<ClientReportPage />} />
          <Route path="/clients/:clientId/funding" element={<ClientFundingBlueprintPage />} />
          <Route path="/company/:companyId/add-clients" element={<AddClientForm />} />
          <Route path="/company/:companyId" element={<CompanyLayout />} />
        </Route>

        {/* === GLOBAL 404 (No Layout/Blank) === */}
        <Route path="*" element={
          <div className="text-center mt-5">
            <h1 className="display-1">404</h1>
            <h4>❌ Critical Error: Page Not Found</h4>
            <p>The URL you entered does not exist or you do not have permission.</p>
            <a href="/login" className="btn btn-primary">Return to Safety</a>
          </div>
        } />
        <Route path="/lead-funnel" element={<LeadEligibilityFunnel />} />
        <Route path="/partner-eligibility" element={<EmbeddableEligibilityChecker />} />
        <Route path="/intake-form" element={<ClientIntakeForm />} />
      </Routes>
    </Suspense>
  );
}