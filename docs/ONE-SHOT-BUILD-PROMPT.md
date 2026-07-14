# One-Shot Build Prompt — AI Kitchen Designer Harness

Paste everything below the line into a coding agent (Claude Code) at the repo root. It is self-contained. Companion doc: `docs/AI-DESIGNER-HARNESS-PLAN.md`.

---

## MISSION

Upgrade the homeowner wizard at `/wizard` (`src/pages/homeowner/Wizard.tsx`) from a hard-coded preview into an AI-assisted kitchen designer covering layout, functionality, and interior design. Build a **deterministic layout engine as the harness**; the AI (Claude via a Supabase edge function) makes design decisions expressed in a constrained `KitchenSpec` DSL, and the engine compiles, validates, and prices everything. The AI must never emit raw coordinates or unvalidated prices.

Two cross-cutting requirements:
1. **Doors, windows, plumbing, power, and gas are planner-wide room features** — added to the core `RoomConfig` type, rendered in the shared 3D scene, and editable in BOTH the trade planner's RoomSetupWizard and the homeowner wizard. Not wizard-only types.
2. **The AI must be able to alter the kitchen plan from chat prompts** — refine mode is a full editing interface (layout, functionality, room facts, style), not just cosmetic tweaks.

## REPO CONTEXT (verified — do not rediscover, but read these files before coding)

- `src/pages/homeowner/Wizard.tsx` — 848-line 4-step wizard. `generatePreviewItems()` (line ~101) fakes layouts with generic `base_1_door` cabinets; `estimatePrice()` (line ~163) fakes pricing. Both get replaced.
- `src/types.ts` — `PlacedItem`, `RoomConfig`, `GlobalDimensions`, `MaterialOption`. `RoomConfig` has no doors/windows.
- `src/constants.ts` — `FINISH_OPTIONS`, `BENCHTOP_OPTIONS`, `HANDLE_OPTIONS`, `KICK_OPTIONS`, `TAP_OPTIONS`, `DEFAULT_GLOBAL_DIMENSIONS` (base 730×575, wall 720×350 @ 1350 mount, tall 2100×580).
- `src/hooks/useCatalog.ts` — Microvellum products from Supabase table `microvellum_products`: `default_width/depth/height`, `door_count`, `drawer_count`, `is_corner`, `is_sink`, `is_blind`, `spec_group`, `visible_to_standard`, corner columns (`left_arm_depth`, `blind_depth`, `filler_width` …).
- `src/lib/pricing/` — real engine: `bomGenerator.ts` (`generateCabinetBOM`, `generateQuoteBOM`), `sheetOptimizer`, `edgeCalculator`, `hardwareCalculator`, `laborCalculator`.
- `src/lib/cornerDefaults.ts` — corner cabinet defaults (filler 75, stile 45).
- `src/components/3d/UnifiedScene.tsx` + `Scene3DErrorBoundary` — 3D preview; see usage in Wizard Step4Review.
- `supabase/functions/send-email/` — copy this edge-function pattern.
- Leads: wizard inserts into `jobs` table with `design_data` JSON, `status: 'enquiry'`.
- Stack: Vite + React + TS + Tailwind + shadcn + Supabase. Tests: add vitest if not configured.
- HARD RULE (WS10): homeowner surfaces NEVER show trade costs, BOM lines, labor rates, or markups — rounded price ranges only.

## BUILD ORDER

### 1. Types & schemas — `src/lib/layout/types.ts` + `src/lib/layout/schemas.ts`

Define (with zod schemas mirroring each):

First, extend the CORE types in `src/types.ts` (shared by trade planner + wizard; default both arrays to `[]` everywhere existing designs load):

```ts
type Wall = 'N' | 'E' | 'S' | 'W';
interface Opening {
  id: string; wall: Wall; type: 'door'|'window'|'walkway';
  offsetMm: number; widthMm: number; heightMm?: number; sillHeightMm?: number;
  swing?: 'in-left'|'in-right'|'out'|'slider';
}
interface ServicePoint {
  id: string; wall: Wall; type: 'water-supply'|'drain'|'gpo'|'gas'|'hood-duct';
  offsetMm: number; heightMm?: number;
}
// add to RoomConfig itself:
//   openings?: Opening[]; services?: ServicePoint[];
```

Then in `src/lib/layout/types.ts`:

