# Room Scanner Compressed Build Runbook

Prepared: 2026-07-14 (updated same day for the fourth-pass master plan: mandatory JCS
fingerprints, deny-by-default RLS in 1A-min, roomRevision reconfirmation, durable
finalization state)
Authority: `AI-ROOM-SCANNER-MASTER-PLAN.md` governs all behaviour; §14.1 defines this
compressed schedule. This runbook only carries the operational detail: four back-to-back
build runs, one structured test pass, then a refinement loop.

Goal: Phase 1A/1B acceptance in 13-17 working days (~3 weeks) instead of the 26-44 day
baseline, then refine against real use instead of speculation.

## Compression strategy

- Build 1A-min plus the homeowner and trade slices as consecutive agent-implemented runs
  with engineer review at each boundary; no idle time between blocks.
- Mandatory pieces stay mandatory: RFC 8785/JCS fingerprints ship from the first deployment
  using the reference `canonicalize` npm package + known-vector tests (~0.5 day, not a
  custom serializer), and the 1A-min migration leaves direct handoff access deny-by-default.
- Defer per 1A-min until after the first test pass: Phase 1C quarantine storage +
  `planner_handoff_finalizations`, staff read UI/routes, external bot-provider integration,
  alert wiring, purge scheduler. None block testing the core journeys.
