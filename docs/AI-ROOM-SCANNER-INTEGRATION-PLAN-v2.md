# AI Room Scanner Integration Plan — v2.2

Prepared: 2026-07-14
Reviewed update: 2026-07-14
Code audit: 2026-07-14 — both repos inspected file-by-file; §1.2 lists the confirmed defects, and the fixes are woven into §3–§10.
Supersedes: v1 (2026-07-14). This revision adds a buildable scanner route and resolves review blockers around public handoff access, incomplete photo captures, cross-field geometry validation, shared contract ownership, test execution, L-shape normalization, and accuracy claims. Ends with a one-shot implementation framework.

Projects:
- Planner: `bower-kitchen-planner` (this repo)
- Website: `bower-cabinet-web-site` (separate repo — has its own companion prompt in §10.3)

---

## 1. Executive Summary

The planner's `RoomScan`/`RoomSpec` model is the right spine. Every complete scanner result (manual, WebXR, CubiCasa, RoomPlan) is an **adapter into `RoomScanV1`**; incomplete results remain `RoomCaptureDraftV1`. `RoomFeaturesEditor` is the **mandatory confirmation layer** for every source. Scan output is estimation/design input only until a professional check measure confirms dimensions.

Order of work:

1. **Resolve the public handoff path first** (§4): the current public wizard cannot read a staff-only handoff row directly.
2. **Decide D1 before scanner UI work** (§2): is scanning customer lead-gen or staff quoting tooling? It flips the Phase 2 priority.
3. **Phase 1a** — self-contained versioned contract + secure handoff + homeowner vertical slice (one E2E-testable path).
4. **Phase 1b** — trade path: room features in `RoomSetupWizard`, config persistence, category-aware warn-only opening guards.
5. **Phase 1c** — private photo/artifact intake using `RoomCaptureDraft`; promote to `RoomScan` only when complete.
6. **Phase 2** — gated: guided WebXR capture (customer-first) **or** staff RoomPlan pilot (staff-first), per D1.
7. **Phase 3 (parallel)** — CubiCasa due-diligence spike: structured geometry, AU availability, async-result UX.
8. Fixtures, security/RLS, retention, and runnable tests are Phase 1 work, not afterthoughts.

### 1.1 Buildable scanner recommendation

Yes, this scanner can be built. The practical first product is a **guided measurement scanner**, not a promise of fully automatic room recognition:

1. A customer starts "Scan my room" on a WebXR-capable Android Chrome device.
2. The camera guides them to mark room corners, then doors/windows, then services.
3. The browser calculates candidate rectangular geometry and emits `RoomScanV1` only after validation; otherwise it saves a draft.
4. `RoomFeaturesEditor` is always shown for correction and confirmation.
5. Unsupported devices, abandoned scans, and non-rectangular rooms fall back to `RoomCaptureDraft` plus manual editing.
6. The confirmed scan opens directly in the planner; manufacture still requires a professional check measure.

RoomPlan is the follow-on route for a controlled staff fleet of LiDAR iPhones/iPads. CubiCasa remains a vendor pilot until AU availability and usable structured geometry are confirmed. Native Android ARCore is only justified if WebXR fails and Bower commits to distributing an app.

### 1.2 Confirmed defects — 2026-07-14 two-repo code audit

These are live behaviours verified in code, not plan hypotheses. Phase 1 fixes all of them; sections below reference them by ID.

- **D-1 — Anonymous handoff journey is broken (P0).** `/wizard` is a public route (`src/App.tsx`), but the `planner_handoffs` migration grants `SELECT` to `authenticated` only, so `usePlannerHandoff`'s direct table read returns null for logged-out visitors. The flat-lay page (`FlatLayGeneratorPage.handleOpenInPlanner`) opens `/wizard?handoff=<id>` for exactly those visitors — the prefill silently does nothing today. The migration's own comment ("the row id acts as the capability token") describes a design that RLS does not actually permit. §4.2's tokenized flow fixes a shipping bug, not a hypothetical.
- **D-2 — Website "Open Kitchen Planner" hits a login wall.** `PlannerPage.plannerHref` opens `${PLANNER_URL}/?source=website-planner&room=…`; the planner's `/` route redirects to `/trade/dashboard`, which sits behind `ProtectedRoute`. Anonymous customers land on staff login. The button must target `/wizard`.
- **D-3 — Trade consumes the handoff on load.** `JobEditor` calls `markHandoffConsumed(row.id)` as soon as the row loads (before any job exists), then again with the job id after creation. A refresh or abandoned setup burns the handoff. Consumption belongs only in the post-creation path.
- **D-4 — Homeowner path never consumes or links.** Only `JobEditor` calls `markHandoffConsumed`; the homeowner wizard's enquiry submission neither consumes the handoff nor links the created job id.
- **D-5 — The wizard's `roomScan` stamp is schema-invalid.** `Wizard.tsx` submits `design_data.roomScan = { source: 'manual', confidence: { overall: 1 }, capturedAt }` — no `room`, which `RoomScan` requires. Parsers must classify this shape as legacy/no-scan, and the wizard should start writing valid scans.
- **D-6 — Environment split is unresolved.** The planner `.env` targets the unified `bower-cabinet-ai` project per `docs/SUPABASE_UNIFICATION_RUNBOOK.md`, but the website `.env.local` has an **empty** `VITE_SUPABASE_URL` (bridge unconfigured — `createPlannerHandoff` throws), and an unset `VITE_PLANNER_URL` falls back to `http://localhost:8080` in production links. Completing the unification runbook and setting both variables is a Phase 1 entry condition.
- **D-7 — Loose UPDATE policy.** `planner_handoffs` grants `UPDATE` to `authenticated` with `USING (true)` and no `WITH CHECK` — any signed-in user can rewrite any handoff row.
- **D-8 — Snapping is opening-blind.** `src/utils/snapping/*` contains zero references to openings (verified by search), confirming §6's warn-only guard work.
- **D-9 — Quote form is mailto-only.** `QuoteFormSection` builds a `mailto:` body; selected files never leave the browser (only name/size metadata is kept in localStorage) and no durable lead record exists. Scope of §6.1.
- **Preflight check (unverified):** the homeowner wizard inserts directly into `jobs` as an anonymous user; confirm the unified project's RLS actually permits that insert before relying on the Phase 1a slice.

