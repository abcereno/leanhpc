-- Adds permission-based access control to replace hard-coded roles
-- (owner/admin/subadmin/supervisor/caller/counter/callcount/customer_service)
-- that used to be checked as ad-hoc booleans across ~13 frontend files (see
-- AuthContext.jsx's isCaller/isCounter/isSupervisor/etc., and AdminSidebar.jsx's
-- nav visibility). Going forward, `profiles.role` still exists (kept as a
-- coarse account-type label — see note on 'developer' below — and so
-- existing rows aren't orphaned), but every actual access decision should
-- check `profiles.permissions` instead.
--
-- Permission keys are defined once in src/utils/permissions.js — this file's
-- backfill values were generated FROM that source (via
-- src/utils/permissionPresets.js) rather than hand-typed twice, so the two
-- can't drift apart. If you add a new permission key later, existing
-- employees simply won't have it set (falsy by absence) until someone
-- checks the box for them on the Edit Employee page — nothing here needs to
-- be re-run.
--
-- v2 (2026-07-18): the first version of this file used
-- jsonb_build_object('key', true, 'key2', true, ...) to build each preset,
-- which broke on the Owner/Operations Manager presets — Postgres functions
-- (jsonb_build_object included) cap out at 100 arguments, and those two
-- presets have 60+ keys (120+ args as key/value pairs). Fixed by using a
-- plain JSON string cast to jsonb instead, which has no such limit. Also
-- broadened every WHERE clause to match every spelling
-- variant AuthContext.jsx's normalizeRole() recognizes (e.g. 'owner' AND
-- 'owners'), not just the single canonical spelling — a role stored as
-- "Owners" or "Admins" would otherwise have silently gotten zero
-- permissions from v1.
alter table public.profiles
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- ============================================================
-- OPTIONAL — run this first to see what's actually in your `role`
-- column before backfilling, so you can eyeball whether any employee's
-- role spelling isn't covered by the matching below.
-- ============================================================
-- select role, count(*) from public.profiles group by role order by 1;

-- ============================================================
-- ONE-TIME BACKFILL: seed existing employees' permissions from
-- the preset that matches their current role, so nobody loses
-- access the moment this ships. Guarded by `permissions = '{}'::jsonb`
-- so it's safe to re-run and won't clobber anything already set via
-- the new Add/Edit Employee UI.
-- ============================================================

-- owner <- preset "owner" (everything)
update public.profiles set permissions = '{"owner_dashboard":true,"aging_dashboard":true,"my_dashboard":true,"reports":true,"analytics":true,"view_clients":true,"view_all_clients":true,"add_client":true,"edit_client":true,"delete_client":true,"view_client_timeline":true,"view_workflow_progress":true,"restart_workflow":true,"close_workflow":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_documents":true,"upload_documents":true,"approve_documents":true,"reject_documents":true,"generate_cfpb_package":true,"generate_postalocity_package":true,"download_documents":true,"view_workflow":true,"advance_workflow":true,"pause_workflow":true,"resume_workflow":true,"reassign_workflow":true,"create_workflow":true,"edit_workflow_template":true,"view_call_queue":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"queue_experian":true,"queue_transunion":true,"queue_equifax":true,"queue_personal_identifiers":true,"queue_postalocity":true,"queue_followup":true,"queue_completed":true,"view_partners":true,"add_partners":true,"edit_partners":true,"upload_partner_clients":true,"view_partner_clients":true,"view_payments":true,"verify_payments":true,"refund_payments":true,"billing":true,"view_employees":true,"add_employees":true,"edit_employees":true,"delete_employees":true,"manage_permissions":true,"settings":true,"workflow_templates":true,"notification_settings":true,"api_settings":true,"integrations":true}'::jsonb
where lower(trim(role)) in ('owner', 'owners') and permissions = '{}'::jsonb;

-- admin <- preset "operations_manager"
update public.profiles set permissions = '{"owner_dashboard":true,"aging_dashboard":true,"my_dashboard":true,"reports":true,"analytics":true,"view_clients":true,"view_all_clients":true,"add_client":true,"edit_client":true,"delete_client":true,"view_client_timeline":true,"view_workflow_progress":true,"restart_workflow":true,"close_workflow":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_documents":true,"upload_documents":true,"approve_documents":true,"reject_documents":true,"generate_cfpb_package":true,"generate_postalocity_package":true,"download_documents":true,"view_workflow":true,"advance_workflow":true,"pause_workflow":true,"resume_workflow":true,"reassign_workflow":true,"create_workflow":true,"edit_workflow_template":true,"view_call_queue":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"queue_experian":true,"queue_transunion":true,"queue_equifax":true,"queue_personal_identifiers":true,"queue_postalocity":true,"queue_followup":true,"queue_completed":true,"view_partners":true,"add_partners":true,"edit_partners":true,"upload_partner_clients":true,"view_partner_clients":true,"view_payments":true,"verify_payments":true,"refund_payments":true,"billing":true,"view_employees":true,"add_employees":true,"edit_employees":true,"manage_permissions":true,"settings":true,"workflow_templates":true,"notification_settings":true,"integrations":true}'::jsonb
where lower(trim(role)) in ('admin', 'admins') and permissions = '{}'::jsonb;

