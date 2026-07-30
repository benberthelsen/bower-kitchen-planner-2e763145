# Bower Kitchen Planner: One-Shot Green Plan

Date: 30 July 2026  
Status: proposed single source of truth  
Target: production-ready public lead generation with every named product area green

This plan supersedes the release sequencing in `docs/audits/2026-07-30/KITCHEN-PLANNER-COMPLETION-PLAN.md`. Older roadmaps and review documents remain useful evidence, but they are not active backlogs.

## Outcome

Finish the product already in the repository. Do not restart it and do not add another design subsystem.

At the end of this programme:

- an unauthenticated homeowner can move from room details to a convincing kitchen, refine it, view it in 3D or AR, and submit one complete enquiry;
- cabinet and material choices are curated, accurate, visually credible, and consistent from selection through the saved lead;
- AI produces visibly different but rule-valid options and degrades safely when unavailable;
- supported room-scanning and AR journeys work repeatedly on named real devices;
- unsupported devices always receive a useful manual or normal-3D fallback;
- staff receive one actionable lead with the full design context;
- automated release checks prevent a regression reaching production.

The programme is one fixed completion scope, but it is delivered through small gated pull requests. A single large code drop would make faults difficult to isolate and would recreate the current build loop.

## Target and working rules

Target delivery: **35 working days / 7 weeks**, with a **10-working-day contingency** for real-device WebXR, RoomPlan import, AR, and production integration faults.

Rules until launch:

1. This document is the only active completion backlog.
2. New ideas are recorded after launch and do not enter the programme unless they fix a green acceptance test.
3. `main` remains releasable. Work is merged in dependency order only after its gate is green.
4. One canonical model owns room geometry, cabinet identity, materials, design proposals, pricing, and lead payloads.
5. The deterministic layout and validation engine remains the geometry authority. AI may select, explain, and request safe edits; it may not invent invalid geometry.
6. The public homeowner catalogue is curated. The full trade/Microvellum catalogue remains available to staff without being forced into the homeowner journey.
7. “Green” means verified evidence, not “implemented” or “looks finished on one device.”

## Fixed supported scope

The following boundary makes green achievable and testable.

### Rooms and layouts

- Rectangular, L-shaped, galley, one-wall, and U-shaped planning flows.
- Doors, windows, and fixed service positions.
- Islands only when clearance rules pass.
- Manual entry is the universal fallback and always remains editable.
- Unusual polygons and manufacturing-ready check measures are outside the homeowner promise.

### Cabinets

- A homeowner range of approximately 20-30 canonical cabinet families covering base, drawer, sink, bin, oven, dishwasher, corner, wall, rangehood, pantry, fridge, tall, and island use.
- Supported widths and configuration variants are explicit.
- Full production catalogue remains a trade/admin concern.

### Materials

- 8-12 curated, currently sellable door palettes.
- 6-8 curated benchtops.
- 4-6 handle families.
- Real supplier swatches and texture assets, with product codes and availability.
- The source catalogue can contain thousands of materials; the homeowner is not asked to search it.

### Scanner and AR

- Android Quick Scan: current Chrome over production HTTPS on at least Google Pixel 8 and Samsung Galaxy S24 class devices.
- iPhone Pro scan: documented RoomPlan-compatible export/import path using real sample files.
- Android AR: current Chrome/WebXR on the same named Android matrix.
- iOS AR: current Safari/Quick Look using validated USDZ export.
- Every other device/browser receives a useful 3D, QR/open-on-phone, or manual fallback.

### Lead handling

- Admin Leads plus staff email notification is the minimum production system of record.
- If a CRM is required before launch, its destination, field map, owner, and retry behaviour must be decided in Block 0. An undefined future CRM is not allowed to remain an amber dependency.

## Green board

No public release occurs while any row is red or amber.