## 2. Decision Required Before Phase 2 (D1)

**Who captures rooms?**

- **Customer lead-gen** → scans drive website conversion. Build the WebXR track first, RoomPlan later.
- **Staff quoting consistency** → scans happen at consult/check-measure. Pilot the RoomPlan track first on a controlled LiDAR device fleet, benchmark it against tape measurements, and demote customer WebXR if staff tooling is the priority.
- **Both** → still pick which ships first; the contract (§3) serves either unchanged.

Phase 1 is identical in all cases. Do not start Phase 2 work until D1 is answered.

## 3. Canonical Contract and Convention Spec

### 3.1 Ground truth (verified in code, 2026-07-14)

- `src/types.ts`: `WallId = 'N'|'E'|'S'|'W'`; `Opening { id, wall, type: 'door'|'window'|'walkway', offsetMm, widthMm, heightMm?, sillHeightMm?, swing? }`; `ServicePoint { id, wall, type: 'water-supply'|'drain'|'gpo'|'gas'|'hood-duct', offsetMm, heightMm? }`; `RoomConfig { width, depth, height, shape, cutoutWidth, cutoutDepth, openings?, services? }`.
- `src/lib/layout/types.ts`: `RoomSpec` (RoomConfig with required openings/services), `RoomScanSource`, `RoomScan { room, confidence: { overall, perWall? }, source, photos?, rawArtifactUrl?, capturedAt }`.
- `src/hooks/usePlannerHandoff.ts`: the **real** `WebsitePlannerHandoff` already uses `dimensions.widthMm/depthMm/heightMm` and materials keys `mainCabinet/secondaryFinish/benchtop/splashback/hardware`. v1's proposed shape (unit-less `width`, `doors/flooring/handles` keys) was wrong — extend the existing shape, do not replace it.
- `zod` is already a dependency. Mirror types exist at `supabase/functions/_shared/layout/types.ts`.

### 3.2 Convention spec (pin these; adapters must obey)

1. **Units**: all lengths in **millimetres**, integers. `RoomConfig.width/depth/height` are mm despite the unsuffixed names; handoff `dimensions` use the `*Mm` suffix. Adapters converting from metres (WebXR, RoomPlan) round to nearest mm.
2. **Walls**: `N` is the wall at the top of the top-down editor view; `E/S/W` proceed clockwise. Scanners without compass meaning assign the longest wall (or user-chosen "main wall") to `N` and record the assignment in `roomScan` metadata.
3. **Offsets**: `offsetMm` is measured from the **left end of the wall as viewed from inside the room**, to the **left edge** of the opening/service (consistent with `ResolvedSegment.startMm` = "distance from the wall's left corner").
4. **Heights**: `heightMm` on services = height above finished floor. Opening defaults: door 2040, window 1200, sill 900 (already documented in `src/types.ts`).
5. **Timestamps**: ISO 8601 UTC.
6. **IDs**: adapter-generated, stable within a scan, `crypto.randomUUID()`.

Write this spec into the contract module's doc comment — it is the contract as much as the types are.

### 3.3 Versioned schema (new)

Create `src/lib/roomScan/contract.ts`. It must be **self-contained and client-safe**, with no runtime dependency beyond Zod and no imports from planner-only aliases. Repo-specific type compatibility belongs in a small adapter/type-test file, which allows the website to consume the generated contract copy unchanged.

```ts
export const ROOM_SCAN_SCHEMA_VERSION = 1;

export const openingSchema = z.object({
  id: z.string(),
  wall: z.enum(['N', 'E', 'S', 'W']),
  type: z.enum(['door', 'window', 'walkway']),
  offsetMm: z.number().int().nonnegative(),
  widthMm: z.number().int().positive(),
  heightMm: z.number().int().positive().optional(),
  sillHeightMm: z.number().int().nonnegative().optional(),
  swing: z.enum(['in-left', 'in-right', 'out', 'slider']).optional(),
});

export const servicePointSchema = z.object({
  id: z.string(),
  wall: z.enum(['N', 'E', 'S', 'W']),
  type: z.enum(['water-supply', 'drain', 'gpo', 'gas', 'hood-duct']),
  offsetMm: z.number().int().nonnegative(),
  heightMm: z.number().int().nonnegative().optional(),
});

export const roomSpecSchema = z.object({
  width: z.number().int().positive(),
  depth: z.number().int().positive(),
  height: z.number().int().positive(),
  shape: z.enum(['Rectangle', 'LShape']),
  cutoutWidth: z.number().int().nonnegative(),
  cutoutDepth: z.number().int().nonnegative(),
  openings: z.array(openingSchema),
  services: z.array(servicePointSchema),
}).superRefine(validateRoomGeometry); // wall bounds, cutouts and vertical constraints

const storedPhotoSchema = z.object({
  storagePath: z.string().min(1).optional(),
  tag: z.enum(['plumbing', 'power', 'window', 'general']).optional(),
  url: z.string().url().optional(), // legacy read only; never persist a signed URL
}).refine(photo => Boolean(photo.storagePath || photo.url), 'photo requires a storage path or legacy URL');

export const roomScanSchema = z.object({
  schemaVersion: z.literal(1),
  room: roomSpecSchema, // includes cross-field geometry validation below
  confidence: confidenceSchema, // §3.4
  source: z.enum(['manual', 'webxr', 'arcore', 'cubicasa', 'roomplan', 'magicplan']),
  photos: z.array(storedPhotoSchema).optional(),
  rawArtifactPath: z.string().min(1).optional(),
  rawArtifactUrl: z.string().url().optional(), // legacy read only
  normalizationWarnings: z.array(z.string().max(500)).optional(),
  capturedAt: z.string().datetime(),
});

export type RoomScanV1 = z.infer<typeof roomScanSchema>;

/** Defensive entry point for anything read from JSONB. Never throws. */
export function parseRoomScan(input: unknown): { ok: true; scan: RoomScanV1 } | { ok: false; reason: string };
```

