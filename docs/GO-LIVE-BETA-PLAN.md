# Go-Live Beta Plan — bowercabinets.com

**Date:** 2026-07-15
**Goal:** Put the website and kitchen planner live at `www.bowercabinets.com`, guarded so
only invited beta testers can get in, so the AI room scanner can be tested and refined on
real phones over real HTTPS.
**Cost:** $0/month (Cloudflare free plan; Cloudflare Access is free for up to 50 users).

## How the pieces fit (plain English)

GoDaddy is only where the domain name is registered — it does not need to host anything.
We point the domain at Cloudflare, which does three jobs at once:

1. **DNS** — tells browsers where `bowercabinets.com` lives.
2. **Pages** — free static hosting that builds both apps straight from GitHub. Every
   `git push` auto-deploys.
3. **Access** — the beta gate. A tester opens the site, types their email, receives a
   one-time PIN, and gets in only if their email is on your allowlist. No code changes;
   removing the gate at launch is deleting one policy. The URL never changes.

Supabase (database, edge functions, AI designer) is already live and is not affected —
browsers talk to it directly.

Final layout:

| URL | Serves | Repo |
|---|---|---|
| `www.bowercabinets.com` (+ bare domain) | Public website | `bower-cabinet-web-site` |
| `planner.bowercabinets.com` | Kitchen planner, wizard, scanner, admin | `bower-kitchen-planner` |

Both sit behind ONE Access gate (`*.bowercabinets.com`), so a tester logs in once and the
website → planner handoff links keep working.

## Part 1 — Accounts and DNS (Ben, one-time, ~15 min)

