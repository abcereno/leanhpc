-- sql/add_individual_signup_company.sql
--
-- Every individual who signs up via the login page's "Individual" tab
-- (src/components/shared/auth/Login.jsx's signupType === "individual")
-- should automatically belong to LTOS (companies.id
-- "e33ef166-d381-458e-a5c8-ac77557d5ea2", company_name "LTOS" — same
-- company id already hardcoded for public-widget leads in
-- EmbeddableEligibilityChecker.jsx, and now centralized client-side as
-- src/utils/companies.js#LTOS_COMPANY_ID).
--
-- Login.jsx itself never inserts into public.clients directly — per its
-- own comment, "The DB Trigger will handle insertions & verification".
-- That trigger is public.handle_new_user(), fired AFTER INSERT on
-- auth.users. This file is that same function, CREATE OR REPLACE'd with
-- exactly one change: the "INDIVIDUAL CLIENT ROUTING" branch's INSERT now
-- also sets company_id. Every other branch (company/affiliate/staff) and
-- the auto-confirmation logic above them is unchanged — copied verbatim
-- from the live function (see "Supabase Snippet Public Schema
-- Functions.csv" in the repo root, which is where this definition was
-- pulled from) so re-running this file is a safe, complete replace, not a
-- partial patch that could drop unrelated logic.
--
-- A second, client-side "self-heal" insert path exists too (see
-- src/components/individual/IndividualDashboard.jsx — creates a clients
-- row on first login if this trigger somehow didn't already create one)
-- and has been updated separately to set the same company_id, so neither
-- path can create an individual client without one.
--
-- Safe to run once; idempotent (CREATE OR REPLACE FUNCTION). Does NOT
-- backfill company_id on any client rows that already exist — this only
-- changes what happens on the NEXT individual signup.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
DECLARE
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'client');
  v_signup_type text := coalesce(new.raw_user_meta_data->>'signup_type', '');
  v_full_name text := coalesce(new.raw_user_meta_data->>'full_name', 'New User');
  v_phone text := coalesce(new.raw_user_meta_data->>'phone', '');
  -- Fallback to full_name if company_name isn't explicitly provided
  v_company_name text := coalesce(new.raw_user_meta_data->>'company_name', new.raw_user_meta_data->>'full_name');
  -- New: every individual signup is attributed to LTOS — see this file's
  -- header comment.
  v_ltos_company_id uuid := 'e33ef166-d381-458e-a5c8-ac77557d5ea2';
BEGIN
  -- ⚡ SAFE AUTO-CONFIRMATION (Added IS NULL to prevent infinite loop crashes)
  UPDATE auth.users
  SET email_confirmed_at = NOW(),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"email_verified": true}'::jsonb
  WHERE id = NEW.id AND email_confirmed_at IS NULL;

  -- 🚀 ERROR-PROOF ROUTING LOGIC
  BEGIN
    -- 🏢 1. COMPANY / PARTNER ROUTING
    IF v_signup_type = 'company' OR v_role = 'company' THEN

      -- Create the main Company Profile
      INSERT INTO public.companies (id, auth_user_id, company_name, contact_email, phone, status)
      VALUES (NEW.id, NEW.id, v_company_name, NEW.email, v_phone, 'active')
      ON CONFLICT DO NOTHING;

      -- Link the Owner so the CompanyAuthContext catches them!
      INSERT INTO public.company_user_profiles (id, company_id, email, full_name, role)
      VALUES (NEW.id, NEW.id, NEW.email, v_full_name, 'company_owner')
      ON CONFLICT DO NOTHING;

    -- 🤝 2. AFFILIATE ROUTING
    ELSIF v_signup_type = 'affiliate' OR v_role = 'affiliate' THEN
      INSERT INTO public.affiliates (auth_user_id, affiliate_name, contact_email, contact_phone, status)
      VALUES (NEW.id, v_full_name, NEW.email, v_phone, 'pending')
      ON CONFLICT DO NOTHING;

    -- 👤 3. INDIVIDUAL CLIENT ROUTING
    ELSIF v_signup_type = 'individual' OR v_role IN ('individual', 'client') THEN
      INSERT INTO public.clients (auth_user_id, full_name, email, phone, status, company_id)
      VALUES (NEW.id, v_full_name, NEW.email, v_phone, 'pending', v_ltos_company_id)
      ON CONFLICT DO NOTHING;

    -- 🛡️ 4. INTERNAL STAFF ROUTING (Admins, Callers, Counters)
    ELSE
      INSERT INTO public.profiles (id, email, role, full_name)
      VALUES (NEW.id, NEW.email, v_role, v_full_name)
      ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, role = EXCLUDED.role, full_name = EXCLUDED.full_name;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Failed to route user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$
