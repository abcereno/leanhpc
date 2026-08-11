-- sql/add_lender_aliases.sql
--
-- Master lender/alias reference table for the classify-inquiries Edge
-- Function's name matching. Seeded from the real starter library HPC's
-- partner (Hidden Partner Cloud) sent over — canonical lender names mapped
-- to the actual abbreviated/truncated/dealership name variants that show
-- up on real SmartCredit/IdentityIQ reports (e.g. "BK OF AMER", "JPMCB
-- CARD", "SYNCB/CARECR", "BMW OF ONTAR"). Before this table existed,
-- classify-inquiries had zero structured lender data — matching was
-- entirely "exact or near match" left to the model's own judgment, which
-- is exactly why creditor-name variance was causing missed links.
--
-- One row per alias (not an array column) so exact-match lookups are a
-- simple indexed equality check, and so future fuzzy/trigram matching can
-- be added later without a schema change.
--
-- requires_manual_review flags entries that should never be auto-decided
-- even on a clean name match (an acronym reused by multiple real
-- companies, or a name that might not even be a lender — e.g. "ATLAS",
-- "FLEX", "AN#") — per the partner's own stated safety rule: a false
-- positive (wrongly linking/deleting something real) is worse than a
-- false negative that just needs a human look. The frontend doesn't have
-- a distinct "manual review" classification bucket yet (see
-- inquiryCounts.js's classifyBureauStatus / InquiriesThread.jsx's
-- dropdown) — until that's built, classify-inquiries treats these as a
-- hard "never mark linked automatically" signal, not a real routing
-- destination.
--
-- related_canonical_name links a dealership's canonical entry to the
-- captive finance company it's most commonly associated with (e.g. "BMW
-- of Ontario" -> "BMW Financial Services"), straight from the worked
-- examples in the source proposal. Left null where no single finance
-- partner is clear (multi-brand dealer groups, used-car retailers) —
-- guessing here would recreate the exact false-positive-linking problem
-- this table exists to prevent.
--
-- Safe to run once; idempotent (unique index on lower(alias), inserts use
-- ON CONFLICT DO NOTHING).

create table if not exists public.lender_aliases (
  id bigserial primary key,
  canonical_name text not null,
  alias text not null,
  category text not null default 'other',
  requires_manual_review boolean not null default false,
  notes text,
  related_canonical_name text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_lender_aliases_alias_unique
  on public.lender_aliases (lower(alias));

create index if not exists idx_lender_aliases_canonical
  on public.lender_aliases (canonical_name);

-- Reference data every portal/edge function needs broad read access to;
-- no insert/update/delete policy — rows only change by re-running this
-- migration or a future admin-managed follow-up, never from the app
-- directly (matches sql/add_services.sql's precedent).
alter table public.lender_aliases enable row level security;

drop policy if exists "anyone can read lender aliases" on public.lender_aliases;
create policy "anyone can read lender aliases"
  on public.lender_aliases for select
  using (true);

-- --------------------------------------------------------------------------
-- Seed data (91 canonical lenders / 397 alias rows) from the partner's
-- starter library. Two corrections made against their raw list before
-- seeding, both to satisfy the alias-uniqueness constraint above:
--   - "Nationstar Mortgage" was listed as its own canonical entry with the
--     exact same 3 aliases as "Mr. Cooper" (Nationstar literally
--     rebranded to Mr. Cooper) -- merged into the single "Mr. Cooper" row
--     rather than kept as a duplicate canonical identity.
--   - "GMAC" was listed under both "Ally Financial" and "GM Financial" --
--     kept only under Ally Financial, since GMAC Inc. is the entity that
--     actually rebranded to Ally in 2010; GM Financial is a separate,
--     newer GM captive-finance arm.
-- --------------------------------------------------------------------------

insert into public.lender_aliases (canonical_name, alias, category, requires_manual_review, notes) values
  ('American Express', 'AMERICAN EXPRESS', 'credit_card_issuer', false, null),
  ('American Express', 'AMERICAN EXPRESS CO', 'credit_card_issuer', false, null),
  ('American Express', 'AMERICAN EXPRESS COMPANY', 'credit_card_issuer', false, null),
  ('American Express', 'AMERICAN EXPRESS BANK', 'credit_card_issuer', false, null),
  ('American Express', 'AMERICAN EXPRESS NATIONAL BANK', 'credit_card_issuer', false, null),
  ('American Express', 'AMEX', 'credit_card_issuer', false, null),
  ('American Express', 'AMEX BANK', 'credit_card_issuer', false, null),
  ('American Express', 'AMEX NATL BANK', 'credit_card_issuer', false, null),
  ('American Express', 'AMEX NB', 'credit_card_issuer', false, null),
  ('American Express', 'AENB', 'credit_card_issuer', false, null),
  ('American Express', 'AMEX CENTURION', 'credit_card_issuer', false, null),
  ('Bank of America', 'BANK OF AMERICA', 'credit_card_issuer', false, null),
  ('Bank of America', 'BANK OF AMERICA NA', 'credit_card_issuer', false, null),
  ('Bank of America', 'BANK OF AMERICA N.A.', 'credit_card_issuer', false, null),
  ('Bank of America', 'BANKAMERICA', 'credit_card_issuer', false, null),
  ('Bank of America', 'BANK AMERICA', 'credit_card_issuer', false, null),
  ('Bank of America', 'BK OF AMERICA', 'credit_card_issuer', false, null),
  ('Bank of America', 'BK OF AMER', 'credit_card_issuer', false, null),
  ('Bank of America', 'BANK OF AMER', 'credit_card_issuer', false, null),
  ('Bank of America', 'BOA', 'credit_card_issuer', false, null),
  ('Bank of America', 'B OF A', 'credit_card_issuer', false, null),
  ('Bank of America', 'BANA', 'credit_card_issuer', false, null),
  ('Bank of America', 'BOFA', 'credit_card_issuer', false, null),
  ('Bank of America', 'BOFA NA', 'credit_card_issuer', false, null),
  ('Bank of America', 'FIA CARD SERVICES', 'credit_card_issuer', false, null),
  ('Bank of America', 'FIA CARD SERVICES NA', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITAL ONE', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITALONE', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITAL ONE BANK', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITAL ONE BANK USA', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITAL ONE BANK USA NA', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITAL ONE BANK USA N.A.', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITAL ONE NA', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPITAL ONE N.A.', 'credit_card_issuer', false, null),
  ('Capital One', 'CAP ONE', 'credit_card_issuer', false, null),
  ('Capital One', 'CAPONE', 'credit_card_issuer', false, null),
  ('Capital One', 'CAP 1', 'credit_card_issuer', false, null),
  ('Capital One', 'CAP ONE BANK', 'credit_card_issuer', false, null),
  ('Capital One', 'CAP ONE NA', 'credit_card_issuer', false, null),
  ('Capital One', 'CAP1', 'credit_card_issuer', false, null),
  ('Capital One', 'COBNA', 'credit_card_issuer', false, null),
  ('Capital One Auto Finance', 'CAPITAL ONE AUTO FINANCE', 'auto_finance', false, null),
  ('Capital One Auto Finance', 'CAPITAL ONE AUTO', 'auto_finance', false, null),
  ('Capital One Auto Finance', 'CAPITALONE AUTO', 'auto_finance', false, null),
  ('Capital One Auto Finance', 'CAP ONE AUTO', 'auto_finance', false, null),
  ('Capital One Auto Finance', 'CAP ONE AUTO FINANCE', 'auto_finance', false, null),
  ('Capital One Auto Finance', 'COAF', 'auto_finance', false, null),
  ('Capital One Auto Finance', 'CAPITAL ONE AUTO FIN', 'auto_finance', false, null),
  ('Capital One Auto Finance', 'CAP1 AUTO', 'auto_finance', false, null),
  ('JPMorgan Chase Card', 'CHASE', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'CHASE BANK', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'CHASE CARD', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'CHASE CREDIT CARD', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'JPMCB', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'JPMCB CARD', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'JPMORGAN CHASE', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'JPMORGAN CHASE BANK', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'JPMC', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Card', 'JP MORGAN CHASE', 'credit_card_issuer', false, null),
  ('JPMorgan Chase Auto', 'JPMCB AUTO', 'auto_finance', false, null),
  ('JPMorgan Chase Auto', 'CHASE AUTO', 'auto_finance', false, null),
  ('JPMorgan Chase Auto', 'CHASE AUTO FINANCE', 'auto_finance', false, null),
  ('JPMorgan Chase Auto', 'JPMORGAN CHASE AUTO', 'auto_finance', false, null),
  ('JPMorgan Chase Home Lending', 'JPMCB HOME', 'mortgage_lender', false, null),
  ('JPMorgan Chase Home Lending', 'CHASE HOME', 'mortgage_lender', false, null),
  ('JPMorgan Chase Home Lending', 'CHASE HOME FINANCE', 'mortgage_lender', false, null),
  ('JPMorgan Chase Home Lending', 'CHASE MORTGAGE', 'mortgage_lender', false, null),
  ('JPMorgan Chase Home Lending', 'JPMORGAN CHASE HOME', 'mortgage_lender', false, null),
  ('Discover', 'DISCOVER', 'credit_card_issuer', false, null),
  ('Discover', 'DISCOVER BANK', 'credit_card_issuer', false, null),
  ('Discover', 'DISCOVER CARD', 'credit_card_issuer', false, null),
  ('Discover', 'DISCOVERCARD', 'credit_card_issuer', false, null),
  ('Discover', 'DISCOVER FINANCIAL', 'credit_card_issuer', false, null),
  ('Discover', 'DISCOVER FINANCIAL SERVICES', 'credit_card_issuer', false, null),
  ('Discover', 'DISCOVER PERSONAL LOANS', 'credit_card_issuer', false, null),
  ('Discover', 'DISC BANK', 'credit_card_issuer', false, null),
  ('Discover', 'DISCOVER BK', 'credit_card_issuer', false, null),
  ('Discover', 'DFS', 'credit_card_issuer', false, null),
  ('Discover', 'GREENWOOD TRUST', 'credit_card_issuer', false, null),
  ('Discover', 'GREENWOOD TRUST COMPANY', 'credit_card_issuer', false, null),
  ('Citi', 'CITI', 'credit_card_issuer', false, null),
  ('Citi', 'CITIBANK', 'credit_card_issuer', false, null),
  ('Citi', 'CITI BANK', 'credit_card_issuer', false, null),
  ('Citi', 'CITIBANK NA', 'credit_card_issuer', false, null),
  ('Citi', 'CITIBANK N.A.', 'credit_card_issuer', false, null),
  ('Citi', 'CITI CARDS', 'credit_card_issuer', false, null),
  ('Citi', 'CITI RETAIL', 'credit_card_issuer', false, null),
  ('Citi', 'CITI MORTGAGE', 'credit_card_issuer', false, null),
  ('Citi', 'CITI AUTO', 'credit_card_issuer', false, null),
  ('Citi', 'CBNA', 'credit_card_issuer', false, null),
  ('Wells Fargo', 'WELLS FARGO', 'credit_card_issuer', false, null),
  ('Wells Fargo', 'WELLS FARGO BANK', 'credit_card_issuer', false, null),
  ('Wells Fargo', 'WFB', 'credit_card_issuer', false, null),
  ('Wells Fargo', 'WFBNA', 'credit_card_issuer', false, null),
  ('Wells Fargo', 'WFBNA CARD', 'credit_card_issuer', false, null),
  ('Wells Fargo', 'WF BANK', 'credit_card_issuer', false, null),
  ('Wells Fargo', 'WELLS FARGO FINANCIAL', 'credit_card_issuer', false, null),
  ('Wells Fargo Auto', 'WELLS FARGO AUTO', 'auto_finance', false, null),
  ('Wells Fargo Auto', 'WFBNA AUTO', 'auto_finance', false, null),
  ('Wells Fargo Auto', 'WFB AUTO', 'auto_finance', false, null),
  ('Wells Fargo Auto', 'WF AUTO', 'auto_finance', false, null),
  ('Synchrony Bank', 'SYNCHRONY', 'credit_card_issuer', false, null),
  ('Synchrony Bank', 'SYNCHRONY BANK', 'credit_card_issuer', false, null),
  ('Synchrony Bank', 'SYNCB', 'credit_card_issuer', false, null),
  ('Synchrony Bank', 'GECRB', 'credit_card_issuer', false, null),
  ('Synchrony Bank', 'GE CAPITAL RETAIL BANK', 'credit_card_issuer', false, null),
  ('Synchrony Bank', 'GE MONEY BANK', 'credit_card_issuer', false, null),
  ('CareCredit', 'CARE CREDIT', 'credit_card_issuer', false, null),
  ('CareCredit', 'CARECREDIT', 'credit_card_issuer', false, null),
  ('CareCredit', 'CARE CR', 'credit_card_issuer', false, null),
  ('CareCredit', 'CARECR', 'credit_card_issuer', false, null),
  ('CareCredit', 'SYNCB/CARECR', 'credit_card_issuer', false, null),
  ('CareCredit', 'SYNCB CARECR', 'credit_card_issuer', false, null),
  ('CareCredit', 'SYNCB CARECREDIT', 'credit_card_issuer', false, null),
  ('PayPal Credit', 'PAYPAL CREDIT', 'credit_card_issuer', false, null),
  ('PayPal Credit', 'PAYPAL', 'credit_card_issuer', false, null),
  ('PayPal Credit', 'PPC', 'credit_card_issuer', false, null),
  ('PayPal Credit', 'SYNCB PPC', 'credit_card_issuer', false, null),
  ('Barclays', 'BARCLAYS', 'credit_card_issuer', false, null),
  ('Barclays', 'BARCLAYS BANK', 'credit_card_issuer', false, null),
  ('Barclays', 'BARCLAYS US', 'credit_card_issuer', false, null),
  ('Barclays', 'BARCLAYS BANK DELAWARE', 'credit_card_issuer', false, null),
  ('Barclays', 'BRCLYSBANKDE', 'credit_card_issuer', false, null),
  ('Barclays', 'BARCLAYCARD', 'credit_card_issuer', false, null),
  ('Barclays', 'BARCLAYS CARD', 'credit_card_issuer', false, null),
  ('Comenity Bank', 'COMENITY', 'credit_card_issuer', false, null),
  ('Comenity Bank', 'COMENITY BANK', 'credit_card_issuer', false, null),
  ('Comenity Bank', 'COMENITY CAPITAL BANK', 'credit_card_issuer', false, null),
  ('Comenity Bank', 'COMENITY BK', 'credit_card_issuer', false, null),
  ('Comenity Bank', 'COMENITYCAPITAL', 'credit_card_issuer', false, null),
  ('Comenity Bank', 'CCB', 'credit_card_issuer', false, null),
  ('Bread Financial', 'BREAD FINANCIAL', 'credit_card_issuer', false, null),
  ('Bread Financial', 'BREAD FINANCIAL PAYMENTS', 'credit_card_issuer', false, null),
  ('Bread Financial', 'BREAD FINANCIAL BANK', 'credit_card_issuer', false, null),
  ('Bread Financial', 'BREAD BANK', 'credit_card_issuer', false, null),
  ('Bread Financial', 'BREAD BK', 'credit_card_issuer', false, null),
  ('U.S. Bank', 'US BANK', 'bank', false, null),
  ('U.S. Bank', 'U.S. BANK', 'bank', false, null),
  ('U.S. Bank', 'US BANK NA', 'bank', false, null),
  ('U.S. Bank', 'U.S. BANK N.A.', 'bank', false, null),
  ('U.S. Bank', 'USBANK', 'bank', false, null),
  ('U.S. Bank', 'USB', 'bank', false, null),
  ('Elan Financial Services', 'ELAN', 'credit_card_issuer', false, null),
  ('Elan Financial Services', 'ELAN FINANCIAL', 'credit_card_issuer', false, null),
  ('Elan Financial Services', 'ELAN FINANCIAL SERVICES', 'credit_card_issuer', false, null),
  ('PNC Bank', 'PNC', 'bank', false, null),
  ('PNC Bank', 'PNC BANK', 'bank', false, null),
  ('PNC Bank', 'PNC BANK NA', 'bank', false, null),
  ('PNC Bank', 'PNC NATIONAL BANK', 'bank', false, null),
  ('Truist Bank', 'TRUIST', 'bank', false, null),
  ('Truist Bank', 'TRUIST BANK', 'bank', false, null),
  ('Truist Bank', 'SUNTRUST', 'bank', false, null),
  ('Truist Bank', 'SUNTRUST BANK', 'bank', false, null),
  ('Truist Bank', 'BB&T', 'bank', false, null),
  ('Truist Bank', 'BBT', 'bank', false, null),
  ('Truist Bank', 'BRANCH BANKING AND TRUST', 'bank', false, null),
  ('Truist Auto', 'TRUISTAUTO', 'auto_finance', false, null),
  ('Truist Auto', 'TRUIST AUTO', 'auto_finance', false, null),
  ('Truist Auto', 'TRUIST BANK AUTO', 'auto_finance', false, null),
  ('TD Bank', 'TD BANK', 'bank', false, null),
  ('TD Bank', 'TD BANK NA', 'bank', false, null),
  ('TD Bank', 'TD RETAIL CARD', 'bank', false, null),
  ('TD Bank', 'TD FINANCIAL', 'bank', false, null),
  ('TD Auto Finance', 'TD AUTO FIN', 'auto_finance', false, null),
  ('TD Auto Finance', 'TD AUTO', 'auto_finance', false, null),
  ('TD Auto Finance', 'TD AUTO FINANCE', 'auto_finance', false, null),
  ('Fifth Third Bank', 'FIFTH THIRD', 'bank', false, null),
  ('Fifth Third Bank', 'FIFTH THIRD BANK', 'bank', false, null),
  ('Fifth Third Bank', 'FIFTH THIRD BK', 'bank', false, null),
  ('Fifth Third Bank', '53 BANK', 'bank', false, null),
  ('Fifth Third Bank', '53BK', 'bank', false, null),
  ('Citizens Bank', 'CITIZENS BANK', 'bank', false, null),
  ('Citizens Bank', 'CITIZENS', 'bank', false, null),
  ('Citizens Bank', 'CITIZENS FINANCIAL', 'bank', false, null),
  ('Citizens Bank', 'RBS CITIZENS', 'bank', false, null),
  ('Navy Federal Credit Union', 'NAVY FEDERAL', 'credit_union', false, null),
  ('Navy Federal Credit Union', 'NAVY FEDERAL CREDIT UNION', 'credit_union', false, null),
  ('Navy Federal Credit Union', 'NFCU', 'credit_union', false, null),
  ('Navy Federal Credit Union', 'NAVY FED CU', 'credit_union', false, null),
  ('PenFed Credit Union', 'PENFED', 'credit_union', false, null),
  ('PenFed Credit Union', 'PENFED CREDIT UNION', 'credit_union', false, null),
  ('PenFed Credit Union', 'PENTAGON FEDERAL CREDIT UNION', 'credit_union', false, null),
  ('PenFed Credit Union', 'PFCU', 'credit_union', false, null),
  ('Alliant Credit Union', 'ALLIANT CU', 'credit_union', false, null),
  ('Alliant Credit Union', 'ALLIANT CREDIT UNION', 'credit_union', false, null),
  ('Alliant Credit Union', 'ALLIANT', 'credit_union', false, null),
  ('EECU', 'EECU', 'credit_union', false, null),
  ('EECU', 'EDUCATIONAL EMPLOYEES CREDIT UNION', 'credit_union', false, null),
  ('Hughes Federal Credit Union', 'HUGHES FEDER', 'credit_union', false, null),
  ('Hughes Federal Credit Union', 'HUGHES FEDERAL', 'credit_union', false, null),
  ('Hughes Federal Credit Union', 'HUGHES FEDERAL CREDIT UNION', 'credit_union', false, null),
  ('Hughes Federal Credit Union', 'HUGHES FCU', 'credit_union', false, null),
  ('UNIFY Financial Credit Union', 'UNIFY FINANCIAL', 'credit_union', false, null),
  ('UNIFY Financial Credit Union', 'UNIFY FINANCIAL CU', 'credit_union', false, null),
  ('UNIFY Financial Credit Union', 'UNIFY FCU', 'credit_union', false, null),
  ('UNIFY Financial Credit Union', 'CUDL/UNIFY FINANCIAL C', 'credit_union', false, null),
  ('Canvas Credit Union', 'CANVASCRED', 'credit_union', false, null),
  ('Canvas Credit Union', 'CANVAS CREDIT UNION', 'credit_union', false, null),
  ('Canvas Credit Union', 'CANVAS CU', 'credit_union', false, null),
  ('Water and Power Community Credit Union', 'WATER & POWER COMM CU', 'credit_union', false, null),
  ('Water and Power Community Credit Union', 'WATER AND POWER COMM CU', 'credit_union', false, null),
  ('Water and Power Community Credit Union', 'WPCCU', 'credit_union', false, null),
  ('Ally Financial', 'ALLY', 'auto_finance', false, null),
  ('Ally Financial', 'ALLY BANK', 'auto_finance', false, null),
  ('Ally Financial', 'ALLY FINANCIAL', 'auto_finance', false, null),
  ('Ally Financial', 'ALLYFINANC', 'auto_finance', false, null),
  ('Ally Financial', 'ALLY AUTO', 'auto_finance', false, null),
  ('Ally Financial', 'ALLY AUTO FINANCE', 'auto_finance', false, null),
  ('Ally Financial', 'GMAC', 'auto_finance', false, null),
  ('Ally Financial', 'GMAC FINANCIAL', 'auto_finance', false, null),
  ('BMW Financial Services', 'BMW FINANCIAL SERVICES', 'auto_finance', false, null),
  ('BMW Financial Services', 'BMW FIN SVC', 'auto_finance', false, null),
  ('BMW Financial Services', 'BMW FS', 'auto_finance', false, null),
  ('BMW Financial Services', 'BMW FINANCE', 'auto_finance', false, null),
  ('BMW Financial Services', 'BMW FIN', 'auto_finance', false, null),
  ('BMW Financial Services', 'BMW BANK', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TOYOTA FINANCIAL', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TOYOTA FINANCIAL SERVICES', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TOYOTA MOTOR CREDIT', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TOYOTA MOTOR CREDIT CO', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TOYOTA MOTOR', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TOYOTA MTR', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TOYOTA FIN', 'auto_finance', false, null),
  ('Toyota Financial Services', 'TMCC', 'auto_finance', false, null),
  ('Lexus Financial Services', 'LEXUS FINANCIAL', 'auto_finance', false, null),
  ('Lexus Financial Services', 'LEXUS FINANCIAL SERVICES', 'auto_finance', false, null),
  ('Lexus Financial Services', 'LEXUS FINANCE', 'auto_finance', false, null),
  ('Lexus Financial Services', 'LEXUS FS', 'auto_finance', false, null),
  ('Lexus Financial Services', 'LFS', 'auto_finance', false, null),
  ('American Honda Finance', 'AMERICAN HONDA FINANCE', 'auto_finance', false, null),
  ('American Honda Finance', 'AM HONDA FIN', 'auto_finance', false, null),
  ('American Honda Finance', 'HONDA FINANCE', 'auto_finance', false, null),
  ('American Honda Finance', 'HONDA FINANCIAL', 'auto_finance', false, null),
  ('American Honda Finance', 'HONDA FIN', 'auto_finance', false, null),
  ('American Honda Finance', 'AHF', 'auto_finance', false, null),
  ('Ford Credit', 'FORD CREDIT', 'auto_finance', false, null),
  ('Ford Credit', 'FORD MOTOR CREDIT', 'auto_finance', false, null),
  ('Ford Credit', 'FORD MOTOR CREDIT CO', 'auto_finance', false, null),
  ('Ford Credit', 'FMC', 'auto_finance', false, null),
  ('Ford Credit', 'FMCREDIT', 'auto_finance', false, null),
  ('GM Financial', 'GM FINANCIAL', 'auto_finance', false, null),
  ('GM Financial', 'GMF', 'auto_finance', false, null),
  ('GM Financial', 'GM FIN', 'auto_finance', false, null),
  ('Hyundai Motor Finance', 'HYUNDAI MOTOR FINANCE', 'auto_finance', false, null),
  ('Hyundai Motor Finance', 'HYUNDAI FINANCE', 'auto_finance', false, null),
  ('Hyundai Motor Finance', 'HYUNDAI MOTOR FIN', 'auto_finance', false, null),
  ('Hyundai Motor Finance', 'HMF', 'auto_finance', false, null),
  ('Kia Finance America', 'KIA FINANCE AMERICA', 'auto_finance', false, null),
  ('Kia Finance America', 'KIA FINANCE', 'auto_finance', false, null),
  ('Kia Finance America', 'KIA MOTORS FINANCE', 'auto_finance', false, null),
  ('Kia Finance America', 'KMF', 'auto_finance', false, null),
  ('Nissan Motor Acceptance', 'NISSAN MOTOR', 'auto_finance', false, null),
  ('Nissan Motor Acceptance', 'NISSAN MOTOR ACCEPTANCE', 'auto_finance', false, null),
  ('Nissan Motor Acceptance', 'NISSAN MOTOR ACCEPTANCE CO', 'auto_finance', false, null),
  ('Nissan Motor Acceptance', 'NISSAN FINANCE', 'auto_finance', false, null),
  ('Nissan Motor Acceptance', 'NMAC', 'auto_finance', false, null),
  ('Mercedes-Benz Financial Services', 'MERCEDES BENZ FINANCIAL SERVICES', 'auto_finance', false, null),
  ('Mercedes-Benz Financial Services', 'MERCEDES BENZ FINANCIAL', 'auto_finance', false, null),
  ('Mercedes-Benz Financial Services', 'MERCEDES FINANCIAL', 'auto_finance', false, null),
  ('Mercedes-Benz Financial Services', 'MB FIN SVCS', 'auto_finance', false, null),
  ('Mercedes-Benz Financial Services', 'MBFS', 'auto_finance', false, null),
  ('Volkswagen Credit', 'VW CREDIT', 'auto_finance', false, null),
  ('Volkswagen Credit', 'VW CREDIT INC', 'auto_finance', false, null),
  ('Volkswagen Credit', 'VOLKSWAGEN CREDIT', 'auto_finance', false, null),
  ('Volkswagen Credit', 'VOLKSWAGEN CREDIT INC', 'auto_finance', false, null),
  ('Volkswagen Credit', 'VW CREDIT LEASING', 'auto_finance', false, null),
  ('Audi Financial Services', 'AUDI FINANCIAL SERVICES', 'auto_finance', false, null),
  ('Audi Financial Services', 'AUDI FINANCE', 'auto_finance', false, null),
  ('Audi Financial Services', 'AUDI FS', 'auto_finance', false, null),
  ('Santander Consumer USA', 'SANTANDER', 'auto_finance', false, null),
  ('Santander Consumer USA', 'SANTANDER CONSUMER', 'auto_finance', false, null),
  ('Santander Consumer USA', 'SANTANDER CONSUMER USA', 'auto_finance', false, null),
  ('Santander Consumer USA', 'SCUSA', 'auto_finance', false, null),
  ('Credit Acceptance Corporation', 'CREDIT ACCEPTANCE', 'auto_finance', false, null),
  ('Credit Acceptance Corporation', 'CREDIT ACCEPTANCE CORP', 'auto_finance', false, null),
  ('Credit Acceptance Corporation', 'CAC', 'auto_finance', false, null),
  ('Regional Acceptance Corporation', 'REGIONALAC', 'auto_finance', false, null),
  ('Regional Acceptance Corporation', 'REGIONAL ACCEPTANCE', 'auto_finance', false, null),
  ('Regional Acceptance Corporation', 'REGIONAL ACCEPTANCE CORP', 'auto_finance', false, null),
  ('FourSight Capital', 'FOURSIGHT CA', 'auto_finance', false, null),
  ('FourSight Capital', 'FOURSIGHT CAPITAL', 'auto_finance', false, null),
  ('Yamaha Motor Finance', 'YAMAHA MOTOR', 'auto_finance', false, null),
  ('Yamaha Motor Finance', 'YAMAHA MOTOR FINANCE', 'auto_finance', false, null),
  ('Yamaha Motor Finance', 'YAMAHA FINANCE', 'auto_finance', false, null),
  ('Yamaha Motor Finance', 'YMF', 'auto_finance', false, null),
  ('SBNA', 'SBNA', 'unknown', true, 'Exact company identity must remain configurable and should not be guessed solely from the acronym.'),
  ('Rocket Mortgage', 'ROCKET MORTGAGE', 'mortgage_lender', false, null),
  ('Rocket Mortgage', 'ROCKET', 'mortgage_lender', false, null),
  ('Rocket Mortgage', 'QUICKEN LOANS', 'mortgage_lender', false, null),
  ('Rocket Mortgage', 'QUICKEN', 'mortgage_lender', false, null),
  ('Mr. Cooper', 'MR COOPER', 'mortgage_servicer', false, null),
  ('Mr. Cooper', 'MRCOOPER', 'mortgage_servicer', false, null),
  ('Mr. Cooper', 'NATIONSTAR', 'mortgage_servicer', false, null),
  ('Mr. Cooper', 'NATIONSTAR MORTGAGE', 'mortgage_servicer', false, null),
  ('Freedom Mortgage', 'FREEDOM MORTGAGE', 'mortgage_lender', false, null),
  ('Freedom Mortgage', 'FREEDOM MTG', 'mortgage_lender', false, null),
  ('PHH Mortgage', 'PHH', 'mortgage_servicer', false, null),
  ('PHH Mortgage', 'PHH MORTGAGE', 'mortgage_servicer', false, null),
  ('PHH Mortgage', 'PHH MTG', 'mortgage_servicer', false, null),
  ('Carrington Mortgage Services', 'CARRINGTON', 'mortgage_servicer', false, null),
  ('Carrington Mortgage Services', 'CARRINGTON MORTGAGE', 'mortgage_servicer', false, null),
  ('Carrington Mortgage Services', 'CARRINGTON MTG', 'mortgage_servicer', false, null),
  ('Carrington Mortgage Services', 'CARNGTN MTG', 'mortgage_servicer', false, null),
  ('Rushmore Loan Management Services', 'RUSHMORE', 'mortgage_servicer', false, null),
  ('Rushmore Loan Management Services', 'RUSHMORE LMS', 'mortgage_servicer', false, null),
  ('Rushmore Loan Management Services', 'RUSHMORE LOAN MANAGEMENT', 'mortgage_servicer', false, null),
  ('Rushmore Loan Management Services', 'RUSHMORE LOAN MANAGEMENT SERVICES', 'mortgage_servicer', false, null),
  ('Select Portfolio Servicing', 'SPS', 'mortgage_servicer', false, null),
  ('Select Portfolio Servicing', 'SELECT PORTFOLIO SERVICING', 'mortgage_servicer', false, null),
  ('Select Portfolio Servicing', 'SELECT PORTFOLIO', 'mortgage_servicer', false, null),
  ('Selene Finance', 'SELENE FINANCE', 'mortgage_servicer', false, null),
  ('Selene Finance', 'SELENE FINAN', 'mortgage_servicer', false, null),
  ('Selene Finance', 'SELENE FIN', 'mortgage_servicer', false, null),
  ('NewRez', 'NEWREZ', 'mortgage_servicer', false, null),
  ('NewRez', 'NEW REZ', 'mortgage_servicer', false, null),
  ('NewRez', 'SHELLPOINT', 'mortgage_servicer', false, null),
  ('NewRez', 'SHELLPOINT MORTGAGE', 'mortgage_servicer', false, null),
  ('NewRez', 'SHELLPOINT MTG', 'mortgage_servicer', false, null),
  ('Huntington Bank', 'HUNTINGTON', 'bank', false, null),
  ('Huntington Bank', 'HUNTINGTON BANK', 'bank', false, null),
  ('Huntington Bank', 'HUNTINGT MTG', 'bank', false, null),
  ('Huntington Bank', 'HUNTINGTON MTG', 'bank', false, null),
  ('Huntington Bank', 'HNTBK', 'bank', false, null),
  ('Huntington Bank', 'TCFBK/HNTBK', 'bank', false, null),
  ('Concord Servicing', 'CONCORD SERVICING', 'other', false, null),
  ('Concord Servicing', 'CONCORD SERVICING LLC', 'other', false, null),
  ('Concord Servicing', 'CONCORD LLC', 'other', false, null),
  ('Marriott Ownership Resorts', 'MARRIOTT OWNERSHIP RES', 'other', false, null),
  ('Marriott Ownership Resorts', 'MARRIOTT OWNERSHIP RESORTS', 'other', false, null),
  ('Marriott Ownership Resorts', 'MARRIOTT VACATION CLUB', 'other', false, null),
  ('Marriott Ownership Resorts', 'MVC', 'other', false, null),
  ('Advantage Credit', 'ADVANTAGE CREDIT', 'credit_reseller', false, null),
  ('Advantage Credit', 'ADVANTAGE CREDIT INC', 'credit_reseller', false, null),
  ('Advantage Credit', 'ADVNTGE CRED', 'credit_reseller', false, null),
  ('Advantage Credit', 'ADVANTAGE', 'credit_reseller', false, null),
  ('Certified Credit Reporting', 'CERTIFIED CREDIT REPORT', 'credit_reseller', false, null),
  ('Certified Credit Reporting', 'CERTIFIED CREDIT REPOR', 'credit_reseller', false, null),
  ('Certified Credit Reporting', 'CRTFD CRDT', 'credit_reseller', false, null),
  ('Certified Credit Reporting', 'CCR', 'credit_reseller', false, null),
  ('Unisource Credit', 'UNISOURCE CREDIT', 'credit_reseller', false, null),
  ('Unisource Credit', 'UNISOURCE CR', 'credit_reseller', false, null),
  ('MFI Credits', 'MFICREDITS', 'credit_reseller', false, null),
  ('MFI Credits', 'MFI CREDITS', 'credit_reseller', false, null),
  ('Medallion', 'MEDALLION', 'other', false, null),
  ('Medallion', 'MEDALLION/CO', 'other', false, null),
  ('California Business Bureau', 'CALIFORNIA BUSINESS BU', 'other', false, null),
  ('California Business Bureau', 'CALIFORNIA BUSINESS BUREAU', 'other', false, null),
  ('BlueEleven Mortgage', 'BLUEELEVEN MORTGAGE', 'mortgage_lender', false, null),
  ('BlueEleven Mortgage', 'BLUEELEVEN MORTGAGE CA', 'mortgage_lender', false, null),
  ('BlueEleven Mortgage', 'BLUE ELEVEN MORTGAGE', 'mortgage_lender', false, null),
  ('Kikoff Lending', 'KIKOFF', 'personal_loan', false, null),
  ('Kikoff Lending', 'KIKOFF LENDING', 'personal_loan', false, null),
  ('Kikoff Lending', 'KIKOFF LENDING LLC', 'personal_loan', false, null),
  ('Upgrade', 'UPGRADE', 'personal_loan', false, null),
  ('Upgrade', 'UPGRADE INC', 'personal_loan', false, null),
  ('Upgrade', 'UPGRADE LOAN', 'personal_loan', false, null),
  ('Chime/Stride Bank', 'CHIME', 'bank', false, null),
  ('Chime/Stride Bank', 'CHIME-STRIDE', 'bank', false, null),
  ('Chime/Stride Bank', 'CHIME STRIDE', 'bank', false, null),
  ('Chime/Stride Bank', 'STRIDE BANK', 'bank', false, null),
  ('Austin Capital Bank', 'AUSTINCAPBK', 'bank', false, null),
  ('Austin Capital Bank', 'AUSTIN CAPITAL BANK', 'bank', false, null),
  ('Austin Capital Bank', 'AUSTIN CAP BK', 'bank', false, null),
  ('Department of Education/Aidvantage', 'DPT ED/AIDV', 'student_loan', false, null),
  ('Department of Education/Aidvantage', 'DEPT ED/AIDVANTAGE', 'student_loan', false, null),
  ('Department of Education/Aidvantage', 'DEPARTMENT OF EDUCATION', 'student_loan', false, null),
  ('Department of Education/Aidvantage', 'AIDVANTAGE', 'student_loan', false, null),
  ('Atlas', 'ATLAS', 'unknown', true, 'Keep as an exact alias but require account-type and contextual validation because multiple companies may use this name.'),
  ('Flex', 'FLEX', 'unknown', true, 'Classify using report context because this may represent a rental or rent-reporting account rather than a traditional lender.'),
  ('Progress Residential', 'PROGRESSRES', 'rental', false, null),
  ('Progress Residential', 'PROGRESS RESIDENTIAL', 'rental', false, null),
  ('Progress Residential', 'PROGRESS RES', 'rental', false, null),
  ('Rental Kharma/Residence', 'RK/RESIDENCE', 'rental', false, null),
  ('Rental Kharma/Residence', 'RENTAL KHARMA', 'rental', false, null),
  ('Rental Kharma/Residence', 'RESIDENCE', 'rental', false, null),
  ('Alaniz Auto', 'ALANIZ AUTO', 'dealership', false, null),
  ('Park Place Motorcars', 'PARK PLACE MOTORCARS', 'dealership', false, null),
  ('Park Place Motorcars', 'PARK P MOTOR', 'dealership', false, null),
  ('Park Place Motorcars', 'CBC/PARK PLACE MOTORCA', 'dealership', false, null),
  ('Family Toyota', 'FAMILY TOYOTA', 'dealership', false, null),
  ('Family Toyota', 'FAMILY TOYOT', 'dealership', false, null),
  ('Family Toyota', 'NCCINC/FAMILY TOYOTA O', 'dealership', false, null),
  ('Vandergriff Toyota', 'VANDERGRIFF', 'dealership', false, null),
  ('Vandergriff Toyota', 'VANDERGRIFF TOYOTA', 'dealership', false, null),
  ('EchoPark Automotive', 'ECHOPARK', 'dealership', false, null),
  ('EchoPark Automotive', 'ECHO PARK', 'dealership', false, null),
  ('EchoPark Automotive', 'ECHOPARK AUTOMOTIVE', 'dealership', false, null),
  ('Moritz Kia', 'MORITZ KIA', 'dealership', false, null),
  ('Moritz Kia', 'MORITZ KIA O', 'dealership', false, null),
  ('Audi Fort Worth', 'AUDI FORT WORTH', 'dealership', false, null),
  ('Audi Fort Worth', '700/AUDI FORT WORTH', 'dealership', false, null),
  ('BMW of Ontario', 'BMW OF ONTARIO', 'dealership', false, null),
  ('BMW of Ontario', 'BMW OF ONTAR', 'dealership', false, null),
  ('DCH Honda of Temecula', 'DCH HONDA OF TEMECULA', 'dealership', false, null),
  ('DCH Honda of Temecula', 'DCH HONDA OF TEMEC', 'dealership', false, null),
  ('DCH Honda of Temecula', '700/DCH HONDA OF TEMEC', 'dealership', false, null),
  ('Unknown AN# inquiry', 'AN#', 'unknown', true, 'Do not classify, delete, or mark non-linked automatically until its identity is confirmed.')
on conflict (lower(alias)) do nothing;

-- --------------------------------------------------------------------------
-- Dealership -> captive finance company relationships, straight from the
-- proposal's own worked examples (BMW of Ontario / BMW Financial
-- Services, DCH Honda of Temecula / American Honda Finance, etc.) plus
-- the same-brand pairings it's reasonable to infer. Left null for
-- EchoPark Automotive, Park Place Motorcars, and Alaniz Auto -- none of
-- these are single-brand dealerships with one obvious captive lender, and
-- guessing wrong here would recreate the false-positive-linking problem
-- this table exists to prevent.
-- --------------------------------------------------------------------------

update public.lender_aliases set related_canonical_name = 'BMW Financial Services'
  where canonical_name = 'BMW of Ontario';
update public.lender_aliases set related_canonical_name = 'American Honda Finance'
  where canonical_name = 'DCH Honda of Temecula';
update public.lender_aliases set related_canonical_name = 'Toyota Financial Services'
  where canonical_name in ('Family Toyota', 'Vandergriff Toyota');
update public.lender_aliases set related_canonical_name = 'Kia Finance America'
  where canonical_name = 'Moritz Kia';
update public.lender_aliases set related_canonical_name = 'Audi Financial Services'
  where canonical_name = 'Audi Fort Worth';

-- --------------------------------------------------------------------------
-- OPTIONAL verification queries:
-- --------------------------------------------------------------------------
-- select canonical_name, count(*) as alias_count from public.lender_aliases group by canonical_name order by alias_count desc;
-- select * from public.lender_aliases where requires_manual_review;
-- select * from public.lender_aliases where related_canonical_name is not null;
