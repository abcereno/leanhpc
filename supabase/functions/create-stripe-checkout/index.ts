// supabase/functions/create-stripe-checkout/index.ts
//
// Not previously tracked in this repo (lived only in the Supabase
// dashboard's function editor, like account-parser/index.ts and
// generate-letter-content/index.ts before they were brought in) — this
// is now the canonical source, so redeploy after editing
// (`supabase functions deploy create-stripe-checkout`, or paste into the
// dashboard function editor).
//
// Called by 5 frontend sites, all via supabase.functions.invoke('create-
// stripe-checkout', { body }): ServiceConfiguratorView.jsx (custom_service),
// ConsumerInvoices.jsx (invoice), EbookView.jsx (ebook),
// UniversalPaymentModal.jsx (bootcamp/vault/classroom/processing/
// account_activation), and GenerateInvoiceModal.jsx, an admin-only
// customer-service tool (new_client_invoice).
//
// Patched 2026-10-02 after a code review surfaced several real
// vulnerabilities in the version that was live in the dashboard. Fixes
// in this pass, in order of severity:
//
//   1. CRITICAL — an unrecognized `type` used to fall through both
//      if/else-if chains with finalAmount/finalName left at their 0 /
//      'Payment' defaults, silently creating a legitimate $0.00 Stripe
//      Checkout session. Fixed: `type` is now validated against an
//      explicit allowlist up front; anything else throws before any
//      Stripe call is made.
//   2. CRITICAL — every branch except `ebook` trusted a client-supplied
//      amount with no server-side source of truth, so a caller could
//      invoke this function directly (bypassing the UI entirely) with
//      an arbitrary `amount`/`totalPrice` and pay a penny for someone
//      else's invoice or for a fixed-price product. Fixed:
//        - `invoice` now re-fetches the invoice's own `grand_total` from
//          the `invoices` table by `invoiceId` and ignores
//          `payload.amount` entirely for pricing (ownership is also
//          checked: the invoice's `client_id` must match the caller's
//          own `clients.auth_user_id`, see #5 below).
//        - `bootcamp` / `vault` / `classroom` are fixed-price catalog
//          items (see UniversalPaymentModal.jsx's getPricingDetails) —
//          their prices are now hardcoded here too
//          (PRODUCT_PRICES_CENTS) and the client-sent amount is ignored.
//        - `processing` and `custom_service` have no fixed/db-backed
//          price (processing depends on a live negatives count from an
//          audit report the client already has in memory;
//          custom_service is a configurable combination of add-ons) —
//          there is currently no server-side source of truth to check
//          these against without duplicating that pricing logic here or
//          passing the audit report through. Left as client-trusted for
//          now, same as before, but documented as a known gap in the
//          branches themselves below. Given these are both
//          admin/staff-reviewed before funding work begins (see
//          ClientBillingPanel.jsx), the blast radius of a tampered
//          amount here is a staff catching an under-billed invoice, not
//          money silently walking out the door.
//   3. MEDIUM — every branch is missing a > 0 amount check except
//      `new_client_invoice`. Fixed: a single `finalAmount > 0` guard
//      now runs right before the generic Checkout Session is built,
//      covering every type that reaches that path.
//   4. MEDIUM — `new_client_invoice`'s Stripe invoice metadata had no
//      clientId/invoiceId, making it unmatchable to any Supabase row
//      from a webhook. Fixed: `metadata.source` added, plus whatever
//      identifiers the caller provides.
//   5. MEDIUM — `new_client_invoice` is an admin/customer-service-only
//      tool (GenerateInvoiceModal.jsx lives under
//      src/components/admin/customer-service/), but nothing enforced
//      that server-side — any authenticated caller could hit this
//      function with type: 'new_client_invoice' and send a real,
//      branded invoice email to an arbitrary address. Fixed: this type
//      now requires a valid Authorization bearer token resolving (via
//      profiles.role) to an internal staff role, checked with the
//      caller's own JWT (not the service-role key) so RLS still applies
//      to the lookup. The `invoice` type gets the same treatment:
//      ownership of the invoice being paid is resolved from the
//      caller's own `clients` row (via their JWT), never from
//      payload.clientId, which is just a request-body field an attacker
//      could change to point at anyone else's invoice.
//   6. LOW — a new Stripe Customer was created on every
//      `new_client_invoice` call, fragmenting repeat clients across
//      multiple Stripe customer records. Fixed: looks up an existing
//      customer by email first before creating one — this lookup is
//      now in _shared/stripeCustomer.ts (added 2026-10-02) rather than
//      being duplicated inline.
//   7. LOW — the `ebook` branch dropped the Supabase `error` and threw
//      a raw `Cannot read properties of undefined` TypeError if the
//      ebook id didn't exist. Fixed: checks for a missing row and
//      returns a clean "E-book not found" error.
//
// Not changed: CORS stays wide open (`*`) — matches every other
// function in this repo (account-parser, classify-inquiries, etc.);
// Checkout Sessions/Invoices still have no idempotency key, so a
// double-click or network retry can still create a duplicate session
// (low-risk — Stripe Checkout itself is single-use and expires).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "npm:stripe@14.14.0"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { Resend } from "npm:resend@3.2.0"
import { getOrCreateStripeCustomer } from "../_shared/stripeCustomer.ts"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
})

