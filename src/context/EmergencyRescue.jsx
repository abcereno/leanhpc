import React, { useEffect } from 'react';

export default function EmergencyRescue() {
  useEffect(() => {
    // 1. Nuke everything in local and session storage
    localStorage.clear();
    sessionStorage.clear();
    
    // 2. Clear any lingering Supabase cookies just to be safe
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });

    // 3. Hard redirect back to login
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0B1121', color: '#f8fafc' }}>
      <h3>🚑 Clearing corrupted session data... redirecting to login.</h3>
    </div>
  );
}