```ts
interface RoomSpec extends RoomConfig { openings: Opening[]; services: ServicePoint[] }
interface DesignBrief {
  room: RoomSpec;
  household: { size?: number; cooks?: 'rare'|'daily'|'entertainer' };
  priorities: ('storage'|'bench-space'|'entertaining'|'baking'|'budget')[];
  appliances: { oven?: '600'|'900'; cooktop?: 'gas'|'induction'; dishwasher: boolean; fridgeWidthMm?: number; microwave?: 'built-in'|'benchtop'|'none' };
  island: 'want'|'no'|'if-it-fits';
  styleWords?: string;
  budgetBand?: 'value'|'mid'|'premium';
}
type SegmentRole = 'sink'|'cooktop'|'dishwasher'|'drawers'|'doors'|'pantry'|'oven-tower'|'fridge-gap'|'corner';
type Segment =
  | { kind: 'cabinet'; role: SegmentRole; widthMm?: number }
  | { kind: 'filler'; widthMm: number }
  | { kind: 'gap'; reason: string; widthMm: number };
interface Run { wall: Wall; segments: Segment[]; wallCabinets: boolean }
interface StyleSpec { finishId: string; benchtopId: string; handleId: string; kickId?: string; tapId?: string }
interface KitchenSpec { runs: Run[]; island?: { lengthMm: number; depthMm: number; features: ('seating'|'sink'|'storage')[] }; style: StyleSpec; rationale: string }
interface Violation { code: string; severity: 'error'|'warn'; message: string; itemIds?: string[] }
```

### 2. Layout engine — `src/lib/layout/` (pure TS, zero React imports)

- `catalogIndex.ts` — build a role→product index from `microvellum_products` rows (sink base = `is_sink`, drawers = `drawer_count>0`, pantry = tall, corner = `is_corner`, etc.), filtered `visible_to_standard`. Fallback table of generic definitionIds (the ones the wizard uses today) if a role has no DB match, so the engine never returns empty.
- `solveRun.ts` — `solveRun(run, wallLengthMm, openings, catalog, dims)`: fit modules (prefer 600, then 450/900/1200) left-to-right, auto-insert fillers ≤ 100mm at wall ends, skip base placement across `door`/`walkway` openings, allow base but not wall cabinets under `window` openings. Returns positioned segments with resolved SKUs and widths.
- `compileSpec.ts` — `compileSpec(spec, room, catalog, dims): PlacedItem[]` — converts runs to world-space `PlacedItem[]` matching existing conventions (see `generatePreviewItems`: back wall z = `-depth/2 + baseDepth/2`, rotations 0/90/180/270, `cabinetNumber` C01…). Adds wall cabinets at `wallMountHeight` where `run.wallCabinets`, tall units full height, island as centered free run. Apply `style` ids onto items (`finishColor`, `handleType`).
- `resolveCorners.ts` — insert blind-corner cabinet where two runs meet using `cornerDefaults.ts` values.
- `placeAppliances.ts` — services-aware placement: sink centred on/near `drain`/`water-supply` point (prefer under a window); dishwasher adjacent to sink (≤ 900mm) on the water side; cooktop on the `gas` point when `cooktop: 'gas'` else near a GPO, ≥ 300mm landing both sides, never in a corner; fridge gap (`fridgeWidthMm` + 40 clearance) at a run end nearest a door opening; oven tower beside pantry when present; hood aligned to `hood-duct` if set.
- `validate.ts` — `validate(items, room, brief): Violation[]`:
  - errors: out-of-room, overlap (AABB with rotation), base cabinet blocking a door opening or its swing arc, wall cabinet across a door or window span, aisle < 1000mm (< 1200mm between facing runs / island), missing sink, missing cooktop landing
  - warns: sink > 1500mm from drain ("re-plumbing required"), gas cooktop off the gas point, no reachable GPO for dishwasher/fridge/oven, work triangle perimeter outside 3.6–8.0m or any leg < 1.2m / > 2.7m, continuous prep bench < 900mm, fridge door swing conflict