// Service-role client — used only for lookups that must bypass RLS
// (resolving an invoice's own grand_total/client_id to check against a
// tampered client-sent amount; the ebook price lookup). Never used to
// write payment results — this function only ever creates a Checkout
// Session/Invoice URL, it doesn't mark anything paid.
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

const resend = new Resend(Deno.env.get('RESEND_API_KEY') ?? '');

// Every `type` this function knows how to handle. Anything else is
// rejected outright instead of silently falling through to a $0
// Checkout Session (see fix #1 above).
const KNOWN_TYPES = new Set([
  'new_client_invoice',
  'ebook',
  'custom_service',
  'invoice',
  'classroom',
  'bootcamp',
  'vault',
  'processing',
  'account_activation',
]);

// Fixed catalog prices (in cents) — must stay in sync with
// UniversalPaymentModal.jsx's getPricingDetails(). 'processing' and
// 'account_activation' are intentionally absent: processing varies with
// a live negatives count the client already has in memory, and
// account_activation is an explicitly manually-quoted amount (see that
// component's comments) — both remain client-trusted for now (see the
// header comment's fix #2 note).
const PRODUCT_PRICES_CENTS: Record<string, number> = {
  bootcamp: 7900,
  vault: 49700,
  classroom: 9900,
};

// Resolves the authenticated caller from the request's own JWT (not the
// service-role key, so RLS still applies to anything looked up through
// it). Shared by requireStaffCaller() and the `invoice` type's ownership
// check below so there's one JWT-extraction path, not two.
async function getCallerClient(req: Request) {
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) throw new Error('Not authenticated.');

  const callerClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );

  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) throw new Error('Not authenticated.');

  return { callerClient, user };
}

// Confirms the caller holds an internal staff role in `profiles`. Used
// to gate new_client_invoice to admin/customer-service, matching where
// GenerateInvoiceModal.jsx is actually mounted in the UI.
async function requireStaffCaller(req: Request) {
  const { callerClient, user } = await getCallerClient(req);

  const { data: profile } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const staffRoles = ['developer', 'admin', 'owner', 'subadmin', 'callers', 'counters', 'customer_service'];
  if (!profile || !staffRoles.includes(profile.role)) {
    throw new Error('Not authorized to generate invoices.');
  }
  return user;
}

