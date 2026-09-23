-- sql/add_cs_dashboard_permissions.sql
--
-- Adds the two new permission keys (view_leads, log_cs_calls — see
-- src/utils/permissions.js's new "customer_relations" group) to every
-- EXISTING customer_service employee, so the CS team doesn't lose the
-- ability to use the rebuilt dashboard just because they were created
-- before these keys existed. New employees created after this ships get
-- them automatically via the updated documents_team preset in
-- src/utils/permissionPresets.js — this file only backfills people
-- already in the database.
--
-- Uses a jsonb merge (||) rather than overwriting permissions outright —
-- an employee's existing custom permissions (if any admin already
-- hand-edited them from the Edit Employee page) are preserved exactly,
-- this only ADDS the two new keys on top.
--
-- Matches sql/add_permissions.sql's own role-spelling matching for
-- customer_service. Safe to re-run.

update public.profiles
set permissions = permissions || '{"view_leads": true, "log_cs_calls": true}'::jsonb
where lower(trim(role)) in ('customer_service', 'customer service', 'cs');
