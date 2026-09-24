-- sql/add_first_financial_partner.sql
--
-- Seeds "First Financial" as a real LTOS referral partner (referral_partners
-- table, sql/add_referral_partners.sql) — it's an actual partner, not
-- placeholder data like the other names seen in the reviewed mockup. Only
-- "Direct" was seeded when that migration ran; this adds the one confirmed
-- real name on top of it, the same idempotent way.
--
-- Safe to run once; idempotent (ON CONFLICT DO NOTHING on the same
-- (company_id, name) unique constraint the original migration created).

insert into public.referral_partners (company_id, name)
values ('e33ef166-d381-458e-a5c8-ac77557d5ea2', 'First Financial')
on conflict (company_id, name) do nothing;
