// src/utils/authRouting.js
//
// Extracted from Login.jsx's handleRoleRouting (2026-10-02) so the new
// broker-facing SignupWizard.jsx (reached from the redesigned root
// LandingPage.jsx's "Start free" button) can land a freshly-created user
// in the correct portal using the exact same role-resolution order as the
// existing /login flow, instead of a second, divergent copy of this
// lookup chain.
//
// Checks, in order: profiles (admin/dev/staff roles) -> companies
// (Partner portal) -> affiliates -> company_user_profiles (agents) ->
// clients (consumer portal) -> a self-healing fallback for an orphaned
// individual/client signup whose DB row hasn't been created yet.
//
// Returns the destination path on success; throws when no account
// profile can be found at all (caller decides how to surface that).
//
// Also exports isDuplicateSignupUser (added 2026-10-02) — both Login.jsx
// and SignupWizard.jsx call supabase.auth.signUp() then immediately
// force a signInWithPassword with the password the user just typed.
// When the email is already registered, Supabase's signUp() doesn't
// error (to avoid leaking which emails exist) — it returns a "fake"
// version of the EXISTING user instead, and the forced sign-in right
// after fails because that real account's actual password doesn't
// match whatever the person just typed. Both call sites were
// surfacing that as a confusing "Account created, but auto-login
// failed" even though no account was created. Centralized here so the
// two call sites can't drift on how they detect it.
import { supabase } from "../supabaseClient";

export function isDuplicateSignupUser(user) {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}

export async function resolveUserDestination(user) {
  const userId = user.id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (profile) {
    const role = profile.role;
    if (role === "developer") return `/admin/${userId}`;
    if (role === "customer_service") return "/cs-dashboard";
    if (["admin", "owner", "subadmin", "callers", "counters"].includes(role)) return "/admin-dashboard";
  }

  const { data: company } = await supabase
    .from("companies")
    .select("id, status")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (company) return `/company-portal/${company.id}/dashboard`;

  const { data: affiliate } = await supabase
    .from("affiliates")
    .select("id, status")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (affiliate) return `/affiliate-portal/${affiliate.id}/dashboard`;

  const { data: agent } = await supabase
    .from("company_user_profiles")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (agent) return `/company-portal/${agent.company_id}/dashboard`;

  const { data: client } = await supabase
    .from("clients")
    .select("id, status")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (client) return "/my-dashboard";

  // Self-healing fallback: authenticated but no DB row yet (IndividualDashboard.jsx heals the profile on arrival).
  if (user.user_metadata?.role === "individual" || user.user_metadata?.role === "client") {
    return "/my-dashboard";
  }

  throw new Error("No account profile found. Please contact support.");
}
