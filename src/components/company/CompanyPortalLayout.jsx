import React from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useCompanyAuth } from '../../context/CompanyAuthContext';

export default function CompanyPortalLayout() {
  const { companyId: contextId } = useCompanyAuth();
  const { companyId: urlId } = useParams();

  // Security Check: URL ID must match Session ID
  if (contextId && urlId && contextId !== urlId) {
    return <Navigate to={`/company-portal/${contextId}/dashboard`} replace />;
  }

  return (
    <div className="company-portal">
        <Outlet />
    </div>
  );
}