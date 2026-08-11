import React from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Badge, Button } from "react-bootstrap";
import img from "../../assets/hpc-lock.png"; // Adjust path if needed

export default function AdminSidebar({ isSidebarOpen, setIsSidebarOpen }) {
  // Nav visibility is permission-based now (see utils/permissions.js) instead
  // of hard-coded role booleans — each section/link checks the same
  // permission key(s) its route requires in App.jsx, so a link is never
  // shown for a page the employee can't actually open.
  const { isDeveloper, userId, hasAnyPermission } = useAuth();
  const location = useLocation();

  const canSeeActivitySection = hasAnyPermission([
    'view_call_queue', 'complete_call_task', 'count_inquiries', 'view_credit_reports',
  ]);
  const canSeeCallCenter = hasAnyPermission(['view_call_queue', 'complete_call_task']);
  const canSeeCounting = hasAnyPermission(['count_inquiries', 'view_credit_reports']);

  const canSeeManagementSection = hasAnyPermission([
    'view_employees', 'add_employees', 'view_partners', 'billing', 'view_clients',
    'add_client', 'verify_payments', 'add_partners', 'settings', 'view_call_notes',
    'view_documents', 'reports', 'analytics',
  ]);
  const canSeeCompanies = hasAnyPermission(['view_partners']);
  const canSeeBilling = hasAnyPermission(['billing']);

  // --- STYLES FOR LINKS ---
  const getLinkClass = (path) => {
    return `nav-link text-white rounded px-3 py-2 d-flex align-items-center mb-1 ${location.pathname.includes(path) ? 'bg-primary fw-bold' : 'hover-bg-secondary'}`;
  };

  // HELPER COMPONENT: Makes rendering links perfectly uniform
  const NavItem = ({ path, icon, label, iconClass = "" }) => (
    <li className="nav-item" title={label}>
      <NavLink to={path} className={getLinkClass(path)}>
        <div className="sidebar-icon-wrapper">
          <i className={`bi ${icon} fs-5 ${iconClass}`}></i>
        </div>
        <span className={`sidebar-text ${isSidebarOpen ? 'open' : 'closed'}`}>{label}</span>
      </NavLink>
    </li>
  );

  return (
    <>
      {/* THE CONTAINER: Added flex-shrink-0 to prevent it from ever getting squished */}
      <div
        className="bg-dark text-white d-flex flex-column shadow-lg overflow-hidden flex-shrink-0"
        style={{ width: isSidebarOpen ? '280px' : '80px', transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)', zIndex: 1040 }}
      >
        {/* Brand/Logo */}
        <Link to={isDeveloper ? `/admin/${userId}` : "/admin-dashboard"} className="text-decoration-none">
          <div className="p-3 d-flex align-items-center border-bottom border-secondary" style={{ height: '70px', whiteSpace: 'nowrap' }}>
            <div className="sidebar-icon-wrapper">
              <img src={img} alt="Logo" height="35" className="rounded-circle" />
            </div>
            <span className={`fs-6 fw-bold text-white tracking-wide sidebar-text ${isSidebarOpen ? 'open' : 'closed'}`}>
                H.P.C. {isDeveloper && <Badge bg="info" className="ms-1 small">DEV</Badge>}
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="flex-grow-1 overflow-y-auto overflow-x-hidden py-3 px-2 custom-scrollbar">

          {/* Core Links — each still requires its own permission; view_clients
              covers dashboard/client-list/company-leads for everyone who has
              it (see App.jsx's matching route guards). */}
          {!isDeveloper && (
            <ul className="nav flex-column mb-4">
              {hasAnyPermission(['view_clients']) && (
                <NavItem path="/admin-dashboard" icon="bi-grid-1x2" label="Dashboard" />
              )}
              {hasAnyPermission(['view_clients']) && (
                <NavItem path="/clients" icon="bi-people" label="Client List" />
              )}
              {hasAnyPermission(['verify_payments']) && (
                <NavItem path="/new-leads" icon="bi-person-plus-fill" label="New Leads" iconClass="text-success" />
              )}
              {canSeeCompanies && (
                <NavItem path="/company-leads" icon="bi-people" label="Company Leads" />
              )}
            </ul>
          )}

          {/* ACTIVITY SECTION */}
          {!isDeveloper && canSeeActivitySection && (
            <>
              <div className={`sidebar-section-title text-uppercase fw-bold mb-2 px-3 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                Activity
              </div>
              <ul className="nav flex-column mb-4">
                {canSeeCallCenter && (
                  <>
                    <NavItem path="/support-console" icon="bi-life-preserver" label="Support Console" iconClass="text-info" />
                    <NavItem path="/pending-callbacks" icon="bi-telephone-forward" label="Pending Callbacks" />
                    <NavItem path="/call-routing" icon="bi-headset" label="Call Routing" />
                    <NavItem path="/call-queue" icon="bi-list-ol" label="Call Queue" />
                  </>
                )}
                {canSeeCounting && (
                  <NavItem path="/identify-inquiries" icon="bi-123" label="Count Inquiries" />
                )}
                {hasAnyPermission(['view_documents']) && (
                  <NavItem path="/docs-routing" icon="bi-file-earmark-text" label="Docs Routing" />
                )}
                {hasAnyPermission(['settings']) && (
                  <NavItem path="/ai-testing" icon="bi-robot" label="AI Simulation" />
                )}
              </ul>
            </>
          )}

          {/* MANAGEMENT SECTION */}
          {!isDeveloper && canSeeManagementSection && (
            <>
              <div className={`sidebar-section-title text-uppercase fw-bold mb-2 px-3 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`}>
                Management
              </div>
              <ul className="nav flex-column mb-4">
                {canSeeCompanies && (
                  <NavItem path="/company" icon="bi-building" label="Companies" />
                )}
                {canSeeBilling && (
                  <NavItem path="/payroll" icon="bi-wallet2" label="Payroll" />
                )}
                {hasAnyPermission(['view_employees']) && (
                  <>
                    <NavItem path="/admin-directory" icon="bi-person-badge" label="Employee Directory" />
                    <NavItem path="/employee-time-tracker" icon="bi-clock-history" label="Employee Logs" />
                    <NavItem path="/activity-logs" icon="bi-activity" label="Management Logs" />
                  </>
                )}
                {hasAnyPermission(['view_clients']) && (
                  <NavItem path="/inquiry-removals" icon="bi-trash" label="Inquiry Logs" />
                )}
                {hasAnyPermission(['add_client']) && (
                  <NavItem path="/approve-signups" icon="bi-person-check-fill" label="Approve Signups" iconClass="text-warning" />
                )}
                {hasAnyPermission(['verify_payments']) && (
                  <NavItem path="/pending-payments" icon="bi-currency-dollar" label="Pending Payments" iconClass="text-success" />
                )}
                {hasAnyPermission(['approve_count_reviews']) && (
                  <NavItem path="/count-reviews" icon="bi-clipboard-check" label="Count Reviews" iconClass="text-warning" />
                )}

                <hr className="border-secondary opacity-25 mx-3" />

                {hasAnyPermission(['view_clients']) && (
                  <>
                    <NavItem path="/service-orders" icon="bi-plus-circle" label="Service Orders" />
                    <NavItem path="/intake" icon="bi-inbox" label="Intake Dashboard" />
                    <NavItem path="/funder-eligibility" icon="bi-bank" label="Funder Eligibility" />
                  </>
                )}
                {hasAnyPermission(['add_partners']) && (
                  <>
                    <NavItem path="/add-company" icon="bi-plus-circle" label="Add Company" />
                    <NavItem path="/add-affiliate" icon="bi-diagram-3" label="Add Affiliate" />
                  </>
                )}
                {hasAnyPermission(['add_employees']) && (
                  <NavItem path="/add-employee" icon="bi-person-plus" label="Add Employee" />
                )}
                {hasAnyPermission(['settings']) && (
                  <NavItem path="/company-holidays" icon="bi-calendar-event" label="Company Holidays" />
                )}
                {hasAnyPermission(['view_call_notes']) && (
                  <NavItem path="/call-logs" icon="bi-telephone" label="Call Logs" />
                )}
                {hasAnyPermission(['view_documents']) && (
                  <NavItem path="/document-submissions" icon="bi-folder2-open" label="Document Submissions" />
                )}
                {hasAnyPermission(['reports', 'analytics']) && (
                  <NavItem path="/master-sheet" icon="bi-grid-3x3" label="Master Spreadsheet" />
                )}
              </ul>
            </>
          )}
        </div>

        {/* MATCHING HEIGHT TOGGLE BUTTON */}
        <div
          className="mt-auto d-flex align-items-center justify-content-center border-top border-secondary border-opacity-25 flex-shrink-0"
          style={{ height: '60px' }}
        >
          <Button
            variant="dark"
            className="d-flex align-items-center justify-content-center text-muted border-0 bg-transparent rounded-circle"
            style={{ width: '40px', height: '40px', transition: 'background-color 0.2s' }}
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            title={isSidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <i className={`bi bi-chevron-double-${isSidebarOpen ? 'left' : 'right'} fs-5`}></i>
          </Button>
        </div>
      </div>
    </>
  );
}
