import React from "react";
import { Link } from "react-router-dom";

// Shared nav bar for the "Hidden Partner Cloud" marketing site + signup
// flow (LandingPage.jsx, SignupWizard.jsx) — extracted 2026-10-02 so both
// pages render the exact same header instead of two copies that could
// drift. Relies on hpcTheme.css (imported by whichever page renders this)
// for its styling.
function IconPerson({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

export const SIGNUP_ROUTE = "/start";
export const PRICING_URL = "https://web.hiddenpartnercloud.com/pricing";

export default function HpcNav() {
  return (
    <nav className="hpc-nav">
      <div className="hpc-nav-inner">
        <Link to="/" className="hpc-logo">
          <span className="hpc-logo-badge"><IconPerson size={16} /></span>
          Hidden Partner Cloud
        </Link>
        <div className="hpc-nav-links">
          <Link to="/#tour" className="hpc-nav-link">Product</Link>
          <a href={PRICING_URL} target="_blank" rel="noreferrer" className="hpc-nav-link">Pricing</a>
        </div>
        <div className="hpc-nav-actions">
          <Link to="/login" className="hpc-btn hpc-btn-outline hpc-btn-sm">
            <IconPerson size={14} /> Log in
          </Link>
          <Link to={SIGNUP_ROUTE} className="hpc-btn hpc-btn-gold hpc-btn-sm">Start free</Link>
        </div>
      </div>
    </nav>
  );
}
