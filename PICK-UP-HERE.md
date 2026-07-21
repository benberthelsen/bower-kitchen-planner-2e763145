# Bower Kitchen Planner — Pick-Up Brief (Go-Live Beta)

**Project:** AI kitchen planner + room scanner → bowercabinets.com beta
**Owner:** Ben Berthelsen (benberthelsen@gmail.com)
**Repo on Ben's machine:** `C:\Users\bench\Claude\Projects\kitchen online planner\bower-kitchen-planner`
**Written:** 19 July 2026, reconstructed after the previous Claude conversations were lost in an app reinstall. The repo's `docs/` folder is the real memory — read it before doing anything.

## Read these repo docs first (in this order)

1. `docs/PRE-LIVE-AUDIT-2026-07-16.md` — latest full status + prioritized findings
2. `docs/GO-LIVE-BETA-PLAN.md` — the Cloudflare go-live checklist
3. `docs/HANDOVER-2026-07-14.md` — architecture pointers + working constraints
4. `docs/workstreams/WS1–WS11` — per-area status

## Stack & environment

Vite + React + TS + Tailwind + shadcn + three.js (react-three-fiber). Dev on :8081. Supabase project `bower-cabinet-ai`, ref `ehtwywctledgkxexztbh` (Sydney), RLS on, Deno edge functions. AI designer edge function uses OpenAI function-calling (model `gpt-5.6-terra` at audit time, with `reasoning_effort: 'none'` workaround). Deterministic layout engine in `src/lib/layout/`; regenerate shared copies with `node scripts/sync-ai-shared.mjs`. Pricing engine `src/lib/pricing/` (×1.35 commercial layer + GST).

## Status as of the 2026-07-16 audit

The full pipeline works end-to-end in production for the first time: wizard → AI generation (3 validated options) → selection → enquiry → Admin Leads → promote to draft job (#495 verified). Automated suite fully green (placement sweep of 45,360 combos: 0 bugs). Verdict: **GO for gated beta once P1 items 1–2 are fixed.**

### P1 (fix before/during beta)
1. **Analytics inserts 403 in production** — fix migration `20260716090000_funnel_events_hardening.sql` written; *pending: apply to production + re-test*.
2. **Lead alert emails never send** — server-side send implemented in `submit-planner-enquiry`; *pending: deploy + set production secrets `RESEND_API_KEY`, `ADMIN_EMAIL`, `FROM_EMAIL` (Ben must create a Resend account + verified sender domain — no email can send until then)*.
3. `send-email` hardening implemented; *pending deploy*.
4. `staff` role second-class (fine while Ben is sole operator; fix before adding staff).

Rate-limit migration `20260716090100_edge_rate_limits.sql` also pending apply + deploy. Deploy commands (after applying migrations via SQL Editor):

```powershell
supabase functions deploy ai-designer --use-api --no-verify-jwt
supabase functions deploy submit-planner-enquiry --use-api --no-verify-jwt
supabase functions deploy send-email --use-api --no-verify-jwt
```

Ben should also set a hard OpenAI monthly spend cap in the OpenAI dashboard.

## Go-live checklist (from GO-LIVE-BETA-PLAN.md) — Ben's side

1. Cloudflare free account → add domain `bowercabinets.com` → change GoDaddy nameservers.
2. Cloudflare Pages: planner repo → `planner.bowercabinets.com`; website repo → `www.` + bare domain. Vite preset, `npm run build`, output `dist`, env vars from each repo's `.env` (+ `VITE_PLANNER_URL=https://planner.bowercabinets.com` on the website project — without it the planner links fall back to localhost).
3. Cloudflare Zero Trust Access gate over `*.bowercabinets.com`, one-time PIN, email allowlist.
4. `supabase secrets set SCANNER_ALLOWED_ORIGINS=...` + Supabase Auth redirect URLs.
5. Phone smoke test of the room scanner over real HTTPS (the whole point of the beta).

## Working constraints (IMPORTANT — from the handover)

- Cowork sandbox file mounts have served **stale/truncated file content** for this repo. Verify with host-side reads; **Ben commits and deploys**, not the agent.
- Generated `supabase/functions/_shared/layout/*` files must be produced by running `sync-ai-shared.mjs` on the host, then checked with `git status` before deploy.
- Public bundle must never carry raw supplier costs — costs come from the DB (`material_pricing`, authenticated-only RLS).
- Supabase writes are approval-gated; don't retry-spam denied writes.

## Known deferred work

- AI planner needs a bigger rework (Ben's words: "needs a lot more work"); trade-side AI panel (JobEditor has no "Design with AI" button yet — reuse `StepDesign` + `useAiDesigner` + `handoffBrief`).
- RLS decision on `microvellum_products` anon readability (WS6).
- Bundle size (~3 MB main chunk) — code-split later, not a beta blocker.

## First actions for a new session

1. Ask Ben to connect the repo folder (and the website repo if the session touches the handoff).
2. Confirm with Ben what's already done from the pending list above — the audit is 3 days old.
3. Drive the P1 fixes and the Cloudflare checklist to done, then the phone scanner beta test.
