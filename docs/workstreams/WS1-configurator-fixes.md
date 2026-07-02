# WS1 — Product Configurator (Full Editor) Fixes

**Complexity: HIGH (3D + pricing integration) — use a strong model.**
Repo: kitchen planner. No dependencies; do this first.

## Goal
The Full Editor (`/trade/job/:id/room/:id/configure/:productId`) must show the
same part sizes, materials, and prices as the real BOM engine, and render
corner doors correctly in its 3D preview.

## Current defects (verified in browser 2026-07-02)
1. **Leg depth default**: `src/components/trade/configurator/DimensionsTab.tsx`
   ~line 103: `cabinet.construction?.cabinetDepthLeft ?? cabinet.dimensions.depth`
   — for a 900-deep corner this defaults arms to 900. Should default to the
   room's base depth (575) like the planner does. Same for right.
2. **Parts List material**: `PartsListPanel.tsx` line ~53:
   `const defaultBoard = materials.find((m) => (m.areaCost ?? 0) > 0)` — when
   the cabinet's stored finish id doesn't match (or matched row has no price,
   e.g. Laminex), it silently uses the first priced material ("3mm White
   Backing"). Parts then price at $2-4 each.
3. **Parallel pricing logic**: PartsListPanel builds its own part list with
   hardcoded unit prices (e.g. gables $45, lines ~149-151) instead of calling
   `generateCabinetBOM` from `src/lib/pricing`. Replace the panel's costing
   with the engine: build a PlacedItem from the ConfiguredCabinet (reuse
   `toPlacedItems` from `src/hooks/useTradeRoomPricing.ts` — export it), fetch
   pricing data via the same hook/query, and render `cabinetBOM.parts`,
   `.hardware`, `.subtotals`. One engine, one truth.
4. **Corner doors in preview**: `Preview3D.tsx` maps to a PlacedItem and
   renders via the same `CabinetMesh`/`CabinetAssembler` as the planner, yet
   pie-cut doors render as a single door on the wrong plane. Compare its
   PlacedItem against the planner's mapping in `RoomPlanner.tsx` (~line 124):
   likely missing `blindSide`, `drawerFrontHeights`, or the corner flags the
   assembler keys off (`definitionId` regex vs `productName`). Reproduce with
   product `base_corner_pie_cut_2_door`, fix the mapping (or the assembler's
   corner-door branch `renderCornerDoors` if the planner shows the same fault
   in 3D view — check both).

## Acceptance
- Corner opens with 575 arms by default; sliders still work and persist.
- Parts List shows the cabinet's actual carcase/exterior names, sizes matching
  the BOM engine, and a total equal to the planner's per-cabinet price.
- Pie-cut corner shows two bi-fold door leaves across the notch in the preview,
  opening with the doors-open toggle if present.
- `npx tsc -p tsconfig.app.json --noEmit` clean; `npm run test:functional` passes.
