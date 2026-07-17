# CRM Integration Plan — build-flow → Bower platform

**Date:** 2026-07-17
**Stage:** next build-out stage after the beta-prep slice (see
`GO-LIVE-BETA-PLAN.md`, `PRE-LIVE-AUDIT-2026-07-16.md`).
**Goal:** move the build-flow CRM off Lovable **without losing any of its live
data**, then link the website, kitchen planner and CRM so leads, jobs and
quotes flow through one system.

## 1. What was found (verified 2026-07-17)

The CRM (`benberthelsen/build-flow`, also in Downloads) is a Lovable-built
React/Vite app and it is much larger than the planner:

| | CRM (build-flow) | Planner (bower-kitchen-planner) |
|---|---|---|
| Supabase project | `cfwywsrhwnfqzdxcgnmm` | `ehtwywctledgkxexztbh` (bower-cabinet-ai) |
| In Ben's Supabase account? | **NO — Lovable-managed** | Yes |
| Migrations / tables | 196 / ~110 | ~40 tables |
| Edge functions | 69 (email→lead extraction, AI scheduling, contracts, e-sign, SMS, Xero/Google/Microsoft OAuth, client portals, Microvellum sync) | 14 |
| Live business data | **Yes — in daily use** | Test/seed data only |

Three facts drive everything below:

1. **The CRM's database is not in your Supabase account.** `supabase projects
   list` shows only bower-cabinet-ai. The data lives in a Lovable-managed
   project — so "removing it from Lovable" is not just re-hosting the app; the
   **database itself must be exported and moved** to a project you own.
2. **Table names collide.** Both systems define `jobs`, `profiles`,
   `user_roles`, `suppliers` and more, with different shapes. The two schemas
   cannot be naively merged into one `public` schema.
3. **The CRM already has the lead machinery** (`leads`, `lead_notes`,
   `extract-lead-from-email`, `intake-processor`, inbox, notifications) and
   even `kitchen_designs` / `kitchen_jobs` tables. Once linked, the planner's
   stopgap Resend `send-email` alert becomes unnecessary — the CRM is the
   proper destination for wizard leads.

Anon-key probing of the CRM's REST API returns zero rows (RLS deny-by-default
holds), so row counts must be checked from inside once access is confirmed.

## 1.1 C0 progress (2026-07-17, via Lovable dashboard)

- Confirmed the CRM runs on **Lovable Cloud** (project "Buildflow Pro",
  workspace `bowercabinets`, created Dec 2025; 1,885 messages / 1,130 AI
  edits). Backend verified live: **117 tables** (messages 1,586 rows,
  notifications 735, budget_items 666, tasks ~595…), 73 edge functions,
  7 storage buckets, 4 auth users, DB 0.66 GB, Xero/Twilio/VAPI/DocuSeal/
  Google secrets configured. Daily automatic backups exist (~14 days
  retained) but are restore-only, not downloadable.
- **Official database export STARTED** (Cloud → Overview → Advanced settings
  → Export project data → Database → Start export). Lovable emails a
  temporary download link and saves the export to Cloud storage. Limit: one
  export per 24 h; export excludes storage files, function code (in GitHub
  already) and secret values.
- **Export downloaded and verified (2026-07-17).** `jobsite-zen_260716.backup`
  (9.99 MB, valid PGDMP custom-format archive, 161 table-data sections).
  Contents confirmed to include the full `public` schema (leads, jobs,
  quotes, clients, messages, tasks, notifications…) **and the `auth` schema
  (users/identities)** — so staff logins migrate too. Copies: 1) Downloads,
  2) `bower-kitchen-planner/backups/crm-database-export-2026-07-16.backup`
  (gitignored), 3) the export also remains in the project's Cloud storage.
- Still to do in C0: download the 7 storage buckets (contract-templates,
  company-logos/photos/assets, client-portal-uploads, job-documents),
  and test-restore the dump into a scratch Supabase project (needs a new
  project on Ben's account — his call, then Claude executes). Secret VALUES
  must be re-entered from each provider when bower-crm is set up (they
  cannot be exported).

## 2. Phase C0 — Safeguard the data FIRST (before anything else)

Nothing else starts until a verified copy of the CRM database exists outside
Lovable. This phase is deliberately boring.

1. **Find the database credentials.** In Lovable: project → Settings →
   (Lovable Cloud / Backend / Database) → there is a connection string or
   "Manage in Supabase" path. Also try logging into supabase.com with every
   email you may have used — if `cfwywsrhwnfqzdxcgnmm` appears in any org, we
   have direct access and everything gets easier. *(Only you can do this
   step.)*
2. **Full export** (Claude can run these once you have the connection string):
   ```powershell
   supabase db dump --db-url "<connection-string>" -f crm-schema.sql          # schema
   supabase db dump --db-url "<connection-string>" --data-only -f crm-data.sql # all rows
   ```
   plus a storage-bucket listing/download (job documents, contracts, quote
   PDFs) and an auth-users export. Keep two copies (local + cloud drive).
3. **Verify the dump restores** into a scratch project before relying on it.
4. Repeat the export before each later cut-over step; keep Lovable untouched
   and running throughout — it stays the system of record until Phase C2 is
   verified.

## 3. Phase C1 — Self-host the CRM app (zero data risk)

The app code is already out of Lovable (GitHub + zip). Hosting it yourself
does not touch the database:

1. Cloudflare Pages project from the `build-flow` repo →
   `crm.bowercabinets.com`, behind the same Cloudflare Access beta gate as
   the rest (`GO-LIVE-BETA-PLAN.md` Part 3 covers `*.bowercabinets.com`).
2. Env vars = its current `.env` (still pointing at the Lovable DB, so
   behaviour is identical, data risk zero). Add an SPA `_redirects` file.
3. Use the self-hosted URL day-to-day. Lovable's editor/hosting is now
   optional — but do **not** cancel Lovable yet (its project still owns the
   database until C2 completes).

## 4. Phase C2 — Move the database to a project you own

**Recommended: restore the dump verbatim into a NEW Supabase project**
(`bower-crm`) in your org, same region (Sydney):

1. Create `bower-crm` → restore `crm-schema.sql` + `crm-data.sql` verbatim
   (no renames, no collisions — it gets its own project).
2. Redeploy the CRM's 69 edge functions from the repo to `bower-crm`
   (scripted, one command per function) and copy its function secrets
   (OpenAI, Resend/SMS, Google/Microsoft/Xero client IDs) from Lovable's
   settings.
3. Auth users: export/import (staff re-set passwords once; OAuth logins
   just work). Re-connect Gmail/Microsoft/Xero integrations (stored tokens
   generally must be re-authorised after a project move — plan a 30-minute
   reconnect session).
4. Point the self-hosted CRM's env at `bower-crm`, smoke-test the seven core
   CRM journeys, run BOTH for a few days (Lovable read-only), take a final
   delta export, then retire the Lovable project and subscription.

**Why not merge straight into bower-cabinet-ai?** The `jobs`/`profiles`/
`user_roles` collisions mean the CRM would have to live in a separate
Postgres schema (`crm.*`) inside that project, which forces changes across
all 69 functions and the app's supabase-js config — a much riskier first
move for live data. Full single-project unification remains available as a
later step (C4) once everything is stable in your own org; "same platform,
same org, linked data" arrives in C3 either way.

## 5. Phase C3 — Link the programs (the actual integration)

With both projects in your org, wire the flows (all of this is Claude-doable):

1. **Wizard leads → CRM.** `submit-planner-enquiry` already creates the
   planner job atomically; add a service-to-service push into the CRM's
   `leads` table (or its `intake-processor` function) with name, email,
   phone, design summary, price band and the planner `jobId`. The CRM's own
   notification/inbox machinery then handles alerts — **replacing the
   planner's Resend stopgap** (whose API key was never configured; delete
   that path once this lands).
2. **Website forms → CRM** the same way (quote/contact forms in the website
   repo).
3. **Cross-links.** CRM lead/job records store the planner job id; the
   planner's Admin Leads page links to the CRM lead and vice-versa. The CRM's
   existing `kitchen_designs`/`kitchen_jobs` tables are the natural landing
   spot — map or retire them after inspection.
4. **Direction of truth:** CRM owns customers/leads/quotes/scheduling;
   planner owns rooms/cabinets/pricing/Microvellum export. One id linking
   them; no duplicated editing surfaces.
5. **Single staff login** (stretch): shared Supabase auth only becomes
   possible with full unification (C4); until then, same email/password on
   both projects is acceptable for a small team.

## 6. Phase C4 (optional, later) — True single database

Once C0–C3 are stable: move planner schema + functions into `bower-crm` (the
planner's data is mostly seed/config and can be re-imported, which makes it
the cheaper side to move — the reverse of what the old unification runbook
assumed, now that the CRM's scale is known). Namespace or rename colliding
tables at that point. Decide then whether it is worth it; C3's linking may
be all the unification the business actually needs.

## 7. Risks and cautions

- **The dump is everything.** Until C0 completes, the business's data has a
  single copy inside a platform you don't control. Do C0 this week even if
  the rest waits.
- **CRM security is unaudited.** 69 public functions, one already
  `verify_jwt = false`, committed `.env`, client-portal token flows — run the
  same pre-live audit process on the CRM before exposing it beyond the
  Cloudflare Access gate.
- **OAuth reconnects** (Google/Microsoft/Xero) are the most likely breakage
  in C2 — schedule them, don't discover them.
- **Lovable exports:** confirm whether Lovable Cloud offers a one-click
  database export/e transfer; if it does, prefer it over raw pg_dump for
  storage + auth completeness.

## 8. Order of operations

| # | Step | Who | Est. |
|---|---|---|---|
| 1 | C0: find DB credentials / Lovable export path | Ben | 30 min |
| 2 | C0: dump schema+data+storage+auth, verify restore | Claude | 0.5–1 day |
| 3 | C1: Cloudflare Pages hosting for CRM | Claude (Ben approves) | 0.5 day |
| 4 | C2: create bower-crm, restore, redeploy functions, secrets | Claude | 1–2 days |
| 5 | C2: auth import + OAuth reconnects + parallel-run | Ben + Claude | 2–3 days elapsed |
| 6 | C3: wizard/website → CRM lead flow + cross-links | Claude | 1–2 days |
| 7 | Retire Lovable (final delta export first) | Ben | 15 min |
