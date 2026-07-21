# Bower Kitchen Planner — Code Review / Deep Dive (2026-07-21)

Focused review of the planner, the AI designer, and how they interact with the
website, the CRM ("Buildflow Pro" / build-flow), and the other Lovable apps.
Emphasis on **dead / orphaned code, built-but-unwired features, and unbuilt
integration seams**.

## Coverage & confidence (read this first)

This is a first-pass, highest-signal review, not a line-by-line audit of every
file. Grounding:
- **Deep-read this session:** the whole AI layout engine (`src/lib/layout/*`),
  the homeowner wizard + StepDesign, the edge functions
  (submit-planner-enquiry, send-email, ai-designer path), useAiDesigner,
  useTradeRoomPricing, the rules engine, polygon geometry.
- **Reviewed for this doc:** full file inventory of *both* repos (via directory
  listing), routing (`App.tsx`), `designV2/*`, the website↔planner↔lead seam
  (`plannerUrl`, `leadContext`, `dreamweaverBridge`, `QuoteFormSection`,
  `handoffBrief`, `usePlannerHandoff`), admin `DesignRules`, a repo-wide
  TODO/stub grep.
- **Inventoried, NOT line-read** (flagged where relevant, not asserted dead):
  the trade configurator + RoomPlanner, admin pricing pages, the PDF generators
  (`planViewPdf`, `orderingListPdf`, `packingListPdf`, `pdfQuoteGenerator`,
  `cutSummaryPdf`), `lib/dxf/*`, `lib/microvellum/*`, `lib/pricing/*`,
  `utils/snapping/*`, most website pages. A full pass over those is a larger,
  separate effort.

General note: the codebase is **clean** — a repo-wide grep found only 3
TODO/stub-style comments, all benign. So the findings below are about
architecture and wiring, not littered debt.

## 1. Dead / orphaned code — the big one: `src/lib/designV2/`

`designV2` is a **complete, sophisticated second rules subsystem** —
`evaluateKitchenRules`, versioned `rulePack` (`bower-kitchen-layout@0.1.0`),
Australian `regulatoryProfiles` (regulated minimums gated behind a qualified
sign-off, returning `pending` rather than inventing defaults), `contracts`
(zod), `catalogCapabilities`, `fingerprint`, plus `hasConceptBlocker` /
`quoteBlockers`. It's clearly the most *ambitious* design-rules thinking in the
repo.

**But its only importer is the admin `DesignRules.tsx` page** (which renders the
rule pack for owner review/sign-off). Nothing in the actual design-generation
or quoting path imports it — not `candidateGenerator`, not `validate`, not the
wizard, not the ai-designer edge function. So `evaluateKitchenRules` **never
runs against a real design**; the admin page shows rules that don't gate
anything.

Meanwhile the *live* rule logic is `src/lib/layout/validate.ts` →
`rules.ts` (the registry I built this session), which does NOT know about
designV2's regulatory profiles, jurisdiction, quote-blockers, or "pending"
concept. So there are **two rules systems**: one dormant-but-richer (designV2),
one live-but-narrower (layout/rules).

**Recommendation (important):** reconcile before building more rules. Either
(a) wire `evaluateKitchenRules` into the generate/quote path as the authority
and make `rules.ts` defer to it, or (b) lift designV2's genuinely-valuable
ideas — regulatory `pending` states, quote-blockers, jurisdiction, the
sign-off record — into the live `rules.ts` registry and retire designV2. Right
now it's ~30 KB of high-quality code that looks authoritative in the admin UI
but protects nothing, and it will keep diverging from the live rules. This is
the single highest-value cleanup/decision in the review.

## 2. Built-but-unwired / unbuilt features

- **Trade-side AI designer — NOT built.** `JobEditor.tsx` has no
  `useAiDesigner`, no `StepDesign`, no "Design with AI" entry — confirmed by
  grep. Yet `handoffBrief.ts`'s own docstring says it's "shared by both AI
  entry points: the homeowner wizard and the trade planner." So the plumbing
  was written anticipating a trade AI entry that was never wired. The AI
  planner is homeowner-only today. (Reuse `StepDesign` + `useAiDesigner` +
  `handoffBrief` in JobEditor — this is a contained, high-value build.)
- **L-shape auto-design — engine now ready, wizard still gated.** From this
  session: the engine designs L-shapes void-free (verified), but the wizard
  still blocks L auto-generation pending a 3D check. One-line un-gate.
- **`cutoutCorner` — model supports 4 corners, UI/rendering support only SE.**
  `polygon.ts` handles all four; the wizard/RoomFeaturesEditor and
  `UnifiedScene` only do SE. Non-SE L-rooms can't be entered or rendered yet.
- **Reserved rules** (`rules.ts` `RESERVED_RULE_IDS`): `sink-bowl-fit`,
  `run-end-panel`, `filler-complete`, `cutout-intersection` — declared, not
  implemented (need catalogue/geometry data). Honest placeholders, listed here
  so they're tracked.