Rules:

- `roomSpecSchema.superRefine()` must reject semantic geometry errors that field-level Zod rules cannot catch: opening `offsetMm + widthMm` beyond its wall, service offset beyond its wall, non-positive room dimensions, cutouts outside the room, opening height beyond room height, and window sill + height beyond room height.
- **Canonical ownership:** the planner owns the self-contained contract. The website carries a generated byte-identical copy with the canonical source commit and SHA-256 in its generated header. A release sync job checks out both repos and fails if they differ. Per-repo checksums alone are insufficient because two repos can pin different hashes and both pass.
- Update the existing `RoomScan` interface in `src/lib/layout/types.ts` and its `supabase/functions/_shared/layout/types.ts` mirror so `schemaVersion`, `confidence.fields`, storage paths, and the parsed type are not erased. Add a compile-time assignability test between `RoomScanV1` and the app-facing type.
- Every `planner_handoffs.payload` read goes through `parseWebsitePlannerHandoff`; every nested scan/draft read from handoffs or `jobs.design_data` goes through its matching parser. Unknown/missing scan `schemaVersion` → treat as no scan, fall back to manual; never crash the wizard.
- Payloads without `roomScan` remain fully valid (backward compat is an acceptance criterion).
- Legacy partial stamps exist in production shape today (D-5): the wizard writes `design_data.roomScan = { source: 'manual', confidence: { overall: 1 }, capturedAt }` with no `room`. `parseRoomScan` must classify that shape as `ok: false` (legacy/no-scan) without erroring, and the wizard should write schema-valid scans (or a `RoomCaptureDraft`) from Phase 1a onward.

### 3.4 Confidence model (revised)

A single numeric blob is uncalibratable. Keep `overall` for display, add per-field flags the layout engine and trade UI can act on:

```ts
export const confidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  perWall: z.record(z.enum(['N','E','S','W']), z.number().min(0).max(1)).optional(),
  fields: z.object({
    height: z.enum(['measured', 'estimated', 'default']).optional(),
    openings: z.enum(['detected', 'user-marked', 'none-captured']).optional(),
    services: z.enum(['detected', 'user-marked', 'none-captured']).optional(),
  }).optional(),
});
```

Usage: `height: 'default'` → trade UI badges the height field "unconfirmed"; `services: 'none-captured'` → wizard prompts for services instead of assuming an empty room has none.

### 3.5 Incomplete capture is not a room scan

`RoomScan` means a complete, normalized room that is safe to pre-fill into the planner. Photos, notes, or partial dimensions must not be padded with fake defaults to satisfy that schema. Add a separate draft:

```ts
export const roomCaptureDraftSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.enum(['manual', 'webxr', 'arcore', 'cubicasa', 'roomplan', 'magicplan']),
  dimensions: z.object({
    widthMm: z.number().int().positive().optional(),
    depthMm: z.number().int().positive().optional(),
    heightMm: z.number().int().positive().optional(),
  }).optional(),
  photos: z.array(z.object({
    storagePath: z.string().min(1),
    tag: z.enum(['plumbing', 'power', 'window', 'general']).optional(),
  })).default([]),
  notes: z.string().max(5000).optional(),
  capturedAt: z.string().datetime(),
});

export type RoomCaptureDraftV1 = z.infer<typeof roomCaptureDraftSchema>;
```

The quote form and an abandoned/unsupported scanner may create `RoomCaptureDraft`. A draft is promoted to `RoomScan` only after required dimensions and geometry pass `roomSpecSchema` and the user confirms them.

### 3.6 Handoff payload (extend the real shape)

```ts
export interface WebsitePlannerHandoff {
  source: 'website' | 'design_scope_builder' | 'flat-lay' | 'quote' | 'scanner' | 'showroom';
  leadId?: string;
  roomType: 'kitchen' | 'laundry' | 'wardrobe' | 'bathroom' | 'other';
  dimensions?: { widthMm?: number; depthMm?: number; heightMm?: number };
  styleTags: string[];
  materials: { mainCabinet?: string; secondaryFinish?: string; benchtop?: string; splashback?: string; hardware?: string };
  notes?: string;
  roomScan?: RoomScanV1;                 // complete and validated
  roomCaptureDraft?: RoomCaptureDraftV1; // partial dimensions/photos only
  handoffSchemaVersion?: 1;              // absent = legacy v0 payload
}
```

Export a matching `websitePlannerHandoffSchema` and a never-throw `parseWebsitePlannerHandoff(input)` result. The envelope parser accepts legacy v0 payloads additively, validates nested `roomScan`/`roomCaptureDraft` with their schemas, and returns a typed payload. Do not cast the entire JSONB row to `PlannerHandoffRow` before validation.

