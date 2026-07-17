# Pre-Live Audit — 2026-07-16

Full-program dry run, security cross-check and dead-code scan ahead of the
bowercabinets.com beta (see `GO-LIVE-BETA-PLAN.md`). Everything below was
verified against the live production project (`bower-cabinet-ai`,
`ehtwywctledgkxexztbh`) and the repository as of this date.

## 1. Headline result

The complete customer-to-staff pipeline now works end-to-end in production for
the first time: wizard room entry → AI generation (3 distinct validated
options with price bands and rationale) → selection → style → review → atomic
enquiry submission → Admin Leads → staff promotion → draft job #495 with a
real editable cabinet room. Two production-blocking faults were found and
fixed during the run (§2). The automated suite is fully green (§3). Remaining
findings are prioritized in §4.

## 2. Faults found by the dry run — FIXED during the audit

| # | Fault | Root cause | Fix applied |
|---|---|---|---|
| 1 | "Design my kitchen with AI" always failed with `designer_persistence_unavailable` — every wizard user silently got the standard-layout fallback | The `20260714110000_ai_designer_v2_persistence.sql` migration was never applied to production; the deployed function could not create sessions | Applied the full migration (tables, RLS, RPCs, 321-row provisional capability seed) via SQL Editor + PostgREST schema reload, with user approval |
| 2 | After fix 1, generation failed with `designer_provider_failed` | OpenAI rejects function tools on `/v1/chat/completions` for `gpt-5.6-terra` unless `reasoning_effort: 'none'` is set (verified with a temporary server-side probe; key and model were both valid) | Added `reasoning_effort: 'none'` to the ai-designer request body and redeployed. Remove when the §8.3 Responses-API migration lands |

**Live production versions recorded (plan §3.3):** function `ai-designer`
(redeployed 2026-07-16), model `gpt-5.6-terra` (no `OPENAI_MODEL` override
set), prompt `ai-designer-v2.1`, engine `layout-v1.1`, successful live
request: 3 options generated for a 4.2 × 3.0 m L-shape brief. `promote-ai-design`
deployed and verified live (job #495, 15 converted items, quote warnings
carried). The temporary `ai-health` diagnostic function was deleted after use.

## 3. Automated verification (all passing)

Layout smoke (proposal IDs, room patches, hard appliance rules); designer V2
contracts (8 scenarios); designer persistence (RLS, hashed tokens, stale
revisions, approved-only resolution); trade-adapter round trip (8 checks);
functional workflow model; snapping/autoplace (15); opening warnings (9);
candidate generator; rule packs; room-scan contract/fingerprint/WebXR fit
(47 + 12 + 12); placement sweep 45,360 combinations — 0 placement bugs, 0
missing essentials, sane prices; `tsc` room-scan compat; ESLint 0 errors
(63 `no-explicit-any` warnings); production Vite build OK.

## 4. Findings to resolve (prioritized)

### P1 — fix before or during beta

1. **Analytics inserts are rejected in production (403).** Every
   `funnel_events` POST from the wizard fails. The repo migration grants anon
   INSERT, so production either never received that policy or it was changed.
   Effect: `trackEvent()` data is silently lost (submission itself is
   unaffected). Fix: re-apply the funnel_events policies in production and
   re-test; also consider rate limits.
2. **New-lead alert emails never send for anonymous wizard users.**
   `send-email` requires an authenticated JWT, but the wizard invokes it with
   the anon key; the 401 is swallowed by a `catch`. Staff get no email for new
   leads (they do appear in Admin → Leads). Fix options: allow the `new_lead`
   template specifically for anon (fixed recipient = `ADMIN_EMAIL`, keep rate
   limiting), or send it server-side from `submit-planner-enquiry` with the
   service role.
3. **`send-email` lets any authenticated user email arbitrary addresses.**
   `quote_confirmed` / `job_status_change` take the recipient from the request
   payload, so any logged-in trade customer could send Bower-branded emails to
   anyone. Fix: derive recipients server-side from the job record; restrict
   callers to staff/service-role.
4. **`staff` role is second-class.** `is_bower_staff()` (DB) accepts
   admin+staff, but `useAuth` only recognizes `admin`, and the `jobs` RLS
   policies for viewing/updating all jobs are admin-only. A user granted
   `staff` cannot open /admin or list leads, yet could promote via API. Fine
   while Ben (admin) is the only operator; align before adding staff users.

### P2 — cleanups and hardening

5. **Wildcard CORS + stale default URL in `send-email`.** Uses `*` origins
   (older pattern) and defaults `admin_url` to `app.bowerkitchens.com.au`.
   Move to the shared exact-origin helper and the new domain during go-live.
