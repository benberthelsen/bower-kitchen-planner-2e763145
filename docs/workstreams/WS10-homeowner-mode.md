# WS10 — Homeowner Mode (Phase 4) — LAST

**Complexity: HIGH (product design + build) — strong model, and a planning
session with Ben BEFORE coding. Blocked on WS5 (handoff) and WS2 (pricing
guards).**
Repos: both. Reference: website `docs/kitchen-planner-integration-plan.md`
Phase 4.

## Concept
A simplified, public planner experience over the same engine: homeowners
sketch a kitchen (guided, not the full trade planner), pick styles/materials
from the showroom data, see an indicative price range (never the trade cost
breakdown), and submit as a lead/quote request that lands in admin.

## Ground rules (from the integration plan + safety notes)
- Homeowner mode NEVER exposes trade buy prices, BOM lines, labor rates, or
  markups — price RANGES only (e.g. cost × commercial layer ± band).
- Separate route tree (`/home/*` or homeowner.bowerbuilding.net later);
  trade/admin stays login-gated.
- Reuse: room wizard steps (simplified), UnifiedScene (read-mostly), pricing
  engine server-side or with rounded output.
- Lead capture before showing the price range (name + contact), feeding the
  existing Leads admin.

## Pre-build questions for Ben (ask, don't assume)
1. Guided template flow (pick L/galley/island template, adjust sizes) or free
   drag like trade?
2. Price display: single "from $X" or range? Rounded to what?
3. Which materials/finishes are homeowner-visible (all showroom brands, or a
   curated set)?
4. Does submit create a `job` (status lead) or only a lead row?

## Acceptance (draft)
- A homeowner completes template → materials → price range → submit in under
  5 minutes on mobile; lead + starter design appear in admin.
