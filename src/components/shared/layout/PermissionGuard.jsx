import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { Spinner, Alert, Button } from "react-bootstrap";
import { ALL_PERMISSION_KEYS, PERMISSION_LABELS } from "../../../utils/permissions";

/**
 * Route gate based on granular permissions (profiles.permissions) instead
 * of a hard-coded role allowlist — replaces RoleGuard.jsx. See
 * utils/permissions.js for what each key means and utils/permissionPresets.js
 * for the bundles the client picks from when creating an employee.
 *
 * - `permissions`: keys required to view this route/section. Leave empty to
 *   mean "any permission at all" — used for the outer admin-shell wrapper,
 *   where the real per-page gating happens inside each page/component.
 * - `match`: "any" (default, needs at least one of `permissions`) or "all".
 * - `allowDeveloper`: also admit the "developer" account type regardless of
 *   permissions. `role: "developer"` is a UI-mode flag (switches
 *   AdminSidebar/AdminProfile into the stripped-down dev view), not a
 *   capability, so it's kept as a belt-and-suspenders fallback in case a
 *   developer's permissions row hasn't been backfilled yet. Defaults on.
 */
export default function PermissionGuard({ permissions = [], match = "any", allowDeveloper = true }) {
  const { user, loadingAuth, hasAnyPermission, hasAllPermissions, isDeveloper } = useAuth();
  const location = useLocation();

  if (loadingAuth) {
    return (
      <div className="d-flex justify-content-center align-items-center vh-100" style={{ backgroundColor: '#0B1121' }}>
        <Spinner animation="border" variant="info" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const requiredKeys = permissions.length ? permissions : ALL_PERMISSION_KEYS;
  const passes = match === "all" ? hasAllPermissions(requiredKeys) : hasAnyPermission(requiredKeys);
  const allowed = passes || (allowDeveloper && isDeveloper);

  if (!allowed) {
    console.error(`🚨 PermissionGuard Blocked Access! Required (${match}): [${permissions.map((k) => PERMISSION_LABELS[k] || k).join(', ') || 'any permission'}]`);

    return (
      <div className="d-flex flex-column align-items-center justify-content-center vh-100" style={{ backgroundColor: '#0B1121', color: '#f8fafc' }}>
        <div className="text-center p-5 rounded-4 shadow-lg border" style={{ backgroundColor: '#131b2f', borderColor: '#1e293b', maxWidth: '500px' }}>
          <i className="bi bi-shield-lock-fill text-danger display-1 mb-3"></i>
          <h2 className="fw-bold text-white mb-3">Access Denied</h2>
          <p className="text-muted mb-4">You don't have the permission needed to view this page. Ask an admin to grant it from your Employee profile.</p>

          <div className="bg-dark p-3 rounded-3 mb-4 text-start border border-secondary">
            <div className="small text-muted mb-1 text-uppercase fw-bold">Diagnostic Data:</div>
            <div className="font-monospace"><strong className="text-info">Route:</strong> {location.pathname}</div>
            <div className="font-monospace"><strong className="text-success">Needs ({match}):</strong> {permissions.map((k) => PERMISSION_LABELS[k] || k).join(', ') || 'any permission'}</div>
          </div>

          <Button variant="outline-light" className="fw-bold px-4 py-2 mt-2 w-100" onClick={() => window.location.href = '/login'}>
            Return to Login
          </Button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
