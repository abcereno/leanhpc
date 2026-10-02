import React, { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import { isDuplicateSignupUser } from "../../../utils/authRouting";
import { useToast } from "../ui/ToastNotifier";
import "./hpcTheme.css";
import "./SignupWizard.css";
import HpcNav from "./HpcNav";
import HpcFooter from "./HpcFooter";

// Built 2026-10-02 to match the 4-step "Start free" wizard (Account /
// Business / Plan / Payment) found inside the public artifact
// (claude.ai/artifact/1zqtK4sKRSVhVzLe8QVUHF) — reached from the
// redesigned root LandingPage.jsx via the shared HpcNav "Start free"
// button (SIGNUP_ROUTE = "/start").
//
// Scope, per explicit user decision ("Build the full 4-step wizard UI"):
//   Step 1 (Account)  — REAL fields. Feeds the actual supabase.auth.signUp
//                        call on final submit, reusing Login.jsx's signup
//                        pattern (signupType: "company", since this wizard
//                        is the broker/partner-facing flow).
//   Step 2 (Business)  — Local state only. No `companies` schema columns
//                        exist yet for "I am a" / monthly volume / referral
//                        source, so these are collected and shown but not
//                        yet persisted. Easy to wire once that schema lands.
//   Step 3 (Plan)      — Picks which of PLAN_LINKS the person is sent to
//                        in Step 4.
//   Step 4 (Payment)   — REAL as of 2026-10-02. First built as a custom
//                        Stripe Elements card-save flow, then replaced
//                        same day once the user supplied 3 real Stripe
//                        Payment Links (one per plan, from the business's
//                        own Stripe account — see PLAN_LINKS below):
//                        clicking "Continue to payment" creates the real
//                        account (same signUp/signIn as before), then
//                        redirects the browser straight to the matching
//                        Payment Link. Stripe hosts the entire checkout
//                        (including whatever trial/subscription terms are
//                        configured on that link in the Stripe dashboard)
//                        — nothing about pricing, trial length, or card
//                        collection is duplicated here. client_reference_id
//                        is set to the new auth user's id (which is also
//                        companies.id — see sql/add_individual_signup_
//                        company.sql's trigger) so a Stripe webhook could
//                        later match a completed checkout back to this
//                        company; no such webhook exists yet.
//
// Follow-up (same day): forgot the other half of the redirect —
// Stripe doesn't send the browser back to our app on its own once
// checkout finishes. Each of the 3 Payment Links' "After payment"
// setting (Stripe Dashboard, on the link itself) needs to point at
// PostCheckout.jsx (routed at /welcome), which reads the still-signed-
// in Supabase session and routes the person into their portal.

const STEPS = ["Account", "Business", "Plan", "Payment"];

const ROLE_OPTIONS = ["Broker", "Lender", "Funding consultant", "Business owner"];
const VOLUME_OPTIONS = ["1–10", "11–25", "26–50", "50+"];
const REFERRAL_OPTIONS = [
  "Search engine",
  "Social media",
  "Referral from a partner",
  "Industry event",
  "Other",
];

// One Stripe Payment Link per plan, supplied directly by the user
// (2026-10-02) from their own Stripe account's "Payment Links" page —
// these already encode the price and whatever trial/subscription terms
// are configured on Stripe's side, so PLANS below only needs enough to
// render the picker, not the actual billing terms.
const PLANS = [
  { id: "starter", name: "Starter", price: 149, reports: 25, link: "https://buy.stripe.com/eVq14obW3eXMah774I48003" },
  { id: "growth", name: "Growth", price: 275, reports: 50, popular: true, link: "https://buy.stripe.com/8x26oI1hp7vk60R88M48002" },
  { id: "professional", name: "Professional", price: 495, reports: 99, link: "https://buy.stripe.com/6oU5kEaRZ7vk60Rexa48001" },
];

function passwordChecks(password) {
  return {
    length: password.length >= 8,
    number: /\d/.test(password),
    capital: /[A-Z]/.test(password),
  };
}

function IconCheck({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function SignupWizard() {
  const [step, setStep] = useState(1);

  // --- Step 1: Account (real) ---
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // --- Step 2: Business (local only — see header comment) ---
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("");
  const [volume, setVolume] = useState("");
  const [referral, setReferral] = useState("");

  // --- Step 3: Plan (local only — see header comment) ---
  const [planId, setPlanId] = useState("growth");

  const pwChecks = passwordChecks(password);
  const pwValid = pwChecks.length && pwChecks.number && pwChecks.capital;

  const canContinueStep1 = firstName.trim() && lastName.trim() && email.includes("@") && pwValid;
  const canContinueStep2 = companyName.trim() && role && volume;

  const goNext = () => setStep((s) => Math.min(s + 1, 4));
  const goBack = () => setStep((s) => Math.max(s - 1, 1));

  const selectedPlan = PLANS.find((p) => p.id === planId);

  return (
    <div className="hpc-page hpc-wizard">
      <HpcNav />

      <div className="hpc-wizard-shell">
        <ol className="hpc-wizard-steps" aria-label="Signup progress">
          {STEPS.map((label, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "upcoming";
            return (
              <li key={label} className={`hpc-wizard-step hpc-wizard-step--${state}`}>
                <span className="hpc-wizard-step-dot">
                  {state === "done" ? <IconCheck size={13} /> : n}
                </span>
                <span className="hpc-wizard-step-label">{label}</span>
              </li>
            );
          })}
        </ol>

        <div className="hpc-wizard-card">
          {step === 1 && (
            <div>
              <h2 className="hpc-serif hpc-wizard-title">Create your account</h2>
              <p className="hpc-muted hpc-wizard-sub">Step 1 of 4 — Account</p>

              <div className="hpc-wizard-row">
                <label className="hpc-wizard-field">
                  <span>First name</span>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jordan" autoFocus />
                </label>
                <label className="hpc-wizard-field">
                  <span>Last name</span>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Avery" />
                </label>
              </div>

              <label className="hpc-wizard-field">
                <span>Work email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
              </label>

              <label className="hpc-wizard-field">
                <span>Password</span>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </label>

              <ul className="hpc-wizard-pwchecks">
                <li className={pwChecks.length ? "ok" : ""}><IconCheck size={12} /> 8+ characters</li>
                <li className={pwChecks.number ? "ok" : ""}><IconCheck size={12} /> A number</li>
                <li className={pwChecks.capital ? "ok" : ""}><IconCheck size={12} /> A capital letter</li>
              </ul>

              <button type="button" className="hpc-btn hpc-btn-gold hpc-btn-block" disabled={!canContinueStep1} onClick={goNext}>
                Continue
              </button>
              <p className="hpc-wizard-login-link">
                Already have an account? <Link to="/login">Log in</Link>
              </p>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="hpc-serif hpc-wizard-title">Tell us about your business</h2>
              <p className="hpc-muted hpc-wizard-sub">Step 2 of 4 — Business</p>

              <label className="hpc-wizard-field">
                <span>Company name</span>
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Acme Funding Group" />
              </label>

              <div className="hpc-wizard-pillgroup">
                <span className="hpc-wizard-pillgroup-label">I am a</span>
                <div className="hpc-wizard-pills">
                  {ROLE_OPTIONS.map((opt) => (
                    <button type="button" key={opt} className={`hpc-wizard-pill ${role === opt ? "active" : ""}`} onClick={() => setRole(opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="hpc-wizard-pillgroup">
                <span className="hpc-wizard-pillgroup-label">Clients you help each month</span>
                <div className="hpc-wizard-pills">
                  {VOLUME_OPTIONS.map((opt) => (
                    <button type="button" key={opt} className={`hpc-wizard-pill ${volume === opt ? "active" : ""}`} onClick={() => setVolume(opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              <label className="hpc-wizard-field">
                <span>Where did you hear about us?</span>
                <select value={referral} onChange={(e) => setReferral(e.target.value)}>
                  <option value="">Select one</option>
                  {REFERRAL_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </label>

              <div className="hpc-wizard-nav-row">
                <button type="button" className="hpc-btn hpc-btn-outline" onClick={goBack}>Back</button>
                <button type="button" className="hpc-btn hpc-btn-gold" disabled={!canContinueStep2} onClick={goNext}>Continue</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="hpc-serif hpc-wizard-title">Choose your plan</h2>
              <p className="hpc-muted hpc-wizard-sub">Step 3 of 4 — Plan</p>

              <div className="hpc-wizard-plans">
                {PLANS.map((plan) => (
                  <button
                    type="button"
                    key={plan.id}
                    className={`hpc-wizard-plan ${planId === plan.id ? "active" : ""}`}
                    onClick={() => setPlanId(plan.id)}
                  >
                    {plan.popular && <span className="hpc-wizard-plan-badge">Most popular</span>}
                    <span className="hpc-wizard-plan-name">{plan.name}</span>
                    <span className="hpc-wizard-plan-price">
                      ${plan.price}<span className="hpc-muted">/mo</span>
                    </span>
                    <span className="hpc-muted hpc-wizard-plan-reports">{plan.reports} reports/mo</span>
                  </button>
                ))}
              </div>

              <div className="hpc-wizard-nav-row">
                <button type="button" className="hpc-btn hpc-btn-outline" onClick={goBack}>Back</button>
                <button type="button" className="hpc-btn hpc-btn-gold" onClick={goNext}>Continue</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <PaymentStep
              selectedPlan={selectedPlan}
              firstName={firstName}
              lastName={lastName}
              email={email}
              password={password}
              companyName={companyName}
              goBack={goBack}
            />
          )}
        </div>
      </div>

      <HpcFooter />
    </div>
  );
}

// Step 4's own component (kept separate from SignupWizard, same as
// before) — owns the account-creation + Payment Link redirect submit
// flow, since nothing about steps 1–3 needs it.
function PaymentStep({ selectedPlan, firstName, lastName, email, password, companyName, goBack }) {
  const { addToast } = useToast();

  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [showLoginFallback, setShowLoginFallback] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = agreedToTerms && !isSubmitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!agreedToTerms) return;

    setIsSubmitting(true);
    setMessage("");
    setShowLoginFallback(false);

    const cleanEmail = email.trim().toLowerCase();
    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      // Real account creation — mirrors Login.jsx's handleSignUp. Step
      // 2/3 selections (role, volume, referral) aren't persisted yet
      // (no schema for them); the plan choice lives entirely in which
      // Payment Link we redirect to below.
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: fullName,
            company_name: companyName,
            signup_type: "company",
            role: "company",
          },
        },
      });
      if (authError) throw authError;

      // See authRouting.js#isDuplicateSignupUser — Supabase doesn't
      // error on a re-used email, it just silently returns the
      // existing account. Catch that here instead of letting the
      // forced sign-in below fail with a misleading "auto-login
      // failed" message.
      if (isDuplicateSignupUser(authData.user)) {
        throw new Error("An account with this email already exists. Please log in instead.");
      }

      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (loginError) {
        throw new Error("Account created, but auto-login failed. Please log in manually.");
      }
      if (!loginData.user) {
        throw new Error("Account created, but we couldn't sign you in. Please log in manually.");
      }

      // Account is real and the browser is signed in — hand off to
      // Stripe's hosted checkout for the chosen plan. client_reference_id
      // is the new user's id (== companies.id, see the trigger in
      // sql/add_individual_signup_company.sql) so a future webhook could
      // match the completed checkout back to this company.
      const checkoutUrl = new URL(selectedPlan.link);
      checkoutUrl.searchParams.set("prefilled_email", cleanEmail);
      checkoutUrl.searchParams.set("client_reference_id", loginData.user.id);

      addToast({ title: "Account created!", message: "Taking you to secure checkout…", variant: "success", icon: "bi-check-circle-fill" });
      window.location.href = checkoutUrl.toString();
    } catch (err) {
      console.error("Signup Wizard Error:", err);
      setMessage(err.message);
      // Whatever broke here (duplicate email, failed auto-login), no
      // session exists yet — point them at /login rather than leaving
      // them stuck on this form.
      setShowLoginFallback(true);
      addToast({ title: "Signup Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="hpc-serif hpc-wizard-title">Start your subscription</h2>
      <p className="hpc-muted hpc-wizard-sub">Step 4 of 4 — Payment</p>

      {message && (
        <div className="hpc-wizard-message hpc-wizard-message--error">
          {message}
          {showLoginFallback && (
            <>
              {" "}
              <Link to="/login" state={{ email: email.trim().toLowerCase() }}>
                Log in instead →
              </Link>
            </>
          )}
        </div>
      )}

      <div className="hpc-wizard-summary">
        <div className="hpc-wizard-summary-row">
          <span>{selectedPlan.name} plan</span>
          <span>${selectedPlan.price}/mo</span>
        </div>
      </div>

      <p className="hpc-wizard-stripe-note">
        You'll complete secure checkout with Stripe on the next screen.
      </p>

      <label className="hpc-wizard-terms">
        <input type="checkbox" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} />
        <span>
          I agree to the <Link to="/terms-and-conditions">Terms</Link> and <Link to="/privacy-policy">Privacy Policy</Link>.
        </span>
      </label>

      <div className="hpc-wizard-nav-row">
        <button type="button" className="hpc-btn hpc-btn-outline" onClick={goBack} disabled={isSubmitting}>Back</button>
        <button type="submit" className="hpc-btn hpc-btn-gold" disabled={!canSubmit}>
          {isSubmitting ? "Creating account…" : "Continue to payment"}
        </button>
      </div>
    </form>
  );
}
