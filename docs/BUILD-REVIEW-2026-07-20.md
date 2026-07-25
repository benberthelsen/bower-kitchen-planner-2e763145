# Bower Platform — Build Review (as at 20 July 2026)

A single reference for what has been built, where it lives, what state it is
in, and how to review it. Written for Ben's review before the next commit +
deploy batch. Everything below either exists on this machine, in the
`bower-cabinet-ai` Supabase project, on Cloudflare, or in Lovable Cloud.

**The one thing to hold in mind:** every item in §4 is written to disk but
**NOT git-committed and NOT deployed**. Nothing new is live until the ship
batch in §8 runs. The beta site currently runs the last code you pushed.

**Review addendum, 21 July 2026:** the five release blockers in §6 were found
after the original build review. All five are now repaired on disk and the
automated gate passes. The batch remains **NO-GO for deployment** until the
manual phone/incognito/3D checks in §8 pass and the changes are committed.

---

## 1. The systems and where they live

| System | What it is | Code lives | Runs at |
|---|---|---|---|
| Kitchen Planner | Vite/React/TS app: homeowner wizard, AI designer, room scanner, trade planner, admin | `C:\Users\bench\Claude\Projects\kitchen online planner\bower-kitchen-planner` (GitHub `benberthelsen/bower-kitchen-planner-2e763145`) | `planner.bowercabinets.com` (Cloudflare Pages, behind Access gate) |
| Public website | Marketing site, showrooms, flat-lay → planner handoff | `...\kitchen online planner\bower-cabinet-web-site` | `www.bowercabinets.com` + bare domain (Cloudflare Pages, behind gate) |
| Backend | Postgres + RLS, 14 Deno edge functions (ai-designer, submit-planner-enquiry, send-email, promote-ai-design…) | `bower-kitchen-planner\supabase\` | Supabase project `bower-cabinet-ai` (`ehtwywctledgkxexztbh`, Sydney) |
| Beta gate | Email-allowlist one-time-PIN gate over everything | — (Cloudflare config) | Cloudflare Zero Trust Access, `*.bowercabinets.com` |
| CRM ("Buildflow Pro") | The live business system: leads, jobs, quotes, contracts, scheduling, Xero/SMS/e-sign — in daily use | Lovable project `jobsite-zen` (GitHub `benberthelsen/build-flow`, copy in Downloads) | `jobsite-zen.lovable.app`; DB in Lovable-managed Supabase `cfwywsrhwnfqzdxcgnmm` (117 tables, 73 functions, NOT in Ben's account) |

## 2. Planner: what was already built and live (pre-audit, verified 16 July)

The full pipeline works end-to-end in production: wizard room entry → AI
generation (3 validated options with price bands) → selection → enquiry →
Admin Leads → staff promotion → draft job with editable cabinets (job #495
verified live). Key subsystems and their homes:

- **Deterministic layout engine** — `src/lib/layout/` (compileSpec, solveRun,
  candidateGenerator, validate, priceDesign…). The AI never invents geometry;
  it ranks/patches what this engine compiles. A mirrored copy is generated
  into `supabase/functions/_shared/layout/` by `node scripts/sync-ai-shared.mjs`
  for the ai-designer edge function — the two MUST be synced together.
- **AI designer** — edge function `supabase/functions/ai-designer/` (OpenAI
  function-calling, model `gpt-5.6-terra`, `reasoning_effort:'none'`
  workaround, prompt `ai-designer-v2.1`, engine `layout-v1.1`).
- **Room scanner** — WebXR capture at `/wizard/scan` (`src/pages/homeowner/
  ScanRoom.tsx`, contract in `src/lib/roomScan/`). The point of the beta;
  phone smoke test over real HTTPS still outstanding.
- **Pricing** — `src/lib/pricing/` (BOM engine, ×1.35 commercial layer + GST)
  and the homeowner-safe band estimator `src/lib/layout/priceDesign.ts`.
  Raw supplier costs never ship in the public bundle (DB + RLS only).
- **3D** — `src/components/3d/` (UnifiedScene, CabinetAssembler + parts).
- **Trade planner & admin** — `src/pages/trade/`, `src/pages/admin/`.
- **Automated verification** — placement sweep (`npm run ai:sweep`,
  45,360 combos), contract/persistence/snapping suites, all green at audit.

## 3. Built 19 July — CRM rescue, phase C0 (data safety)

Goal: a provable copy of the live business data outside Lovable before any
migration work. **Status: verified, two Ben-actions remaining.**

| Artifact | Where | State |
|---|---|---|
| Official Lovable DB export | `bower-kitchen-planner\backups\crm-database-export-2026-07-16.backup` (+ Downloads + Lovable Cloud storage) | Downloaded 17 July |
| **Restore verification** | Done in the Cowork sandbox: archive converted PG17→PG16 format and restored | **Row counts match the live dashboard exactly** — messages 1,586; notifications 735; budget_items 666; tasks 595; auth.users 4; jobs 282; clients 225; quotes 29; 116 public tables. Only `ada_memory_embeddings` skipped locally (needs pgvector; its data IS in the dump) |
| Portable plain-SQL dump | `backups\crm-full-plain.sql.gz` (~10.7 MB) | Restores into any Postgres ≥15 with plain psql — the version-proof second copy |
| Schema-only SQL | `backups\crm-schema.sql` | For reading/diffing |
| Storage manifest | `backups\crm-storage-manifest.csv` | All 685 storage objects (~363 MB: job-documents 309 MB/184 files, db-snapshots, company-photos, logos, contract-templates) |
| Bucket download script | `backups\download-crm-buckets.mjs` | **Ben to run** with `CRM_SUPABASE_URL=https://cfwywsrhwnfqzdxcgnmm.supabase.co` + service_role key from Lovable Cloud settings |
| Report | `docs\CRM-C0-VERIFICATION-2026-07-19.md` | On disk, commit with the rest |

