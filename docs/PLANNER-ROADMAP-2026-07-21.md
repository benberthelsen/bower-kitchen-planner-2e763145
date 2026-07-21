# Bower Planner — Improvement Roadmap (2026-07-21)

Ben's 10-point direction, reviewed against the actual codebase and re-sequenced
by dependency. The direction is sound; the main change I'd make is **where
authoritative geometry sits in the order** (see §Sequence).

## Where each item stands in the code today

| # | Item | Current state in the repo | Gap | Effort / risk |
|---|---|---|---|---|
| 1 | Authoritative room polygon + usable wall segments | None. `geometry.ts` is corner-origin bounding-box; `wallToWorld` assumes 4 rectangular walls; `validate.ts` fit-checks the outer rect only; **cutout is validated in `schemas.ts` but ignored by the engine** (this IS blocker 6.5). Scanner has its own `roomScan/contract.ts` model. | One polygon model shared by scanner, engine, validate, pricing, 3D. | **Large / high** — touches every layer + the `_shared` edge copy + a scanner contract v2. |
| 2 | Formal rules engine (hard / safety / soft) | `validate.ts` = flat error/warn, rules hardcoded inline; `designScore.ts` already does soft scoring. | Declarative rule registry with 3 tiers, testable in isolation, sweep-enumerated. | **Medium / low** for relational rules; spatial rules depend on #1. |
| 3 | Deterministic generation, AI ranks only | **Already the architecture** — `candidateGenerator` compiles+validates; AI ranks/refines. | Enforce `allowedWalls` on *refine* too; ensure refine output is re-validated (it is client-side) and never bypasses the engine. | **Small / low** — harden existing. |
| 4 | Scanner review — editable 2D plan, confidence | Contract already carries per-field confidence (`estimated`/`user-marked`/`default`); no confirm-before-generate 2D editor. | An editable 2D plan that confirms dims/openings/services/height/walls and surfaces low-confidence fields. | **Medium-large / medium** — mostly UI; should edit the #1 polygon. |
| 5 | Catalogue-driven SKU + validated fits | `catalogRoles.ts` maps roles→generic template ids + rough price weights; real BOM lives in `src/lib/pricing` but the homeowner/AI path uses the rough estimator (`priceDesign.ts`). | Every generated cabinet → real Bower SKU + width/door/finish/hardware/price; sink-bowl & appliance-dimension validation. | **Medium / medium** — data + mapping; depends on stable #1/#2. |
| 6 | Lock parts, regenerate the rest | Generator takes a whole brief; no partial-constraint input. | "Locked walls/segments" input to the generator. | **Medium / medium** — depends on #2/#3. |
| 7 | Comparison view of the 3 designs | Data already exists (`score.parts`, price band, violations, rationale); not surfaced as a compare view. | UI that lays the three side by side with warnings + reasons. | **Small / low** — cheap early CX win. |
| 8 | Plain-language design explanations | AI produces a free-text `rationale`; no per-decision "why". | Each rule carries a human "why" string; explanations become a byproduct of #2. | **Small / low** once #2 exists. |
| 9 | "Needs designer review" state | Partial: the 6.5 L-shape gate is a hand-rolled instance of this. | First-class state triggered by a hard-rule failure OR low scanner confidence. | **Small / low** — generalize the L-shape gate. |
| 10 | Outputs: plan, elevations, schedule, quote, enquiry pack | Top-view PDF plan export exists; elevations were explicitly deferred; no schedule/quote package. | Dimensioned plan + elevations + cabinet schedule + preliminary quote. | **Large / medium** — depends on #1 (elevations) + #5 (schedule/quote). |

## The one sequencing change I'd argue for

Ben's order: repair blockers → **rules** → **geometry** → scanner → catalogue/BOM.

The tension: a chunk of the rules engine is *spatial* — aisle widths, cooking
clearances, "item inside the room", clearance envelopes, cutout intersection.
Those rules must query the geometry model. If you build the full rules engine on
today's bounding-box model and then swap in polygons, you rewrite every spatial
rule's geometry queries. That's rework you can avoid.

But the *other* half of the rules — dishwasher-beside-sink, sink-bowl fit,
blind-corner fallback, filler/end-panel presence, appliance gaps, corner
handedness — is **relational/topological**, not polygon-dependent. Those can be
formalized now, survive the geometry refactor untouched, and immediately make
generation trustworthy, power the plain-language explanations (#8) and the
review state (#9).

**So split #2 and interleave #1:**

1. **Finish the blockers** — 6.2/6.3 done, 6.5 gated; **6.1** (one-line import) and **6.4** (email hardening, before any email/CRM alert) remain.
2. **Rules engine — relational tier first.** Declarative registry (hard/safety/soft), plain-language messages, sweep-enumerated. Formalize every non-spatial rule now. This is the highest value-per-risk step and it hardens what's already shippable.
3. **Authoritative polygon geometry (#1).** Do this *before* the spatial rules, because they depend on it. This also *replaces* the 6.5 gate with a real fix and lets the scanner editor (#4) edit one model.
4. **Rules engine — spatial tier on the polygon.** Aisles, clearances, in-polygon, cutout intersection.
5. **Scanner confirmation 2D plan (#4)** — edits the polygon, surfaces confidence + the review state (#9).
6. **Catalogue/SKU + real BOM + outputs (#5, #10).**

Cheap CX wins to slot in as their deps land: comparison view (#7) can come early
(data already exists); explanations (#8) and the general review state (#9) fall
out of step 2; lock-and-regenerate (#6) after step 4.

## Near-term-beta vs long-term-product

The gated beta's stated purpose is to **test the scanner on real phones**. Against
that goal, the fastest learning comes from **#4 (scanner confirmation) + #9
(review state)** — they turn a shaky auto-result into "confirm what we measured,
and we'll hand-plan anything uncertain," which is both safer and exactly what a
beta should measure. #1/#2/#5 are the "make it dependable for real customers and
staff" investments that matter before *widening* past the gate. Worth being
deliberate about not building the full polygon+BOM stack ahead of what the beta
actually validates — though the relational rules (step 2) are cheap enough and
high-value enough to do regardless.

## Hidden costs to budget

- **Edge-function sync doubles the surface.** The engine is mirrored to
  `supabase/functions/_shared/layout` via `sync-ai-shared.mjs`; a geometry
  rewrite must keep both sides identical or the AI's designs diverge from the
  client preview. Every geometry change ships with a re-sync + redeploy.
- **Scanner contract is versioned** (`schemaVersion: 1`). A polygon model is a
  contract v2 — plan a migration for any stored/handed-off scans.
- **The sweep is the safety net.** Its "0 bugs" was false precisely because
  rules didn't exist (that's how the 20-July defects hid). Every new rule must
  be sweep-enumerated so coverage is visible, or the same blind spot returns.
- **Commit/deploy stays Ben's** (host shell + mount-staleness constraints); each
  phase lands as a reviewed batch, not a big-bang.

## Definition of "dependable" (the actual goal)

A design is only offered automatically when: the room geometry is confirmed
(scanner review passed or manual), every hard rule passes, every safety rule is
satisfied or corrected, each cabinet maps to a real SKU that fits its sink/
appliance, and the price is BOM-backed. Anything short of that routes to
**designer review** rather than presenting a confident-but-wrong result. That
single invariant is what turns "impressive demo" into "trustworthy tool."