6. **`funnel_events` readable by every authenticated user** (including trade
   customers). Restrict SELECT to staff.
7. **Stored-SVG injection surface.** `UnifiedCatalog.tsx` renders
   `thumbnail_svg` from the products table with `dangerouslySetInnerHTML`.
   Only admin-imported data reaches it (import function verifies admin), so
   risk is low; sanitize (e.g. DOMPurify) when convenient.
8. **Committed `.env`.** Contains only the public URL/publishable key (safe by
   design), but it's on GitHub; move to `.env.example` + untracked `.env` to
   keep habits clean.
9. **Temporary auth fail-open.** `ProtectedRoute` deliberately lets legacy
   `consumer` profiles into `/trade/*` routes ("prevent redirect loops").
   Revisit before public launch.
10. **Bundle size.** Main chunk ~2.98 MB (836 KB gzip). Code-split the 3D
    planner and admin routes when convenient; not a beta blocker.
11. **Admin job page counts cabinets differently from the promote toast**
    (12 vs 15): panels/fillers/appliance items are counted in conversion but
    not shown in the room table. Cosmetic; verify which count staff should see.

### npm audit (production deps)

1 high (DOMPurify XSS via a transitive dependency; upgrade path exists) and
2 moderate advisories at audit time. Run `npm audit` and take the non-breaking
`npm audit fix` before beta; the `--force` upgrades can wait.

## 5. Dead code / dead ends

No orphan pages (every page component is routed), no legacy `external-supabase`
shim references remain, no junk files tracked by git, and only one TODO in
`src`. The `/admin/analytics` sidebar link has a matching route. `docs/`
history files (`AI-DESIGNER-HARNESS-PLAN.md`, `AI-DESIGNER-BUILD-STATUS.md`)
remain marked as superseded history — leave as is.

## 6. Environment note for future agent sessions

The Cowork sandbox mount served stale/truncated file content for this repo
(package.json, generated `_shared` files) — a truncated generated file even
reached a deploy attempt. Verification must run on the host (Desktop
Commander / Ben's shell), and generated `_shared` files should always be
produced by running `node scripts/sync-ai-shared.mjs` on the host, then
sanity-checked with `git status` before `supabase functions deploy`.

## 6.1 Beta-prep implementation status (added later on 2026-07-16)

Items 1–5 of the pre-beta slice are implemented in the repository and verified
(transpile-clean; migrations complete):

- **P1.1 analytics:** `20260716090000_funnel_events_hardening.sql` re-asserts
  grants + anon INSERT policy and restricts SELECT to staff. *Pending: apply
  to production and re-test a wizard insert.*
- **P1.2 lead emails:** `submit-planner-enquiry` now sends the `new_lead`
  alert server-side with the service role; the dead client-side call was
  removed from `Wizard.tsx`. *Pending: deploy, and note the production
  secrets `RESEND_API_KEY`, `ADMIN_EMAIL` and `FROM_EMAIL` are NOT set — no
  email can send until Ben adds a Resend API key and verified sender domain.*
- **P1.3 send-email hardening:** service-role or Bower-staff JWT only;
  `new_lead` recipient fixed to `ADMIN_EMAIL` and service-initiated only;
  shared exact-origin CORS helper; generic public errors; stale default
  admin URL now points at planner.bowercabinets.com. *Pending: deploy.*
- **Item 3 durable rate limiting:** `20260716090100_edge_rate_limits.sql`
  (deny-by-default table + `bump_edge_rate_limit_v1`, service_role-only) and
  `ai-designer` now checks the shared Postgres window with the in-memory
  limiter as fast path/fallback. *Pending: apply migration + deploy. Also set
  a hard OpenAI monthly spend cap in the OpenAI dashboard (Ben).*
- **Item 4 mobile state:** `Wizard.tsx` persists state to sessionStorage
  (24 h cap, URL params win, cleared on submission) so phone tab reloads no
  longer lose a scan/design.
- **Item 5 photos:** verified — the WebXR scan page captures geometry only;
  no photo upload path exists before Phase 1C. Nothing to disable.

Deployment commands (after applying the two new migrations via SQL Editor):

```powershell
supabase functions deploy ai-designer --use-api --no-verify-jwt
supabase functions deploy submit-planner-enquiry --use-api --no-verify-jwt
supabase functions deploy send-email --use-api --no-verify-jwt
```

## 7. Go / no-go for gated beta

**Go**, once P1 items 1–2 are fixed (analytics + lead alert emails), since
both directly affect what the beta is meant to measure. P1 items 3–4 are
required before any non-Ben staff or real customers use the system outside
the gate. The beta infrastructure itself proceeds per `GO-LIVE-BETA-PLAN.md`.