| Area | Current | Green acceptance |
| --- | --- | --- |
| Release control | Red | Required CI passes on every pull request; preview and production are separated; rollback is tested |
| Public access | Red | Website and customer planner work in an incognito session without Cloudflare Access; staff routes remain protected |
| Homeowner funnel | Red | A useful visual and indicative range appear before contact collection; one contact form; save/resume works |
| Cabinet selection | Amber/red | Curated, de-duplicated catalogue with clear families, variants, thumbnails, fit rules, and stable IDs |
| Boards and finishes | Amber | Real named swatches and textures match the 3D, review screen, AR export, saved design, and lead |
| Live 3D | Amber/red | Five golden kitchens are visually approved on desktop and mobile; fixtures, lighting, materials, camera, and performance pass |
| AI planner | Red | Three visual, meaningfully different, valid options; safe refinement, undo, regenerate, and deterministic fallback all pass |
| Room scanner | Amber/red | Named real-device runs meet accuracy and completion targets; low-confidence scans cannot silently continue |
| AR kitchen | Amber | Scale, placement, reset, tracking recovery, iOS export, Android placement, and unsupported-device fallback pass |
| Pricing | Amber | One versioned price source is used throughout the journey; displayed and submitted ranges match |
| Leads and operations | Amber/red | Ten consecutive submissions create exactly one complete lead each, notify the owner, retain attribution, and can be reopened |
| Privacy and security | Red/unknown | Analytics contains no contact PII; RLS, roles, CORS, rate limits, secrets, consent, and retention pass review |
| Performance and accessibility | Amber/red | Route budgets and key WCAG 2.2 AA journey checks pass on representative mobile and desktop devices |
| Production evidence | Red | Signed release checklist, test evidence, monitoring, rollback version, and 72-hour production soak are complete |

## Delivery sequence

### Block 0 - lock the programme and release controls

Target: Days 1-3.

Work:

- Create the programme branch and break this document into tracked issues or checkboxes with one owner per item.
- Archive or label older completion plans as superseded.
- Record the deployed production commit and create a rollback tag.
- Add GitHub Actions for install, typecheck, production build, unit/contract tests, scanner tests, AI tests, and pricing tests.
- Add branch protection so required checks must pass before `main`.
- Create separate Cloudflare preview and production settings.
- Add feature flags and kill switches for AI, scanning, Android AR, and iOS AR.
- Capture baseline Web Vitals, bundle sizes, console errors, funnel events, and screenshots for the five golden kitchens.
- Decide the lead system of record, notification owner, response expectation, and whether CRM integration is in scope.
- Freeze canonical identifiers and schema ownership for rooms, cabinets, materials, proposals, prices, and leads.

Gate:

- A failing typecheck or test cannot merge.
- The exact production version can be restored.
- All unresolved decisions in the Decisions section have named answers.

### Block 1 - canonical product, material, price, and design data

Target: Days 4-8.

This must precede visual and AI polishing because every later surface depends on stable identities.

Work:

- Define one `HomeownerCabinet` contract with canonical ID, family, purpose, supported widths, handedness/variants, fit constraints, thumbnail, render recipe, and trade-product mapping.
- Build the 20-30 family homeowner catalogue and remove semantic duplicates across dynamic, static, appliance, and fallback sources.
- Define one `PlannerMaterial` contract with brand, range, supplier code, swatch, texture, scale, grain direction, roughness, availability, and compatible surfaces.
- Curate the initial door, benchtop, and handle collections from the existing supplier catalogue.
- Add asset validation for missing, broken, duplicate, or oversized swatches/textures.
- Version a single pricing contract and eliminate independent UI calculations.
- Define one serialisable design proposal contract used by standard layout, AI option, refinement, 3D, AR, review, and lead payloads.
- Add schema migrations or compatibility adapters for saved jobs rather than silently breaking them.

Gate:

- Every customer-facing cabinet and material has one stable identity.
- A saved design reopens with the same cabinets, finishes, appliances, and indicative range.
- Catalogue, material, proposal, and pricing contract tests pass.

### Block 2 - cabinet and board selection experience

Target: Days 9-12.

Work:

- Replace long raw lists with grouped cabinet families, plain-language purpose, useful filters, and a consistent front thumbnail.
- Expose widths and variants inside a selected family instead of as duplicate products.
- Explain disabled or impossible choices and offer the nearest valid alternatives.
- Support add, replace, remove, and undo without losing the active design.
- Replace flat colour dots with real swatches, full-screen samples, supplier/range names, codes, and grain previews.
- Offer curated palette cards first, with optional individual changes after a concept exists.
- Reduce appliance entry to appliance type and recommended shortlist; place full SKU selection behind an optional expansion.
- Make the same selection component work with keyboard, touch, and screen reader names.

Gate:

- A homeowner can identify and change a cabinet or finish without knowing trade terminology.
- No semantic duplicates are visible.
- Invalid sizes cannot be applied.
- Selection state remains identical after refresh/reopen.

### Block 3 - live 3D representation and visual system

Target: Days 13-18.

Work:

- Create five fixed golden rooms: one-wall, galley, L-shaped, U-shaped, and island.
- Standardise camera framing, orbit limits, reset view, lighting, shadows, background, and loading state.
- Apply physical-scale supplier textures with correct grain direction and consistent colour handling.
- Finish visible construction details: kickboards, fillers, end panels, benchtop joins and overhangs, handles, sink, tap, cooktop, oven, fridge, dishwasher, and rangehood.
- Ensure the same render recipe is used by standard, AI, saved, reopened, and AR designs.
- Add thumbnail rendering for AI comparison and saved leads.
- Lazy-load the 3D/AR stack and split large routes. Set first-load JavaScript at no more than 500 KB gzip for the public entry path; load heavy 3D code only when needed.
- Remove visual jumps, stale scenes, camera resets after edits, texture flashes, and recoverable WebGL crashes.
- Add screenshot comparison with an agreed tolerance and human approval for intentional changes.

Gate:

- All five golden kitchens pass visual review at desktop and representative mobile sizes.
- Materials are recognisably different and match their swatches.
- Every fixture is placed without obvious floating, clipping, or z-fighting.
- Editing updates the scene without a reload or lost camera state.
- Public entry performance budget and error-free console checks pass.

### Block 4 - homeowner funnel and AI planner

Target: Days 19-23.

Work:

- Reshape the journey to: room -> priorities/appliance types -> style -> standard visual -> AI alternatives/refinement -> quote request.
- Show a valid standard concept, 3D preview, and indicative range before requesting contact details.
- Use one contact form. Either save it as a real resumable draft lead or collect it only at final quote request; do not store it as funnel-event metadata.
- Add honest progress, back navigation, save/resume, expiry recovery, and explicit failure states.
- Show AI options as visual cards with thumbnail, price range, cabinet/storage summary, bench-space summary, and a short design reason.
- Guarantee meaningful difference between options using named layout strategies, not cosmetic wording.
- Run every option through the same geometry, clearance, opening, service, and pricing validators before display.
- Make safe quick actions primary: more drawers, more bench, move sink, add/remove pantry, add/remove island, reduce cost, and replace cabinet.
- Keep free-text editing as an advanced input translated into validated operations.
- Make undo, redo/regenerate, return to standard layout, and start fresh obvious.
- On AI timeout, invalid output, rate limit, or outage, preserve the session and return to a valid deterministic design.

Gate:

- Three visual options are different, understandable, valid, and consistently priced.
- Twenty scripted refine/undo/regenerate cycles do not corrupt the proposal or session.
- AI outage never blocks standard planning or enquiry.
- No contact PII is present in analytics.

### Block 5 - room scanner

Target: Days 24-27.

Work:

- Detect support before presenting Quick Scan as the main action.
- Keep “Enter measurements manually” above the fold on every unsupported or failed state.
- Add a guided capture state machine with clear start, wall, corner, opening, pause, retry, and finish feedback.
- Add a post-scan 2D confirmation plan with wall labels, dimensions, openings, confidence, warnings, and direct editing.
- Block silent continuation when required walls are missing, the polygon is invalid, closure error is excessive, or confidence is low.
- Validate real RoomPlan-compatible exported files and make import errors actionable.
- Persist the raw scan, normalised plan, device/browser, confidence, corrections, and final accepted dimensions for diagnosis.
- Add anonymised scan diagnostics without images, names, email addresses, or phone numbers.
- Run repeated real-room tests on the named Android devices and iPhone import path.

