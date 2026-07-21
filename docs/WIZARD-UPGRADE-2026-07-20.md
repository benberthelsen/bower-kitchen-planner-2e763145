# Wizard Upgrade — Style-First Flow + Wall Selection (2026-07-20)

Companion to `AI-PLANNER-REWORK-2026-07-20.md` (engine fixes). This drop
restructures the homeowner wizard per Ben's direction: the customer's style
choice comes BEFORE cabinet placement, and the customer can say which walls
get cabinets. Cabinet revision affordances strengthened.

## New flow

Room → Cooking → **Style** → **Design (AI, lead-gated)** → Review

Previously Style sat after Design, so the AI generated and priced options in
default Designer White and the real finishes were painted on afterwards. Now
generation runs with the customer's actual style from the start — option
cards price correctly, and the style genuinely leads the design, matching how
a real design conversation works.

## Wall selection (new, Room step section 2)

A tappable mini floor-plan (Back/Front/Left/Right walls). Empty = Auto (the
engine decides, as today). Selecting walls:

- flows through `buildBrief` → `DesignBrief.allowedWalls` → the engine's
  candidate generator drops strategies needing a disallowed wall (implemented
  and swept in the engine drop);
- greys out incompatible layout-shape cards in the Room step ("Not with your
  wall picks") and auto-switches the selected shape with a toast if the
  current one becomes impossible — verified UI↔engine parity across all 16
  wall subsets;
- is shareable (`?cw=NE` URL param) and resets the chosen design when
  changed, like any other geometry input.

**Schema fix that matters:** `designBriefSchema` (zod, shared with the
ai-designer edge function) silently strips unknown keys — without the
`allowedWalls` line added in `schemas.ts`, the edge function would have
ignored the wall picker entirely. This makes re-running
`node scripts/sync-ai-shared.mjs` and redeploying ai-designer REQUIRED for
wall selection to work in production (it was already required for the engine
fixes — same deploy).

## Revision affordances

- "Generate three fresh options" button under the option cards — previously
  once options rendered there was no way to re-roll (stale options survived
  style/wall changes made via Back).
- Design-step copy now tells the customer options can be revised; the chat
  refine bar + Undo were already there and are unchanged.

## Session/state mechanics

- Saved-state version bumped v2 → v3 (`bower.wizard.state.v3`): the step
  numbers changed meaning, so restoring an old mid-flow save would drop
  someone on the wrong step. Old saves are discarded (24 h transient data;
  no production impact worth a migration).
- `cabinetWalls: Wall[]` added to WizardState, URL serialisation (`cw`), and
  the design-reset rule in `onChange`.
- Lead gate unchanged in behaviour — it now gates the Design step at its new
  position (step 4), still after room+cooking+style investment, still before
  designs/prices are revealed.

## Found while digging (not fixed here)

1. **Dead code:** `Step2Layout` ("How much storage?") and its `estimatePrice`
   helper are defined but never rendered — step 2 renders StepCook. The
   `layoutStyle` state it edited still exists (URL `ls`, buildBrief priority
   fallback) but nothing lets the user change it any more. Recommend deleting
   the component + folding `layoutStyle` out of state in a cleanup pass.
2. **Server prompt:** the ai-designer prompt doesn't mention allowed walls;
   the candidate pool enforces them regardless (hard constraint), but telling
   the model improves its rationales. Small server-side prompt tweak, next
   AI-function session.
3. Option cards regenerate with the new style but a style change made via
   Back does NOT clear an already-chosen design (style is cosmetic to the
   spec and re-applied at compile) — intentional, noting for completeness.

## Files changed

| File | Change |
|---|---|
| `src/pages/homeowner/Wizard.tsx` | step reorder, WallPicker, shape gating, state v3, `cabinetWalls` |
| `src/pages/homeowner/wizardBrief.ts` | `cabinetWalls` → `DesignBrief.allowedWalls` |
| `src/pages/homeowner/steps/StepDesign.tsx` | regenerate button, copy |
| `src/lib/layout/schemas.ts` | `allowedWalls` in `designBriefSchema` (zod strip fix) |

## Verification done in the session

- `wizardBrief.ts` fully typechecked against the patched engine (0 errors).
- TSX files parse clean (0 syntax errors; full typecheck needs the host
  toolchain — see below).
- UI wall-gating vs engine `strategyPlausible`: parity across all 16 wall
  subsets (script re-runnable from the engine smoke harness).

## Ben's steps (host)

1. `git diff` the four files.
2. `npx tsc --noEmit` — the sandbox cannot fully typecheck TSX (no
   node_modules); this is the authoritative check.
3. `npm run dev` → click through: Room (pick walls — try excluding the right
   wall, watch U-shape grey out) → Cooking → Style → lead gate → Design
   (generate, regenerate, refine, undo) → Review → submit.
4. `node scripts/sync-ai-shared.mjs` → `git status` → commit → deploy
   ai-designer (same deploy batch as the engine fixes + pending migrations).

## Addendum (same day) — Rich share links

Ben asked whether extra design information could be encoded for sharing on
the web. Gap confirmed: the share link carried only dimensions + style codes.
The chosen AI design, doors/windows/services, L-shape cutout and cooking
answers were all lost — a recipient saw a default kitchen in an empty
rectangle.

Now the copied share link carries a `d` param: the full design context
(openings, services, room shape/cutout, cooking answers, wall picks,
styleWords, and the chosen design's KitchenSpec) as deflate-compressed
base64url JSON. Measured size for a real L-shape design: ~860 chars, total
URL ~930 chars — well under browser limits, with a 6,000-char guard that
falls back to the short link. Round-trip verified byte-identical.

Decoding is defensive: zod-validated (openingSchema / servicePointSchema /
kitchenSpecSchema) with clamped numbers and enum whitelists; any failure
falls back to the short params. The restore applies via setState directly —
onChange would see openings in the patch and null the restored design.
`proposalId` is deliberately not shared: the recipient's copy is
spec-as-truth; they regenerate before chat-refining, and a submission from a
shared link carries `aiProposalId: null` (same as the standard-layout path).
The address bar keeps the short URL; only the copied link carries `d`.
Browsers without CompressionStream (pre-2023) share the short link as before.

Known limits, deliberately deferred:
- **The beta gate applies.** While Cloudflare Access covers
  `*.bowercabinets.com`, shared links only open for allowlisted testers.
  Public sharing starts working the day the gate policy is removed — no code
  change needed.
- **No social preview cards.** A per-design OG image (the 3D render in a
  link preview) needs server-side rendering — a Cloudflare Worker + a
  share-row table would also give short URLs (`/s/abc123`). Worth doing
  post-beta if sharing becomes a real acquisition channel; the `d` payload
  is the foundation either way.

Extra verification: `swing` enum parity between `@/types` Opening and
openingSchema confirmed (in-left/in-right/out/slider) — mismatched enums
would have silently dropped openings on restore.