1. Create a free account at https://dash.cloudflare.com (use your normal email).
2. Cloudflare dashboard → **Add a domain** → `bowercabinets.com` → choose the **Free** plan.
   Cloudflare scans existing DNS records (there's nothing important yet) and then shows two
   nameservers, e.g. `ada.ns.cloudflare.com` and `bob.ns.cloudflare.com`.
3. GoDaddy → My Products → `bowercabinets.com` → DNS → **Nameservers → Change → Enter my
   own nameservers** → paste the two Cloudflare nameservers → save. Takes minutes to a few
   hours to propagate; Cloudflare emails you when the domain goes "Active".

Nothing else stays at GoDaddy. Domain renewal still happens there as normal.

## Part 2 — Deploy the two apps to Cloudflare Pages (~20 min)

For each repo (planner first, website second):

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the
   GitHub repo (`benberthelsen/bower-kitchen-planner-2e763145`, then the website repo).
2. Build settings:
   - Framework preset: **Vite** (or None)
   - Build command: `npm run build`
   - Build output directory: `dist`
3. Environment variables (Settings → Environment variables → Production), copied from each
   repo's `.env`:
   - Planner project: `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
     `VITE_SUPABASE_URL`
   - Website project: its `VITE_SUPABASE_*` values **plus**
     `VITE_PLANNER_URL=https://planner.bowercabinets.com` — this is the outstanding
     handover item; without it the "Open Kitchen Planner" links fall back to localhost.
4. Deploy, then add custom domains (project → Custom domains):
   - Planner project → `planner.bowercabinets.com`
   - Website project → `www.bowercabinets.com` and `bowercabinets.com`
   Cloudflare creates the DNS records and HTTPS certificates automatically.

`public/_redirects` (added to the planner repo alongside this plan) makes deep links like
`/wizard` and `/admin/leads` work on refresh. The website repo needs the same file —
`/* /index.html 200` — if it is also a single-page app.

## Part 3 — The beta gate (Cloudflare Access, ~10 min)

1. Cloudflare dashboard → **Zero Trust** (first visit asks for a team name — anything,
   e.g. `bower`; pick the **Free** plan).
2. Zero Trust → Settings → Authentication → confirm **One-time PIN** is enabled as a login
   method (it is by default). No passwords, nothing for testers to install.
3. Zero Trust → Access → Applications → **Add an application → Self-hosted**:
   - Application name: `Bower beta`
   - Application domain: `*.bowercabinets.com` — and add `bowercabinets.com` (bare) as a
     second domain entry so every page of both apps is covered.
   - Session duration: 1 week (testers re-verify weekly, not every visit).
4. Policy: name `Beta testers`, action **Allow**, include → **Emails** → list the beta
   testers' addresses (yours first). Save.

Adding/removing a tester later = editing that email list. Launching publicly later =
deleting the application. URLs, QR codes and printed links all keep working.

## Part 4 — Point the backend at the new origins (Ben or Claude, ~10 min)

1. **Edge function CORS** — the shared security helper only echoes allowed origins, so the
   live domains must be added. Supabase dashboard → Edge Functions → Secrets (or CLI):

   ```
   supabase secrets set SCANNER_ALLOWED_ORIGINS=https://www.bowercabinets.com,https://bowercabinets.com,https://planner.bowercabinets.com
   ```

   (Add localhost ports back into the list if you also want local dev against production
   functions; otherwise dev keeps using the built-in localhost defaults only when the env
   var is unset — so once this is set, include any origins you still use.)
2. **Supabase Auth URLs** (admin/staff login on the planner): Authentication → URL
   Configuration → Site URL `https://planner.bowercabinets.com`; add
   `https://planner.bowercabinets.com/**` and `https://www.bowercabinets.com/**` to
   Redirect URLs.
3. Nothing changes for the service-role edge functions (`promote-ai-design`,
   `submit-planner-enquiry`, `ai-designer`) beyond CORS — they are already deployed.

## Part 5 — Scanner beta smoke test (the point of all this)

The room scanner needs a real phone on real HTTPS — both are satisfied the moment Part 2-4
are done. First pass checklist:

1. On your phone, open `https://planner.bowercabinets.com/wizard` → email → PIN → in.
2. Camera/motion permission prompts appear (HTTPS secure context) — accept.
3. Scan a room → confirm dimensions/openings/services → generate AI designs → pick one →
   submit an enquiry.
4. Desktop: `https://planner.bowercabinets.com/admin/leads` → the enquiry is there →
   **Promote to Job** → draft job with editable cabinets opens in the trade planner.
5. Record (per implementation plan §3.3): deployed `ai-designer` version, live model ID,
   prompt version, and one successful production request — production state is never
   inferred from the repo.

Then iterate on the scanner freely: every `git push` to the planner repo redeploys
`planner.bowercabinets.com` in ~1 minute, still behind the gate.

## Known limits and notes

- **Access covers pages, not Supabase.** The wizard's own submission/AI endpoints live on
  `*.supabase.co` and are protected by their existing token/validation/rate-limit design,
  not by the beta gate. That matches the security model already in the master plan.
- **Website repo** (`bower-cabinet-web-site`) needs the same `_redirects` file and its
  production env vars set in its Pages project — it was not touched in this session.
- **50-user Access limit** on the free Zero Trust plan — plenty for a beta.
- **Email deliverability:** one-time PINs come from Cloudflare; tell testers to check spam
  the first time.

## Order of operations

| # | Step | Who | Blocked by |
|---|---|---|---|
| 1 | Cloudflare account + add domain + GoDaddy nameserver change | Ben | — |
| 2 | Pages project: planner (build, env, `planner.` domain) | Ben (Claude can drive the dashboard once logged in) | 1 |
| 3 | Pages project: website (build, env incl. `VITE_PLANNER_URL`, `www` + bare domains) | Ben/Claude | 1 |
| 4 | Zero Trust: Access app + email allowlist over `*.bowercabinets.com` | Ben/Claude | 1 |
| 5 | `SCANNER_ALLOWED_ORIGINS` secret + Auth redirect URLs | Ben/Claude | 2-3 |
| 6 | Phone scanner smoke test + record live versions | Ben | 2-5 |
