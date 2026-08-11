-- Run this in the Supabase SQL editor to audit companies BEFORE relying on
-- the new hard lock (RequireCompanyAuth.jsx now blocks the whole portal
-- when is_subscription_active is false).
--
-- is_subscription_active was previously just a display label in
-- AddCompanyForm.jsx's "Manage Partner Subscriptions" tab -- it didn't
-- gate anything. This query surfaces any company that looks like it's
-- currently in use (has clients) but isn't marked active, since those are
-- the ones that would get locked out the moment this ships.

select
  c.id,
  c.company_name,
  c.subscription_plan,
  c.is_subscription_active,
  count(cl.id) as client_count,
  count(cl.id) filter (where cl.is_paid) as paid_client_count
from companies c
left join clients cl on cl.company_id = c.id
group by c.id, c.company_name, c.subscription_plan, c.is_subscription_active
order by
  -- surfaces the riskiest rows first: has real (paid) clients but is
  -- currently NOT marked as an active subscription
  (count(cl.id) filter (where cl.is_paid) > 0 and not coalesce(c.is_subscription_active, false)) desc,
  client_count desc;