MVP storage: normalized metadata remains inside `planner_handoffs.payload` JSONB. Durable artifacts use private Supabase Storage paths in `photos[].storagePath` / `rawArtifactPath`; signed URLs are generated only when viewing and are never persisted.

### 3.7 Polygon normalization policy

Scanners return polygons, while the current wall model has only four wall IDs. Its existing `LShape` rendering does not provide enough perimeter-segment identity to place openings on all six L-shape edges. Therefore the scanner MVP normalizes rectangles only:

1. Axis-align (rotate to dominant wall directions) and snap near-axis walls (±3°).
2. If the result is a rectangle within tolerance (each wall within ±20mm of the bounding box) → rectangle.
3. Otherwise → **bounding rectangle + structured `normalizationWarnings` describing the deviation + cap `confidence.overall` at 0.5**, and surface a "room shape simplified — please review" warning in `RoomFeaturesEditor`.

Never silently discard geometry: keep the original polygon in the raw artifact for reprocessing.

True scanner-derived L-shapes move to a later room-model milestone: introduce stable perimeter segment IDs (or polygon edges), update rendering/layout/snapping to consume them, then map openings/services onto those segments. Do not infer an L-shape into the current four-wall contract.

## 4. Scan Lifecycle, Security, Privacy — Phase 1 scope

### 4.1 Backend ownership and preflight

The planner repo owns the `planner_handoffs` table, its migrations, the `room-captures` bucket, and handoff/storage edge functions. The website consumes those endpoints. Before implementation, confirm both deployed apps target the same Supabase project in each environment; if they do not, treat the planner backend as an explicit HTTP API rather than attempting cross-project table access.

Audit status (D-6): the planner `.env` and `supabase/config.toml` already target the unified `bower-cabinet-ai` project; `docs/SUPABASE_UNIFICATION_RUNBOOK.md` lists the remaining manual steps (schema bootstrap, function deploys). The website `.env.local` currently has an empty `VITE_SUPABASE_URL` and the runbook is not confirmed complete. Finishing that runbook and setting `VITE_SUPABASE_URL` + `VITE_PLANNER_URL` in the website environment is the entry condition for every cross-repo flow in this plan.

The earlier "no migrations" rule is withdrawn for this work. Phase 1 may add only the narrowly scoped handoff-token, expiry, index, and Storage policy migrations described here. A `room_scans` table remains deferred.

### 4.2 Secure public handoff flow

The public `/wizard` route cannot directly `SELECT` a staff-only table — and today it doesn't (D-1): the anonymous flat-lay → wizard prefill is silently broken in production. The tokenized flow below fixes a shipping bug. Keep staff table reads authenticated and add a capability flow:

1. Website calls `create-planner-handoff` edge function. It validates the handoff schema, generates the row ID plus a high-entropy public token, stores only the token hash, sets `expires_at` (recommended: seven days), and returns `{ id, token }`.
2. Website opens `/wizard?handoff=<id>#handoffToken=<token>`. The secret is in the URL fragment so it is not sent in the initial HTTP request or referrer. The planner reads it once, stores it in session storage for refresh recovery, and immediately removes the fragment with `history.replaceState`.
3. Public wizard calls `get-planner-handoff` edge function with the ID/token in the POST body. The function verifies the hash, expiry, consumption state, request limits, and returns only the validated payload plus safe lead fields. It never exposes a general table read.
4. Loading or refreshing the wizard does **not** consume the handoff. After the homeowner submission successfully creates the enquiry job, call `consume-planner-handoff` and link `job_id` in the same completion path (the homeowner path has no consume call at all today — D-4). Apply the same rule in trade: remove `JobEditor`'s on-load `markHandoffConsumed` (D-3) and keep only the post-creation call that links the new job id.
5. For photo flows, `finalize-planner-handoff` verifies the same capability and uploaded object ownership before replacing the initial draft payload with final storage paths. Clients never update the table directly.
6. Staff trade routes may continue authenticated reads, but they still parse the payload defensively.

Remove the website's direct anonymous table insert after the edge function is live. Rate limiting belongs in the function/gateway, not in an RLS comment.
The migration must also remove anonymous `INSERT` permission from `planner_handoffs`; otherwise callers can bypass validation, token generation, expiry and rate limits. Tighten the `authenticated` `UPDATE` policy in the same migration — it is currently `USING (true)` with no `WITH CHECK` (D-7), so any signed-in user can rewrite any handoff; restrict updates to the consumption/linking fields, ideally by routing them through the edge functions.

### 4.3 Capture and artifact lifecycle

**Lifecycle.** A draft or scan is created on the website/planner, attaches to a handoff, and is copied into the enquiry job's `design_data` after confirmation. If staff later creates a trade job, preserve the scan metadata and link the handoff/job rather than rewriting the capture source. Orphan handoffs and Storage objects are purged after 30 days; accepted lead/job artifacts follow the documented customer-record retention period.

**Storage.** Provision bucket `room-captures` as private. Clients request short-lived signed upload URLs from `create-room-capture-upload`; the function validates MIME type, ownership token, per-file cap (10MB), per-handoff count (15), and a total cap. Store object paths, not public or signed URLs. Planner/trade views request signed download URLs when needed.

**Privacy.** Treat linked home photos/scans as personal information as an internal policy, state the collection purpose at capture, provide deletion handling, define a fixed retention window, and confirm vendor storage/deletion rights before CubiCasa use. Separately confirm whether Bower is an APP entity under the Australian Privacy Act; coverage depends on turnover and statutory exceptions, so the document must not present legal applicability as already determined.