Green accuracy and reliability:

- At least 20 completed Android scans across small, medium, and L-shaped rooms.
- At least 10 successful iPhone Pro imports using real exports.
- At least 90% completion without developer intervention on the supported matrix.
- Accepted wall measurements are within 100 mm or 3%, whichever is greater, against a tape/laser reference.
- Anything outside tolerance is visibly marked for correction and cannot silently become the final room.
- Manual correction and fallback always work.

Gate:

- Evidence table contains device, browser/OS, room, run result, per-wall error, correction, and final outcome.
- All scanner contract/geometry tests and the real-device criteria pass.

### Block 6 - AR kitchen view

Target: Days 28-30.

Work:

- Use the same accepted proposal and materials as the normal 3D scene.
- Android: verify two-point anchor, orientation, floor placement, scale, reset/reposition, tracking loss, interruption, and reload.
- iOS: validate USDZ generation, texture inclusion, orientation, scale, Quick Look launch, and return to planner.
- Add a short placement guide and explicit “concept only” scale/check-measure notice.
- Add unsupported-device experience with embedded normal 3D, QR code/open-on-phone link, copyable design link, and return action.
- Add recoverable error states for permission denial, missing WebXR, model export failure, lost tracking, and expired design.
- Record success/failure telemetry without personal data.

Green reliability:

- Ten consecutive successful placements on each named Android device.
- Ten consecutive successful iOS Quick Look exports/opens on a supported iPhone Pro.
- Kitchen scale checked against two known dimensions and within 2%.
- Reset/reposition and tracking recovery pass on every supported device.
- Every unsupported-device test reaches a useful fallback.

Gate:

- Signed real-device AR matrix and fallback matrix are green.

### Block 7 - leads, operations, security, accessibility, and release

Target: Days 31-35 or pulled forward in parallel where dependencies allow.

Work:

- Make public website and homeowner planner routes accessible without Cloudflare Access.
- Keep `/admin/*` and `/trade/*` protected by application roles and, if desired, separate staff-only Cloudflare policy.
- Submit exactly one lead containing source/UTM, contact, room, scan confidence, selected design, materials, appliances, indicative range, notes, and reopenable design link.
- Add idempotency, retries, visible submission status, safe failure recovery, and staff alerting.
- Confirm the assigned staff owner can open, understand, and respond to the lead without re-keying.
- Complete RLS/role tests, CORS allowlist, function rate limits, bot protection, secret scan, dependency review, consent/privacy copy, and data retention decision.
- Verify analytics event names and conversion funnel using non-personal identifiers only.
- Run keyboard, focus, labels, errors, contrast, zoom, reduced-motion, and screen-reader checks for the critical journey, targeting WCAG 2.2 AA.
- Run the complete automated suite, device/browser matrix, five golden kitchens, lead tests, security checks, and performance budgets from a release candidate.
- Deploy to production, perform an incognito smoke test, monitor for 72 hours, and keep the rollback version ready.

Gate:

- Ten consecutive public enquiries create exactly one complete lead each and one expected notification each.
- Failed or retried submissions do not duplicate leads.
- Staff and public access controls are independently verified.
- There are no release-blocking console, function, RLS, accessibility, performance, or error-monitoring findings.
- The 72-hour soak has no critical or high-severity regression.

## Required test assets

### Five golden kitchens

Each fixture stores room dimensions/openings, requirements, cabinet proposal, material palette, appliances, expected indicative range, expected rule results, and approved desktop/mobile screenshots.

1. Compact one-wall kitchen.
2. Galley with opposing runs.
3. L-shape with window and corner cabinet.
4. U-shape with appliance constraints.
5. Open-plan kitchen with island and clearance boundaries.

### Automated release suite

- clean install and dependency integrity;
- TypeScript typecheck;
- production build;
- linting once the baseline is clean;
- catalogue/material asset validation;
- geometry and rules regression;
- pricing consistency;
- design proposal round trip;
- AI contract, invalid-output, timeout, and fallback tests;
- scanner schema/geometry/import tests;
- lead payload, idempotency, and permission tests;
- route smoke tests;
- visual screenshot tests for stable golden fixtures;
- bundle budget check.

