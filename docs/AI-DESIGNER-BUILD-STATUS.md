# AI Designer — Build Status

_Last updated: 2026-07-13 (provider swap to OpenAI + placement sweep). Plan: `AI-DESIGNER-HARNESS-PLAN.md`. Spec: `ONE-SHOT-BUILD-PROMPT.md`._

## 2026-07-13 update

- **Provider: Anthropic → OpenAI.** `supabase/functions/ai-designer/index.ts` now
  calls the OpenAI Chat Completions API with function-calling (tools
  `propose_layout` / `patch_room` / `finalize`), reusing the existing
  `OPENAI_API_KEY` secret (default model `gpt-4o`, override `OPENAI_MODEL`). This
  matches the flat-lay/joinery image functions, which already use OpenAI. No
  `ANTHROPIC_API_KEY` is needed anymore. **Still needs deploying** — `ai-designer`
  was never deployed (that was the "Failed to fetch"); Ben deploys from his side.
- **Placement sweep added:** `npm run ai:sweep` (`scripts/ai-planner-sweep.mjs`)
  runs the deterministic engine across 45,360 room/shape/service/opening/appliance
  combos. Result: 0 placement bugs (no overlaps/out-of-room), 0 price problems,
  0 missing essentials across 18k "reasonable" rooms. Known boundary (expected,
  not a bug): a single-wall room ≤3000mm with a mid-wall door can't hold
  fridge+sink+cooktop on one fragmented wall — the solver drops the cooktop with
  a note; the AI path should pick an L/U-shape there instead.

## Built this session (P0 + P1 + wizard wiring + P3 scaffold)

| Piece | Where | Status |
|---|---|---|
| `Opening` + `ServicePoint` on core `RoomConfig` | `src/types.ts` | ✅ (optional arrays — legacy designs unaffected) |
| KitchenSpec DSL types + zod schemas | `src/lib/layout/types.ts`, `schemas.ts` | ✅ |
| Layout engine: run solver (openings-aware, mirrored corner-first side runs), corner reservation, wall-cab rows, rangehood, island | `src/lib/layout/solveRun.ts`, `compileSpec.ts`, `geometry.ts`, `catalogRoles.ts` | ✅ |
| Validators: fit/overlap, door swing, galley+island aisles, work triangle, cooktop landing, prep bench, **sink-vs-drain re-plumb warn**, gas point | `src/lib/layout/validate.ts` | ✅ |
| Services-aware default layouts (no-AI fallback), 4 shapes | `src/lib/layout/defaultSpec.ts` | ✅ |
| Price band v1 (per-item estimator, band ±12%, $500 rounding, band-only output) | `src/lib/layout/priceDesign.ts` | ✅ (real BOM engine slot-in is P2) |
| Wizard on the engine (replaced `generatePreviewItems` + `estimatePrice`, same signatures) | `src/pages/homeowner/Wizard.tsx` | ✅ |
| `ai-designer` edge function: OpenAI tool loop (`propose_layout`, `patch_room`, `finalize`), generate/refine/style modes, server-side compile, rate limit | `supabase/functions/ai-designer/index.ts` | ✅ scaffold (needs deploy; reuses `OPENAI_API_KEY`) |
| Engine→Deno sync script | `scripts/sync-ai-shared.mjs` (`npm run ai:sync-shared`) — regenerates `supabase/functions/_shared/layout/` | ✅ |
| Client hook | `src/hooks/useAiDesigner.ts` (`generate`/`refine`/`restyle`) | ✅ (not yet used by wizard UI) |
| Smoke tests (11) | `npm run test:layout` | ✅ all passing |

## Session 2 additions — room capture phase 1 (end-to-end)

| Piece | Where | Status |
|---|---|---|
| Scanner phases P9–P12 in the plan (research: `ROOM-SCANNER-RESEARCH.md`) | `AI-DESIGNER-HARNESS-PLAN.md` §8a | ✅ |
| `RoomScan` universal capture type (manual/webxr/arcore/cubicasa/roomplan/magicplan) | `src/lib/layout/types.ts` (synced to `_shared`) | ✅ |
| **RoomFeaturesEditor** — top-down tap-a-wall diagram for doors/windows/drain/power/gas, offset+width fine-tuning, mobile-friendly | `src/components/shared/RoomFeaturesEditor.tsx` (shared — reuse in trade RoomSetupWizard) | ✅ |
| Wizard Step 1 hosts the editor; openings/services in wizard state | `src/pages/homeowner/Wizard.tsx` | ✅ |
| Openings/services flow through preview + pricing (engine avoids doorways, sink follows drain) | bridge functions in Wizard | ✅ |
| **Buildability notes** on Review step (amber box: re-plumb, gas move, aisle/triangle warnings) | Step4Review | ✅ |
| Lead `design_data` v2: openings, services, roomScan stamp, buildNotes | handleSubmit | ✅ |
| E2E smoke test (door + drain → valid design, sink on drain wall) | `scripts/layout-smoke.mjs` — 12/12 passing | ✅ |

## Session 3 additions — the AI design experience (one-shot)

| Piece | Where | Status |
|---|---|---|
| 5-step flow: Room → **Cooking** → **Design** → Style → Review | `Wizard.tsx` | ✅ |
| Step 2 "How you cook": household, cook frequency, priorities chips, oven/cooktop/dishwasher/fridge, island preference | `steps/StepCook.tsx` | ✅ |
| Step 3 "Design": ✨ AI generate → 3 named option cards (rationale + price band + warnings), 3D preview, **chat refine bar** with Undo (10-deep), room patches from chat applied back to wizard state | `steps/StepDesign.tsx` + `useAiDesigner` | ✅ |
| No-AI fallback: deterministic "Standard layout" seeded on entry; AI failure → toast + keep going | `StepDesign.tsx` | ✅ |
| `buildBrief` — full DesignBrief from wizard state (replaces the thin adapter path on review) | `wizardBrief.ts` | ✅ |
| Style step: 8 **Quick Style** preset cards (Coastal, Scandi, Japandi, Modern Dark…) + existing pickers | `src/data/stylePresets.ts` + Wizard | ✅ |
| Review consumes the chosen design (spec recompiled with selected style), band from engine, `design_data` carries spec + designName + aiGenerated | Step4Review | ✅ |
| Analytics: ai_generate_requested/succeeded/failed, ai_option_selected, ai_refine_used, style_preset_applied | throughout | ✅ |

Notes: legacy `Step2Layout` + the old bridge functions remain in Wizard.tsx unused (harmless; remove in a cleanup pass). AI features need the edge function deployed: `supabase functions deploy ai-designer` (reuses the existing `OPENAI_API_KEY` secret) — everything else works without it.

### P2 — real BOM pricing (done)

`src/hooks/useWizardPricing.ts`: wizard bands now come from the SAME `generateQuoteBOM` + Supabase pricing tables as the trade planner (shared 'pricing-data' react-query cache). Trade cost × 1.35 commercial × GST → ±12% band → $500 rounding. Only the band leaves the hook (WS10); BOM warnings log to console. Deterministic estimator remains the fallback while tables load / if the BOM totals $0. Wired into StepDesign preview + Review; `design_data.priceBand.source` records 'bom' vs 'estimator'. Depends on planner pricing migrations being applied (INTEGRATION_STATUS point 2 — benchtop_pricing etc.); until then the estima