- **Segment-native runs along the L notch** — the notch interior walls aren't
  used for cabinets yet (the DSL still targets N/E/S/W). Deferred.
- **Wizard dead code** (from the wizard-upgrade doc): `Step2Layout` +
  `estimatePrice` + the `layoutStyle` state are defined but never rendered —
  a real delete-candidate.
- **Scanner photo path** — per the audit, the WebXR scan captures geometry
  only; no photo-upload path before "Phase 1C". Unbuilt by design.

## 3. The AI planner and how it interacts with the other systems

### 3a. Planner ↔ Website (`bower-cabinet-web-site`) — BUILT
The website is a Vite/React marketing + showroom site. The seam is real and in
use:
- `lib/plannerUrl.ts` resolves the planner URL from `VITE_PLANNER_URL` with a
  localhost guard (a build-time check stops a localhost target shipping — good
  hygiene; this is the handover's outstanding "VITE_PLANNER_URL" item, now
  handled in code).
- Flat-lay / design-scope selections become a **handoff** that opens
  `/wizard?handoff=<id>`; the planner consumes it via `usePlannerHandoff` →
  `handoffBrief` → `brief.styleWords` (a strong style preference to the AI).
  The `planner_handoffs` table (anon-insert) carries it. This works.
- The website also bridges to **"Dream Weaver Studio"** (`dreamweaverBridge.ts`)
  — another of Ben's Lovable apps — to generate flat-lay *images* (AI image
  gen). So there's a third ecosystem edge: website ↔ Dream Weaver for imagery.

### 3b. Planner/Website ↔ CRM ("build flow" / "Buildflow Pro" / "bower os") — NOT INTEGRATED
This is the biggest *integration* gap, and it matches `CRM-INTEGRATION-PLAN.md`
(phase C3 is unbuilt):
- Wizard enquiries go to the **planner's own Supabase** (`bower-cabinet-ai`,
  `jobs`) via `submit-planner-enquiry`. The website `QuoteFormSection` posts to
  the same Supabase (`VITE_SUPABASE_URL` + publishable key) or falls back to a
  `mailto:` draft to info@bowerbuilding.net.
- **Neither pushes into the CRM** (build-flow / Buildflow Pro, Supabase
  `cfwywsrhwnfqzdxcgnmm`). There is no service-to-service call, no shared
  `leads` write, no cross-link. The planner's lead machinery (Admin → Leads)
  and the CRM's lead machinery are entirely separate systems today.
- The stopgap Resend lead-alert email is *also* not active (no key). So a
  wizard/website lead currently lands only in the planner's `jobs` table (+
  optional email draft), and a human re-keys it into the CRM.
- **"bower os":** I read this as the CRM / Buildflow Pro (literally described in
  Lovable as "an AI-powered operating system for trade businesses"). If you
  mean a *distinct* product I haven't seen, tell me — I found no `bower-os`
  repo/module. Assuming bower os = the CRM, the whole planner↔OS link is the
  unbuilt C3 work: push wizard/website leads into the CRM's `leads`/intake, and
  cross-link the planner job id ↔ CRM lead. Until then the "ecosystem" is three
  separate apps sharing a brand, not shared data.

### 3c. AI planner internals (reviewed deeply this session)
Deterministic engine generates candidates; AI ranks/refines only (good, sound
architecture). Recent work: fixed placement/rotation/corner/filler/end-panel
defects, added the tiered rules registry, made geometry authoritative
(polygon), and taught it L-shapes. Known internal gaps carried forward: island
auto-fit inside an L (a void island is rejected, not repositioned); benchtop
run/corner geometry not modelled; the `microvellum_products` anon-readability
RLS decision (WS6) still open; bundle ~3 MB (code-split later).

## 4. Risks / recommendations, ranked

1. **Decide designV2's fate.** Two divergent rules systems is the top
   architectural risk — wire it in as the authority, or harvest its ideas into
   `rules.ts` and delete it. Don't build a third.
2. **Build the CRM lead link (C3)** if the "one ecosystem" vision is real —
   it's the difference between three brand-sharing apps and an actual OS. Until
   then, every lead is hand-re-keyed.
3. **Wire the trade-side AI panel** — cheap (reuse existing pieces), removes the
   half-built `handoffBrief` "both entry points" claim.
4. **Finish L-shape** (un-gate + cutoutCorner UI/render) so the geometry work
   reaches customers.
5. **Delete the confirmed dead wizard code** (`Step2Layout`/`estimatePrice`/
   `layoutStyle`).
6. **Do the inventoried-not-read pass** (PDF/DXF/microvellum/pricing/trade
   configurator) if you want true dead-code certainty there — I flagged them
   rather than guessing.

## 5. What I did NOT find (reassuring)
No orphan routes (every page is routed), no `external-supabase` shim remnants,
no TODO/stub litter, no committed secrets beyond the safe publishable keys, and
the website's planner-URL + the email escaping now have real guards. The
codebase is disciplined; the issues are architectural (two rules systems, an
un-integrated CRM), not messy.