## 5. Phase 1a — Contract + Secure Homeowner Vertical Slice

Goal: one thin, E2E-testable path — website creates a tokenized handoff with `roomScan` → public homeowner wizard retrieves and applies it → enquiry `design_data` preserves it → handoff is consumed and linked only after successful submission.

Planner changes:

1. Add a runnable unit-test harness. Either Vitest with `npm test` / `npm run test:room-scan`, or follow the repo's existing convention: `test:functional` runs `node --test` over `.test.mjs` files, and `test:snapping`/`test:layout` bundle with esbuild (`--alias:@=./src`) then run node smoke scripts. Either is acceptable; CI must invoke it. Creating `.test.ts` files without a runner is not complete.
2. Create the self-contained `src/lib/roomScan/contract.ts` (§3.3–3.7) with convention spec comments, `RoomScanV1`, `RoomCaptureDraftV1`, defensive parsers, and cross-field geometry refinement.
3. Update `src/lib/layout/types.ts` and `supabase/functions/_shared/layout/types.ts`; add a compile-time compatibility test so parsed fields such as `confidence.fields` remain visible to consumers.
4. Create fixture library `src/lib/roomScan/__fixtures__/`: `manual-rect.json`, `webxr-rect.json`, `cubicasa-sample.json`, `capture-draft-photos-only.json`, `legacy-handoff-no-scan.json`, plus invalid cases (wrong units, missing version, opening overflow, service overflow, invalid cutout, sill/height overflow). Keep a non-rectangular raw polygon fixture that normalizes to a warned bounding rectangle.
5. Add the migration and planner-owned edge functions in §4.2–4.3. Replace public direct table reads with tokenized function retrieval while retaining authenticated staff access.
6. Update `usePlannerHandoff.ts`: extend `WebsitePlannerHandoff`, validate the whole handoff and nested scan/draft, and expose parsed values. Public retrieval uses `{ handoffId, token }`.
7. Update `src/pages/homeowner/Wizard.tsx`: apply validated `roomScan.room` dimensions, openings, and services; carry source/confidence/storage paths/warnings into `design_data.roomScan`; show draft photos/rough dimensions without treating them as confirmed geometry; on parse failure retain current dimensions-and-style behaviour.
8. After successful enquiry-job insertion, mark the handoff consumed and link the inserted job ID. A failed submission or page refresh must leave it usable.
9. Update `RoomFeaturesEditor.tsx`: expose `water-supply` and `hood-duct`; accept confidence/warnings; show "unconfirmed" and "room shape simplified" states where appropriate.
10. Tests: contract round-trips every fixture; secure retrieval rejects wrong/expired tokens; wizard mapping covers scan → state → `design_data`; draft-only and legacy payloads preserve current behaviour.

Website changes (other repo — see §10.3): consume the generated contract copy, convert `/planner` from local-only to `create-planner-handoff`, and open `/wizard?handoff=<id>#handoffToken=<token>`. Fix the `PlannerPage` "Open Kitchen Planner" button (D-2): it currently opens the planner root, which redirects to the auth-gated `/trade/dashboard`; point it — and any other customer-facing planner links — at `/wizard`. Keep actual `File[]` objects until upload completes. The quote form may create `RoomCaptureDraft` for photos/partial dimensions; it creates `RoomScan` only when a complete valid room has been confirmed.

Acceptance: an unauthenticated visitor can retrieve only the tokenized, unexpired handoff; wrong/expired tokens reveal nothing; a valid scan pre-fills dimensions/openings/services; submitted enquiry preserves metadata and links/consumes the handoff; draft-only and legacy handoffs do not fabricate geometry and behave safely.

## 6. Phase 1b — Trade Path

1. `RoomSetupWizard`: add `openings`/`services` to its config interface; add a room-features step embedding `RoomFeaturesEditor` immediately after **Room Shape**, because that existing step contains the floor-plan dimensions. The later "Size Defaults" step is cabinetry sizing, not room sizing.
2. `JobEditor.handleRoomComplete`: persist openings/services into `TradeRoom.config` (the trade `PlannerScene` already renders `room.config.openings` — this lights it up). Note the field-name seam: the setup wizard's internal config uses `roomWidth/roomDepth/roomHeight` while `TradeRoom.config` uses `width/depth/height`; `openings`/`services` must be carried explicitly through that mapping in both the new-job and edit-room branches.
3. Trade handoff mapping: scan-derived features arrive in the new room's config.
4. Manual placement: **warn-only guards** first, using the same opening rules as the layout engine rather than warning on every overlap. Base/tall cabinets conflict with doors/walkways; wall cabinets also conflict with windows; vertical ranges must avoid false warnings for valid base cabinetry below a window. Derive wall position through a shared geometry helper and return a `Violation` with `severity: 'warn'`; do not block placement.
5. Surface warnings in the existing trade planner feedback area and clear/recompute them after move, resize, rotate, delete, undo, and room-feature edits.
6. Tests: trade room config round-trip through `useTradeJobPersistence`; handoff → trade room mapping; category-aware opening warning cases, including a valid base cabinet below a window.

Acceptance: trade job from a scanner handoff shows openings in the planner scene; editing room features in trade setup persists; invalid manual placement warns visibly; jobs created before this change load unchanged.

## 6.1 Phase 1c — Photo and Partial-Capture Intake

