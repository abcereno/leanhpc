// DEPRECATED — superseded by PermissionGuard.jsx (permission-based route
// gating replaced the hard-coded role allowlists this component used).
// No longer imported anywhere; kept only so history/blame isn't lost.
// Safe to delete once you're comfortable the permission cutover is stable.
import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { Spinner, Alert, Button } from "react-bootstrap";

export default function RoleGuard({ allowedRoles = [] }) {
  const { user, role, loadingAuth } = useAuth();
  const location = useLocation();

  if (loadingAuth) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ backgroundColor: '#0B1121' }}>
        <Spinner animation="border" variant="info" />
      </div>
    );
  }

  // If they aren't logged in at all, send them to login safely
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 🔥 THE LOOP BREAKER 🔥
  // If they are logged in but lack the role, trap them safely instead of bouncing them to "/"
  if (!allowedRoles.includes(role)) {
    console.error(`🚨 RoleGuard Blocked Access! Role: [${role}], Allowed: [${allowedRoles.join(', ')}]`);
    
    return (
      <div className="d-flex flex-column align-items-center justify-content-center vh-100" style={{ backgroundColor: '#0B1121', color: '#f8fafc' }}>
        <div className="text-center p-5 rounded-4 shadow-lg border" style={{ backgroundColor: '#131b2f', borderColor: '#1e293b', maxWidth: '500px' }}>
          <i className="bi bi-shield-lock-fill text-danger display-1 mb-3"></i>
          <h2 className="fw-bold text-white mb-3">Access Denied</h2>
          <p className="text-muted mb-4">You do not have the required security clearance to view this portal.</p>
          
          <div className="bg-dark p-3 rounded-3 mb-4 text-start border border-secondary">
            <div className="small text-muted mb-1 text-uppercase fw-bold">Diagnostic Data:</div>
            <div className="font-monospace"><strong className="text-info">Route:</strong> {location.pathname}</div>
            <div className="font-monospace"><strong className="text-warning">Your Role:</strong> {role || 'Null / Unassigned'}</div>
            <div className="font-monospace"><strong className="text-success">Allowed:</strong> {allowedRoles.join(', ')}</div>
          </div>

          <Alert variant="danger" className="small text-start shadow-sm">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            <strong>If your role says "Null":</strong> Your browser, network, or VPN is actively blocking our database connection. Please log in via a Google Chrome Incognito window.
          </Alert>

          {/* Hard redirect to wipe router memory */}
          <Button variant="outline-light" className="fw-bold px-4 py-2 mt-2 w-100" onClick={() => window.location.href = '/login'}>
            Return to Login
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}