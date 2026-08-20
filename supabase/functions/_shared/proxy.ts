// supabase/functions/_shared/proxy.ts
//
// Routes outbound fetch() calls through a static-IP proxy so third-party
// services can allowlist a fixed IP instead of Supabase Edge Functions'
// normal shared/rotating egress IPs. First need: SmartCredit's
// `external-login` endpoint (fetch_3b_raw, credit_analysis) — per
// ConsumerDirect's own Partner Integration team, they can whitelist a
// known IP to let that legacy login path keep working while HPC migrates
// to their Passwordless Integration. Supabase Edge Functions have no
// static egress IP of their own (confirmed via Supabase's docs — outbound
// IPs "can change without prior notice"), so a proxy in front is the only
// way to give ConsumerDirect something stable to whitelist.
//
// Self-hosted VPS + tinyproxy (see SMARTCREDIT_PROXY_SETUP.md), NOT
// a shared-IP proxy service — ConsumerDirect explicitly told the client
// the whitelisted IP can't be shared with other tenants, and QuotaGuard's
// (and most similar services') default plan gives out IPs from a shared
// pool; a genuinely dedicated IP there requires an Enterprise-tier
// subscription. A small VPS is exclusively ours by construction, so this
// deliberately doesn't depend on any particular proxy vendor's tiering —
// any HTTP forward proxy (self-hosted tinyproxy, or a paid dedicated-IP
// service if that changes later) works here unmodified, since this file
// only needs a proxy URL in `http://user:pass@host:port` form.
//
// Code pattern is Deno's own documented way to route fetch() through an
// HTTP proxy: Deno.createHttpClient() with a `proxy` config, passed as
// the `client` option to fetch(). Deno does NOT read HTTP_PROXY/
// HTTPS_PROXY env vars for fetch() the way Node does, so this explicit
// client is required, not optional.
//
// Setup (one-time — see SMARTCREDIT_PROXY_SETUP.md for the full VPS
// + tinyproxy walkthrough):
//   1. Provision a small VPS (DigitalOcean/Linode/AWS Lightsail, ~$5-6/mo)
//      and note its public IP — that IP IS the static IP, exclusively
//      ours, nothing shared with any other tenant.
//   2. Install and configure tinyproxy on it with a username/password
//      (auth is the security boundary here, not inbound IP restriction —
//      Supabase's own egress IPs aren't published/stable either, so
//      there's nothing fixed to allowlist on the inbound side).
//   3. `supabase secrets set SMARTCREDIT_PROXY_URL="http://user:pass@<vps-ip>:8888"`
//   4. Give that VPS's public IP to ConsumerDirect's Partner Integration
//      contact (John O'Neill) to whitelist for external-login.
//   5. Deploy every function that imports this file, then test for
//      real — a local test only confirms the code/credentials are wired
//      correctly, not that ConsumerDirect's Cloudflare config actually
//      treats this IP as exempt. Confirm with a real deployed call.
//
// If SMARTCREDIT_PROXY_URL isn't set at all, proxiedFetch() falls back to
// a plain fetch() — so functions importing this never hard-fail just
// because the proxy hasn't been configured yet in a given environment
// (local dev, staging) — they just go out on whatever IP Supabase happens
// to assign, same as before this file existed.

function getProxyClient(): Deno.HttpClient | null {
  const proxyUrl = Deno.env.get("SMARTCREDIT_PROXY_URL");
  if (!proxyUrl) return null;

  const url = new URL(proxyUrl);
  return Deno.createHttpClient({
    proxy: {
      url: `${url.protocol}//${url.host}`,
      basicAuth: {
        username: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
      },
    },
  });
}

// Drop-in replacement for fetch() — same signature, routes through the
// static-IP proxy when SMARTCREDIT_PROXY_URL is configured, plain fetch()
// otherwise. Always closes the client afterward (an unclosed
// Deno.HttpClient leaks a connection per call).
export async function proxiedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const client = getProxyClient();
  if (!client) return fetch(input, init);

  try {
    return await fetch(input, { ...init, client });
  } finally {
    client.close();
  }
}