1. Provision private Storage and signed-upload functions owned by the planner backend (§4.3).
2. Website quote form retains `File[]`, validates file count/type/size before upload, uploads only after the handoff capability is created, reports per-file progress/failure, then finalizes the handoff with verified object paths.
3. Photo-only or partial-dimension submissions create `RoomCaptureDraft`, not `RoomScan`.
4. Planner shows draft artifacts as reference material and asks the user/staff to complete dimensions in `RoomFeaturesEditor` before promotion.
5. Promotion creates a new validated `RoomScanV1` while preserving capture source, artifact paths, original timestamp, and an audit note that the user confirmed the geometry.
6. Add orphan cleanup and signed-download tests; ensure persisted JSON contains no signed URLs.

Acceptance: photo-only quote submissions remain usable without invented room dimensions; private objects cannot be read without a valid signed URL; a completed draft promotes to a valid scan and then follows the Phase 1a path.

## 7. Phase 2 — Gated by D1

### 7.1 Customer WebXR (if D1 = lead-gen)

**Go/no-go gate before production build:**

1. Analytics: measure the share of intended scanner visitors on WebXR-capable Android Chrome. Treat 15–20% as a business discussion threshold, not an automatic engineering truth; campaign/device mix matters.
2. Discovery prototype: run corner-marking in at least five furnished kitchens to identify failure modes, especially plain/low-texture walls, occlusion, reflective surfaces, tracking loss, and rooms wider than the most accurate depth range.
3. Benchmark: at least 20 complete capture runs across four representative supported devices and multiple users. Record median and 95th-percentile wall-length error, opening-width/offset error, polygon closure error, completion rate, and time-to-complete against tape measurements.
4. Product gate: Bower sets the quote-grade tolerance after seeing the baseline. Initial target for evaluation: wall-length p95 ≤50mm, opening offset/width p95 ≤75mm, closure error ≤1%, and unaided completion ≥80%. This is never a manufacturing tolerance.
5. Three non-technical users are useful for early discovery, but not sufficient for the production usability gate; include at least 10 representative users before launch.

If green: `/wizard?scan=webxr` (or "scan room" action in Step 1); feature-detect secure context + `navigator.xr` + `immersive-ar`, fall back cleanly to manual; guided capture (stabilize tracking → mark corners → close/confirm rectangle → mark openings → mark services → optional photos); emit `RoomScanV1` only after valid geometry, otherwise retain `RoomCaptureDraftV1`; **always** land in `RoomFeaturesEditor` before design generation. Position as quote/design-grade only.

### 7.2 Staff RoomPlan tool (if D1 = quoting accuracy)

Small native iOS capture app (or ARKit wrapper) for staff at consults/check measures on LiDAR devices. Convert RoomPlan walls/openings/objects → `RoomSpec` via the rectangle-only polygon policy (§3.7); store USDZ at `rawArtifactPath`. It attaches scans directly to trade jobs and skips the website handoff while using the same contract.

A controlled LiDAR fleet is expected to be more consistent, but Apple does not provide a construction-accuracy guarantee. Run RoomPlan through the same tape-measure benchmark and report the same median/p95 metrics before calling it check-measure tooling. Until that gate passes, it remains quote/design input and still requires professional confirmation.

## 8. Phase 3 — CubiCasa Spike (parallel with Phase 1)

Decision spike, not implementation. Answer before writing an adapter:

1. **Data shape**: obtain sample kitchen output; verify machine-readable walls/openings/dimensions-in-mm/QA fields — not just rendered plan images. If images-only → reject as geometry source (visual reference at most).
2. **Australia availability** (GoToScan docs currently say US-only — likely blocker unless CubiCasa confirms otherwise), pricing, SLA, SDK licensing.
3. **Async UX**: conversion is not instant, so "scan → design now" cannot block on the webhook. Required flow: scan → immediate manual/estimated dimensions → email/link updates the design when processed geometry lands. If the SLA is hours, CubiCasa suits the trade/quote path, not the live homeowner wizard.
4. **Data rights**: where scans are stored, retention, deletion — feeds §4.
5. If green: thin backend adapter only — create capture draft → accept webhook → normalize to `RoomScanV1` (§3.7) when structured geometry is complete → attach to handoff/job.

## 9. Acceptance Criteria (consolidated)

Phase 1a: secure tokenized public retrieval works without granting anonymous table reads; handoff may include validated `roomScan`; wizard applies dimensions/openings/services; `design_data` preserves source, confidence, features, storage paths and warnings; successful submission links/consumes the handoff; **legacy handoffs without `roomScan` work unchanged**; fixtures run in CI. An anonymous visitor completing the flat-lay → `/wizard?handoff=` journey gets a pre-filled wizard end-to-end — that exact journey is broken today (D-1) and is the headline regression test.

Phase 1b: trade setup edits room features via `RoomFeaturesEditor`; `TradeRoom.config` persists openings/services; trade scene renders openings from handoff-created rooms; manual placement warnings are category/height aware; pre-existing jobs load unchanged.

Phase 1c: private uploads persist storage paths only; photo/partial submissions remain `RoomCaptureDraft`; promotion requires complete validated geometry; cleanup covers orphaned objects.

Phase 2 (either track): complete capture normalizes into `RoomScanV1`, incomplete capture remains a draft; unsupported devices fall back to manual; user confirms in `RoomFeaturesEditor`; median/p95 accuracy and completion gates are documented and passed before production positioning.

Phase 3: sample output mapped or rejected against `RoomSpec`; AU availability, pricing, SLA, data rights known; go/no-go recorded.

### 9.1 Practical delivery sequence

Indicative sequence for one experienced product engineer with review support; estimates expand if Supabase environments or deployment ownership are not already aligned:

| Delivery block | Indicative effort | Exit result |
|---|---:|---|
| Contract, fixtures, test runner | 3–5 days | Both apps understand the same validated scan/draft data |
| Secure handoff + private artifact backend | 4–7 days | Public wizard works without public table/bucket access |
| Homeowner + trade integration | 5–8 days | Features survive handoff, editing, persistence and rendering |
| Quote photo/draft intake | 3–5 days | Partial captures are useful without fabricated geometry |
| WebXR discovery prototype | 2–3 weeks | Real-device accuracy/completion evidence and go/no-go |
| Production WebXR hardening if green | 3–5 additional weeks | Guided customer scanner with fallback, analytics and QA |
| RoomPlan staff pilot | 3–5 weeks after contract/backend | Controlled LiDAR capture measured against the same protocol |

Do not combine the Phase 1 foundation and production WebXR UI into one unsupervised implementation run. The scanner prototype should begin only after the secure handoff and validation acceptance tests pass.

---

## 10. One-Shot Implementation Framework

Prompts structured so a capable coding agent can implement Phase 1 in a single run per repo. Contract-first, fixture-driven, with explicit guardrails and a verification gauntlet — the properties that make one-shots survive.

### 10.1 Ground rules (paste into any prompt)

```
GROUND RULES
- Read before writing: open every file you will modify before editing it. The plan's
  descriptions may be stale; the code is ground truth.
- Additive application changes: no renames/removal of existing exported fields and no
  behaviour change for payloads/jobs lacking roomScan. Targeted migrations are allowed
  only for handoff token hash/expiry/indexes and private Storage policies in plan §4.
- All lengths are integer millimetres. Walls are N/E/S/W. offsetMm is from the left end
  of the wall viewed from inside the room. (Full spec in contract.ts doc comments.)
- Parse the handoff envelope and every nested roomScan/roomCaptureDraft read defensively;
  parsers never throw. Invalid scan = no scan, never partially trusted geometry.
- A photo-only/partial capture is RoomCaptureDraft, never a RoomScan with fake defaults.
- Public users never SELECT planner_handoffs directly. Use the tokenized edge-function flow.
- Persist private Storage paths only; never persist public or signed URLs.
- Warn, don't block, for manual-placement opening conflicts; warnings must respect cabinet
  category and vertical range so base cabinets below windows do not false-positive.
- If a task conflicts with existing code, keep existing behaviour, implement additively,
  leave a `// PLAN-DEVIATION:` comment, and list all deviations in the final summary.
- Add a runnable test command if absent. Run typecheck + relevant tests after each stage;
  finish with full tests + build and do not claim a check that was not executed.
```

### 10.2 Planner repo prompt (Phase 1 planner/backend, one run)

```
Repo: bower-kitchen-planner. Implement scanner data-spine Phase 1 per
docs/AI-ROOM-SCANNER-INTEGRATION-PLAN-v2.md. [+ GROUND RULES]

