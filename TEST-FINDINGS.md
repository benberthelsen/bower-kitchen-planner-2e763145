# Room Scanner Test Pass — Findings

Date: 2026-07-14 · Runs 0–4 complete, live backend on bower-cabinet-ai.
Automated: contract 47 + fingerprint 12 + openings matrix 9 + layout/snapping/functional suites + live E2E 15/15 — all green.

## Journeys executed (browser, real deployed functions)

| # | Journey | Result |
|---|---|---|
| J2 | /planner starter → tokenized handoff → public wizard | PASS (after F-2 fix) — dims applied, token scrubbed from URL |
| J4 | Scanner handoff (unconfirmed WebXR scan) → wizard prefill | PASS (after F-2 fix) — 4212×2856 applied, S-wall door rendered at offset 100/width 870, "Room scan loaded" toast |
| J7 | Wrong token abuse | PASS — clean manual wizard, no crash, no existence leak, generic 404 server-side |
| API | Create/get/submit/replay/tamper/RLS (15 checks) | PASS — scripts/scanner-e2e-smoke.ps1, rerunnable |

## Findings

### F-1 · Website dev server renders a blank page (pre-existing WIP, not scanner work) — DEFECT, open
`npm run dev` on bower-cabinet-web-site serves an empty #root with "React is running in
production mode" reported in dev. Production and dev-mode BUILDS render perfectly
(`npm run build` / `build:dev` + `vite preview`), so the app code — including all Run 4
changes — is fine; the dev pipeline is broken somewhere in the uncommitted WIP (~143
files). Not caused by Run 4 (blank on / and every route, and builds work).
**Workaround used for QA:** `set NODE_ENV=development&& npm run build:dev` + `vite preview --port 4173`.
Note: vite build forces NODE_ENV=production even with --mode development, which also
flips `import.meta.env.DEV` and hides the planner CTA via plannerUrl's localhost guard —
hence the explicit NODE_ENV for test builds.

### F-2 · Wizard URL-sync erased ?handoff= before the tokenized fetch resolved — DEFECT, FIXED
The wizard syncs design params to the query string on mount, which removed `?handoff=`
and flipped the react-query key to null before `get-planner-handoff` returned — handoff
payloads (including scans) never applied. Fixed by capturing handoffId once in a
useState initializer (Wizard.tsx); verified live with a scan handoff (J4).

### F-3 · Origin allowlist for local preview — CONFIG, done
`SCANNER_ALLOWED_ORIGINS` secret now set on the project to the dev origins +
http://localhost:4173 (preview). Set this to the real production origins at deploy time —
defaults in code cover localhost dev only.

### F-4 · Notes for the refine loop — POLISH
- Single-wall mode shows derived depth (width×0.7) in the features diagram even when a
  scan supplied a real depth; the scan's depth lands in state (URL shows d=2856) but the
  Step-1 diagram label uses the derivation. Consider honouring scan depth for the diagram
  when an incomingScan exists.
- J2's starter brief style text lands in styleTags → styleWords; verify AI designer
  treatment during the design-step QA.
- Remaining journeys for a follow-up session (need Ben's login): trade job from handoff
  (staff read), room-features step through JobEditor, placement-warning pill in the live
  planner, plan-view PDF export, admin Leads linkage after a submitted enquiry, legacy
  job load. The underlying paths are covered by unit/E2E suites; this is UI confirmation.

### F-5 · Room-feature measurement fields untypeable (reported by Ben) — DEFECT, FIXED
The detail-panel inputs committed on every keystroke, and the setters clamp
(e.g. width `Math.max(200, v)`): typing "9" became 200, further digits appended to the
clamped value ("920" → 20020), and clearing the field snapped to 0. Pre-existing editor
behaviour, surfaced by trade QA. Fixed in RoomFeaturesEditor: `NumField` now edits a
local draft and commits the clamped value on blur/Enter. Verified live in the trade
Features step (870 → 920 types cleanly).

## Refine backlog from Ben's trade QA (2026-07-14)

### F-6 · Cabinets don't back onto walls by default — DEFECT/UX
Adding from the catalog places the cabinet free-floating; wall snap only engages when a
drag brings the back within 200mm (`WALL_SNAP_THRESHOLD`). Fix path: on add, auto-snap to
the nearest wall with free run (base/tall/wall categories), keeping drag-snap as-is;
consider raising the drag threshold to ~300mm.

### F-7 · Cabinet movement feels clunky — UX
Drag uses snap hysteresis (200 engage / 350 release) with hard position jumps and no
preview. Fix path: ghost/preview outline with snap guides before commit, smaller snap
jump animation, and pointer-plane tuning. Needs an iteration session with Ben driving.

### F-8 · Corner cabinets should sit with both backs against both walls — DEFECT/UX
Corner nesting logic exists (CORNER_SNAP_THRESHOLD 300, solid corner nests by rotation)
but only triggers within 300mm of BOTH walls and doesn't run on initial placement. Fix
path: same auto-snap-on-add for corner products (choose nearest corner), verify arm
depths leave no wall gap, widen trigger.

### F-9 · Room features editor looks basic / not intuitive — UX REDESIGN
Works functionally (post F-5) but needs: to-scale feature sizing on the diagram,
dimension labels while dragging, clearer wall hit targets, icons on chips, maybe an
onboarding hint. Schedule as a design pass with Ben's input rather than a code-only fix.

### F-10 · Doors/windows/power points need better 3D detail — 3D POLISH
Current 3D: flat colored panels (openings) and small colored cubes (services). Fix path:
modeled door leaf + architrave with swing direction, framed window with glazing +
mullions, GPO faceplates, cooktop gas symbol; reuse across homeowner + trade scenes.

Suggested refine run order: F-6 + F-8 (same subsystem, biggest quoting impact) → F-7 →
F-10 → F-9 (design session first).

## Environment notes
- Use bun (not npm) for installs in both repos; npm fights the bun lockfile (broke
  esbuild mid-pass — recovered with `bun add`).
- Stale `.git/index.lock` appeared twice (OneDrive/crashed git) — safe to delete when no
  git process is running.
- curl on this machine needs `--ssl-no-revoke` (network blocks CRL checks).
