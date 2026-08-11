import React from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { useAffiliateAuth } from '../../context/AffiliateAuthContext';
import AffiliatePortalNavibar from './AffiliatePortalNavibar'; // You should create this later!

export default function AffiliatePortalLayout() {
  const { affiliateId: contextId } = useAffiliateAuth();
  const { affiliateId: urlId } = useParams();

  // Security Check: URL ID must match Session ID
  if (contextId && urlId && contextId !== urlId) {
    return <Navigate to={`/affiliate-portal/${contextId}/dashboard`} replace />;
  }

  return (
    <div className="affiliate-portal">
      <AffiliatePortalNavibar /> {/* Add specific nav here later */}
      <main className="container mt-4">
        <Outlet />
      </main>
    </div>
  );
}