STAGE 0 — RECON (no edits)
Read: src/types.ts, src/lib/layout/types.ts, src/hooks/usePlannerHandoff.ts,
src/pages/homeowner/Wizard.tsx, src/components/shared/RoomFeaturesEditor.tsx,
src/pages/trade/components/RoomSetupWizard/index.tsx, src/pages/trade/JobEditor.tsx,
src/hooks/useTradeJobPersistence.ts, src/components/trade/planner/PlannerScene.tsx,
src/lib/layout/geometry.ts, src/lib/layout/wizardAdapter.ts, src/lib/layout/validate.ts,
src/utils/snapping/*, supabase/functions/_shared/layout/types.ts, the planner_handoffs
migration (note its SELECT/UPDATE policies — plan D-1/D-7), the jobs-table RLS used by
the homeowner enquiry insert, docs/SUPABASE_UNIFICATION_RUNBOOK.md, Supabase config,
package.json and CI files. Verify without printing secrets whether website/planner
environments target the same Supabase project (plan D-6). Output a concise map:
public/staff handoff paths, both markHandoffConsumed call sites, persistence points,
geometry rules and runnable checks.

STAGE 1 — CONTRACT
Add Vitest and explicit test scripts if no runner exists. Create self-contained
src/lib/roomScan/contract.ts per plan §3.3–3.7: no planner-only imports, RoomScanV1,
RoomCaptureDraftV1, handoff schema, never-throw parsers and superRefine geometry bounds.
Update src/lib/layout/types.ts and the Supabase shared mirror additively; add compile-time
assignability coverage. Create all fixtures listed in §5, including draft-only, overflow,
invalid cutout/height and non-rectangle normalization cases. Tests must actually run.

STAGE 2 — SECURE HANDOFF BACKEND
Add only the §4 migrations: token hash, expires_at/indexes, and private room-captures
bucket/policies. Add create-planner-handoff, get-planner-handoff,
finalize-planner-handoff, consume-planner-handoff and create-room-capture-upload
functions owned by this repo.
Validate inputs, hash tokens, enforce expiry/limits, return minimum data, keep staff
reads authenticated, and never make the table or bucket anonymously readable/writable.
Test valid/wrong/expired/consumed tokens, refresh-before-submit and upload limits.

STAGE 3 — HOMEOWNER SLICE
usePlannerHandoff.ts: validate the envelope and nested scan/draft; public retrieval uses
handoff id + token. Wizard.tsx applies only valid RoomScan geometry, shows draft reference
data without inventing dimensions, preserves full scan metadata/storage paths, and calls
consume only after successful enquiry insertion with the new job id (the homeowner path
has no consume call today — add it; and replace the schema-invalid partial roomScan
stamp per plan D-5). RoomFeaturesEditor:
add water-supply/hood-duct and confidence/normalization warning states. Test scan mapping,
draft-only fallback, wrong tokens, refresh and legacy behaviour.

STAGE 4 — TRADE SLICE
RoomSetupWizard: add openings/services to its config interface; add a room-features
step immediately after Room Shape (where floor dimensions are edited). Mind the seam:
the wizard config uses roomWidth/roomDepth/roomHeight, TradeRoom.config uses
width/depth/height — carry openings/services explicitly through both new-job and
edit-room branches.
JobEditor.handleRoomComplete: include openings/services in TradeRoom.config.
Trade handoff mapping: carry scan features into the new room's config. Remove the
on-load markHandoffConsumed call (plan D-3); consume only in the post-creation path
that links the new job id.
Placement: share layout geometry rules; doors/walkways block base/tall, windows also
affect wall cabinets, and vertical range prevents false positives. Surface warn-severity
Violations and recompute through all placement/edit/undo paths; do NOT block.
Tests: TradeRoom.config round-trip via useTradeJobPersistence; handoff → trade room
mapping preserves features; category/height warning matrix passes.

STAGE 5 — VERIFY
Typecheck, room-scan tests, existing smoke suites, full tests and build. Confirm private
handoff E2E, fixtures, legacy behaviour, draft-only behaviour, consume-after-submit,
opening rendering and trade warnings. Report files changed, migrations/functions,
deviations and every check's exact status. Definition of done = §9 Phase 1a + 1b plus
the planner/backend responsibilities from Phase 1c.
```

### 10.3 Website repo prompt (run after 10.2; separate repo)

```
Repo: bower-cabinet-web-site. Implement the website side of scanner Phase 1.
[+ GROUND RULES]

STAGE 0 — RECON: read src/lib/dreamweaverBridge.ts,
src/pages/PlannerPage.tsx, src/pages/showrooms/FlatLayGeneratorPage.tsx,
src/components/home/QuoteFormSection.tsx, package.json, CI files and
docs/kitchen-planner-integration-plan.md. Confirm the planner-owned edge-function base
URL/environment without printing keys. Record that the quote form currently stores file
metadata only and has no complete room geometry.

STAGE 1 — GENERATED CONTRACT COPY: copy the finished self-contained planner
src/lib/roomScan/contract.ts byte-identically. Add a generated header containing the
canonical planner commit + SHA-256 and a local checksum check. Add/document a release
sync check that checks out both repos and compares files; do not claim two independent
lock files prove cross-repo equality. Extend dreamweaverBridge.ts to use the contract's
WebsitePlannerHandoff (roomScan?, roomCaptureDraft?, handoffSchemaVersion?, source union).

STAGE 2 — PLANNER PAGE: replace PlannerPage's local-only flow: create a real
handoff through the planner-owned create-planner-handoff edge function
(handoffSchemaVersion: 1), receive { id, token }, and open
getPlannerUrl() + '/wizard?handoff=<id>#handoffToken=<token>'. Read the fragment once
in the planner, keep it in session storage for refresh, then scrub it from the URL.
Also fix the "Open Kitchen Planner" button (plan D-2): it opens the planner root today,
which redirects to the auth-gated /trade/dashboard; point every customer-facing planner
link at /wizard. Flag (without printing values) that .env.local currently has an empty
VITE_SUPABASE_URL and that VITE_PLANNER_URL must be set — the localhost:8080 fallback
breaks production links (plan D-6).
Update FlatLayGeneratorPage.handleOpenInPlanner the same way — it currently inserts
directly into the table and opens /wizard?handoff=<id> with no token, the exact journey
plan D-1 shows is broken for anonymous visitors.
Keep local storage as a pre-submit draft only. Remove direct anonymous table insertion
after this works.

STAGE 3 — QUOTE FLOW / CAPTURE DRAFT: retain actual File[] objects, validate count,
MIME and size, create the secure handoff capability, request signed upload URLs from
the planner-owned function and upload with progress/error handling. Call
finalize-planner-handoff with the capability and verified object paths. Photo-only or
partial dimensions create roomCaptureDraft, never roomScan with defaults. Create
roomScan only when complete room geometry passes the shared parser and is confirmed.
Include the handoff id in the submitted quote/enquiry path; if the mailto flow remains,
state clearly that it is not a durable lead record and do not claim database linkage.

STAGE 4 — VERIFY: add a runnable test command if absent; run typecheck/tests/build;
local and cross-repo contract checks pass. E2E: /planner creates tokenized handoff →
public wizard retrieves it; wrong token fails; quote photos upload privately → payload
contains storage paths and RoomCaptureDraft → no fake dimensions; signed URLs expire.
```

### 10.4 Why this one-shots

**Recon before edits** catches stale assumptions. **A self-contained contract + runnable fixtures first** gives both repos the same executable boundary. **Secure handoff retrieval before UI mapping** makes the public vertical slice real. **Draft versus scan** prevents fake geometry. **Additive changes + legacy fixtures** make backward compatibility testable. **Category-aware warn-don't-block** limits UX risk. **Deviation comments and stage gates** keep judgment calls reviewable.

Run 10.2 and 10.3 separately. The planner/backend run goes first; the website contract copy and endpoint use must come from that finished version. Review Stage 0 before edits, and do not begin scanner capture UI until Phase 1 acceptance is green.

---

## 11. What Deliberately Moved Out of Phase 1

Hard placement blocking (warn-only ships first); `room_scans` table (JSONB payload suffices until CubiCasa/RoomPlan produce durable artifacts at volume — create it in Phase 2/3 with lifecycle rules from §4); any scanner capture UI (Phase 2, gated); native Android ARCore (only if D1 = customer-first AND WebXR fails its accuracy gate AND Bower commits to app distribution — three conditions, not one).
