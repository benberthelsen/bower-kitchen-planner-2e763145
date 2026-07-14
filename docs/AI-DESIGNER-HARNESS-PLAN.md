# AI Kitchen Designer Harness — Build-Out Plan

**Goal:** Make the homeowner wizard (`/wizard`) fully usable as an AI-assisted kitchen designer covering **layout**, **functionality**, and **interior design** — built on the real trade engine (Microvellum catalog, pricing engine, UnifiedScene 3D) instead of the current hard-coded preview.

---

## 1. Where we are today

| Area | Current state | Gap |
|---|---|---|
| Wizard | 4 steps: Room → Layout → Style → Review (`src/pages/homeowner/Wizard.tsx`) | Shape + 2 dimensions only; no doors/windows/island; no appliances |
| Layout | `generatePreviewItems()` hard-codes generic 600mm `base_1_door` cabinets | No wall/tall/pantry/corner/sink cabinets; ignores the real Microvellum catalog |
| Pricing | `estimatePrice()` = linear metres × $2,400 × multiplier | Real engine exists in `src/lib/pricing` (BOM, sheets, edges, hardware, labor) but is unused here |
| Interior design | 8 door finishes, 6 benchtops, 6 handles — flat pickers | No style guidance, no palettes, no kicks/taps/splashback in HO flow |
| AI | None in repo | — |
| Room model | `RoomConfig` = width/depth/height/shape | No walls-with-openings (doors, windows), no plumbing/power/gas positions — needed planner-wide, not just in the wizard |

Existing assets to reuse: `useCatalog` (products with `door_count`, `is_sink`, `is_corner`, `spec_group`, arm depths), `src/lib/pricing/*`, `UnifiedScene` + `Scene3DErrorBoundary`, Supabase edge functions pattern (`send-email` etc.), jobs/leads tables, URL-state sharing.

---

## 2. Core architecture: harness, not free-form AI

The AI never emits raw geometry. It makes **design decisions**; deterministic code guarantees **valid, priceable output**.

```
Homeowner brief (text / choices / photo)
        │
        ▼
┌─ Supabase Edge Function: ai-designer ─────────────────┐
│  Claude (tool-use loop, key server-side)              │
│  tools: get_catalog · propose_layout · validate ·     │
│         price_design · set_style · critique           │
└──────────────┬────────────────────────────────────────┘
               ▼
┌─ Layout Engine (pure TS, src/lib/layout/) ────────────┐
│  DesignBrief ──▶ KitchenSpec ──▶ PlacedItem[]         │
│  wall-run solver · corner resolver · appliance zones  │
│  validators: fit, overlap, clearances, work triangle  │
└──────────────┬────────────────────────────────────────┘
               ▼
   Real pricing engine ──▶ honest range (HO-safe, rounded)
               ▼
   UnifiedScene 3D preview + option cards in wizard
```

Key principle: **every AI proposal round-trips through `validate` + `price_design` before the user sees it.** Invalid proposals bounce back to the model with the violation list.

---

## 3. Data contracts (the backbone)

### 3.1 `DesignBrief` — what the user tells us
```ts
interface DesignBrief {
  room: RoomSpec;                    // see 3.2
  household: { size?: number; cooks?: 'rare'|'daily'|'entertainer' };
  priorities: ('storage'|'bench-space'|'entertaining'|'baking'|'budget')[];
  appliances: { oven?: '600'|'900'; cooktop?: 'gas'|'induction';
                dishwasher: boolean; fridgeWidth?: number; microwave?: 'built-in'|'benchtop' };
  island?: 'want'|'no'|'if-it-fits';
  styleWords?: string;               // free text: "warm coastal, oak + white"
  budgetBand?: 'value'|'mid'|'premium';
  photoUrl?: string;                 // optional photo of existing kitchen (vision input)
}
```

