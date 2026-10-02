// src/components/shared/public/PostCheckout.jsx
//
// Built 2026-10-02 — the missing piece of the Payment Link pivot
// (see SignupWizard.jsx's header comment): once SignupWizard.jsx
// redirects a freshly-created account to Stripe's hosted Payment Link
// checkout (window.location.href = checkoutUrl), the browser leaves
// our app entirely. Stripe doesn't come back on its own — each of the
// 3 Payment Links needs its "After payment" setting (in the Stripe
// Dashboard, on the Payment Link itself) pointed at this page's URL
// (e.g. https://<your-domain>/welcome) so the person lands back here
// instead of on Stripe's generic confirmation screen.
//
// SignupWizard.jsx already called supabase.auth.signInWithPassword()
// in-browser before redirecting, so the Supabase session is still in
// localStorage when the person returns here (same browser, same
// origin) — this page just reads that session and routes them into
// their portal via authRouting.js's resolveUserDestination, the same
// resolver /login and /under-review use.
import React, { useCallback, useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import { resolveUserDestination } from "../../../utils/authRouting";
import "./hpcTheme.css";
import "./SignupWizard.css";

export default function PostCheckout() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("checking"); // checking | error
  const [message, setMessage] = useState("");

  const run = useCallback(async () => {
    setStatus("checking");
    setMessage("");
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        // No session — most likely they finished checkout on a
        // different device/browser than the one they signed up on.
        navigate("/login", { replace: true });
        return;
      }

      const destination = await resolveUserDestination(user);
      navigate(destination, { replace: true });
    } catch (err) {
      console.error("PostCheckout routing error:", err);
      setStatus("error");
      setMessage(err.message || "We couldn't find your account yet.");
    }
  }, [navigate]);

  useEffect(() => {
    run();
  }, [run]);

  return (
    <div className="hpc-page">
      <div className="hpc-wizard-shell" style={{ display: "flex", alignItems: "center", minHeight: "70vh" }}>
        <div className="hpc-wizard-card" style={{ textAlign: "center", width: "100%" }}>
          {status === "checking" ? (
            <>
              <h2 className="hpc-serif hpc-wizard-title">Setting up your account…</h2>
              <p className="hpc-muted hpc-wizard-sub">
                Thanks for subscribing — taking you to your dashboard.
              </p>
            </>
          ) : (
            <>
              <h2 className="hpc-serif hpc-wizard-title">Almost there</h2>
              <div className="hpc-wizard-message hpc-wizard-message--error">{message}</div>
              <p className="hpc-muted" style={{ fontSize: "0.88rem", marginBottom: "1.4rem" }}>
                Your payment went through. If this is the first check, your account record may
                still be finishing setup — try again in a few seconds, or log in directly.
              </p>
              <div className="hpc-wizard-nav-row">
                <button type="button" className="hpc-btn hpc-btn-outline" onClick={run}>Try again</button>
                <Link to="/login" className="hpc-btn hpc-btn-gold">Log in instead</Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
