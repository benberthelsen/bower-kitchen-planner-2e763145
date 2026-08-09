# Kitchen AI University

Kitchen AI University is the continuing knowledge base and training method for
the Bower Kitchen Planner. Its purpose is to turn practical kitchen-design
feedback into durable software knowledge instead of fixing one picture at a
time and forgetting the lesson later.

## The governing principle

The deterministic Bower engine designs the kitchen. It may use only cabinet,
hardware, appliance and construction capabilities that map to the Bower
Microvellum library. AI may rank, name and explain layouts that already passed
the rules; it does not author geometry or invent products.

This boundary keeps a design buildable, editable, priceable and transferable to
the trade planner even when the online AI is unavailable.

## The six subjects

1. **Room truth** — dimensions, selected wall ranges, openings, services,
   ceiling height and scan provenance remain authoritative.
2. **Microvellum vocabulary** — every semantic role resolves to a supported
   product identity, width and construction recipe.
3. **Professional planning** — key items are placed first: sink, cooktop,
   rangehood, dishwasher and fridge, followed by tall storage, drawers and
   infill cabinetry.
4. **Style DNA** — a family changes cabinet composition, massing, overhead
   density, shelving and feature elements, not only colours.
5. **Candidate quality** — hard-invalid layouts are rejected before scoring;
   alternatives must be materially different, or fewer choices are shown.
6. **Presentation and learning** — 3D, pricing, editing and AI explanations must
   describe the same approved design and preserve customer work.

## How to teach one new lesson

Use this sequence for every screenshot or designer observation:

1. Record the exact wizard URL, room facts, selected products and a screenshot.
2. State the professional requirement in plain language, including legitimate
   exceptions for very small or constrained rooms.
3. Reproduce the current result with the deterministic engine.
4. Add a failing characterization or regression fixture before changing the
   behaviour.
5. Put the correction in the lowest authoritative layer: catalogue mapping,
   Style DNA, candidate generation, hard rule, scoring, renderer or editor.
6. Sync the browser engine to the Supabase copy with `npm run ai:sync-shared`.
7. Run the focused test, the full release suite and a browser check using the
   reported URL.
8. Record any newly learned exception here or in the versioned design handoff.

A successful lesson changes a reusable rule and test. A screenshot-specific
coordinate patch is not a completed lesson.

## Current core lessons

- Prefer a 900 × 900 bi-fold pie-cut base corner. Use a handed blind corner
  only when the preferred unit would displace a required adjoining cabinet.
- Blind-corner units include their mapped return; the adjoining cabinet and
  benchtops must close directly into that return.
- Tall units form a bank at a run end. A fridge, pantry or oven bank must not
  leave a small isolated base cabinet trapped between it and the wall.
- Cooktops avoid windows and inside corners, receive product-aware side
  clearance and normally centre on their usable bench run.
- Sinks prefer a suitable window, remain clear of an exposed run end or tall
  panel when space permits, and size their cabinet to the selected sink.
- Dishwashers sit beside the sink, share the normal benchtop height and receive
  finished support panels where exposed.
- Wall cabinets first complete important groups around the rangehood and into
  valid corners. They do not strand narrow gaps or sit above a sink unless the
  customer requests maximum storage.
- Cabinets may be prompt-sized to the millimetre within mapped product limits;
  fillers remain normal scribes rather than hiding poor space allocation.
- Islands maintain at least a 900 mm walkway, face the working kitchen, receive
  continuous back and end panels, and normally provide a 300 mm seating
  overhang where the room allows.
- Continuous kick faces and benchtops are produced as runs, while cabinet
  identities remain discrete for editing and the Microvellum take-off.

These rules are executable in the layout, Design Studio, geometry, appliance,
editor and pricing smoke suites. The code and tests are authoritative if this
summary ever becomes stale.

## Style curriculum

The system defines sixteen versioned style families. Only families with full
mandatory Microvellum mappings and Bower's signed human composition review may
appear to customers. A review uses at least five external references and checks
composition traits rather than surface colour alone.

The present mapped launch group is Classic White, Scandinavian, Coastal /
Beach, Warm Timber and Modern Dark. Hamptons stays hidden until its mandatory
profiled doors, crown moulding and pillar-end capabilities are mapped. Newly
mapped families must pass fidelity and pairwise structural-difference tests
before activation.

## Evidence and regression library

- `audits/` contains dated usability evidence and screenshots.
- `scripts/designer-characterization-smoke.mjs` protects useful behaviour that
  existed before the v5 architecture.
- `scripts/layout-smoke.mjs` holds professional layout lessons and reported-room
  regressions.
- `scripts/design-studio-engine-smoke.mjs` checks architecture, Style DNA and
  professional candidate gates.
- `scripts/design-studio-synthetic-entry.ts` runs 100 AI-available and 100
  AI-unavailable customer journeys through Review and quote creation.
- `docs/AI-DESIGNER-BEHAVIOUR-MAP-v5.md` records the preserved baseline.
- `docs/AI-DESIGN-STUDIO-v5-HANDOFF.md` records the current release boundary.

## Release and rollback discipline

The unified Design Studio remains controlled by
`VITE_FEATURE_DESIGN_STUDIO`; the retained split Style/Design journey is the
rollback path. Existing saved designs migrate between wizard v4 and v5 without
discarding customer work.

Before a production promotion:

```powershell
npm run ai:sync-shared
npm run test:ci
npm run build:design-studio
```

Then merge through GitHub, verify both the Release checks and Cloudflare Pages
checks, deploy the `ai-designer` Supabase function when its shared code changed,
and smoke-test the live website-to-planner-to-quote journey. Tag or record the
previous production commit so rollback stays immediate.

## Starting the next session

Bring the exact planner URL and screenshot, then describe what a competent
kitchen designer would do instead and why. Begin by reading this file and the
v5 handoff, reproduce the issue, and add the next lesson to the regression
library before editing the engine.
