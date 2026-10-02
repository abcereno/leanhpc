import React from "react";
import { Link } from "react-router-dom";
import { PRICING_URL } from "./HpcNav";

// Shared footer for the "Hidden Partner Cloud" marketing site + signup
// flow — see HpcNav.jsx for why this was extracted out of LandingPage.jsx
// on 2026-10-02 instead of staying inlined there.
function IconPerson({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

export default function HpcFooter() {
  return (
    <footer className="hpc-footer">
      <div className="hpc-footer-inner">
        <div className="hpc-footer-logo">
          <span className="hpc-logo-badge" style={{ width: 44, height: 44 }}><IconPerson size={22} /></span>
          <div className="hpc-footer-wordmark">
            Hidden<br />Partner<br />Cloud<sup style={{ fontSize: "0.6rem" }}>TM</sup>
          </div>
        </div>
        <p className="hpc-footer-legal">
          Hidden Partner Cloud LLC provides software and administrative workflow tools. We are not a financial institution or legal service provider, and outcomes depend on individual circumstances.
        </p>
        <div className="hpc-footer-links">
          <a href={PRICING_URL} target="_blank" rel="noreferrer">Pricing</a>
          <Link to="/login">Log in</Link>
          <Link to="/terms-and-conditions">Terms</Link>
          <Link to="/privacy-policy">Privacy</Link>
          <span className="hpc-footer-copy">&copy; {new Date().getFullYear()} Hidden Partner Cloud LLC</span>
        </div>
      </div>
    </footer>
  );
}
