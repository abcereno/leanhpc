# SmartCredit Static-IP Proxy Setup

Why this exists: `fetch_3b_raw` and `credit_analysis` (Supabase Edge Functions) log into SmartCredit's legacy `external-login` endpoint on the client's behalf. That endpoint started returning a Cloudflare "Attention Required" bot-protection challenge instead of a real login response. ConsumerDirect's Partner Integration team (John O'Neill) confirmed they can whitelist a specific IP to bypass that challenge for this login path while HPC migrates to their newer Passwordless Integration — but Supabase Edge Functions don't have a static outbound IP of their own to give them (confirmed via Supabase's own docs).

ConsumerDirect also confirmed the whitelisted IP **cannot be shared** with other companies. Most "static IP proxy" services (QuotaGuard, etc.) hand out IPs from a shared pool by default — a genuinely dedicated IP there means paying for their Enterprise tier. A small VPS sidesteps that entirely: the IP is exclusively ours by construction, nothing to negotiate.

This doc is the one-time setup for that VPS. The edge functions already route through it via `supabase/functions/_shared/proxy.ts` — nothing in the app code needs to change once this is done.

## 1. Provision a VPS

Any provider works — DigitalOcean, Linode, and AWS Lightsail all have a ~$5-6/mo tier that's more than enough for this (it's just forwarding a handful of requests a day). Cheapest/simplest option: DigitalOcean's smallest Droplet, Ubuntu 22.04 LTS.

This step has to be done by you directly (signing up for a hosting account isn't something that can be automated on your behalf). Once it's created, note:
- The VPS's public IP address — **this is the static IP** you'll give to ConsumerDirect.
- Root/SSH access to it.

## 2. Install and configure tinyproxy

SSH into the VPS, then run:

```bash
sudo apt update && sudo apt install -y tinyproxy
```

Edit the config:

```bash
sudo nano /etc/tinyproxy/tinyproxy.conf
```

Key settings to set/confirm:

```
Port 8888
Listen 0.0.0.0

# Auth is the actual security boundary here — Supabase's own outbound IPs
# aren't published/stable either, so there's no fixed IP to allowlist on
# the inbound side. Pick a long random username/password.
BasicAuth <choose-a-username> <choose-a-long-random-password>

# Defense in depth: even if credentials ever leaked, this stops the proxy
# being used as an open relay to anywhere else.
Filter /etc/tinyproxy/filter
FilterDefaultDeny Yes
```

Create the filter file so only SmartCredit traffic is allowed through:

```bash
sudo bash -c 'echo "www.smartcredit.com" > /etc/tinyproxy/filter'
```

Restart it:

```bash
sudo systemctl restart tinyproxy
sudo systemctl enable tinyproxy
```

Open the port in the firewall:

```bash
sudo ufw allow 8888/tcp
```

## 3. Test it from your own machine

```bash
curl -x http://<username>:<password>@<vps-ip>:8888 https://www.smartcredit.com -I
```

A response (even a redirect/HTML page, not a curl connection error) means the proxy itself is working. This does NOT yet confirm ConsumerDirect's whitelist — that's step 5.

## 4. Wire it into Supabase

```bash
npx supabase secrets set SMARTCREDIT_PROXY_URL="http://<username>:<password>@<vps-ip>:8888"
npx supabase functions deploy fetch_3b_raw
npx supabase functions deploy credit_analysis
```

## 5. Get the IP whitelisted and confirm end to end

Send the VPS's public IP to John O'Neill at ConsumerDirect, and confirm with him it's being added as a Cloudflare-level bypass for `external-login` (a firewall-only allowlist on their origin server won't fix a Cloudflare challenge — the block happens before traffic reaches their server at all).

Once he confirms it's in place, run a real Fetch3bModal import for a test client and confirm it succeeds. A local/manual `curl` test through the proxy only proves the proxy and the Supabase secret are wired correctly — it doesn't prove ConsumerDirect's whitelist is actually working the way it's supposed to. The deployed, real attempt is the only test that answers that.

## Ongoing maintenance

This is now infrastructure HPC owns, unlike a managed proxy service:
- Ubuntu security updates: `sudo apt update && sudo apt upgrade -y` periodically.
- If the VPS is ever recreated/resized, its public IP will likely change — ConsumerDirect's whitelist and the `SMARTCREDIT_PROXY_URL` secret would both need updating.
- If tinyproxy stops responding, `sudo systemctl status tinyproxy` / `sudo systemctl restart tinyproxy` on the VPS.

## Troubleshooting: requests blocked even though the IP is whitelisted

Confirmed with John O'Neill (2026-09-02, via Cloudflare's own ray-ID lookup on his end): ConsumerDirect only whitelisted the VPS's **IPv4** address (2.25.159.159). Most VPS providers also assign a public IPv6 address by default, and Ubuntu prefers IPv6 for outbound connections whenever both are available on the destination. tinyproxy was picking up that IPv6 address for its outbound connections to SmartCredit — an address ConsumerDirect never whitelisted — so Cloudflare blocked it and served the "Attention Required" challenge page instead of a real bot check. 22 clean requests went through on IPv4 between Aug 19–26; everything since switched to IPv6 and started failing.

Fix: pin tinyproxy's outbound connections to the VPS's IPv4 address with the `Bind` directive, so this can't happen again regardless of what the OS's routing table prefers.

```bash
sudo nano /etc/tinyproxy/tinyproxy.conf
```

Add (using the VPS's own public IPv4 — the same one given to ConsumerDirect):

```
Bind 2.25.159.159
```

Restart it:

```bash
sudo systemctl restart tinyproxy
```

Verify from the VPS itself — both should now report the same IPv4 address:

```bash
curl -4 ifconfig.me
curl ifconfig.me
```

Then run a real Fetch3bModal import for a test client and confirm it succeeds (a local curl test only proves tinyproxy is bound correctly, not that ConsumerDirect's firewall is happy — same caveat as step 5 above).

Optional extra hardening, since this box exists only to proxy SmartCredit traffic and has no reason to originate anything over IPv6: disable IPv6 on the VPS entirely so no future service on it can repeat this mistake.

```bash
sudo bash -c 'cat >> /etc/sysctl.conf <<EOF
net.ipv6.conf.all.disable_ipv6 = 1
net.ipv6.conf.default.disable_ipv6 = 1
EOF'
sudo sysctl -p
```