- `defaultSpec.ts` — `defaultSpecFor(brief): KitchenSpec` — sensible non-AI layout per shape (this replaces `generatePreviewItems` and is the no-AI fallback).
- `priceDesign.ts` — run items through `generateQuoteBOM`/pricing engine; return `{ lowAud, highAud }` = total × 1.0/1.15 commercial band, rounded to $500. Guard: if pricing throws or returns 0, fall back to current linear-metre formula and flag `estimateSource: 'fallback'`.
- **Tests** (`src/lib/layout/__tests__/`): vitest unit tests — run solving on 2400/3600/6000mm walls, corner insertion, opening avoidance, validator catches (overlap, narrow aisle, bad triangle), `defaultSpecFor` for all 4 shapes yields zero errors. Add vitest + `"test": "vitest run"` to package.json if absent.

### 2b. Planner-wide openings & services (trade planner too — not wizard-only)

- **`UnifiedScene`**: render window cutouts (recessed frame + translucent pane) and door openings (frame, no wall segment) in wall meshes from `room.openings`; render `room.services` as small colour-coded markers (blue = water/drain, red = gpo, yellow = gas, grey = duct) with a `showServices` prop. In 2D/plan mode draw door swing arcs. Degrade gracefully when arrays are empty/undefined (all existing designs).
- **Trade RoomSetupWizard** (`src/pages/trade/components/RoomSetupWizard/`): add `OpeningsStep.tsx` and `ServicesStep.tsx` following the existing step pattern (`index.tsx` registers steps). Each shows a top-down SVG room diagram (reuse the `KitchenDimensionsDiagram` approach): click a wall to add an item, list below with offset/width/type inputs, delete buttons. Persist into the room's `RoomConfig` in `design_data`.
- **RoomPlanner snapping**: door openings + swing arcs = no-place zones for base/tall cabinets; window spans = no-place zones for wall cabinets (respect `sillHeightMm` — base cabinets under windows are fine). Wire into the existing drag/snap logic.
- **`planViewPdf.ts`**: draw openings (door arc symbol, window double-line) and service point symbols on the plan.

### 3. Edge function — `supabase/functions/ai-designer/index.ts`