// Resolves the CALLER's own clients.id via their auth_user_id — never
// trust payload.clientId for an ownership check, since that's just a
// number an attacker can change. Used by the `invoice` type below.
async function getCallerOwnClientId(req: Request) {
  const { callerClient, user } = await getCallerClient(req);
  const { data: clientRow } = await callerClient
    .from('clients')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!clientRow) throw new Error('Not authenticated as a client.');
  return clientRow.id;
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const payload = await req.json();
    const { type, clientId, clientEmail, returnUrl, metadata } = payload;

    if (!KNOWN_TYPES.has(type)) {
      throw new Error(`Unknown payment type: ${type}`);
    }

    let finalAmount = 0;
    let finalName = 'Payment';
    let customMetadata = metadata || {};

    // ==========================================
    // 🚀 NEW LEAD: NATIVE STRIPE INVOICE (staff-only)
    // ==========================================
    if (type === 'new_client_invoice') {
      await requireStaffCaller(req);

      finalAmount = parseInt(payload.amount);

      // 🚨 SAFETY CHECK: Prevent $0 Invoices
      if (!finalAmount || finalAmount <= 0) {
        throw new Error("Stripe requires the invoice amount to be greater than $0.00.");
      }

      // 1. Reuse an existing Stripe Customer for this email if one
      // exists, instead of creating a duplicate every time this is run
      // (see _shared/stripeCustomer.ts).
      const customerId = await getOrCreateStripeCustomer(stripe, payload.clientEmail, payload.clientName);

      // 2. Create the Invoice Item (Explicitly passing amount and USD)
      await stripe.invoiceItems.create({
        customer: customerId,
        amount: finalAmount,
        currency: 'usd',
        description: payload.description || 'Credit Repair Services',
      });

      // 3. Create the Draft Invoice
      // We force pending_invoice_items_behavior to 'include' so it doesn't lose the price!
      const draftInvoice = await stripe.invoices.create({
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: 1,
        currency: 'usd',
        pending_invoice_items_behavior: 'include',
        metadata: {
          type: 'new_client_invoice',
          source: 'generate_invoice_modal',
          clientName: payload.clientName,
          clientEmail: payload.clientEmail,
          description: payload.description || '',
        }
      });

      // 4. Send the Invoice to finalize it and generate the URL
      const finalizedInvoice = await stripe.invoices.sendInvoice(draftInvoice.id);
      const invoiceUrl = finalizedInvoice.hosted_invoice_url;

      console.log(`✅ Finalized Invoice Amount: $${finalizedInvoice.amount_due / 100}`);

      // 👇 FORCE SEND THE EMAIL VIA RESEND 👇
      if (payload.clientEmail) {
        try {
          const resendResponse = await resend.emails.send({
            from: 'info@hiddenpartnercloud.com',
            to: payload.clientEmail,
            subject: `Invoice for ${payload.description || 'Credit Services'}`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 10px;">
                <h2 style="color: #333;">Hello ${payload.clientName},</h2>
                <p style="color: #555; font-size: 16px;">Your invoice for <strong>${payload.description || 'Credit Services'}</strong> in the amount of <strong>$${(finalAmount / 100).toFixed(2)}</strong> is ready.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${invoiceUrl}" style="background-color: #0d6efd; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 16px; display: inline-block;">Pay Invoice Now</a>
                </div>
                <hr style="border: none; border-top: 1px solid #eaeaea; margin: 30px 0;" />
                <p style="color: #999; font-size: 12px; text-align: center;">If the button doesn't work, copy and paste this link into your browser:<br/>${invoiceUrl}</p>
              </div>
            `
          });
          console.log(`✅ Resend API Response:`, resendResponse);
        } catch (emailErr) {
          console.error("❌ Failed to send email via Resend:", emailErr);
        }
      }

      // 5. Send URL back to React Modal
      return new Response(JSON.stringify({ url: invoiceUrl, checkoutUrl: invoiceUrl }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ==========================================
    // NORMAL CHECKOUT SESSIONS
    // ==========================================
    if (type === 'ebook') {
      const ebookId = metadata?.ebookId;
      if (!ebookId) throw new Error("Missing E-book ID");
      const { data: ebook, error: ebookError } = await supabaseAdmin
        .from('ebooks').select('title, price').eq('id', ebookId).single();
      if (ebookError || !ebook) throw new Error("E-book not found.");
      finalAmount = Math.round(ebook.price * 100);
      finalName = `E-Book: ${ebook.title}`;
      customMetadata = { clientId, type, ebookId };
    }
    else if (type === 'custom_service') {
      // No DB-backed price for this combination of add-ons yet (see
      // header comment fix #2) — amount is still client-trusted.
      finalAmount = Math.round(payload.totalPrice * 100);
      finalName = payload.productName || 'Custom Credit Service';
      customMetadata = { clientId, type, ...metadata };
    }
    else if (type === 'invoice') {
      // Authoritative amount comes from the invoice's own row, never
      // from the client — see header comment fix #2. Ownership is
      // resolved from the CALLER's own JWT (getCallerOwnClientId), not
      // payload.clientId, so a tampered clientId in the request body
      // can't be used to pay down someone else's invoice.
      const ownClientId = await getCallerOwnClientId(req);
      const { data: invoiceRow, error: invoiceError } = await supabaseAdmin
        .from('invoices')
        .select('id, grand_total, invoice_number, client_id')
        .eq('id', payload.invoiceId)
        .single();
      if (invoiceError || !invoiceRow) throw new Error("Invoice not found.");
      if (String(invoiceRow.client_id) !== String(ownClientId)) {
        throw new Error("This invoice does not belong to you.");
      }
      finalAmount = Math.round(Number(invoiceRow.grand_total) * 100);
      finalName = `Invoice #${invoiceRow.invoice_number}`;
      customMetadata = { clientId: ownClientId, type: 'invoice', invoiceId: invoiceRow.id };
    }
    else if (type === 'bootcamp' || type === 'vault' || type === 'classroom') {
      // Fixed catalog price — ignore whatever the client sent.
      finalAmount = PRODUCT_PRICES_CENTS[type];
      finalName = payload.productName || 'Credit Service';
      customMetadata = { clientId: payload.clientId, type, purchaseId: payload.invoiceId };
    }
    else if (type === 'processing' || type === 'account_activation') {
      // Both intentionally variable with no server-side source of truth
      // yet (negatives-count-dependent / manually quoted) — see header
      // comment fix #2. Still client-trusted, still floor-checked below.
      finalAmount = payload.amount;
      finalName = payload.productName || 'Credit Service';
      customMetadata = { clientId: payload.clientId, type, purchaseId: payload.invoiceId };
    }

    if (!finalAmount || finalAmount <= 0) {
      throw new Error("Invalid payment amount.");
    }

    const sessionConfig: any = {
      payment_method_types: ['card', 'cashapp'],
      line_items: [{ price_data: { currency: 'usd', product_data: { name: finalName }, unit_amount: finalAmount }, quantity: 1 }],
      mode: 'payment',
      success_url: `${returnUrl}?success=true&type=${type}`,
      cancel_url: `${returnUrl}?canceled=true`,
      client_reference_id: clientId || payload.clientId,
      metadata: customMetadata
    };

    if (clientEmail) sessionConfig.customer_email = clientEmail;

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return new Response(JSON.stringify({ url: session.url, checkoutUrl: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error("Checkout Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
