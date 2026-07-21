# AI Planner Rework — Placement Defects (2026-07-20)

Ben's report: cabinets placed back-to-front; back/end panels not applied to
ends of runs and islands; bench runs into corners not working; no fillers —
cabinets built right up to doorways; no way for the user to say which walls
get cabinets; style should be chosen before placement (style dictates layout
and cabinet use), with cabinets revisable after.

Each defect was traced to root cause in `src/lib/layout/` and the wizard.
**Fixes 1–4 are implemented in this drop and verified** (typecheck clean; an
18-check behavioral suite passes; a 1,260-combo mini-sweep returns 2,774
candidates with 0 errors and 0 crashes). Items 5–6 are engine-ready but need
wizard UI work (specced below).

## Why the audit sweep said "0 bugs" while all this was broken

The sweep only checks the rules `validate.ts` knows. It had NO rules for
orientation, corner handedness, panels, or doorway clearance — so a design
where every side-wall cabinet faced the wall passed 45,360/45,360 combos.
Every fix below therefore ships WITH a new validation rule, so it can never
regress silently again.

## 1. Back-to-front cabinets — FIXED (root cause: rotation convention clash)

`geometry.ts` used `E:270, W:90`. The scene (`CabinetMesh`) applies rotation
as `-degToRad(θ)`, and the manual planner's proven convention
(`utils/snapping/wallSnapping.ts`) is left wall → 270, right wall → 90. Net
effect: **every AI cabinet on an E or W wall rendered facing INTO the wall** —
every L-shape and U-shape looked back-to-front. Fixed `WALL_ROTATION` and
`wallToWorld` to `N:0, E:90, S:180, W:270`.

New rule: `faces-wall` (error) — any floor item touching a wall whose rotation
doesn't face away from a wall it touches.

## 2. Corners — FIXED (blind variant + handedness)

The corner role always resolved to `base_corner_blind_left` regardless of
which corner it served, so half of all corners had the blind panel on the
door side — doors jammed against the adjacent run ("bench run into corner not
working"). Now `compileSpec` picks `base_corner_blind_left/right` so the blind
panel faces the corner (low-t half of the wall → Left), and sets
`item.blindSide`, which `CabinetAssembler` already renders correctly.

⚠ Please eyeball one L-shape corner in 3D — the Left/Right semantics were
verified by convention analysis, not visually. If it's inverted, the fix is a
one-line swap in `resolveCornerVariant`.

Note: continuous benchtop geometry over corner returns is NOT modeled in the
AI preview at all (benchtops aren't emitted as items) — that's a separate
work item, same as the old Lovable planner's deferred "run-based benchtop
logic".

## 3. Fillers + doorway clearance — FIXED

Three compounding causes: (a) the doorway margin was only 25mm; (b) solveRun
emitted fillers only for ≤100mm leftovers; (c) **compileSpec silently skipped
every filler** ("visual no-ops in v1"). Now: margin is 50mm (architrave +
scribe allowance), and solved fillers attach to the neighbouring cabinet as
`fillerLeft`/`fillerRight` — which the assembler already renders and the
estimator now prices.

New rule: `doorway-tight` (warn) — a floor cabinet within 25mm of a
door/walkway opening with no filler.

## 4. End panels on runs and islands — FIXED

The engine never set any panel intent. Now `compileSpec` sets
`endPanelLeft/endPanelRight` (already supported by the assembler and the
PlacedItem model) on: exposed ends of every base/tall run group (not at room
corners, not where the adjacent run's reserve backs the end), exposed
wall-cabinet row ends, and both extremes of the island. Under the wall-offset
convention low-t = Left on every wall, so the flags are wall-agnostic.
Pricing adds ~$110/panel and filler strips to the estimate.

New rule: `island-exposed` (warn) — island present without both end panels.

⚠ Island BACK panels (the seating-side face) are still bare carcase — the
intent model only has left/right ends. If you want a finished island back in
the AI preview, that needs an assembler-level `backPanel` flag or a separate
panel item; flagging rather than hacking it in. The old planner had the same
gap.

## 5. Wall selection — ENGINE READY, UI pending

`DesignBrief.allowedWalls?: Wall[]` added and honored: strategies that need a
disallowed wall are skipped (`single-wall`→N; `l-shape`→N + W or E;
`u-shape`→N,W,E; `galley`→N,S), and the L-shape side run respects the choice.
Verified: `allowedWalls:['N']` yields only single-wall candidates.

Wizard UI (next session): in Step 1 (Room), after openings are set, show the
room plan with tappable walls ("Where do you want cabinets?") → store as
`allowedWalls` in wizard state → `buildBrief` passes it through (one line in
`wizardBrief.ts`). Also pass it into the AI prompt context so revisions
respect it.

## 6. Style before placement — spec (agreed direction)

Current order: Room → Cooking → Design(AI) → Style → Review. Ben's point:
style dictates layout and cabinet use, so choose it first. Concretely in
`Wizard.tsx`: swap steps 3/4 (STEPS array, the two step conditionals, canNext
logic, and the sessionStorage step migration), so Style (finish/benchtop/
handle picks, currently defaulted) is set BEFORE StepDesign generates — the
candidates then compile and price with the real style from the start
(StepDesign already accepts `style`; no engine change needed). The lead gate
moves with the Design step. "Cabinets can be revised" is already the design:
specs are patchable via the AI designer; the revision UI affordance can be
strengthened later (per-cabinet swap in StepDesign).

Not implemented this session because Wizard.tsx is a 63KB file with persisted
state; doing it blind alongside engine changes risks the working wizard. It's
a clean, contained change for the next session.

## Files changed (all in `src/lib/layout/`)

| File | Change |
|---|---|
| `geometry.ts` | E/W rotation fix; doorway margin 25→50; convention docs |
| `catalogRoles.ts` | `resolveCornerVariant()` (blind left/right) |
| `compileSpec.ts` | filler intent, end panels (runs/wall rows/island), corner variant+blindSide |
| `validate.ts` | new rules: `faces-wall` (error), `doorway-tight` (warn), `island-exposed` (warn) |
| `priceDesign.ts` | price end panels + fillers |
| `types.ts` | `DesignBrief.allowedWalls` |
| `defaultSpec.ts` | L-shape side respects `allowedWalls` |
| `candidateGenerator.ts` | `strategyPlausible` respects `allowedWalls` |

## Ben's verification & ship steps (host side)

1. `git diff` — review the 8 files (this doc is committed alongside).
2. `npx tsc --noEmit` and `npm run ai:sweep` (expect 0 placement bugs; the
   sweep now also enforces the new rules).
3. `npm run dev` → wizard → L-shape room → check in 3D: side runs face the
   room, corner doors open clear of the adjacent run, island has finished
   ends, fillers appear at doorways.
4. `node scripts/sync-ai-shared.mjs` then `git status` (regenerates
   `supabase/functions/_shared/layout/*` — the deployed ai-designer must use
   the SAME engine or its designs will disagree with the client preview).
5. Commit both, then `supabase functions deploy ai-designer --use-api
   --no-verify-jwt` (fold into the pending P1 deploy batch — migrations
   first).

Verification artifacts from this session: `backups/ai-engine-smoke.test.cjs`
(the 18-check suite; run `node backups/ai-engine-smoke.test.cjs` after a
`tsc` transpile, or just trust the sweep) — kept out of `src/` deliberately.