- Deno function, CORS like `send-email`. Env: `ANTHROPIC_API_KEY` (Supabase secret).
- Request: `{ mode: 'generate'|'refine'|'style', brief: DesignBrief, currentSpec?: KitchenSpec, message?: string, history?: {role,content}[] }`.
- Duplicate the minimal layout-engine pieces it needs into `supabase/functions/_shared/layout/` (Deno can't import from `src/`) — keep files small and mirrored; add a header comment in both locations noting they must stay in sync.
- Claude call: model `claude-sonnet-4-5`, tool-use loop (max 8 iterations) with tools:
  - `get_catalog_summary()` → role list + available widths + style option ids/names (query `microvellum_products` with service-role client)
  - `propose_layout(spec: KitchenSpec)` → compiles + validates; returns `{ violations, itemCount, priceBand }`
  - `finalize(specs: KitchenSpec[])` → ends loop
- Add tool `patch_room(roomPatch)` — lets refine turns update `openings`/`services`/dimensions when the user states room facts in chat.
- System prompt: kitchen-design expert; MUST call `propose_layout` and fix all `error` violations before `finalize`; `generate` mode returns 3 distinct named options (vary layout strategy, not just style); `style` returns updated `style` + rationale only, choosing ONLY from provided option ids.
- **`refine` mode = full chat plan editing.** Input: current `KitchenSpec` + `RoomSpec` + last 6 turns + user message. Must handle all of:
  - layout ops: move/swap/add/remove runs, island, pantry, fridge gap sizing ("move the sink under the window", "add an island with seating", "remove the corner unit")
  - functionality ops: drawer/door mix, appliance changes, prep-space requests ("more drawers", "make room for a 900 oven")
  - room ops via `patch_room`: "there's a door on the right wall", "plumbing is on the back wall", "the window is 1800 wide" → patch then re-layout
  - style ops: finishes/benchtop/handles ("make it darker", "oak fronts")
  - questions: answer from rationale/validators WITHOUT changing the spec (return `unchanged: true`)
  Output: 1 updated spec + `changeSummary` string ("Moved sink 600mm left; dishwasher followed"). Client keeps an undo stack (last 10 specs) with an Undo button in the chat bar.
- Response: JSON `{ options: { name, spec, items, priceBand, violations, rationale }[] }` (compile server-side so the client never trusts model output directly). Streaming optional — if simple, return non-streamed JSON and show a client-side progress state.
- Guards: zod-parse every tool input; unknown ids → tool error back to model; per-IP rate limit 10 generations/hour via a `ai_rate_limits` table or in-memory map; log each session to new table `ai_design_sessions (id uuid pk default gen_random_uuid(), created_at, brief jsonb, mode text, result jsonb)` — write the migration in `supabase/migrations/`.

### 4. Style presets — `src/data/stylePresets.ts`

8 presets (Coastal, Scandi, Japandi, Hamptons, Modern Dark, Industrial, Classic White, Warm Timber), each `{ id, name, blurb, style: StyleSpec }` using ONLY existing ids from `src/constants.ts`. Export `STYLE_PRESETS` and include them in the edge function's catalog summary.

### 5. Wizard rework — `src/pages/homeowner/`

Refactor into `Wizard.tsx` (shell) + `steps/` files. New 5-step flow, preserving current visual language (slate/emerald Tailwind, StepIndicator, mobile-first):

1. **Room** — existing shape/dims + island preference + openings/services editor: top-down SVG of the room, tap a wall to add door/window, plus "Where is your sink/plumbing now?" and optional power/gas markers (share the diagram component with the trade OpeningsStep/ServicesStep — build it once in `src/components/shared/`). Store as `RoomSpec`.
2. **How you cook** — household size, cooks, priorities (multi-chip), appliance choices. → `DesignBrief`.
3. **Design** — "✨ Design my kitchen" button → POST `ai-designer` `generate` → 3 option cards (name, rationale, price band, item count; render mini `UnifiedScene` per card lazily). Select → full-width 3D preview + refine chat input (mode `refine`, keep last 6 turns). "Skip — use standard layout" → `defaultSpecFor`. Loading state with rotating friendly messages; on API failure, toast + fall back to default spec (wizard must never dead-end).
4. **Style** — preset cards (apply to spec, live 3D update) + "Describe your look" input → `style` mode + expandable custom pickers (existing finish/benchtop/handle plus kick + tap from constants).
5. **Review & Quote** — keep current contact capture and `jobs` insert, but: price band from `priceDesign`, `design_data` = `{ wizardVersion: 2, brief, spec, items, style, priceBand }`, keep `send-email` invoke and `/quote/:jobId` link. Keep URL-param sharing working for steps 1–2 fields; once a design is generated add `?design=<ai_design_sessions.id>` and hydrate from it on load.

### 6. Learning framework (planner-side foundations)

The designer must improve over time from user behaviour. Build the data layer + retrieval now; the weekly trend job and admin queue can be minimal v1s.

- **Migrations** (`supabase/migrations/`):
  - `design_feedback (id, session_id, event text, payload jsonb, created_at)` — events: `option_selected`, `option_rejected`, `refine_command`, `style_preset_applied`, `lead_submitted`, `handoff_opened`
  - `design_patterns (id, name, tags jsonb, room_shape, size_band, spec jsonb, status 'candidate'|'approved'|'retired', stats jsonb)`
  - `style_presets (id, name, blurb, style jsonb, tags text[], status, stats jsonb)` — seed from `src/data/stylePresets.ts`; wizard + edge function read from DB with the static file as fallback
  - `trend_snapshots (id, created_at, window_days, summary jsonb)`
- **Feedback logging**: client fires `design_feedback` inserts (via edge function to keep RLS tight) at option select/reject, each refine turn, preset apply, and lead submit.
- **Few-shot retrieval in `generate`**: before calling Claude, query approved `design_patterns` matching room shape + size band (±600mm) + overlapping priority tags, take top 3 by stats, include in the system prompt as example specs. Zero matches = proceed without examples.
- **Trend context**: if a `trend_snapshots` row exists (< 14 days old), inject its `summary` into the `generate`/`style` system prompt ("current customer trends: …").
- **Weekly job**: scheduled edge function `ai-designer-trends` (copy `scheduled-supplier-import` pattern) aggregating 90-day `design_feedback` into a new snapshot + flagging high-performing specs from converted leads as `candidate` patterns. Human approval only: candidates do nothing until an admin flips status to `approved` (a minimal `/admin/ai-designer` list page with approve/retire buttons is enough for v1).

### 7. Website integrations (flatlay + inspiration gallery — ALREADY BUILT on the website side, integrate only)

The website repo has `generate-flatlay` (OpenAI image gen over material selections) and the inspiration/scope-builder flow deployed. Planner-side work only:

- **`src/lib/flatlay/client.ts`**: `getFlatlay(style: StyleSpec, materials): Promise<string /* image URL */>` — invoke the `generate-flatlay` Supabase function with material names + swatch/texture URLs; cache by style-hash (storage bucket `flatlays` or table) to avoid re-billing. If the function errors or the apps aren't yet on one Supabase project (env flag `VITE_FLATLAY_ENABLED`), fall back to `renderFlatlayFallback()` — a deterministic canvas swatch board (hex/texture tiles + labels + style name) that always works.
- **Show the board**: Style step ("Your material board", download/share), selected-option summary, and Review step.
- **Handoff seeding**: on wizard load with `?handoff=<id>`, fetch the `planner_handoffs` row (WS5 contract — if the table/type is missing, create the migration and a `WebsitePlannerHandoff` TS type: `{ id, payload: { roomType?, dimensions?, materials?: {name,id?}[], styleWords? }, consumed_at }`), map materials to catalog/preset ids (nearest-match by name, note when fallback used), pre-fill brief + style, mark consumed, and show "Based on your inspiration picks" in the Style step. After lead submit, write the job id back onto the handoff row.
- Gallery/Style-Finder UI changes inside the website repo are OUT OF SCOPE here — just make the planner consume handoffs and log `handoff_opened` feedback.

### 8. Wiring & cleanup

- Delete `generatePreviewItems` and `estimatePrice` from Wizard; import from `src/lib/layout`.
- `trackEvent` additions: `ai_generate_requested/succeeded/failed`, `ai_option_selected`, `ai_refine_used`, `style_preset_applied`.
- Ensure `/wizard` still works logged-out (RLS: `ai_design_sessions` insert/select via edge function service role only).

## ACCEPTANCE CHECKLIST (verify before finishing)

- [ ] `npm run build` and `npm run test` pass; no new TS errors.
- [ ] `/wizard` with AI skipped: all 4 shapes produce layouts with sink + cooktop + fridge gap, zero validator errors, real-engine price band.
- [ ] `generate` returns 3 options that compile with zero `error` violations (test with mocked Anthropic response in a unit test of the tool loop if no API key available).
- [ ] Refine turns work across all op classes: "move the sink under the window" (layout), "more drawers" (functionality), "there's a door on the east wall" (room patch + re-layout), "make it darker" (style), "why is the fridge there?" (question, spec unchanged). Undo restores the previous spec.
- [ ] Doors/windows render as real wall cutouts and service markers show in 3D for BOTH the wizard preview and the trade RoomPlanner; trade RoomSetupWizard has working Openings + Services steps; base cabinets can't be dropped across a doorway in RoomPlanner.
- [ ] Sink placed away from the drain point produces a "re-plumbing required" warning visible to the user.
- [ ] Existing saved designs (no openings/services) load without errors everywhere.
- [ ] Feedback events (`option_selected`, `refine_command`, `style_preset_applied`, `lead_submitted`) land in `design_feedback`; `generate` includes approved pattern examples when matches exist and works with zero patterns.
- [ ] Style presets load from DB with static-file fallback; admin page can approve/retire patterns and presets.
- [ ] Flatlay board appears in the Style step: AI image when `VITE_FLATLAY_ENABLED` and the function responds, canvas fallback otherwise — never a broken image or blocked step.
- [ ] `/wizard?handoff=<id>` pre-fills brief + style from a `planner_handoffs` row, marks it consumed, and writes the job id back after lead submit.
- [ ] No trade pricing detail anywhere in homeowner UI or network payloads — bands only, rounded to $500.
- [ ] Lead submission stores full v2 `design_data` and still fires `send-email`.
- [ ] Mobile 375px: all steps usable, 3D preview ≥ 240px tall.
- [ ] Old share URLs (`/wizard?s=l&w=4200…`) still hydrate steps 1–2.

## OUT OF SCOPE (do not build)

Photo upload/vision, photoreal renders, multi-room, payments, any changes inside the website repo (gallery UI, Style Finder, `generate-flatlay` itself — already built there), embedding-based style matching (tag matching is enough for v1), auto-promotion of learning candidates (admin approval only).