- The quote form stays mailto-only until Refine — its capture-draft flow needs 1C storage.
- Each run ends green (typecheck + tests + build + the run's acceptance checks) before the
  next starts. A red run is fixed before proceeding, never deferred.

## Run 0 — Entry gate (half day, manual)

Cannot be delegated to a build run:

1. Commit the planning baseline: `git add docs/ && commit` in the planner repo (docs/ is
   currently untracked; `contract.lock.json` needs a real SHA).
2. Finish the Supabase unification runbook steps; set website `VITE_SUPABASE_URL` and
   `VITE_PLANNER_URL`.
3. Record D1 if deciding now; otherwise WebXR-first is assumed per the master plan default.

If the environments are still split after Run 0, stop and revert to the master plan's
baseline schedule — the compression assumes one shared backend.

## Run 1 — Contract + fixtures (planner repo)

Master plan §5, §12.1, Phase 1A contract scope.

- `src/lib/roomScan/contract.ts`: discriminated draft/unconfirmed/confirmed schemas with
  `roomRevision`/`confirmedRevision`, coordinate frame with positive-determinant check,
  strict-write + tolerant-legacy parsers.
- Full fixture library (valid + invalid, including legacy stamp, negative determinant, and
  revision-mismatch cases).
- Test wiring using the repo's esbuild/node smoke convention (`roomscan:test` script).
- Deno mirror + `roomscan:sync` / `roomscan:check` scripts.

Exit: all fixtures pass through named package scripts; compile-time compatibility test green.

## Run 2 — Secure handoff backend + homeowner slice (planner repo)

Master plan §6 (1A-min) + §8.1.

- Migrations in order: enum addition (own migration) → token hash/expiry/keys/indexes/FK +
  `jobs.submission_key`/fingerprint fields → RLS repair (drop anon access AND the broad
  authenticated SELECT/UPDATE — direct handoff access is deny-by-default until the staff
  follow-up).
- `submit_planner_enquiry_v1` RPC (handoff optional, `INSERT ... ON CONFLICT`, versioned
  JCS fingerprints via `canonicalize` with known-vector tests).
- `create-planner-handoff`, `get-planner-handoff`, `submit-planner-enquiry`,
  `link-trade-handoff`, shared security helper (exact-origin CORS, no-store, generic
  errors, body/rate limits, redacted logs).
- Wizard: tokenized retrieval, scan/draft mapping as pure functions, apply confirmed-scan
  geometry only, fix the invalid roomScan stamp, submit via the RPC path.
- `RoomFeaturesEditor`: water-supply + hood-duct, confidence/warning badges; edits bump
  `roomRevision` and invalidate confirmation.
- Remove JobEditor on-load consume; link post-creation only.

Exit: anonymous tokenized handoff E2E works locally (create → wizard prefill → confirm →
submit → consume/link); wrong/expired token, idempotency/replay, JCS known-vector, and
legacy tests pass.

## Run 3 — Trade slice (planner repo)

Master plan §8.2.

- Room-features step after Room Shape; openings/services through new-job/add-room/edit-room
  mappings into `TradeRoom.config` (mind the roomWidth→width seam).
- Warn-only, category/height-aware placement warnings; recompute on all edit paths.
- Openings/services in trade 3D scene and plan-view PDF.
- Trade edits to room features invalidate any attached scan confirmation (revision bump).

Exit: trade round-trip tests pass; pre-existing jobs load unchanged.

## Run 4 — Website (website repo; may overlap Run 3)

Master plan §9.1-9.2. Depends only on Run 1's contract and Run 2's deployed functions.

- Generated contract copy + `contract.lock.json` + checksum script.
- `/planner` and flat-lay create tokenized handoffs via the edge function; remove direct
  table inserts; every customer planner link targets `/wizard` (fixes the login-wall bug).
- Wrong/expired-token recovery state.
- Quote form: unchanged this pass (photos deferred to 1C); add the handoff link where
  dimensions are provided, without file upload.

Exit: website builds; contract checksum passes; cross-repo handoff journey works against
the planner from Run 2.

## Test pass (2 days, after Run 4)

Automated: full suites in both repos plus the master plan §12.2 security matrix that exists
at this point (tokens, RLS deny-by-default, idempotency, JCS vectors, tampered-scan and
revision-mismatch rejection).

Manual QA script — walk each journey end to end and log every finding:

1. Anonymous flat-lay → wizard prefill → confirm → submit → staff sees linked enquiry.
2. `/planner` starter → tokenized wizard → submit.
3. Organic `/wizard` (no handoff) → submit → exactly one job on retry.
4. Handoff with unconfirmed scan fixture → editor prefill → edit a wall (confirmation
   invalidates) → reconfirm → design generation.
5. Trade: new job from handoff → room features visible/editable → placement warnings →
   save/reload → PDF.
6. Legacy: old handoff, old job — behaviour unchanged.
7. Refresh/back-button/expired-token abuse of every journey above.

Findings go into a single `TEST-FINDINGS.md` with severity (blocker / defect / polish).

## Refine loop (repeat until stable)

1. Fix blockers and defects in short runs against `TEST-FINDINGS.md`; re-run the failing
   journey plus the automated suites.
2. When two consecutive passes produce no blockers, pull in the deferred fast-follows:
   Phase 1C quarantine storage + `planner_handoff_finalizations` + quote photo intake,
   staff read UI/routes, bot provider, alert wiring, purge scheduler. All complete before
   production launch (master plan §15 gates unchanged).
3. Then Phase 2 per D1: WebXR discovery prototype (or RoomPlan pilot) against the now-real
   contract and confirmation UI — the scanner is refined against a tested application, not
   built onto an untested one.

## Sequence summary

| Step | Scope | Duration |
|---|---|---:|
| Run 0 | Commit baseline, env, D1 | 0.5 day |
| Run 1 | Contract + fixtures | 2-3 days |
| Run 2 | Backend (1A-min incl. JCS) + homeowner slice | 4-5 days |
| Run 3 | Trade slice | 3-4 days |
| Run 4 | Website (may overlap Run 3) | 2-3 days |
| Test pass | Automated + scripted manual QA | 2 days |
| Refine | Findings-driven, then deferred fast-follows | 1-2 weeks |

Total to first full test pass: 13-17 working days (~3 weeks). Revert to the master plan's
baseline schedule if environments stay split, review capacity is missing at run boundaries,
or blocker density stays high — and never skip a run's exit gate to save time.
