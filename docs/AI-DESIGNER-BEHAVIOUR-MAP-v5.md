# AI designer behaviour map (v5 baseline)

Captured before the Unified AI Kitchen Design Studio changes. These behaviours
are contracts unless a v5 acceptance rule deliberately replaces them.

## Preserved customer behaviours

- Room dimensions, L-shaped cut-outs, openings, service points, selected walls
  and partial wall ranges remain authoritative.
- The deterministic solver maps semantic cabinet roles to exact catalogue
  definition IDs and supported widths before geometry reaches the renderer.
- Compiled designs remain priceable, editable, renderable in the existing 3D
  scene and transferable to the trade/Microvellum path.
- Dishwasher placement remains adjacent to the sink; fridge openings preserve
  the appliance body width plus ventilation clearance.
- Existing AI session tokens, proposal selection, retry, undo, manual cabinet
  editing and non-blocking offline fallback remain available.
- A change to finishes preserves layout. A deliberate style-family change may
  recompose layout massing through Style DNA.

## Defect fixtures replaced by v5

- The wizard default used `defaultSpecFor` directly while alternatives used the
  candidate engine. Both must use the same engine.
- Style presets changed material IDs only. Style family DNA must now change
  overhead density, open shelving, tall-unit massing and feature composition.
- The online model could author `KitchenSpec` geometry. It may now rank, name
  and explain approved candidate IDs only.
- Structurally identical options could be backfilled to reach three cards. The
  Studio must show fewer than three rather than show a near-duplicate.
- The website room-scan drift check resolved a nested, non-existent website
  path and reported a false green skip.

## Engine ownership boundaries

1. Room and brief: capture facts and customer intent.
2. Catalogue capabilities: exact product IDs, widths and supported features.
3. Style DNA: versioned composition rules and mapped material families.
4. Candidate engine: deterministic geometry and hard-rule rejection.
5. Quality selection: professional score and structural diversity gate.
6. AI presentation: ranking, naming and explanations for approved IDs only.

The executable companion is `scripts/designer-characterization-smoke.mjs`.
