# AI Kitchen Designer Implementation Status

**Date:** 2026-07-14  
**Plan:** `AI-KITCHEN-DESIGNER-SCANNER-IMPLEMENTATION-PLAN.md` Revision 5  
**Current milestone:** D0 safety repairs and D1 persistence foundation complete locally  
**Deployment:** Not deployed or production-smoke-tested by this work

## 1. Completed Locally

### 1.1 Server-enforced AI proposal safety

- `propose_layout` compiles and validates every model proposal against the confirmed room.
- A request-scoped `proposalId` is issued only when there are no error-severity violations.
- `finalize` accepts only those server-issued proposal IDs. It rejects raw specifications,
  unknown IDs, duplicate IDs and the wrong number of options.
- Final options are compiled and validated again before they are returned to the client.
- Generate mode requires three distinct valid options; refine and style modes require one.
- AI request mode, layout shape, history roles, message size and current design are validated
  before any model call.
- The default model was moved off deprecated `gpt-4o` to the configurable supported model
  `gpt-5.6-terra`; production must still verify the configured live model.

### 1.2 Confirmed room remains authoritative

- Physical room geometry is separate from the preferred cabinet layout strategy.
- Width, depth, ceiling height, physical shape, cutouts, openings and services flow from the
  confirmed room into preview, pricing, validation, AI generation and submission.
- L- and U-shaped cabinet preferences no longer fabricate an L-shaped physical room.
- Incoming scan height and cutout geometry are retained instead of being replaced with a
  2700 mm assumption.
- Invalid confirmed-scan submission is shown to the customer and blocks submission instead
  of silently dropping the scan.
- AI room edits now return a `proposedRoomPatch`; they cannot mutate the room used by the
  active request.
- The wizard returns the customer to the Room step and offers explicit **Apply suggestion**
  and **Keep measured room** actions. Applying a change clears the old design and requires
  the customer to continue through room confirmation again.

### 1.3 Hard kitchen rules and deterministic fitting

- A requested dishwasher is a required appliance and cannot be silently removed.
- A placed dishwasher must be directly adjacent to the sink on the same wall.
- Missing sink, cooktop, fridge space or requested dishwasher is an error, not a warning.
- Error-severity designs cannot be selected, advanced or submitted for quote.
- The run solver reserves minimum space for later required cabinets before choosing wider
  variants.
- Fragmented single-wall layouts use a deterministic requirement-aware sequence and a
  600 mm sink fallback where needed to preserve a feasible sink/dishwasher pair.
- Impossible requirement sets remain blocked with clear validation errors and compromise
  notes rather than being presented as valid designs.

### 1.4 V2 foundation contracts

The new `src/lib/designV2` foundation includes strict schemas and helpers for:

- required, preferred and open customer requirements;
- jurisdiction and project-scope-aware regulatory profile selection;
- exact and provisional appliance and sink evidence;
- versioned catalogue and material identities;
- richer style selections;
- corner, blind-corner and filler intent geometry;
- typed, undoable design operations;
- rule outcomes including pending and not-applicable states;
- provisional V1 catalogue capabilities; and
- deterministic rule-result fingerprints that exclude staff identity and timestamps.

The V1 role map deliberately resolves as provisional and `quoteReady: false`. It must not be
treated as the final Bower catalogue capability source.

### 1.5 Durable proposal and catalogue foundation

- Added versioned database records for designer sessions, brief revisions, proposals, rule
  results, catalogue capabilities and regulatory profiles.
- Public designer sessions use a short-lived random capability token. Only its SHA-256 hash is
  stored, and browser mutations go through the Edge Function rather than direct table writes.
- Generate creates a session and immutable brief fingerprint. Refine and restyle must present
  the same session, token, room/brief fingerprint, current proposal and design revision.
- Proposal persistence is atomic and row-locked. Concurrent stale refinements are rejected
  instead of overwriting a newer design revision.