-- subadmin <- preset "operations_manager"
update public.profiles set permissions = '{"owner_dashboard":true,"aging_dashboard":true,"my_dashboard":true,"reports":true,"analytics":true,"view_clients":true,"view_all_clients":true,"add_client":true,"edit_client":true,"delete_client":true,"view_client_timeline":true,"view_workflow_progress":true,"restart_workflow":true,"close_workflow":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_documents":true,"upload_documents":true,"approve_documents":true,"reject_documents":true,"generate_cfpb_package":true,"generate_postalocity_package":true,"download_documents":true,"view_workflow":true,"advance_workflow":true,"pause_workflow":true,"resume_workflow":true,"reassign_workflow":true,"create_workflow":true,"edit_workflow_template":true,"view_call_queue":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"queue_experian":true,"queue_transunion":true,"queue_equifax":true,"queue_personal_identifiers":true,"queue_postalocity":true,"queue_followup":true,"queue_completed":true,"view_partners":true,"add_partners":true,"edit_partners":true,"upload_partner_clients":true,"view_partner_clients":true,"view_payments":true,"verify_payments":true,"refund_payments":true,"billing":true,"view_employees":true,"add_employees":true,"edit_employees":true,"manage_permissions":true,"settings":true,"workflow_templates":true,"notification_settings":true,"integrations":true}'::jsonb
where lower(trim(role)) in ('subadmin', 'sub_admin', 'sub-admin') and permissions = '{}'::jsonb;

-- supervisor <- preset "operations_manager"
update public.profiles set permissions = '{"owner_dashboard":true,"aging_dashboard":true,"my_dashboard":true,"reports":true,"analytics":true,"view_clients":true,"view_all_clients":true,"add_client":true,"edit_client":true,"delete_client":true,"view_client_timeline":true,"view_workflow_progress":true,"restart_workflow":true,"close_workflow":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_documents":true,"upload_documents":true,"approve_documents":true,"reject_documents":true,"generate_cfpb_package":true,"generate_postalocity_package":true,"download_documents":true,"view_workflow":true,"advance_workflow":true,"pause_workflow":true,"resume_workflow":true,"reassign_workflow":true,"create_workflow":true,"edit_workflow_template":true,"view_call_queue":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"queue_experian":true,"queue_transunion":true,"queue_equifax":true,"queue_personal_identifiers":true,"queue_postalocity":true,"queue_followup":true,"queue_completed":true,"view_partners":true,"add_partners":true,"edit_partners":true,"upload_partner_clients":true,"view_partner_clients":true,"view_payments":true,"verify_payments":true,"refund_payments":true,"billing":true,"view_employees":true,"add_employees":true,"edit_employees":true,"manage_permissions":true,"settings":true,"workflow_templates":true,"notification_settings":true,"integrations":true}'::jsonb
where lower(trim(role)) in ('supervisor', 'supervisors', 'sup') and permissions = '{}'::jsonb;

-- customer_service <- preset "documents_team"
update public.profiles set permissions = '{"view_clients":true,"view_workflow_progress":true,"view_documents":true,"upload_documents":true,"approve_documents":true,"generate_cfpb_package":true,"generate_postalocity_package":true}'::jsonb
where lower(trim(role)) in ('customer_service', 'customer service', 'cs') and permissions = '{}'::jsonb;

-- caller <- preset "caller"
update public.profiles set permissions = '{"view_clients":true,"view_workflow_progress":true,"view_call_queue":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true}'::jsonb
where lower(trim(role)) in ('caller', 'callers') and permissions = '{}'::jsonb;

-- counter <- preset "counter"
update public.profiles set permissions = '{"view_clients":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_workflow":true}'::jsonb
where lower(trim(role)) in ('counter', 'counters') and permissions = '{}'::jsonb;

-- callcount <- caller union counter presets
update public.profiles set permissions = '{"view_clients":true,"view_workflow_progress":true,"view_call_queue":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_workflow":true}'::jsonb
where lower(trim(role)) in ('callcount', 'call_count', 'call-count') and permissions = '{}'::jsonb;