Open question from the data: `public.leads` has 0 rows — confirm leads are
expected to live in clients/jobs after intake. Remaining for C0: run the
bucket script, put a second copy of `backups\` on a cloud drive.

## 4. Built 20 July — AI planner + wizard rework (ON DISK, NOT COMMITTED)

All triggered by Ben's defect report: cabinets back-to-front, missing
end/back panels, corners broken, no fillers at doorways, no wall choice,
style chosen too late. Root causes were traced, fixed, and each fix ships
with a validation rule so the sweep can never miss it again (the old sweep
said "0 bugs" precisely because it had no rules for any of these).

### 4a. Layout engine fixes — `src/lib/layout/` (8 files)

| File | Change |
|---|---|
| `geometry.ts` | **Rotation fix**: engine used E:270/W:90; the scene + manual planner use E:90/W:270 — every AI side-run cabinet faced INTO the wall. Also doorway margin 25→50 mm |
| `catalogRoles.ts` | `resolveCornerVariant()` — blind-corner left/right chosen so the blind panel faces the corner |
| `compileSpec.ts` | Fillers now attached as `fillerLeft/Right` intent (were silently discarded); `endPanelLeft/Right` set on exposed run ends, wall-row ends and both island ends; corner `blindSide` set |
| `validate.ts` | New rules: `faces-wall` (error), `doorway-tight` (warn), `island-exposed` (warn) |
| `priceDesign.ts` | End panels + fillers priced |
| `types.ts` | `DesignBrief.allowedWalls` |
| `defaultSpec.ts` / `candidateGenerator.ts` | Strategies/side-runs respect `allowedWalls` |

Reference doc: `docs\AI-PLANNER-REWORK-2026-07-20.md`.
Verification done: typecheck clean; 18-check behavioral suite
(`backups\ai-engine-smoke.test.cjs`) all passing; 1,260-room mini-sweep →
2,774 candidates, 0 errors, 0 crashes.
⚠ Needs one human eye: a corner cabinet in 3D (if the blind side is
inverted, it's a one-line swap). Known gaps left open: island BACK panels,
run-based benchtop geometry over corners.

### 4b. Wizard upgrade — `src/pages/homeowner/` + `src/lib/layout/schemas.ts`

| File | Change |
|---|---|
| `Wizard.tsx` | Step order now Room → Cooking → **Style** → **Design** → Review (AI generates + prices with the real style); **WallPicker** (tappable floor-plan → which walls get cabinets, auto = engine decides); incompatible shape cards grey out, UI↔engine gating parity verified across all 16 wall subsets; saved-state key bumped v2→v3; **rich share links** (below) |
| `wizardBrief.ts` | `cabinetWalls` → `DesignBrief.allowedWalls` |
| `steps/StepDesign.tsx` | "Generate three fresh options" re-roll button; revised copy |
| `schemas.ts` | `allowedWalls` added to `designBriefSchema` — zod strips unknown keys, so WITHOUT this the edge function would silently ignore the wall picker |

### 4c. Rich share links — inside `Wizard.tsx`

The copied share URL now carries the full design context — chosen design
spec, doors/windows/walkways, plumbing/power/gas, L-shape cutout, cooking
answers, wall picks, style words — as one compressed `d` parameter (~930-char
URL for a real design; verified byte-identical round-trip). The recipient
sees the actual kitchen, can revise it and submit their own enquiry.
proposalId is deliberately not shared. Limits: shared links only open for
gate-allowlisted people until the beta gate is removed; social preview
images/short URLs need a post-beta Cloudflare Worker.

Reference doc for 4b+4c: `docs\WIZARD-UPGRADE-2026-07-20.md`.
Verification done: `wizardBrief.ts` fully typechecked against the patched
engine; TSX syntax-clean; share round-trip + size tested. **The sandbox
cannot fully typecheck TSX — `npx tsc --noEmit` on this machine is the
authoritative check before committing.**

## 5. Infrastructure state

- **Cloudflare**: DNS + both Pages projects + Zero Trust Access gate — DONE
  per Ben (19 July). Every `git push` auto-deploys the Pages sites (which is
  why nothing in §4 is live: it isn't pushed).
- **Supabase migrations — APPLIED + VERIFIED (20 July, via browser)**:
  `20260716090000_funnel_events_hardening.sql` (fixes the production 403 that
  was silently discarding every wizard analytics event) and
  `20260716090100_edge_rate_limits.sql` (durable AI rate limiting) both ran
  successfully against `bower-cabinet-ai`. Verified live: funnel_events now
  carries exactly `anon can insert funnel events` + `staff can read funnel
  events` (old authenticated-read policy dropped); `edge_rate_limits` table
  + `bump_edge_rate_limit_v1(...)` function exist with EXECUTE granted to
  `service_role` only. Minor observation for later cleanup: anon still holds
  broad table-level GRANTs on funnel_events from an earlier migration —
  inert under RLS (no matching policies), so not a live risk.
- **Supabase edge deploys — STILL PENDING** (needs the host + Supabase CLI,
  Ben's side): `ai-designer`, `submit-planner-enquiry`, `send-email` not yet
  redeployed with the 20 July code. Also: hard OpenAI monthly spend cap in
  the OpenAI dashboard.
- **Lead alerts**: Resend path deliberately skipped — Ben's "one ecosystem"
  decision; wizard leads will flow into the CRM (Phase C3). Until then,
  check planner Admin → Leads manually.

## 6. Release blockers found in review (21 July 2026)

These are confirmed defects in the current on-disk batch, not future
enhancements. Repair them before commit, deployment or a customer beta.

**Implementation update (21 July):** all five repairs below are implemented on
disk. Additional hardening completed in the same pass: selected walls are now
an authoritative validation rule; mirrored candidates cannot escape onto an
excluded wall; `fromEnd` joinery sides are normalized before fillers/end panels
are attached; scanner capture now has a visible floor reticle and rejects bad
corner sequences; AI joinery intent survives promotion into the trade planner.

Automated evidence:

- App typecheck: clean (`tsc --noEmit -p tsconfig.app.json`).
- Layout tests: 22 passed; candidate tests: 9 passed.
- AI sweep: 45,360 combinations; 17,793 expected-clean rooms; 0 placement
  bugs, 0 missing essentials and 0 price-band problems.
- Scanner: 47 contract + 12 fingerprint + 16 WebXR fitting checks passed.
- Rule pack and designer V2 contracts: all passed.
- AI-to-trade round trip: all passed, including preserved price band.
- Pricing smoke suite: all passed.
- Email security: 12 injection/link assertions passed.
- Production build: passed. Known main-chunk warning remains (~2.99 MB).

### 6.1 P0 — undefined pricing converter

**Status: REPAIRED + AUTOMATED CHECKS PASSED.** The converter is locally
imported and separately re-exported. The real app typecheck, pricing suite and
production build pass.

**Location:** `src/hooks/useTradeRoomPricing.ts`, around line 103.

**Finding:** `toPlacedItems` is re-exported from the module but is not imported
into the hook's local scope. The hook calls it later, and the generated
production JavaScript still contains an unresolved `toPlacedItems` reference.

**Impact:** trade-room pricing can fail at runtime as soon as pricing data is
evaluated, even though the Vite production build completes.

**Repair:**

1. Import `toPlacedItems` as a local binding from its source module.
2. Export that imported binding separately if the existing public API still
   needs the re-export.
3. Keep Vite build success separate from TypeScript correctness; run the app
   project typecheck explicitly.

**Acceptance checks:**

- `tsc --noEmit -p tsconfig.app.json` reports no `toPlacedItems` error.
- `npm run build` completes.
- A trade room with cabinets calculates and displays pricing without a runtime
  exception.
- The production bundle does not contain a call to an undeclared
  `toPlacedItems` identifier.

### 6.2 P0 — rich-share key collides with room depth

**Status: REPAIRED; MANUAL INCOGNITO CHECK PENDING.** Rich data now uses `sd`,
numeric query values require finite in-range numbers, compressed/decompressed
payloads are size-limited and schema-checked, and the address-bar fallback now
contains the same rich link as the clipboard.

**Location:** `src/pages/homeowner/Wizard.tsx`, around line 530.

**Finding:** the `d` query parameter already stores room depth. Rich sharing
also writes compressed design data to `d`, replacing the numeric depth.
`paramsToState` can then parse the compressed payload as a number and hydrate
`roomDepth` as `NaN`.

**Impact:** a shared design can reopen with corrupt room dimensions, which can
break validation, geometry, pricing or regeneration.

**Repair:**

1. Reserve `d` for room depth and use a distinct, versioned key for the rich
   payload, for example `design` or `sd`.
2. Parse all numeric query values through a helper that accepts only finite,
   in-range numbers and otherwise falls back to the saved/default value.
3. Put a decoded-size limit and schema validation around the rich payload.
4. Ensure the clipboard fallback presents the same rich URL, rather than an
   address-bar URL that may omit the encoded design.

**Acceptance checks:**

- A share round trip preserves room width, room depth, openings, services,
  style, allowed walls and the selected design byte-for-byte where expected.
- Malformed, missing, infinite and non-numeric dimensions cannot create
  `NaN` state.
- Old non-rich links continue to open safely.
- A copied link opened in a clean/incognito session renders the same kitchen.

### 6.3 P1 — regeneration changes AI session ownership

**Status: REPAIRED; LIVE REFINE CYCLE PENDING.** Fresh generation clears the
old selection/chat/undo lineage. Refine controls require both a proposal ID and
an active matching browser session; restored designs cannot submit stale
credentials.

**Location:** `src/pages/homeowner/steps/StepDesign.tsx`, around line 115, and
the session state inside `useAiDesigner`.

**Finding:** generating three fresh options replaces the hook's active AI
session, while the currently selected design can still retain a proposal ID
from the previous session. A later refine request can therefore combine an old
proposal with new session credentials.

**Impact:** chat refinement can fail with `invalid_parent_proposal`, or apply
work to the wrong generation lineage.

**Repair:**

1. Clear the selected AI design/proposal whenever fresh options are generated,
   and require the user to select one of the new options before refinement.
2. Preferably retain session ownership per proposal so undo/refine operations
   can always resolve the session that created that proposal.
3. Disable refine controls when the selected proposal has no matching active
   session.

**Acceptance checks:**

- Generate, select, regenerate, select again, refine and undo all succeed.
- A proposal ID is never submitted with a different session ID.
- The UI clearly shows that a new option must be selected after regeneration.
- Reloaded/restored designs either restore valid session ownership or disable
  server-side refinement safely.

### 6.4 P1 — public caller controls the admin email link

**Status: REPAIRED + OFFLINE SECURITY TEST PASSED; EDGE DEPLOY PENDING.** The
request `Origin` and payload `admin_url` are ignored. Links are derived from a
host-restricted HTTPS `PLANNER_ADMIN_URL`, all template values are escaped and
length-limited, request bodies are capped, and enquiry submission uses the
shared Postgres limiter with the in-memory limiter as fallback.

**Location:** `supabase/functions/submit-planner-enquiry/index.ts`, around line
147, plus the HTML template in `supabase/functions/send-email`.

**Finding:** the public request's `Origin` header is treated as the authority
for the planner/admin URL and is inserted into an HTML email. Customer-supplied
name, email and other fields are also interpolated without HTML escaping.

**Impact:** an attacker can place a misleading external admin link or HTML
content in a staff notification email, creating a phishing and email-injection
risk.

**Repair:**

1. Build the admin link only from a server-side environment variable such as
   `PLANNER_ADMIN_URL`; never trust request `Origin` for an email link.
2. HTML-escape every customer-controlled value before interpolation.
3. Validate allowed URL protocol and host at function startup.
4. Add a durable rate limit to the public enquiry function before enabling
   automated email alerts.

**Acceptance checks:**

- A forged `Origin` cannot change any link in the email.
- Inputs containing HTML tags, quotes and link markup are rendered as plain
  text.
- Only the configured HTTPS Bower admin host appears in notifications.
- Repeated distributed submissions are throttled without creating excess jobs
  or emails.

### 6.5 P1 — L-shaped room cutout is ignored

**Status: BETA GATE REPAIRED; FULL POLYGON SUPPORT REMAINS OPEN.** The wizard
disables automatic AI design for L-shaped rooms and the edge function rejects a
direct bypass with `unsupported_l_shape`. WebXR also rejects strongly
non-rectangular captures instead of inflating them to a bounding rectangle.

**Location:** `src/lib/layout/validate.ts`, around lines 25–30, and the room
geometry/compiler path.

**Finding:** the fit check validates cabinet rectangles only against the
room's outer bounding rectangle. It never tests intersection with the missing
section of an L-shaped room.

**Impact:** the engine can accept and price cabinets that occupy space which
does not physically exist. The current 3D floor and outer-wall rendering can
also make the invalid result look plausible.

**Immediate beta repair:**

1. Block automatic AI generation for L-shaped rooms.
2. Preserve the scanned/manual L-shape data and offer manual planning or a
   review-required handoff instead.
3. Show a direct user message that automatic L-room placement is not yet
   supported.

**Full repair:**

1. Represent the room as a polygon or explicit usable wall segments.
2. Reject cabinets, fillers, end panels, benchtops and clearance envelopes that
   intersect the cutout or lie outside the polygon.
3. Generate runs only on usable wall segments, with openings clipped to the
   same segment model.
4. Render the actual floor polygon and omit walls/floor inside the cutout.

**Acceptance checks:**

- Until polygon support ships, no L-shaped room can enter automatic
  generation.
- Polygon tests cover all four cutout orientations and boundary-touch cases.
- Candidate generation, validation, pricing and 3D rendering share the same
  room geometry.
- No accepted item or clearance envelope intersects the missing floor area.

### 6.6 Remaining release evidence

The code and automated checks are complete. Before changing this batch to GO:

1. Run the full wizard click-through in §8, including regenerate/refine/undo.
2. Open a rich design link in an incognito session and compare room/design data.
3. Complete the 3D blind-corner and exposed-end visual check.
4. Run the room scanner on a supported Android/ARCore phone over production
   HTTPS and confirm the reticle, four-corner capture and wizard handoff.
5. After commit, regenerate the website contract copy/lock, then deploy the
   three modified edge functions.

## 7. Known open items (deliberate, tracked)

1. Phone smoke test of the room scanner over production HTTPS — the point of
   the beta, status unknown.
2. Corner blind-side visual check (§4a) — one look in 3D.
3. Dead code: `Step2Layout` ("How much storage?") + `estimatePrice` +
   `layoutStyle` state — never rendered; delete in a cleanup pass.
4. Full polygon-based L-shaped generation and rendering (the safe beta gate is
   implemented; automatic L-room design remains disabled).
5. Island back panels + benchtop run/corner geometry (engine model gap).
6. `staff` role second-class — fix before adding any non-Ben staff.
7. CRM C1–C3: self-host CRM app on Pages (`crm.bowercabinets.com` — repo
   needs a `public/_redirects` file), then move DB to a Ben-owned project
   (`bower-crm`), then wire wizard/website leads into the CRM.
8. Bundle size (~3 MB main chunk) — code-split later; not a beta blocker.
9. Website room-scan contract + `contract.lock.json` are intentionally pending:
   the sync script requires the canonical planner contract to be committed
   before it records the commit SHA.

## 8. The ship batch (automated gate passed; manual/deploy pending)

1. ~~**Automated release-blocker gate**~~ — **DONE 21 July**. See evidence in
   §6. Manual evidence in §6.6 is still required before deployment.
2. ~~**Supabase SQL Editor**: apply the two migrations~~ — **DONE + verified
   20 July** (see §5). Skip; go to step 3.
3. **Review the complete diff and staged set**: use explicit file staging; do
   not use `git add -A` while unrelated/untracked work is present.
4. ~~**Typecheck + automated suites**~~ — **DONE 21 July**. Re-run immediately
   before commit: `.\node_modules\.bin\tsc.exe --noEmit -p tsconfig.app.json`,
   `npm run test:layout`, `npm run test:candidates`, `npm run roomscan:test`,
   `npm run test:trade-adapter`, `npm run test:email-security`,
   `npm run ai:sweep`, then `npm run build`.
5. **Click-through** (`npm run dev`): Room — pick walls, watch U-shape grey
   out when a side wall is excluded → Cooking → Style → lead gate → Design —
   generate, check in 3D: side runs face the room, corner doors open clear,
   island has finished ends, fillers at doorways; regenerate; chat-refine;
   undo → Review → share the link, open it in an incognito window, confirm
   the same kitchen appears → submit a test enquiry → Admin → Leads.
6. ~~**Sync the AI's engine copy**~~ — **DONE on disk 21 July**. Re-run after
   any later engine edit and inspect the `_shared` regeneration.
7. **Commit source + generated mirrors**, then run
   `npm run roomscan:sync -- --website` so the website lock records that commit.
   Commit the website contract/lock, push the frontend repositories, then:
   `supabase functions deploy ai-designer --use-api --no-verify-jwt`
   `supabase functions deploy submit-planner-enquiry --use-api --no-verify-jwt`
   `supabase functions deploy send-email --use-api --no-verify-jwt`
8. **CRM C0 close-out**: run `download-crm-buckets.mjs` (service key from
   Lovable Cloud settings), verify `download-report.csv` against the
   manifest, copy `backups\` to a cloud drive.