- Persisted proposals retain parent lineage, compiled items, validation results, rounded price
  band, immutable catalogue/pricing snapshots, and engine, prompt, provider and model versions.
- The client keeps the capability token in memory and sends the durable proposal ID for every
  refine or restyle request.
- Added a provisional import from `microvellum_products` using V2 designer roles and capability
  fields. Imported rows remain `quote_ready = false` until reviewed and approved by Bower staff.
- Added deterministic approved-capability resolution: nearest allowed width, then curated
  priority, then stable item ID. The resolver cannot return provisional rows.
- The shared exact-origin allow-list now covers the planner's standard local and preview ports.
- Raw OpenAI response bodies are no longer returned to the browser when the provider fails.

## 2. Verification Completed

| Check | Result |
|---|---|
| Layout smoke tests | Passed, including proposal IDs, request validation, room patches and hard appliance rules |
| V2 contract smoke tests | Passed, 8 contract and fingerprint scenarios |
| Designer persistence smoke tests | Passed, including RLS, hashed tokens, stale revisions, V2 catalogue roles and approved-only resolution |
| AI placement sweep | Passed, 45,360 combinations; 0 placement defects in 17,793 feasible combinations |
| Room-scan contract checks | Passed; planner, website copy and lock file in sync |
| Room-scan smoke/fingerprint tests | Passed, 47 room-scan checks and 12 fingerprint checks |
| Planner production build | Passed |
| AI Edge Function bundle check | Passed |
| Desktop wizard visual check | Passed with no browser console errors |
| Phone wizard visual check | Passed; customer UI fits, with overflow only in the development-only navigation bar |

Known non-blocking build notices remain: stale Browserslist data and a large existing main
bundle. Deno is not installed locally, so the Edge Function was bundle-checked with esbuild
rather than executed in Deno. Docker was not available, so the new migration received static
contract checks but has not yet been applied to a local or staging PostgreSQL database.

## 3. Not Yet Implemented

The overall multi-phase plan is not complete. The next production-critical work is:

1. Apply and exercise the new migration against staging, including RLS and concurrent stale-
   revision tests with real PostgreSQL transactions.
2. Move rate limiting from the current best-effort function-instance limiter to the API gateway
   or another durable shared store, with operational alerts.
3. Review the imported provisional rows and replace inference with approved capabilities derived from the real Bower
   cabinet catalogue and supplier material records.
4. Upgrade the existing website handoff payload to carry exact versioned material identity
   tuples, then preserve them through planner, proposal, job, quote and production records.
5. Add exact appliance and sink capture UI, including source evidence and stage-specific
   concept/quote readiness.
6. Deterministically enumerate feasible layout strategies and candidate pools before asking
   AI to rank and explain diverse options.
7. Add persisted typed operation history, deterministic replay and undo/redo across sessions.
8. Build the server-verified proposal-to-`TradeRoom` promotion path using real
   `ConfiguredCabinet` records.
9. Build the shared trade-side AI workspace, locks, diff, undo and apply workflow.
10. Extend plan/elevation, cabinet, material and quote documents, then add staff review and
    check-measure gates before production export.
11. Deploy versioned functions and migrations to a staging project, record the live model and
    prompt versions, and run authenticated end-to-end scanner-to-quote tests.

## 4. Recommended Next Slice

Implement the approved-catalogue and promotion slice next:

1. Apply the migration to staging and regenerate Supabase types.
2. Review and approve a small production-representative capability set: standard base, drawer,
   sink, dishwasher opening, corner, pantry, oven tower and fridge opening.
3. Resolve those approved records during compilation and persist their exact item identities in
   the catalogue snapshot.
4. Recompile a selected persisted proposal and promote it to an editable `TradeRoom` draft using
   real `ConfiguredCabinet` records.
5. Add authenticated end-to-end tests covering scan, generate, refine, stale rejection, select,
   promote and quote-readiness blocking.

This closes the next business gap: converting a safe homeowner concept into an auditable Bower
cabinet job without silently substituting provisional products.