### 3.2 `RoomSpec` — extends today's `RoomConfig` (shared planner-wide, see §4a)
```ts
interface Opening {
  wall: Wall;                        // 'N'|'E'|'S'|'W'
  type: 'door'|'window'|'walkway';
  offsetMm: number;                  // from wall's left corner
  widthMm: number;
  heightMm?: number;                 // door/window height
  sillHeightMm?: number;             // windows only
  swing?: 'in-left'|'in-right'|'out'|'slider';  // doors — drives clearance validation
}
interface ServicePoint {
  wall: Wall;
  type: 'water-supply'|'drain'|'gpo'|'gas'|'hood-duct';
  offsetMm: number;
  heightMm?: number;                 // e.g. GPO at 1050 above bench
}
interface RoomSpec extends RoomConfig {
  openings: Opening[];
  services: ServicePoint[];
}
```
These live in `src/types.ts` (extending `RoomConfig` itself, not a wizard-only type) so the trade planner, admin job views, and the wizard all share one room model.

### 3.3 `KitchenSpec` — the AI's output language (zod-validated)
A wall-run description, not coordinates:
```ts
interface KitchenSpec {
  runs: Run[];           // { wall, segments: Segment[] }
  island?: IslandSpec;
  style: StyleSpec;      // finishId, benchtopId, handleId, kickId, tapId, splashback
  rationale: string;     // shown to the user: why this layout works
}
type Segment =
  | { kind: 'cabinet'; role: 'sink'|'cooktop'|'dishwasher'|'drawers'|'doors'|'pantry'|'oven-tower'|'fridge-gap'|'corner'; widthMm?: number }
  | { kind: 'filler'; widthMm: number }
  | { kind: 'gap'; reason: string; widthMm: number };
```
The layout engine compiles `KitchenSpec` → concrete `PlacedItem[]` by picking real catalog SKUs (via `useCatalog` data server-side), solving widths to fill runs (600/450/300 modules + fillers), resolving corners with the existing corner defaults, and stacking wall cabinets at `wallMountHeight`.

---

## 4. Layout engine (`src/lib/layout/`) — deterministic core

Pure functions, no React, fully unit-testable:

- **`solveRun(wallLengthMm, segments, catalog)`** — fits modules to wall length, inserts fillers, respects openings (never place cabinets over a doorway; windows block wall cabinets but not base).
- **`resolveCorners(runs)`** — blind-corner insertion using existing `cornerDefaults.ts` (filler width 75, stile 45, arm depths from product rows).
- **`placeAppliances(brief, runs, room)`** — services-aware: sink centred on/near the `drain`/`water-supply` point (preferably under a window), dishwasher within 900mm of sink AND water, cooktop on the `gas` point when gas (else near a GPO) with ≥ 300mm landing both sides, fridge gap at a run end near the entry door with a GPO behind, oven tower not in corner, hood above cooktop aligned to `hood-duct` if present.
- **`validate(design)` → Violation[]** — hard rules (fail) and soft rules (warn):
  - fit: nothing outside room, no overlaps, no cabinet blocking a door opening or its swing arc, door/drawer clearance
  - walkways ≥ 1000mm (1200 for galley/island aisles)
  - services: sink > 1500mm from drain → warn "re-plumbing required"; gas cooktop off the gas point → warn; appliance positions without a reachable GPO → warn (soft, since services can be moved — but the user should know it costs)
  - work triangle: sink–cooktop–fridge perimeter 3.6–8.0m, no leg < 1.2m or > 2.7m
  - landing space: ≥ 300mm both sides of cooktop, ≥ 450mm beside oven/fridge, ≥ 600mm drainage side of sink
  - min bench prep zone ≥ 900mm continuous
  - wall cabinets never over door openings; over windows only above head height
- **`priceDesign(items, style)`** — call the real `src/lib/pricing` BOM path; return HO-safe rounded band (× commercial layer ± 12%, rounded to $500). Never expose trade cost lines (WS10 ground rule).

Also gives non-AI value immediately: replace `generatePreviewItems` with `compileSpec(defaultSpecFor(brief))` so the wizard is dramatically better even with AI switched off.

---

## 4a. Planner-wide openings & services (whole-planner feature, not wizard-only)

Doors, windows, plumbing, and power become first-class room features across the app:

- **Types** — `Opening[]` + `ServicePoint[]` added to `RoomConfig` in `src/types.ts`; persisted inside `design_data` for every job/room (trade and homeowner). Migration-safe: both default to `[]` for existing designs.
- **3D rendering (`UnifiedScene`)** — wall meshes get window cutouts (glass pane + frame) and door openings (frame + optional swing-arc floor decal in 2D/plan view); service points render as small floor/wall markers (tap, drain, GPO, gas icons) toggleable via a "Show services" control.
- **Trade planner editing** — new `OpeningsStep` + `ServicesStep` in `RoomSetupWizard` (`src/pages/trade/components/RoomSetupWizard/`): top-down room diagram (reuse `KitchenDimensionsDiagram` pattern), tap a wall to add a door/window/service point, drag or type the offset. Also editable later from the RoomPlanner side panel.
- **Homeowner wizard editing** — simplified version of the same diagram in Step 1 (add door + window + "where's the sink now?" for water; power auto-assumed unless set).
- **Snapping/placement** — RoomPlanner drag logic treats door openings + swing arcs as no-place zones for base cabinets and window spans as no-place zones for wall cabinets.
- **Plan-view PDF** (`planViewPdf.ts`) — draw openings and service symbols so installers get them on the drawing.

The layout engine and AI both consume the exact same `RoomSpec`, so anything sketched in the trade planner is AI-designable and vice versa.

---

## 5. AI harness (`supabase/functions/ai-designer/`)

Edge function (same pattern as `send-email`), Anthropic API key in Supabase secrets.

- **Endpoint:** `POST /ai-designer` `{ mode: 'generate'|'refine'|'style'|'critique', brief, currentSpec?, message?, history? }` — SSE streaming response.
- **Tool-use loop (max ~8 rounds):** model calls `get_catalog_summary`, `propose_layout(KitchenSpec)`, `validate_layout`, `price_design`, `set_style`. The function executes tools by importing the layout engine (shared via `src/lib/layout` compiled into the function, or duplicated `_shared/` module) and querying `microvellum_products`.
- **Modes:**
  - `generate` — brief → **2–3 named options** (e.g. "The Entertainer", "Storage Maximiser"), each a validated `KitchenSpec` + price band + rationale.
  - `refine` — **full chat-driven plan editing.** Every turn takes the current `KitchenSpec` + room + history and returns an updated spec (validated + re-priced before display). Supported operation classes:
    - *layout*: "move the sink under the window", "swap the pantry to the other end", "add an island with seating", "remove the corner cabinet", "make the fridge space 900"
    - *functionality*: "more drawers, fewer doors", "add a spot for a built-in microwave", "I need a bigger prep area", "dishwasher on the left of the sink"
    - *room*: "there's a door on the right wall", "the window is 1.8m wide", "the plumbing is on the back wall" — these patch `RoomSpec` and trigger re-layout
    - *style*: "make it darker", "oak fronts with stone benchtop", "black handles"
    - *questions*: "why is the fridge there?" — answered from the rationale/validators without changing the spec
    Each response includes a one-line change summary ("Moved sink 600mm left under the window; dishwasher followed it") so the user sees exactly what changed; client keeps an undo stack of specs.
  - `style` — styleWords/photo → `StyleSpec` from curated palettes (§6).
  - `critique` — scores an existing design against the validator rules + ergonomics, returns plain-English suggestions.
- **Vision:** if `photoUrl` supplied, pass image to Claude for style extraction and rough room understanding.
- **Guardrails:** zod-validate every tool payload; reject specs referencing unknown SKUs; hard price-band rounding server-side; rate-limit by IP (public endpoint); log briefs+specs to a new `ai_design_sessions` table for eval/replay.

---

## 6. Interior design layer

- **Style profiles** (`src/data/stylePresets.ts`): 6–8 curated palettes (Coastal, Scandi, Modern Dark, Hamptons, Japandi, Industrial, Classic White, Warm Timber) — each maps to concrete `finishId + benchtopId + handleId + kickId + tapId + splashback` combos and price-band multiplier. The AI selects/blends from these — it never invents hex codes or SKUs.
- **Style step upgrade:** replace flat swatch pickers with preset cards (3D thumbnail via existing scene) + "customise" expansion retaining current pickers, adding kick + tap + splashback (already in trade constants).
- **AI style assistant:** "Describe your dream look" text box (or photo upload) → `style` mode → applies preset + tweaks with a one-line rationale ("Oak shaker fronts warm up the white stone you liked").
- Later phase: photoreal renders (e.g. scene screenshot → image model restyle). Explicitly out of v1 scope.

