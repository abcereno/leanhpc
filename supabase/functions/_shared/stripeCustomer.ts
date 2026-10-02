// supabase/functions/_shared/stripeCustomer.ts
//
// Extracted 2026-10-02 from create-stripe-checkout/index.ts's
// new_client_invoice branch, which looked up an existing Stripe
// Customer by email before creating one, to avoid fragmenting a repeat
// client across multiple Stripe customer records.
import Stripe from "npm:stripe@14.14.0";

export async function getOrCreateStripeCustomer(
  stripe: Stripe,
  email: string,
  name?: string
): Promise<string> {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data.length > 0) {
    return existing.data[0].id;
  }
  const customer = await stripe.customers.create({ email, name });
  return customer.id;
}