-- developer <- preset "owner" (role itself is kept as a separate account-type
-- flag that switches AdminSidebar/AdminProfile into "dev mode" — that's a UI
-- concern, not an access-scope permission, so it's intentionally not one of
-- the checkboxes). normalizeRole() treats ANY role string containing "dev"
-- as developer, so match the same way here.
update public.profiles set permissions = '{"owner_dashboard":true,"aging_dashboard":true,"my_dashboard":true,"reports":true,"analytics":true,"view_clients":true,"view_all_clients":true,"add_client":true,"edit_client":true,"delete_client":true,"view_client_timeline":true,"view_workflow_progress":true,"restart_workflow":true,"close_workflow":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_documents":true,"upload_documents":true,"approve_documents":true,"reject_documents":true,"generate_cfpb_package":true,"generate_postalocity_package":true,"download_documents":true,"view_workflow":true,"advance_workflow":true,"pause_workflow":true,"resume_workflow":true,"reassign_workflow":true,"create_workflow":true,"edit_workflow_template":true,"view_call_queue":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"queue_experian":true,"queue_transunion":true,"queue_equifax":true,"queue_personal_identifiers":true,"queue_postalocity":true,"queue_followup":true,"queue_completed":true,"view_partners":true,"add_partners":true,"edit_partners":true,"upload_partner_clients":true,"view_partner_clients":true,"view_payments":true,"verify_payments":true,"refund_payments":true,"billing":true,"view_employees":true,"add_employees":true,"edit_employees":true,"delete_employees":true,"manage_permissions":true,"settings":true,"workflow_templates":true,"notification_settings":true,"api_settings":true,"integrations":true}'::jsonb
where lower(trim(role)) like '%dev%' and permissions = '{}'::jsonb;

-- ============================================================
-- SAFETY NET: catch any row that looks like it should be an owner but
-- didn't match the exact spellings above (e.g. "Owner ", "OWNER", a typo
-- variant) — anything with "owner" anywhere in the role string gets full
-- access rather than silently landing with zero permissions. This is
-- deliberately broad because under-granting the owner is the worse failure
-- mode here.
-- ============================================================
update public.profiles set permissions = '{"owner_dashboard":true,"aging_dashboard":true,"my_dashboard":true,"reports":true,"analytics":true,"view_clients":true,"view_all_clients":true,"add_client":true,"edit_client":true,"delete_client":true,"view_client_timeline":true,"view_workflow_progress":true,"restart_workflow":true,"close_workflow":true,"view_credit_reports":true,"count_inquiries":true,"save_count":true,"submit_count":true,"view_documents":true,"upload_documents":true,"approve_documents":true,"reject_documents":true,"generate_cfpb_package":true,"generate_postalocity_package":true,"download_documents":true,"view_workflow":true,"advance_workflow":true,"pause_workflow":true,"resume_workflow":true,"reassign_workflow":true,"create_workflow":true,"edit_workflow_template":true,"view_call_queue":true,"call_experian":true,"call_transunion":true,"call_equifax":true,"call_personal_identifiers":true,"complete_call_task":true,"view_call_notes":true,"edit_call_notes":true,"queue_experian":true,"queue_transunion":true,"queue_equifax":true,"queue_personal_identifiers":true,"queue_postalocity":true,"queue_followup":true,"queue_completed":true,"view_partners":true,"add_partners":true,"edit_partners":true,"upload_partner_clients":true,"view_partner_clients":true,"view_payments":true,"verify_payments":true,"refund_payments":true,"billing":true,"view_employees":true,"add_employees":true,"edit_employees":true,"delete_employees":true,"manage_permissions":true,"settings":true,"workflow_templates":true,"notification_settings":true,"api_settings":true,"integrations":true}'::jsonb
where lower(trim(role)) like '%owner%' and permissions = '{}'::jsonb;

-- ============================================================
-- Update create_staff_member so newly-created employees get their
-- permissions set at creation time (from AddEmployee.jsx's checkbox
-- form) instead of only inheriting from the role backfill above.
-- `target_role` is kept (still stored on profiles.role) purely as a
-- legacy/display label — the actual access decisions read
-- profiles.permissions, populated from target_permissions here.
-- (Unaffected by the jsonb_build_object arg-limit bug above — this only
-- ever builds a 2-key object for raw_user_meta_data.)
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_staff_member(
  target_email text,
  target_password text,
  target_name text,
  target_role text,
  target_permissions jsonb DEFAULT '{}'::jsonb
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  new_user_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_user_meta_data
  )
  VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    target_email,
    crypt(target_password, gen_salt('bf')),
    now(),
    jsonb_build_object('role', target_role, 'full_name', target_name)
  );

  -- handle_new_user()'s trigger insert doesn't know about permissions, so
  -- set them here once the profiles row exists.
  UPDATE public.profiles
  SET permissions = target_permissions
  WHERE id = new_user_id;
END;
$function$;

-- ============================================================
-- OPTIONAL — run this after the above to confirm every employee actually
-- got permissions (any row showing 0 here fell through every match above
-- and needs a manual check on its role spelling, or just set it from the
-- Edit Employee page in the app).
-- ============================================================
-- select role, id, email, jsonb_object_keys(permissions) is not null as has_any_permissions,
--        (select count(*) from jsonb_object_keys(permissions)) as permission_count
-- from public.profiles
-- order by role;