### Browser and device matrix

| Journey | Minimum green matrix |
| --- | --- |
| Manual planner and lead | Current Chrome, Edge, Firefox, and Safari; iPhone Safari; Android Chrome |
| 3D | Current Chrome/Edge desktop, Safari desktop, iPhone Safari, Android Chrome |
| Android scan | Pixel 8 class and Galaxy S24 class, current Chrome, production HTTPS |
| iPhone scan import | Supported iPhone Pro, current iOS, documented RoomPlan export source |
| Android AR | Pixel 8 class and Galaxy S24 class, current Chrome/WebXR |
| iOS AR | Supported iPhone Pro, current Safari/Quick Look |
| Fallback | Desktop, older/unsupported phone, denied permissions, missing WebXR, offline/interrupted session |

## Performance and quality budgets

- Public entry first-load JavaScript: no more than 500 KB gzip.
- Heavy 3D, scanning, and AR code loads only when its route or view is opened.
- No unhandled console errors in the release matrix.
- No horizontal overflow at 320 CSS pixels.
- Interaction controls are at least 44 by 44 CSS pixels where practical.
- Core journey remains usable at 200% zoom and by keyboard.
- Every asynchronous action has loading, success, empty, retryable failure, and terminal failure behaviour.
- Saved proposal, displayed proposal, AR proposal, and submitted proposal have matching stable IDs.
- Every displayed price states that it is indicative and comes from the same versioned calculation.

## Decisions that must be made in Block 0

These are choices, not reasons to continue building indefinitely.

| Decision | Recommended answer |
| --- | --- |
| Lead system of record | Admin Leads plus email for launch; add CRM only if its exact destination is already available |
| Early contact gate | Remove it; collect contact once after the user sees value |
| Homeowner catalogue size | 20-30 canonical families |
| Initial material range | 8-12 door palettes, 6-8 benchtops, 4-6 handles |
| AI authority | Deterministic engine owns geometry and validation |
| Manual measurement | Universal supported fallback |
| Scanner promise | Concept measurement with visible confidence and mandatory professional check measure |
| Public route protection | No Cloudflare Access on customer routes; retain role protection for staff |
| Production deployment | Merge only from a green release candidate with a tagged rollback |

## Release stop conditions

Stop the release, but not the programme, if any of the following is true:

- a public route still asks for a Cloudflare PIN;
- a staff route is accessible without the correct role;
- contact PII appears in analytics;
- the same action creates duplicate leads;
- a visible design differs from the saved or submitted design;
- invalid geometry can be selected;
- scanner confidence is low without a forced review;
- AR scale is outside tolerance;
- AI failure loses the standard design or blocks enquiry;
- a required check is bypassed;
- production cannot be rolled back to the recorded version.

## Final definition of done

The planner is green across the board only when:

1. Every Green board row has attached test evidence and no accepted amber item.
2. All required automated checks pass on the production commit.
3. The five golden kitchens pass desktop and mobile visual approval.
4. The real-device scanner and AR matrices meet their numeric acceptance targets.
5. Ten consecutive public lead journeys create one complete, actionable lead each.
6. Public and staff access controls are independently verified.
7. Privacy, security, accessibility, performance, and pricing checks pass.
8. Production is monitored for 72 hours with no critical/high regression.
9. The production commit is tagged and the rollback procedure has been tested.
10. Older build plans are marked superseded and post-launch ideas move to a separate backlog.

## First implementation queue

Begin in this order:

1. CI, branch protection, staging/production split, release tag, and feature flags.
2. Remove PII from funnel analytics and resolve the duplicate contact/lead model.
3. Canonical cabinet, material, price, and proposal contracts.
4. Curated cabinet and material data.
5. Golden kitchen fixtures and current visual baselines.
6. 3D fidelity and route performance.
7. Funnel and AI presentation/refinement.
8. Scanner real-device hardening.
9. AR real-device hardening.
10. Public access, lead E2E, security/accessibility validation, and production release.

Nothing below an item begins if its upstream contract or release gate is still red.