---

## 6a. Learning framework — the designer improves over time

No model fine-tuning; the system learns through **data the harness already controls**, with a human-in-the-loop promotion step so quality never drifts unattended.

### Signals collected (table `design_feedback`)
| Signal | Meaning |
|---|---|
| Option selected / rejected (of the 3 generated) | which layout strategies win per shape/size/brief |
| Refine commands (already logged in sessions) | what the generator got wrong — recurring commands = systematic gaps |
| Style preset applied / swapped | style preferences over time |
| Gallery likes/saves (§6c) | trending looks, pre-wizard |
| Lead submitted / quote accepted | strongest quality signal |
| Trade/admin edits to an AI design after handoff | expert corrections |

### Learning layers
1. **Pattern library (`design_patterns` table)** — named, curated `KitchenSpec` templates tagged by room shape, size band, and brief traits. `generate` retrieves the top-k matching patterns and passes them to Claude as few-shot examples ("designs that worked for similar rooms"), so new ideas enter the system as data, not code. New patterns come from: converted leads, admin-approved trade designs, and manually authored ideas — all distilled to specs and queued for approval.
2. **Style evolution (`style_presets` table)** — presets move from static `stylePresets.ts` to DB rows with usage/conversion stats, editable in admin. New presets can be composed in admin from trending finish/benchtop/handle combos; stale ones retired (soft-hide, never delete — old designs reference them). `styleWords` matching uses embeddings over preset descriptions + tags.
3. **Trend context (`trend_snapshots`)** — a weekly scheduled function (reuse `scheduled-supplier-import` pattern) aggregates the last 90 days of signals into a compact JSON ("charcoal + oak up 40%, islands requested in 70% of ≥3.6m rooms, most-common refine: more drawers"). This snapshot is injected into the `generate`/`style` system prompt so recommendations track evolving taste automatically.
4. **Eval + promotion loop** — the same weekly job re-runs the golden-brief eval suite against the current pattern library and flags candidates (new pattern, preset change) in an admin "AI Designer" review queue. Nothing goes live without an approve click. This is how "new ideas and layouts" get incorporated safely.

### Admin surface
`/admin/ai-designer`: review queue (patterns/presets), trend dashboard, session browser (brief → options → refines → outcome), kill-switch per pattern/preset.

---

## 6b. Flatlay generator — integrate the EXISTING website function (don't rebuild)

The website repo (`bower-cabinet-web-site`) already has `generate-flatlay` deployed (OpenAI image generation over selected materials, called via `dreamweaverBridge.ts` from the Design Scope Builder / `/showrooms/flat-lay` page — see `docs/INTEGRATION_STATUS.md`). The planner just needs the thin client that INTEGRATION_STATUS step 5 already recommends:

- **Prerequisite:** Supabase unification (WS6 / `SUPABASE_UNIFICATION_RUNBOOK.md`) so both apps share one project and the planner can invoke the function.
- **`src/lib/flatlay/client.ts`** — maps a `StyleSpec` + resolved materials (names, swatch/texture URLs from the supplier bundle) to the `generate-flatlay` payload; caches result per style hash in a `flatlays` storage bucket/table so repeat views don't re-bill OpenAI.
- **Deterministic fallback** — small canvas swatch-board renderer (hex/texture tiles + labels) used while the AI image generates, or if the function is unavailable — the wizard never blocks on it.
- **Where it appears in the planner:** Style step ("Your material board" + download/share), selected-option summary, review step, quote email, and the trade job view after handoff.
- **Share loop:** `/flatlay/:designId` public route + "Design a kitchen with this look" CTA seeding the wizard.

---

## 6c. Inspiration gallery — the website is the style front door (integrate, don't rebuild)

The website's showrooms / inspiration gallery + Design Scope Builder already let a user explore looks and pick materials. The job here is wiring it to the wizard so users **define their style on the website first, then work forward** into the AI designer:

- **Entry flow:** website gallery / flat-lay scope builder → selections saved as a `planner_handoffs` row (WS5 Phase 3 contract, `WebsitePlannerHandoff`) → "Design my kitchen with this style" button → `/wizard?handoff=<id>`.
- **Planner side:** on load with `?handoff`, fetch the row, map material names/ids against the supplier catalog (`useMaterialsCatalog`, fall back to nearest preset + note), pre-fill `DesignBrief.styleWords` + `StyleSpec`, mark handoff consumed, and show "Based on your inspiration picks" in the Style step. Wizard remains fully editable.
- **Loop closure:** lead/job id written back to the handoff row so admin links gallery session → lead → job (WS5 acceptance).
- **Website-side additions (website repo backlog, not this build):** "Style Finder" swipe flow (pick 5+ images → derived StyleProfile), gallery items backed by real `KitchenSpec`s rendered from the planner, publishing anonymised converted designs back into the gallery.
- **Feeds learning:** once on one Supabase project, gallery likes/saves/scope briefs write to `design_feedback` → trend snapshots (§6a), so evolving taste on the website steers the AI designer automatically.

---

## 7. Wizard UX rework

New flow (still under 5 min on mobile — WS10 acceptance):

1. **Room** — shape + dims **plus** doors/windows placement (simple tap-on-wall diagram, reuse `RoomShapeStep`/`RoomDimensionEditor` patterns from the trade RoomSetupWizard) and island preference.
2. **How you cook** — NEW: household size, priorities, appliance picks (drives `DesignBrief`).
3. **AI Design** — NEW: "Design my kitchen" → 3 option cards (mini 3D + price band + rationale). Pick one → full `UnifiedScene` preview with a **chat refine bar** ("make the pantry bigger"…). Skip-AI fallback: deterministic default layout.
4. **Style** — preset cards + AI style assistant + custom pickers.
5. **Review & Quote** — real-engine price band, keep contact capture + lead submission; store full `KitchenSpec` + `PlacedItem[]` in `design_data` so admin/trade opens the actual design in the trade planner (real handoff, not notes text).

URL sharing: replace param-per-field with a short design ID (`ai_design_sessions.id`) once a design exists; keep old params for backward compat.

---

## 8. Build phases

| Phase | Scope | Est. effort |
|---|---|---|
| **P0 — Foundations** | `Opening` + `ServicePoint` on `RoomConfig` in `src/types.ts`; `DesignBrief`; `KitchenSpec` + zod; extend wizard state | 2–3 days |
| **P0b — Planner-wide room features** | UnifiedScene rendering of doors/windows/service markers; RoomSetupWizard Openings + Services steps; no-place zones in RoomPlanner; plan-view PDF symbols | 4–5 days |
| **P1 — Layout engine** | solver, corners, services-aware appliance placement, validators, `compileSpec`; swap out `generatePreviewItems`; unit tests (vitest) | 4–6 days |
| **P2 — Real pricing** | wire `src/lib/pricing` BOM into wizard band; HO-safe rounding; remove `estimatePrice` | 1–2 days |
| **P3 — AI harness** | `ai-designer` edge function, tool loop, `generate` + full chat `refine` (layout/functionality/room/style ops), sessions table, rate limiting | 5–6 days |
| **P4 — Wizard UX** | new steps 2–3, option cards, chat refine UI + undo stack, openings/services editor | 4–5 days |
| **P5 — Interior design** | style presets, style step rework, `style` mode, photo input | 3–4 days |
| **P6 — Handoff + evals** | design_data → trade planner open; golden-brief eval suite (20 briefs + 20 refine commands, assert zero hard violations + price band sanity); analytics events | 2–3 days |
| **P7 — Website integration** | *(prereq: WS6 Supabase unification + WS5 handoff)* `generate-flatlay` client + fallback board; `?handoff=` wizard seeding from gallery/scope-builder; write-back loop | 3–4 days |
| **P8 — Learning framework** | `design_feedback` + `design_patterns` + `style_presets` (DB) + `trend_snapsh