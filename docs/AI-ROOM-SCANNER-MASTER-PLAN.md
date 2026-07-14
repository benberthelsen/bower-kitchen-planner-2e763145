# AI Room Scanner Master Implementation Plan

Prepared: 2026-07-14
Status: reviewed implementation specification; Phase 0 version-control and D1 approval gates remain. Third-pass amendments applied 2026-07-14 (delivery-minimum subset, enum-migration ordering, positive-determinant transforms, JPEG/PNG-only photos, keyed deletion-ledger pseudonyms, timestamp ordering invariant).

Projects:

- Planner: `bower-kitchen-planner`
- Website: `bower-cabinet-web-site`

This document consolidates the room-scanner work from:

- `AI-ROOM-SCANNER-INTEGRATION-PLAN-v2.md`
- `AI-DESIGNER-HARNESS-PLAN.md`
- `AI-DESIGNER-BUILD-STATUS.md`
- the 2026-07-14 two-repository code audit

It is the source of truth for room capture, handoffs, capture storage, scanner validation,
and scanner-to-planner integration. The AI Designer harness remains authoritative only for
AI layout/design behaviour that does not conflict with this document.

## 0. Architecture Review Repairs Incorporated

The 2026-07-14 implementation review identified ten gaps. This revision resolves them as
binding requirements rather than leaving them as implementation choices:

| Review finding | Required repair | Acceptance evidence |
|---|---|---|
| Atomic/idempotent organic submission had no durable key | Store the key and request fingerprint on `jobs`; execute job creation and handoff consumption in one restricted PostgreSQL RPC | Same-key retries return one job; different-payload reuse fails; concurrency test creates one job |
| Confirmation was a client convention | Use discriminated unconfirmed/confirmed schemas and require `ConfirmedRoomScanV1` at the submission RPC boundary | Server rejects an unconfirmed scan even if a client bypasses the wizard |
| Staff handoff access was undefined | Add an explicit `staff` application role and `is_bower_staff()` helper; never infer staff access from `profiles.user_type = 'trade'` | Admin/staff read tests pass; consumer/trade-customer access fails |
| Coordinate normalization was not reproducible | Persist a complete invertible source-plan-to-canonical affine transform | Source-to-canonical-to-source fixture round trips within tolerance |
| Existing shared sync ignored `src/lib/roomScan` | Add dedicated room-scan sync/check scripts for website and Deno outputs | Both repositories and the generated Deno copy pass drift checks |
| Tolerant parsing could silently weaken new writes | Use strict parsing for create/finalize/submit and tolerant parsing only for legacy reads | Invalid new payload is rejected; useful legacy fields still recover |
| Technology decision D1 was missing | Add the decision record and comparison matrix in Section 4 | Bower records audience, owner, chosen pilot, date, and evidence gate before Phase 2 |
| RoomPlan retained only USDZ | Retain serialized structured scan data plus optional USDZ | A stored RoomPlan fixture can be re-adapted without the original device |
| Deletion proof retained direct object references | Separate active deletion work from a pseudonymous, time-limited audit ledger | Completed ledger rows contain no object paths, direct handoff/job IDs, or customer identifiers |
| The declared source-of-truth documents were untracked | Commit the planning baseline before contract provenance is generated | `contract.lock.json` names a commit that contains this plan and the canonical contract |

The master plan and the documents it supersedes must be added to version control in Phase 0.
Do not generate `contract.lock.json` until the canonical contract has a real commit SHA.

### Second-pass hardening incorporated

| Remaining ambiguity | Improvement in this revision | Acceptance evidence |
|---|---|---|
| Draft corner coordinates had no recorded transform | Add an optional draft coordinate frame and require it whenever canonical partial corners are stored | Draft source/canonical round-trip fixture passes |
| V1 could contain both a scan and a draft, or omit its version | Make `handoffSchemaVersion: 1` mandatory for new writes and model capture attachment as an exclusive union | Strict parser rejects dual capture fields and missing V1 version |
| Signed upload validation could trust client MIME metadata | Upload into quarantine, inspect actual bytes and metadata, then promote only verified objects | Spoofed MIME, oversize, checksum mismatch and malformed image tests fail safely |
| Public Edge Function CORS, caching, logging and abuse controls were underspecified | Add one shared public-function security policy with origin allowlisting, `no-store`, redaction and endpoint rate limits | Header, redaction, enumeration and throttling tests pass |
| Twenty runs could not support a stable production p95 decision | Separate discovery from the production benchmark and require device-level samples, measurement counts and confidence intervals | Evidence report cannot pass on a pooled or underpowered sample |

### Third-pass amendments incorporated

| Remaining issue | Improvement in this revision | Acceptance evidence |
|---|---|---|
| Foundation had no shippable minimum; the live prefill bug waited behind 24-41 days of infrastructure | Define a 1A-min subset that fixes the broken anonymous journey and unblocks Phase 1B while retaining deny-by-default RLS, atomic submission and stable JCS fingerprints; defer only external bot-provider integration and alert wiring | 1A-min ships and the anonymous flat-lay -> wizard journey works without reopening direct table access |
| `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction | Enum addition is its own migration, ordered before any reference to `'staff'` | Migrations apply cleanly in order on a fresh database |
| Transform validation permitted reflections | Require a positive determinant; mirrored source data is a normalization error | Negative-determinant fixture is rejected |
| HEIC photos contradicted the decode-probe rule | Photos are JPEG/PNG only; capture clients transcode HEIC before upload | HEIC upload is rejected server-side |
| Unkeyed subject hash was dictionary-reversible | Ledger pseudonyms use an HMAC with a restricted, rotatable key | Ledger rows cannot be reversed without the ledger key |
| Missing timestamp invariant and fixture labels | Add `confirmedAt >= capturedAt` validation; label the CubiCasa fixture unconfirmed | Ordering-violation fixture is rejected |

### Fourth-pass review repairs incorporated

| Review finding | Binding repair | Acceptance evidence |
|---|---|---|
| 1A-min could defer the RLS repair while current authenticated policies expose every handoff | 1A-min drops anonymous and broad authenticated handoff policies before any public function ships; explicit staff read access may follow from a deny-by-default state | Anonymous, consumer, trade-customer and ordinary authenticated direct reads/updates fail in the 1A-min migration test |
| A serializer-to-JCS upgrade could change fingerprints for an identical retry | Use RFC 8785/JCS from the first release and persist `submission_fingerprint_version`; never change an issued algorithm without replay support | Known JCS vectors pass and a retry produces the same key/fingerprint before and after deployment |
| AI or manual patches could mutate a confirmed room without invalidating confirmation | Room geometry/features are immutable inside `ConfirmedRoomScanV1`; every patch increments `roomRevision` and returns `UnconfirmedRoomScanV1` for mandatory reconfirmation | Dimension/opening/service patch tests clear confirmation and block submit until reconfirmed |
| One finalization key could not remember more than one recoverable-draft update | Store each attempt in `planner_handoff_finalizations` keyed by handoff/key, with request fingerprint, status and result version | Old-key replay still returns its recorded result after a later successful finalization |
| The database `staff` role was absent from generated types, auth state and route guards | Regenerate Supabase types, add `isStaff`, and expose least-privilege `/staff` lead/handoff surfaces while keeping full admin routes admin-only | Staff reaches permitted pages; staff cannot reach roles, users, pricing or settings |
| Accuracy intervals could treat correlated wall rows as independent and under-sample openings by device | Use capture-clustered, device-stratified intervals and require per-device wall/opening observation minimums | Analysis fails for row-level pseudo-replication or an under-sampled device cohort |

## 1. Document Authority

Use this precedence when documents disagree:

1. Current code, migrations, and deployed configuration.
2. This master plan for scanner, handoff, storage, and room-capture behaviour.
3. `AI-DESIGNER-BUILD-STATUS.md` after it has been repaired and refreshed.
4. `AI-DESIGNER-HARNESS-PLAN.md` for AI/layout intent only.

`AI-ROOM-SCANNER-INTEGRATION-PLAN-v2.md` is superseded by this document in full,
including its Section 10 one-shot prompts: they still instruct building
`consume-planner-handoff` (replaced here by `submit-planner-enquiry` +
`link-trade-handoff`) and a generated contract header (replaced by
`contract.lock.json`). Regenerate any implementation prompt against this master plan
before running it; do not execute the v2.2 prompts as written.

The following older instructions are explicitly superseded:

- Opening `/wizard?handoff=<id>` without a token.
- Consuming a handoff when a page loads.
- Direct anonymous writes to `planner_handoffs`.
- Persisting public or signed photo URLs.
- Treating photos or incomplete measurements as a valid `RoomScan`.
- Describing the current wizard as four steps, AI-free, or opening-blind.

The two AI Designer documents currently end mid-sentence and must not be used as complete
implementation prompts until their missing tails are restored.

## 2. Product Outcome

The first shippable scanner is a guided room-measurement experience:

1. A customer starts "Scan my room" on a supported Android Chrome device.
2. WebXR guides them to stabilize tracking and mark room corners.
3. They mark doors, windows, and service locations.
4. The capture is normalized and validated.
5. `RoomFeaturesEditor` always displays the result for confirmation.
6. A confirmed room opens in the homeowner planner.
7. Unsupported, abandoned, or incomplete captures fall back to a recoverable draft and
   manual editing.

This is quote/design-grade input. It is never manufacturing authority. Cabinet production
continues to require a professional check measure.

Follow-on options:

- RoomPlan: controlled LiDAR iPhone/iPad capture for staff.
- CubiCasa: vendor pilot only after structured geometry and Australian availability are
  confirmed.
- Native Android ARCore: only if WebXR fails and Bower commits to app distribution.

## 3. Verified Current State

### 3.1 Planner capabilities already built

- `RoomConfig` supports optional `Opening[]` and `ServicePoint[]`.
- `RoomSpec` requires openings and services for deterministic layout.
- The layout engine avoids doors/walkways and applies service-aware placement.
- The homeowner wizard has a five-step AI-assisted flow.
- `RoomFeaturesEditor` is present in homeowner Step 1.
- Openings and services reach layout, pricing, validation, and 3D rendering.
- `RoomScan` exists as a scanner-neutral type.
- The AI designer uses OpenAI and has a deterministic fallback.
- The wizard uses the shared BOM pricing path when pricing data is available.
- Existing layout and placement smoke suites provide a base for scanner fixtures.

### 3.2 Confirmed defects and gaps

1. The public wizard cannot read current handoffs because table `SELECT` is authenticated
   only.
2. The website planner page opens the planner root, which redirects customers to the
   protected trade area.
3. The trade job editor consumes a handoff when it loads, before job creation.
4. The homeowner wizard does not consume or link a handoff after enquiry creation.
5. The homeowner wizard writes a schema-invalid partial `roomScan` stamp with no `room`.
6. Website Supabase/planner production environment values are not confirmed complete.
7. The handoff authenticated `UPDATE` policy is too broad.
8. Trade snapping and manual placement are opening-blind.
9. Trade room setup does not persist openings/services through all create/edit mappings.
10. The quote form is mailto/local-storage only and discards selected `File` objects.
11. `RoomFeaturesEditor` does not expose every modelled service type.
12. The older AI Designer documents contain stale contracts and are physically truncated.

## 4. Product Decision

Before production scanner UI begins, choose the primary capture audience:

- Customer lead generation: build the WebXR track first.
- Staff quoting consistency: build the RoomPlan track first.
- Both: choose one pilot first; both use the same data contract and confirmation UI.

Default recommendation: finish the shared foundation, then run the WebXR discovery pilot.
It reuses the existing web product and still leaves reusable adapters and validation if the
accuracy gate fails.

### 4.1 Decision record D1: first capture pilot

**Owner:** Bower product owner, advised by planner engineering and the quoting team.

**Decision deadline:** before Phase 2 starts.

**Status:** proposed recommendation is WebXR for customer lead generation. If the first
business goal changes to controlled staff quoting, choose RoomPlan instead. Record the final
choice, approver, date, supported-device list, pilot budget, and accepted accuracy gate in
this section before scanner UI work begins.

**Run 0 note (2026-07-14):** foundation work (Runs 1-4) proceeds on the WebXR-first default.
This is a working assumption, not the formal D1 approval — the supported-device list, pilot
budget and accuracy gate still require Bower sign-off before Phase 2 scanner UI starts.
Environment preflight verified same day: planner and website both target `bower-cabinet-ai`
(`ehtwywctledgkxexztbh`), `planner_handoffs`/`jobs` exist there, edge functions respond, and
local `VITE_PLANNER_URL` is set (production URL to be set at deploy time — launch
precondition).

| Track | Primary audience and reach | Distribution | Structured output | Main advantage | Main constraint | D1 recommendation |
|---|---|---|---|---|---|---|
| WebXR over ARCore | Customers with compatible Android Chrome and an ARCore-supported device | Existing HTTPS website; no Bower app install | Bower-created corner/opening/service measurements | Fastest way to test customer demand and reuse the website | Device/browser coverage and measurement accuracy must be proven | First customer discovery pilot |
| RoomPlan | Staff using supported LiDAR iPhone/iPad devices | Small native iOS/iPadOS staff app | Serializable RoomPlan data, walls/openings, confidence and USDZ | Strong structured capture in a controlled workflow | Apple/LiDAR hardware and native app delivery | First staff-consistency pilot |
| Native Android ARCore | Staff or customers on a controlled ARCore device list | Google Play or managed Android distribution | Bower-owned native tracking and geometry | More tracking/control options than browser WebXR | Highest Android engineering and release burden | Contingency after WebXR evidence |
| CubiCasa / GoToScan | Vendor-assisted staff capture; customer invite only where offered | Vendor app and asynchronous service | Must be commercially confirmed through API/CAD samples | Outsources capture and floor-plan processing | Vendor terms, turnaround, data handling and GoToScan regional limits | Due-diligence spike only |

Use the same representative kitchens and tape-measure benchmark for every pilot. Device
reach, completion rate, p95 error, staff/customer workflow fit, privacy, recurring cost, and
integration effort are the comparison criteria; a visually impressive demo is not a gate.

## 5. Canonical Room-Capture Contract

### 5.1 Conventions

- All persisted lengths are integer millimetres.
- `N` is the top wall in the canonical top-down view; `E/S/W` proceed clockwise.
- `offsetMm` is measured from the wall's left end as viewed from inside the room.
- Opening offsets refer to the opening's left edge.
- Service heights are measured above finished floor.
- Timestamps are ISO 8601 UTC.
- Adapter-generated feature IDs use stable UUIDs within a capture.
- Scanner V1 emits normalized rectangles only.
- Existing manual `RoomConfig` L-shapes remain supported by the application, but are not a
  valid scanner-normalization target until perimeter-segment IDs exist.

### 5.2 Coordinate frame

Every scan records how source geometry became the canonical `N/E/S/W` frame:

```ts
interface CoordinateFrameV1 {
  assignment: 'user-main-wall' | 'longest-wall' | 'source-orientation';
  sourcePlanAxes: 'x-z' | 'x-y';
  sourceUnits: 'metres' | 'millimetres';
  /**
   * Row-major homogeneous 3x3 affine matrix. It maps
   * [sourceAxis1, sourceAxis2, 1] to [canonicalXmm, canonicalZmm, 1].
   * Scale, arbitrary yaw, quarter-turn snapping and translation are all included.
   */
  sourceToCanonicalMatrix: [
    number, number, number,
    number, number, number,
    0, 0, 1,
  ];
  snappedQuarterTurnDegrees: 0 | 90 | 180 | 270;
  sourceWallToCanonical?: Record<string, 'N' | 'E' | 'S' | 'W'>;
  mainWallSourceId?: string;
  originDescription: 'north-west-corner-in-canonical-plan';
}
```

Tie handling must be deterministic. Square/near-square rooms require the user to choose the
main wall rather than relying on longest-wall selection.

Axes for all captured plan coordinates (including `partialGeometry.cornersMm`): the origin
is the north-west corner in the canonical top-down plan, `x` increases east (along the `N`
wall) and `z` increases south. The matrix is the audit/reprocessing authority;
`snappedQuarterTurnDegrees` is a convenient description, not a replacement for the matrix.
Every matrix value must be finite and the affine determinant must be **positive**; a
negative determinant is a reflection that silently reverses wall order and flips offsets
while still round-tripping numerically. Mirrored source data is a normalization error; an
adapter must correct it before emitting the transform, or document the mirroring explicitly
and emit an already-corrected matrix. Inverse round-trip fixtures must recover source points
within the adapter's documented tolerance.

A draft may omit `coordinateFrame` while it contains only photos, notes, raw artifacts, or
rough dimensions. If `partialGeometry.cornersMm` is present, `coordinateFrame` is required
and those corners are already in canonical coordinates. If an adapter cannot yet construct
the transform, retain source points only in the private raw artifact/`adapterState`; do not
mislabel them as canonical `cornersMm`.

### 5.3 Valid scan versus recoverable draft

`RoomScanV1` means complete, normalized, validated geometry that may pre-fill the planner.
`RoomCaptureDraftV1` means useful but incomplete capture data that must never drive layout
until promoted.

```ts
type RoomScanSourceV1 =
  | 'manual'
  | 'webxr'
  | 'arcore'
  | 'cubicasa'
  | 'roomplan'
  | 'magicplan';

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

interface StoredCapturePhotoV1 {
  storagePath: string;
  /** JPEG/PNG only. Capture clients (including iOS) transcode HEIC to JPEG
   *  before upload; HEIC cannot be decode-probed in the Edge runtime. */
  mediaType: 'image/jpeg' | 'image/png';
  byteSize: number;
  sha256: string;
  tag?: 'plumbing' | 'power' | 'window' | 'general';
}

interface StoredCaptureArtifactV1 {
  storagePath: string;
  kind: 'source-structured' | 'partial-geometry' | 'visualization' | 'vendor-delivery';
  mediaType: string;
  byteSize: number;
  sha256: string;
}

interface RoomScanBaseV1 {
  schemaVersion: 1;
  source: RoomScanSourceV1;
  roomRevision: number; // positive integer; increment on every room/feature change
  coordinateFrame: CoordinateFrameV1;
  room: RoomSpecV1 & { shape: 'Rectangle' };
  confidence: {
    overall: number;
    perWall?: Partial<Record<'N' | 'E' | 'S' | 'W', number>>;
    fields?: {
      height?: 'measured' | 'estimated' | 'default';
      openings?: 'detected' | 'user-marked' | 'none-captured';
      services?: 'detected' | 'user-marked' | 'none-captured';
    };
  };
  photos?: StoredCapturePhotoV1[];
  rawArtifacts?: StoredCaptureArtifactV1[];
  normalizationWarnings?: string[];
  capturedAt: string;
}

interface UnconfirmedRoomScanV1 extends RoomScanBaseV1 {
  state: 'unconfirmed';
  confirmedAt?: never;
  confirmedRevision?: never;
}

interface ConfirmedRoomScanV1 extends RoomScanBaseV1 {
  state: 'confirmed';
  confirmedAt: string; // must be >= capturedAt
  confirmedRevision: number; // must equal roomRevision
}

type RoomScanV1 = UnconfirmedRoomScanV1 | ConfirmedRoomScanV1;

interface RoomCaptureDraftV1 {
  schemaVersion: 1;
  state: 'draft';
  source: RoomScanSourceV1;
  coordinateFrame?: CoordinateFrameV1;
  dimensions?: { widthMm?: number; depthMm?: number; heightMm?: number };
  photos: StoredCapturePhotoV1[];
  rawArtifacts?: StoredCaptureArtifactV1[];
  partialGeometry?: {
    cornersMm?: Array<{ x: number; z: number }>;
    openings?: Partial<OpeningV1>[];
    services?: Partial<ServicePointV1>[];
    closureComplete?: boolean;
  };
  adapterState?: JsonValue;
  notes?: string; // max 5000 chars, enforced by the schema
  capturedAt: string;
}

type RoomCaptureV1 =
  | RoomCaptureDraftV1
  | UnconfirmedRoomScanV1
  | ConfirmedRoomScanV1;
```

`adapterState` is recovery-only, size-limited, JSON-safe, and never consumed by the layout
engine. Promotion always rebuilds and validates a fresh `RoomScanV1`.

Three capture states, not two:

1. **Draft** (`state: 'draft'`) - incomplete geometry. Never drives layout.
2. **Scan, unconfirmed** (`state: 'unconfirmed'`) - complete, normalized, validated geometry
   from an adapter. May pre-fill the wizard and `RoomFeaturesEditor`, but must not drive
   design generation or be written into submitted `design_data`.
3. **Scan, confirmed** (`state: 'confirmed'` with required `confirmedAt`) - a person accepted
   the geometry in `RoomFeaturesEditor`. Only this state feeds `DesignBrief.room`, enquiry
   `design_data`, and trade room configs.

Vendor adapters (CubiCasa, RoomPlan) therefore emit `UnconfirmedRoomScanV1`; confirmation
happens in the planner, which rebuilds and validates a `ConfirmedRoomScanV1`. Changing only
the discriminator or timestamp is insufficient if the editor changed geometry.

`ConfirmedRoomScanV1` is immutable with respect to dimensions, shape, coordinate frame,
openings and services. A shared `applyRoomPatch()` function must increment `roomRevision`,
remove `confirmedAt`/`confirmedRevision`, and return `UnconfirmedRoomScanV1`. This applies to
manual edits, AI-proposed patches, adapter corrections and trade edits. Reconfirmation creates
a new confirmed value with `confirmedRevision === roomRevision`. Cabinet/layout/style changes
that do not alter `RoomSpecV1` do not invalidate room confirmation.

### 5.4 Validation rules

The Zod contract is self-contained and has no planner-only imports. It declares local
`RoomSpecV1`, `OpeningV1`, and `ServicePointV1` shapes; a compile-time test proves they remain
assignable to the planner's app-facing types. All new-write schemas use `.strict()` so unknown
keys are rejected. Define the scanner room schema explicitly as
`roomSpecV1Schema.extend({ shape: z.literal('Rectangle') })`; a TypeScript intersection alone
does not enforce the runtime value. Cross-field refinement rejects:

- non-positive/non-integer room dimensions;
- opening offset plus width beyond its wall;
- service offsets beyond their wall;
- opening/window heights beyond room height, including defaults;
- invalid cutouts;
- confidence values outside 0..1;
- duplicate feature IDs;
- persisted signed URLs;
- scanner V1 rooms with a non-rectangle shape;
- non-finite, singular, reflective (negative-determinant) or malformed coordinate transforms;
- draft canonical corners without a coordinate frame;
- a state/confirmation mismatch;
- a `confirmedAt` earlier than `capturedAt`;
- a non-positive/non-integer `roomRevision` or `confirmedRevision !== roomRevision`;
- drafts with no useful photo, artifact, dimension, partial geometry, or note;
- invalid photo/artifact byte sizes, MIME types or SHA-256 values;
- non-JSON or oversized adapter state; and
- oversized warnings, notes, adapter state, artifact lists, or photo lists.

`JsonValue` is implemented as a recursive Zod schema. Size limits are checked against the
UTF-8 byte length of the serialized JSON, not JavaScript character count. Export these
separate schemas:

- `roomCaptureDraftV1Schema`;
- `unconfirmedRoomScanV1Schema`;
- `confirmedRoomScanV1Schema`;
- `roomScanV1Schema` as the discriminated union;
- `websitePlannerHandoffV1Schema` for strict new writes; and
- `parseLegacyWebsitePlannerHandoff()` for tolerant legacy reads.

The handoff envelope this contract validates:

```ts
interface WebsitePlannerHandoffBaseV1 {
  handoffSchemaVersion: 1;
  source: 'website' | 'design_scope_builder' | 'flat-lay' | 'quote' | 'scanner' | 'showroom';
  leadId?: string;
  roomType: 'kitchen' | 'laundry' | 'wardrobe' | 'bathroom' | 'other';
  styleTags: string[];
  materials: {
    mainCabinet?: string;
    secondaryFinish?: string;
    benchtop?: string;
    splashback?: string;
    hardware?: string;
  };
  notes?: string;
}

type CaptureAttachmentV1 =
  | {
      dimensions?: { widthMm?: number; depthMm?: number; heightMm?: number };
      roomScan?: never;
      roomCaptureDraft?: never;
    }
  | {
      dimensions?: never;
      roomScan: RoomScanV1; // complete and validated, confirmed or unconfirmed
      roomCaptureDraft?: never;
    }
  | {
      dimensions?: never;
      roomScan?: never;
      roomCaptureDraft: RoomCaptureDraftV1;
    };

type WebsitePlannerHandoffV1 = WebsitePlannerHandoffBaseV1 & CaptureAttachmentV1;
```

The `source` union and materials keys extend the shape that exists in both repos today;
nothing is renamed. Once `contract.ts` exists, its exported schema is authoritative over
this snippet.

For new writes, `handoffSchemaVersion: 1` is mandatory. A payload may contain a scan, a
draft, or top-level rough dimensions, but never more than one of those representations. Scan
dimensions live only in `roomScan.room`; draft dimensions live only in
`roomCaptureDraft.dimensions`. This removes precedence rules and conflicting measurements.

New writes through `create-planner-handoff`, `finalize-planner-handoff`, and
`submit-planner-enquiry` use strict parsing and reject invalid nested scan/draft data, missing
V1 version, duplicate capture representations, or contradictory dimensions. They must never
silently strip a field and report success.

Legacy reads are deliberately tolerant: invalid nested scan data must not discard otherwise
useful lead/style fields from a pre-contract handoff. `parseLegacyWebsitePlannerHandoff()`
normalizes recoverable fields to `WebsitePlannerHandoffV1`, strips only the invalid or
conflicting nested capture data, and reports structured issues including legacy-version
normalization:

```ts
type HandoffIssue = {
  path: string;
  code: string;
  message: string;
};

type ParseHandoffResult =
  | { ok: true; handoff: WebsitePlannerHandoffV1; issues: HandoffIssue[] }
  | { ok: false; reason: string };
```

### 5.5 Contract ownership

- Planner owns `src/lib/roomScan/contract.ts`.
- Website receives a generated byte-identical copy at `src/lib/roomScan/contract.ts`.
- Planner receives a generated Deno copy at
  `supabase/functions/_shared/roomScan/contract.ts`. Its Zod import is rewritten from
  `zod` to the repository-pinned `npm:zod@...` import, so it is generated-equivalent rather
  than byte-identical.
- Add `scripts/sync-room-scan-contract.mjs` and expose it as `roomscan:sync`. It writes both
  generated targets when both repositories are available and always writes the Deno target.
- Add `scripts/check-room-scan-contract.mjs` as `roomscan:check`. It generates expected
  output in memory and fails on canonical/website or canonical/Deno drift.
- Make the existing `ai:sync-shared` package script call the room-scan sync after its current
  layout sync; do not assume its present `src/lib/layout` loop discovers `src/lib/roomScan`.
- Provenance is stored beside the website copy in `contract.lock.json`, not added as a
  website-only source header.
- `contract.lock.json` records canonical commit, schema version, canonical SHA-256, and
  generated Deno SHA-256.
- Website CI verifies that its copy matches the lock hash without requiring a sibling repo.
  A release workflow that checks out both repositories compares the actual canonical and
  website files.
- Planner adds a compile-time compatibility test against app-facing types.
- Both repositories run `roomscan:check` in CI. The canonical contract and this plan must be
  committed before the first lock file is generated.

## 6. Secure Handoff Architecture

### 6.1 Environment preflight

Before implementation:

1. Complete the Supabase unification runbook.
2. Confirm planner and website target the intended shared project in development and
   production without printing secrets.
3. Set a real production `VITE_PLANNER_URL`; production must never fall back to localhost.
4. Confirm current `jobs` RLS. Public enquiry creation will move server-side regardless.

### 6.2 Database changes

Add narrowly scoped fields to `planner_handoffs`:

- `public_token_hash text`
- `expires_at timestamptz`
- `payload_version integer not null default 1`
- `finalized_at timestamptz`
- `submission_key uuid`
- existing `consumed_at` and `job_id` remain

Add nullable fields to `jobs` for all new homeowner enquiries, including organic enquiries:

- `submission_key uuid`
- `submission_fingerprint text`
- `submission_fingerprint_version smallint`

Create a unique constraint on `jobs(submission_key)`. PostgreSQL permits multiple `NULL`
values under this constraint, while new homeowner submissions receive a conflict target that
can be used safely by `INSERT ... ON CONFLICT`.
The fingerprint is SHA-256 over a deterministic canonical JSON representation of the
validated enquiry payload plus the handoff ID (or explicit `null`), excluding the capability
token and volatile timestamps. Existing jobs remain `NULL`; every new homeowner enquiry
created by the submission RPC requires all three fields. Use a tested RFC 8785/JCS canonical
JSON implementation; do not depend on JavaScript object insertion order or ad hoc string
sorting.
Version 1 is `RFC8785-JCS + SHA-256`. Persist version `1` beside every new fingerprint and
include the algorithm version in RPC replay checks. A future algorithm change must retain the
old implementation for existing rows or migrate fingerprints with a proved equivalence path.

Add `planner_handoff_finalizations`:

- `handoff_id uuid not null references planner_handoffs(id) on delete cascade`
- `finalization_key uuid not null`
- `request_fingerprint text not null`
- `request_fingerprint_version smallint not null`
- `expected_payload_version integer not null`
- `status text not null` constrained to `pending | completed | failed`
- `result_payload_version integer`
- `failure_code text`
- `created_at`, `updated_at`, and `completed_at` timestamps
- primary key `(handoff_id, finalization_key)`

This table stores idempotency/audit metadata, not object paths, customer data, signed URLs or
capture payloads. Retain rows for at least the handoff retry window, then purge them with the
handoff/retention workflow.

Security changes:

- Remove anonymous `INSERT`, `SELECT`, and `UPDATE` access.
- Remove general authenticated `UPDATE` access.
- Add `staff` to `app_role` and add `is_bower_staff(user_id)` as a stable,
  `SECURITY DEFINER` helper with a fixed search path. It returns true only for explicit
  `staff` or `admin` roles in `user_roles`.
- **Migration ordering:** `staff` is added with `ALTER TYPE public.app_role ADD VALUE`.
  PostgreSQL cannot use a newly added enum value inside the transaction that adds it, and
  migrations run in transactions. The enum addition must be its own migration, applied
  before any migration, policy, or seed that references `'staff'`.
- Do not infer staff permission from `profiles.user_type = 'trade'`; a trade customer is not
  automatically Bower staff.
- `planner_handoffs SELECT` is permitted only through `is_bower_staff(auth.uid())`.
- Role assignment remains admin-only. Staff have no direct handoff mutation policy.
- Regenerate `src/integrations/supabase/types.ts`, add `staff` to the application `AppRole`,
  expose `isStaff`/`isStaffOrAdmin` from auth state, and add route tests.
- Staff UI is least-privilege: `/staff/leads` and `/staff/handoffs` may reuse shared lead/job
  components, while users, roles, pricing, supplier imports, settings and the existing full
  `/admin` layout remain admin-only. A Bower staff member who also needs trade-planner tools
  receives both the explicit `staff` role and `profiles.user_type = 'trade'`; the two concepts
  remain independent.
- All public and mutation paths use validated edge functions/RPCs.
- Add indexes for expiry, consumption and job ID; add uniqueness for `public_token_hash` and
  `jobs.submission_key`.
- Add the missing foreign key from `planner_handoffs.job_id` to `jobs.id` with
  `ON DELETE SET NULL`. The capture deletion workflow removes handoff payloads and storage
  objects explicitly before deleting/anonymizing rows, so a database cascade cannot orphan
  private objects.

**1A-min RLS floor:** before `create-planner-handoff`, `get-planner-handoff`, or
`submit-planner-enquiry` is deployed, drop anonymous handoff table access and the current
authenticated `SELECT USING (true)` / `UPDATE USING (true)` policies. Until the explicit
staff-role migration and UI are complete, no authenticated direct handoff `SELECT` policy is
preferable to retaining the broad policy; capability Edge Functions use the service role and
the restricted RPC path. This deny-by-default repair is not deferrable.

### 6.3 Public capability flow

1. Website calls `create-planner-handoff`.
2. Function validates the envelope, generates a high-entropy token, stores only its hash,
   sets a seven-day expiry, and returns `{ id, token }`.
3. Website opens `/wizard?handoff=<id>#handoffToken=<token>`.
4. Planner reads the fragment once, stores the token in tab-scoped session storage for
   refresh recovery, then immediately removes the fragment with `history.replaceState`.
5. Planner sends ID/token only in POST bodies to edge functions.
6. `get-planner-handoff` validates hash, expiry, state, rate limits, and payload; it returns
   only the permitted handoff fields.
7. Page load and refresh never consume the handoff.

### 6.4 Atomic enquiry submission

Do not insert the job and consume the handoff in separate browser requests.

The `submit-planner-enquiry` Edge Function does not perform multiple Supabase table calls and
call them a transaction. It performs strict Zod validation, applies public-endpoint rate
limits/bot protection, computes the token hash and submission fingerprint, then calls one
PostgreSQL function: `public.submit_planner_enquiry_v1(...)`.

The SQL function is `SECURITY DEFINER`, fully qualifies referenced objects, fixes its
`search_path`, revokes execute from `PUBLIC`, `anon`, and `authenticated`, and grants execute
only to `service_role`. It performs one database transaction:

1. Require a UUID `submission_key`, supported fingerprint version, fingerprint, and validated
   enquiry JSON.
2. Lock the handoff row with `FOR UPDATE` when a handoff is attached, then verify token hash,
   expiry, payload version and consumption state.
3. If that handoff is already consumed with the same key, compare the existing job
   fingerprint/context and return it as a replay; reject a different key.
4. Require any submitted room scan to satisfy `ConfirmedRoomScanV1`. The Edge Function runs
   the full Zod schema and the SQL function also checks the `state`/`confirmedAt` JSON
   invariants before writing.
5. Attempt the job insert with `INSERT ... ON CONFLICT (submission_key) DO NOTHING RETURNING
   id`.
6. If the insert conflicts, select the existing job. Recompute/compare using its persisted
   fingerprint version and return it only when version, fingerprint and handoff context match;
   otherwise reject key reuse.
7. Set `consumed_at`, `job_id`, and `submission_key` on the handoff when attached.
8. Commit and return only the job ID and an `idempotentReplay` flag.

The handoff is **optional**: organic visitors who start at `/wizard` with no `?handoff=`
submit through the same function. Their key and fingerprint are durable on the resulting job,
so a lost response can be retried without a handoff row. Generate the UUID before the first
submit attempt and retain it in recoverable wizard state until success. This path replaces
the wizard's current direct anonymous `jobs` insert; browsers receive no direct insert policy.

Database uniqueness, not an application-level pre-check, is the final concurrency guard.
Tests must exercise two simultaneous requests, same-key/same-payload replay, same-key changed
payload, and both handoff-linked and organic submission.

Trade creation uses a separate authenticated `link-trade-handoff` path. Remove the existing
on-load consumption call; link only after the trade job is successfully created.

### 6.5 Backend functions

Planner backend owns:

- `create-planner-handoff`
- `get-planner-handoff`
- `create-room-capture-upload`
- `finalize-planner-handoff`
- `submit-planner-enquiry`
- `link-trade-handoff`
- `create-room-capture-download`
- `purge-room-captures`

Restricted PostgreSQL functions own the operations that require row locks or multi-table
atomicity:

- `public.submit_planner_enquiry_v1` - called only by the submission Edge Function;
- `public.link_trade_handoff_v1` - verifies the authenticated caller may link the target
  job, locks the handoff, and links it only after the job exists; and
- `public.claim_planner_handoff_finalization_v1` and
  `public.complete_planner_handoff_finalization_v1` - own finalization-key replay state and
  the final handoff/version update around the non-transactional storage promotion.

Browser clients never call these SQL functions directly. Edge Functions remain responsible
for Zod validation, token hashing, authentication context, rate limiting and response
shaping; SQL functions remain responsible for locks, uniqueness and atomic writes.

`finalize-planner-handoff` requires a client-generated `finalization_key`, request fingerprint
and fingerprint version, plus the expected payload version. It claims
`planner_handoff_finalizations(handoff_id, finalization_key)` before storage promotion:

1. A completed matching key returns its recorded `result_payload_version`, even if the handoff
   later advanced through another finalization.
2. Reusing a key with different metadata/fingerprint fails.
3. A matching `pending` attempt resumes safely; a retryable `failed` attempt may be reclaimed
   under the same key without creating a second row.
4. A new key with a stale expected payload version returns a conflict.
5. After object verification/promotion, a restricted completion RPC locks the handoff, patches
   only capture draft/scan fields, increments `payload_version`, sets `finalized_at`, and marks
   the attempt `completed` with the resulting version in the same database transaction.

The function never replaces unrelated style, material or lead data. Multiple sequential draft
updates are allowed through different keys/expected versions, while every historical key keeps
its own replay result.

### 6.6 Public function security and observability

Apply one shared response/request helper to `create-planner-handoff`,
`get-planner-handoff`, `create-room-capture-upload`, `finalize-planner-handoff`,
`submit-planner-enquiry`, and `create-room-capture-download`:

- Read an exact production/development origin allowlist from configuration. Echo a matched
  origin and set `Vary: Origin`; never use `Access-Control-Allow-Origin: *` for scanner or
  handoff functions.
- Permit `OPTIONS` and the minimum required methods/headers. Data operations are POST-only;
  reject unexpected methods and oversized request bodies before JSON parsing.
- Return `Cache-Control: no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, and
  `X-Content-Type-Options: nosniff` on capability, handoff and signed-URL responses.
- Use stable public error codes and generic messages. Wrong token, unknown ID and unauthorized
  access must not reveal whether a handoff or object exists; expiry/consumption detail is
  returned only after a valid capability is established.
- Apply endpoint-specific limits by pseudonymous IP key, capability/handoff ID and account
  where available. `create` and `submit` include bot protection; upload/download/finalize
  receive tighter capability limits. Store only a short-lived HMAC/pseudonymous IP key, not a
  durable raw IP address.
- Generate a request ID and log only function name, outcome/error code, duration, byte/count
  totals and pseudonymous correlation IDs. Never log capability tokens or hashes, request
  bodies, lead contact data, storage paths, signed URLs, scan geometry, photos, or service
  role credentials.
- Configure alerts for token failures, throttling, upload rejection, transaction conflicts,
  finalization failures and purge failures without placing sensitive payloads in alert text.

The repository's existing wildcard-CORS Edge Function snippets are not the template for this
public capability flow. Add and test a scanner-specific shared helper before implementing the
first endpoint.

## 7. Private Capture Storage and Retention

### 7.1 Storage rules

- Bucket: `room-captures`, private.
- Upload prefix: `quarantine/handoffs/<handoff-id>/<random-object-id>`.
- Final prefix: `handoffs/<handoff-id>/<random-object-id>`.
- Signed upload URL lifetime: short, configurable.
- Maximum file size: 10MB.
- Maximum files per handoff: 15.
- Enforce a total per-handoff byte cap.
- Signed upload targets are random, single-object paths and do not permit client-selected
  prefixes or overwrite of a finalized object.
- Photo types are limited to the contract allowlist (JPEG/PNG). Artifact MIME/type allowlists
  are explicit per artifact kind; file extension and client `Content-Type` are not trusted.
- Before finalization, inspect the stored object's actual byte count and magic bytes, compute
  SHA-256 server-side, and compare them with the contract metadata. Decode-probe images and
  reject malformed data. HEIC is rejected server-side; decode-probing HEIC in the Edge
  runtime is impractical, so capture clients transcode to JPEG before upload. Do not unpack
  ZIP/USDZ/vendor archives in this public request path.
- Delete rejected or abandoned quarantine objects. Promote verified objects to the final
  prefix only after every object in the requested capture passes and the optimistic
  `payload_version` still matches.
- Finalization verifies every path belongs to the capability's quarantine prefix, then stores
  only the promoted final path. A promotion/database failure must leave no handoff referring
  to an unverified or missing object.
- Because object moves and PostgreSQL updates are not one transaction, use the matching
  `planner_handoff_finalizations` row as the retryable state machine. On database
  conflict/failure, mark a sanitized failure code and delete or re-quarantine any
  promoted-but-unreferenced objects; the daily purge also removes orphaned final/quarantine
  objects after a short grace period.
- Signed downloads can target finalized paths only; quarantine objects are never downloadable
  through the public capture API.
- Persist storage paths only. Signed URLs are generated on demand and never stored in JSON.

### 7.2 Retention

- Unconsumed/abandoned handoffs and capture objects: purge after 30 days.
- Consumed customer/job captures: use an approved retention period configured before
  production launch. Bower approves the period; treat home photos and scans as personal
  information regardless of whether Bower is formally an APP entity under the Australian
  Privacy Act, and state the collection purpose at capture.
- Deletion requests remove JSON references and storage objects.
- CubiCasa/RoomPlan vendor artifacts follow the same deletion ledger.

**Deletion work and audit proof are separate.** A restricted mutable work table may hold the
object paths, handoff/job IDs and vendor artifact references required while a deletion is in
progress. Delete that work row after all targets are removed or irrecoverably anonymized.

The append-only `capture_deletions` audit table retains only a random deletion request ID,
pseudonymous subject reference, object/vendor counts, request reason/category, requested-at,
completed-at, actor ID, outcome, and vendor deletion-confirmation ID where required. The
pseudonymous subject reference is an **HMAC over the customer identifier using a restricted,
rotatable ledger key** held by admins; an unkeyed hash of an email or phone number is
dictionary-reversible and defeats the ledger's purpose. The ledger must not retain object
paths, direct handoff/job IDs, email/phone/name, or raw vendor artifact references. Define
and enforce a retention period for the audit ledger itself.

`purge-room-captures` runs daily through Supabase scheduling. It supports dry-run mode,
records counts/errors, removes objects before rows, and is idempotent. Tests cover prefix
isolation, consumed records, partial failures, and repeated execution.

## 8. Planner Integration

### 8.1 Homeowner wizard

- Retrieve public handoffs through `get-planner-handoff`, never direct table access.
- Extract scan/draft mapping into pure testable functions.
- Apply only validated `ConfirmedRoomScanV1` geometry to design state; unconfirmed scans
  pre-fill the editor but never drive design generation until confirmed (Section 5.3).
- Display draft photos/partial dimensions as reference, not trusted layout input.
- Add water supply and hood duct to `RoomFeaturesEditor`.
- Display confidence and normalization warnings.
- Confirmation rebuilds and validates a fresh `ConfirmedRoomScanV1` with `confirmedAt`.
- Submit through the atomic `submit-planner-enquiry` function.
- Legacy/tokenless/invalid scans retain current manual behaviour without crashing.

### 8.2 Trade setup and planner

- Add openings/services to the trade setup config.
- Place the shared feature editor immediately after Room Shape/floor dimensions.
- Carry features through new-job, add-room, and edit-room mappings.
- Persist features in `TradeRoom.config` and job `design_data`.
- Preserve them through load/save round trips.
- Render openings and service markers in trade plan/3D views.
- Include features in plan-view PDF output.

Manual-placement warnings reuse shared geometry rules:

- doors/walkways conflict with base and tall cabinetry;
- windows conflict with wall cabinetry;
- vertical ranges prevent false warnings for valid base cabinetry below windows;
- warnings recompute after move, resize, rotate, delete, undo, and feature edits;
- Phase 1 warns but does not hard-block.

### 8.3 AI Designer integration

- `ConfirmedRoomScanV1.room` feeds the existing `DesignBrief.room`.
- AI never consumes `adapterState` or unconfirmed partial geometry.
- AI proposals still pass deterministic compile, validation, and pricing.
- Refinement may propose validated room-feature patches, but applying one uses
  `applyRoomPatch()`, produces `UnconfirmedRoomScanV1`, and requires `RoomFeaturesEditor`
  reconfirmation before design generation or submission resumes.
- Stored captures use private paths; temporary signed URLs are resolved only for approved
  vision requests.

## 9. Website Integration

### 9.1 Shared prerequisites

- Configure `VITE_SUPABASE_URL`, publishable key, and production `VITE_PLANNER_URL`.
- Consume the generated contract copy and lock file.
- Replace direct REST writes to `planner_handoffs` with edge-function calls.

### 9.2 Planner page and flat-lay journey

- `/planner` creates a tokenized handoff and opens the public `/wizard` route.
- Every customer-facing planner link points to `/wizard`, never planner root/trade routes.
- Flat-lay selections use the same secure handoff function.
- Local storage remains a pre-submit draft only.
- Wrong/expired tokens show a recoverable manual-start state without leaking data.

### 9.3 Quote/capture draft

- Retain real `File[]` objects until upload completion.
- Transcode HEIC to JPEG client-side, then preflight size/count/type and compute SHA-256
  before requesting signed URLs; these client checks improve feedback but never replace
  server verification.
- Create the capability before uploading.
- Upload to quarantine and show per-file progress and retry/failure states.
- Generate one `finalization_key` per logical draft update before its first finalize attempt
  and retain that key for every retry; a later update uses a new key and current payload version.
- Finalize with declared metadata, verified promoted paths and optimistic `payload_version`.
- Photos or rough dimensions create `RoomCaptureDraftV1`.
- Complete adapter geometry creates `UnconfirmedRoomScanV1`; create
  `ConfirmedRoomScanV1` only after editor confirmation.
- The durable handoff/enquiry is the system record; mailto may remain an optional
  notification but must not be described as durable submission.

## 10. Scanner Technology Tracks

### 10.1 WebXR customer scanner

Use secure-context feature detection for `navigator.xr` and `immersive-ar`, then verify an
ARCore-supported device and required session features. The device/browser capability check,
not user-agent sniffing, controls whether the scanner or manual fallback opens. The guided
flow:

1. Compatibility check and manual fallback.
2. Tracking stabilization guidance.
3. Corner capture and closure check.
4. Canonical wall assignment and coordinate-frame creation.
5. Door/window capture.
6. Service-point capture.
7. Optional private photos.
8. Rectangle normalization and validation.
9. Mandatory `RoomFeaturesEditor` confirmation.

Incomplete sessions persist a recoverable draft. Non-rectangular geometry stores the raw
artifact/partial polygon, uses a warned bounding rectangle only after explicit confirmation,
and never pretends to be a true L-shape.

Reference: [Google WebXR requirements](https://developers.google.com/ar/develop/webxr/requirements).

### 10.2 RoomPlan staff pilot

- Native iOS/iPadOS app for controlled LiDAR devices.
- Staff authentication required.
- Convert walls/openings into the same rectangle-normalized contract.
- Store encoded `CapturedRoomData` or `CapturedRoom` JSON as the structured private raw
  artifact, together with RoomPlan/app version and device-model metadata needed to reproduce
  the adapter result.
- Store USDZ only as an optional secondary visualization artifact; it is not the semantic
  source of truth.
- Attach to a trade job through authenticated backend functions.
- Use the same confirmation and tape-measure benchmark as WebXR.
- Do not call it check-measure tooling until measured accuracy passes the approved gate.

References: [Apple RoomPlan](https://developer.apple.com/documentation/roomplan) and
[CapturedRoomData serialization](https://developer.apple.com/documentation/roomplan/capturedroomdata).

### 10.3 Native Android ARCore contingency

Build this only when D1 evidence shows WebXR misses an agreed requirement that native ARCore
can address and Bower approves app distribution. The spike must name the failed WebXR metric,
not simply assume native is more accurate.

- Use the official ARCore SDK in a small Kotlin Android app; do not reimplement tracking.
- Maintain an explicit supported-device list and detect optional capabilities such as depth
  at runtime.
- Reuse the same guided corner/opening/service workflow, contract, transform, private upload,
  confirmation UI and benchmark fixtures.
- Authenticate staff/customer capability before upload and use the same backend functions.
- Produce an unconfirmed scan; planner confirmation remains mandatory.
- Compare completion, p95 error, tracking loss and engineering/support cost directly with the
  WebXR pilot before production approval.

Reference: [ARCore supported devices](https://developers.google.com/ar/devices).

### 10.4 CubiCasa decision spike

Before implementation, confirm:

- Australian availability and commercial terms;
- machine-readable walls/openings/dimensions, not only images;
- processing SLA and webhook behaviour;
- SDK/licensing requirements;
- storage region, retention, deletion, and data rights;
- sample output mapping into the contract.

Separate normal CubiCasa service availability from the GoToScan invitation product. The
vendor currently describes GoToScan/customer invitation as US-only, so it is unsuitable for
the immediate Australian homeowner flow unless the vendor contract confirms otherwise.
Record dated evidence because regional terms can change.

References: [CubiCasa geographic limitations](https://help.cubi.casa/en/articles/9970400-geographic-limitations-to-cubicasa-services),
[GoToScan availability](https://help.cubi.casa/en/articles/8894475-introduction-to-gotoscan), and
[GoToScan API](https://integrate.docs.cubi.casa/create-a-gotoscan-order-20093455e0).

## 11. Accuracy and Go/No-Go Protocol

### 11.1 Discovery

- At least five furnished kitchens.
- At least 20 attempted captures across the discovery set, retaining failures and abandoned
  sessions rather than analysing successful scans only.
- Include plain walls, occlusions, reflective surfaces, wide rooms, and tracking loss.
- Observe non-technical users without coaching beyond the product UI.
- Use discovery to revise guidance and identify device exclusions; it is not the production
  p95 approval sample.

### 11.2 Benchmark

- At least 60 attempted captures, including failures, across the frozen release candidate.
- At least four representative device cohorts and at least 15 attempts per cohort. Record
  device model, OS, browser/app, AR runtime and scanner build versions.
- At least 60 wall observations and 25 opening width/offset observations in every supported
  device cohort (at least 240 walls/100 openings across the minimum four cohorts). A cohort
  that cannot meet both minimums is not approved as supported.
- Use multiple users, repeated captures and a fixed mix of easy/difficult kitchens.
- Record tape/laser reference measurements independently before revealing scanner results.
- Measure signed and absolute wall-length, opening-width and opening-offset error.
- Measure polygon closure error.
- Measure unaided completion, abandonment reason, tracking-loss rate, retry rate and
  time-to-complete across all attempts.
- Pre-register the quantile estimator and interval method. Report p50, p90 and p95 with 95%
  confidence intervals using a device-stratified cluster bootstrap that resamples complete
  capture attempts, keeping all walls/openings from an attempt together. Where users or
  kitchens are repeated heavily, block/resample at that higher cluster and include a
  sensitivity result. Do not calculate confidence intervals by treating every wall row as an
  independent scan.
- Report completion with an attempt-level binomial interval and publish the raw anonymized
  measurement rows used for the calculation.
- Report pooled and per-device results. A pooled pass cannot hide a failing supported device;
  remove or separately gate a cohort that lacks enough evidence or misses tolerance.

Initial evaluation targets:

- wall-length p95 at or below 50mm;
- opening width/offset p95 at or below 75mm;
- closure error at or below 1%;
- unaided completion at or above 80%.

Bower approves the final quote-grade tolerance after reviewing evidence. No scanner result
is approved as manufacturing-grade by this gate. Any scanner/runtime change that can affect
tracking or geometry reruns a proportionate regression benchmark before release.

## 12. Testing and Acceptance

### 12.1 Contract fixtures

Valid fixtures:

- manual rectangle;
- WebXR unconfirmed rectangle with invertible coordinate frame;
- confirmed copy rebuilt after editor acceptance;
- RoomPlan rectangle plus serialized structured source fixture;
- CubiCasa sample (unconfirmed);
- photo-only draft;
- abandoned partial-corner draft with coordinate frame;
- legacy handoff without scan;
- legacy invalid partial scan stamp.

Invalid fixtures:

- missing/unknown schema version;
- non-integer units;
- opening/service overflow;
- duplicate IDs;
- invalid vertical dimensions;
- confidence outside range;
- scanner L-shape;
- singular, non-finite or negative-determinant coordinate matrix;
- canonical draft corners without a coordinate frame;
- `state: 'confirmed'` without `confirmedAt`;
- `state: 'unconfirmed'` with `confirmedAt`;
- `confirmedAt` earlier than `capturedAt`;
- non-positive room revision or `confirmedRevision !== roomRevision`;
- new handoff missing `handoffSchemaVersion: 1`;
- handoff containing both `roomScan` and `roomCaptureDraft`;
- handoff containing capture data plus conflicting top-level dimensions;
- persisted signed URL;
- HEIC photo media type;
- non-JSON or oversized adapter state/photo/artifact list.

Contract tests map representative source points to canonical coordinates and back through the
inverse matrix. The recovered source points must remain within the adapter's stated numeric
tolerance.

### 12.2 Security tests

- correct, wrong, expired, and reused tokens;
- token never appears in server request URL/referrer;
- refresh before submit remains usable;
- public capability responses use exact-origin CORS, `Vary: Origin`, and `no-store` headers;
- unknown ID, wrong token and unauthorized object responses do not reveal resource existence;
- scanner endpoint logs contain no token/hash, PII, geometry, storage path or signed URL;
- endpoint/body/rate limits and bot-protection challenges fail closed;
- anonymous direct table writes fail;
- the 1A-min migration removes broad authenticated `SELECT`/`UPDATE`; anonymous, consumer,
  trade-customer and ordinary authenticated direct handoff access fails before staff exists;
- after the staff migration, explicit staff/admin reads succeed while consumer and non-staff
  trade reads still fail;
- generated Supabase/app role types include `staff`; staff route guards permit only staff
  lead/handoff surfaces and deny full admin pages;
- all direct authenticated handoff updates fail;
- `submit_planner_enquiry_v1` execute permission is limited to `service_role`;
- same-key/same-fingerprint replay returns one job for linked and organic submissions;
- RFC 8785/JCS known vectors pass and fingerprint version 1 is stable across deployment/retry;
- an unsupported fingerprint version fails without silently recomputing under a new algorithm;
- same-key/different-fingerprint or different-handoff reuse fails;
- simultaneous matching submissions create one job through the unique database index;
- simultaneous different submissions against one handoff produce one winner;
- server rejects a draft or unconfirmed scan even when the browser request bypasses the UI;
- strict new writes reject malformed nested scan data;
- tolerant legacy reads recover valid lead/style fields and report nested scan issues;
- upload path/count/type/size limits plus MIME spoof, malformed image, checksum mismatch and
  quarantine-only download rejection;
- same-key finalization replay succeeds while changed-metadata reuse fails;
- an old completed finalization key returns its recorded result after a later key advances the
  handoff; simultaneous finalizations serialize on payload version;
- stale-version finalization cleans or re-quarantines promoted-but-unreferenced objects;
- cross-handoff object finalization fails;
- signed download expiry;
- cleanup dry-run and idempotency;
- completed deletion audit rows contain no direct customer, handoff/job, object-path, or raw
  vendor-artifact references.

### 12.3 Integration tests

- Website planner -> tokenized handoff -> public wizard prefill.
- Flat-lay -> tokenized handoff -> style and scan fields preserved.
- Scan -> wizard state -> confirmation -> `design_data` round trip.
- Draft-only handoff shows references without invented geometry.
- Unconfirmed scan pre-fills the editor but cannot reach design generation or
  submitted `design_data` until confirmed.
- Any manual, AI, adapter or trade patch to dimensions/openings/services increments
  `roomRevision`, returns an unconfirmed scan, and blocks generation/submission until the
  editor reconfirms it.
- Browser-tampered unconfirmed scan is rejected by `submit-planner-enquiry`.
- Homeowner submission atomically creates and links one enquiry.
- Handoff-less wizard submission creates exactly one enquiry through
  `submit-planner-enquiry`.
- Trade creation consumes only after success.
- Trade room create/edit/load preserves openings/services.
- Category/height-aware placement warning matrix.
- Door/window rendering in homeowner and trade scenes.
- Plan-view PDF includes openings/services.
- Existing legacy jobs and handoffs load unchanged.

### 12.4 Generated contract tests

- Planner canonical contract compiles against app-facing room/opening/service types.
- Website generated file SHA-256 equals the canonical hash in `contract.lock.json`.
- Deno generated output equals the expected import-rewritten output.
- `roomscan:check` fails after intentional drift in each target and passes after sync.
- Planner and website CI execute the check through named package scripts.

### 12.5 Accuracy evidence checks

- Analysis includes failed/abandoned attempts in completion and tracking-loss denominators.
- A fixture dataset verifies signed/absolute error, p50/p90/p95, attempt-level completion
  intervals and capture-clustered/device-stratified confidence-interval code.
- A duplicated-wall fixture proves that adding correlated rows inside one capture does not
  falsely narrow the interval as if they were independent attempts.
- The report fails validation when any required device cohort is missing or under-sampled.
- The report fails validation when pooled results pass but a supported device cohort fails.
- Evidence records scanner, browser/app, OS, AR runtime and device versions.
- Raw evidence rows are anonymized and contain no customer contact or capture-photo data.

Use the repository's existing Node/esbuild smoke-test pattern or add Vitest deliberately.
Whichever is chosen must be wired to explicit package scripts and CI. Test files that no
script executes do not count.

## 13. Delivery Phases

### Phase 0: Documentation and environment repair

- Add this plan and its referenced planning documents to version control and commit the
  canonical baseline before generating a lock file.
- Complete environment unification/configuration.
- Restore truncated AI Designer documents.
- Add superseded/canonical ownership banners.
- Update build status against current code/deployment state.

### Phase 1A: Contract and secure handoff

- Discriminated contract, invertible coordinate frame, strict-write/tolerant-read parsers,
  and fixtures.
- Database migration, explicit staff role/RLS repair, job submission-key uniqueness, and
  restricted transaction RPC.
- Generated Supabase role types, auth state and least-privilege staff routes.
- Shared public-function CORS, caching, redaction, rate-limit and error-response helper.
- Secure create/get functions.
- Atomic enquiry submission and trade linking.
- Contract sync workflow.

**Minimum shippable subset (1A-min).** This subset includes all of the following:

- strict V1 contract, compatibility fixtures and tolerant legacy reads;
- handoff token/expiry migration;
- `jobs.submission_key`, versioned JCS fingerprint fields, unique constraint and restricted
  atomic submission RPC;
- removal of anonymous table access and broad authenticated handoff `SELECT`/`UPDATE`
  policies, leaving direct handoff access deny-by-default;
- RFC 8785/JCS fingerprinting from the first deployment with known-vector/replay tests;
- `create-planner-handoff`, `get-planner-handoff`, and `submit-planner-enquiry`; and
- the shared CORS, no-store, generic-error, body-limit, rate-limit and redacted-log helper.

This fixes the anonymous flat-lay -> wizard journey and safely unblocks Phase 1B. Only
external bot-provider integration (endpoint rate limits still apply), alert wiring, explicit
staff-role read policy/UI, and Phase 1C quarantine storage may follow without blocking 1B.
The staff follow-up starts from no direct handoff access and must complete before production
launch; it must never temporarily retain the old broad authenticated policies.

### Phase 1B: Planner and trade integration

- Homeowner mapping/confirmation/submission.
- Trade feature editor and persistence.
- Opening-aware manual placement warnings.
- Rendering/PDF completion.

### Phase 1C: Private capture intake

- Signed quarantine upload, byte-level verification, retry-safe promotion/finalization, and
  finalized-only download.
- Durable `planner_handoff_finalizations` claim/completion state and replay cleanup.
- Quote draft flow.
- Draft promotion.
- Scheduled retention cleanup.

### Phase 2: Scanner pilot selected by D1

- WebXR discovery and benchmark, or RoomPlan staff pilot.
- Production work proceeds only after the gate passes.

### Phase 3: Vendor/native expansion

- CubiCasa adapter if due diligence passes.
- Native Android only if WebXR fails and app distribution is approved.
- True polygon/L-shape room model as a separate planner-wide milestone.

## 14. Indicative Effort

| Delivery block | Indicative effort |
|---|---:|
| Documentation/environment repair | 1-3 days |
| Contract, fixtures, test wiring | 5-8 days |
| Secure handoff, public-function controls and atomic submission | 6-10 days |
| Quarantined private storage, finalization and retention | 5-8 days |
| Homeowner/trade integration | 5-8 days |
| Website planner/flat-lay/quote integration | 4-7 days |
| WebXR discovery prototype | 2-3 weeks |
| Production WebXR hardening if green | 3-5 additional weeks |
| RoomPlan staff pilot | 3-5 weeks after foundation |
| Native Android ARCore contingency spike | 2-3 weeks after a documented WebXR failure |
| Production native Android hardening if selected | 4-8 additional weeks |
| CubiCasa commercial/API decision spike | 3-5 days plus vendor response time |

These estimates assume both apps can use the same Supabase backend and existing deployment
access is available. The 1A-min subset (Phase 13/1A) is the earliest point at which the
live anonymous-prefill defect is fixed in production; schedule it ahead of the remaining
hardening.

### 14.1 Compressed back-to-back schedule

The table above is the conservative baseline: sequential solo implementation with idle time
between blocks. The compressed schedule below reaches the same Phase 1A/1B acceptance in
13-17 working days (~3 weeks) instead of 26-44, without weakening any Section 5-7 invariant.
Compression comes from execution mode and sequencing, not scope:

1. **Back-to-back agent-implemented runs with engineer review.** This specification is now
   detailed enough that most foundation work is mechanical; each run's exit gate (typecheck +
   tests + build, plus the run's named acceptance checks) replaces block-boundary idle time.
2. **Merge six blocks into four runs** with combined exit gates (below).
3. **Vetted libraries over hand-rolls.** Mandatory RFC 8785/JCS uses the reference
   `canonicalize` npm package plus the known-vector tests (~0.5 day), not a custom
   serializer.
4. **Overlap where dependencies allow.** The website run needs only Run 2's deployed
   functions and the Run 1 contract copy — it may run in parallel with the trade slice.
5. **1A-min deferrals stand** (external bot provider, alert wiring, staff read UI, Phase 1C
   quarantine storage) and land as fast-follows before production launch.

| Run | Scope (exit gate) | Effort |
|---|---|---:|
| Run 0 (manual) | Commit docs baseline, env unification, D1 note | 0.5 day |
| Run 1 | Contract + coordinate frame + fixtures + sync/check scripts (all fixtures pass via named scripts) | 2-3 days |
| Run 2 | Migrations (enum-first ordering), deny-by-default RLS, submission RPC + JCS fingerprints, create/get/submit/link functions, shared security helper (tokenized E2E + idempotency tests pass) | 4-5 days |
| Run 3 | Homeowner mapping/confirmation/submission + trade features/persistence/warnings/rendering (round-trip + legacy tests pass) | 3-4 days |
| Run 4 | Website: contract copy + lock, tokenized /planner + flat-lay, /wizard link fixes (cross-repo E2E passes); may overlap Run 3 | 2-3 days |
| Test pass | Full automated suites + scripted manual QA of the seven core journeys; findings logged with severity | 2 days |

Fast-follow before launch (may start during the refine loop): Phase 1C quarantine storage +
`planner_handoff_finalizations`, staff read UI/routes, bot provider, alerts — 5-8 days.

The compressed schedule fails — revert to the baseline table — if any of these hold: the
Supabase environments are still split after Run 0, engineer review capacity is not available
at each run boundary, or the test pass produces blocker-density high enough that refine runs
exceed two days each. Do not compress by skipping a run's exit gate; a red run is fixed
before the next run starts.

`ROOM-SCANNER-BUILD-RUNBOOK.md` carries the operational detail (per-run prompts, QA script,
refine loop) and must stay consistent with this section and with 1A-min.

## 15. Definition of Done

The foundation is complete only when:

- public handoffs work without public table access;
- 1A-min has removed the legacy broad authenticated handoff `SELECT`/`UPDATE` policies;
- only explicit staff/admin roles can read handoff rows directly;
- generated database types, auth state and least-privilege `/staff` routes recognize `staff`
  without granting full admin access;
- job creation and handoff consumption run in one restricted PostgreSQL RPC;
- linked and organic submission keys are database-unique, fingerprint-bound, atomic, and
  idempotent under concurrency;
- submission fingerprints use persisted/versioned RFC 8785/JCS from the first release;
- strict V1 writes require the version, reject conflicting capture representations and reject
  malformed scans while tolerant legacy reads preserve useful fields;
- the complete source-to-canonical transform survives and inverts across every round trip;
- every stored draft canonical corner set has its source-to-canonical frame;
- complete scans and incomplete drafts are never confused, and unconfirmed scans never
  drive design generation or submitted `design_data`, including through direct API calls;
- any room dimension/opening/service patch increments revision, invalidates confirmation and
  requires editor reconfirmation;
- no persisted JSON contains signed URLs;
- public scanner functions enforce exact-origin CORS, no-store responses, generic errors,
  redacted logs, body/rate limits and bot protection;
- uploads remain quarantined until actual bytes, size, hash and decodability pass;
- every finalization key has durable attempt/result state, remains replayable after later
  updates, and cannot leave a handoff referring to an unverified/missing object;
- private object access, orphan cleanup and retention are tested;
- homeowner and trade flows preserve openings/services;
- manual trade placement warns correctly around openings;
- old jobs/handoffs remain compatible;
- canonical, website, and Deno contract copies pass drift/provenance checks;
- RoomPlan structured source data can be re-adapted independently of USDZ;
- deletion proof contains no direct references to deleted capture objects or customers;
- both repositories build and all explicit tests pass;
- deployment configuration is verified;
- D1 records its owner, audience, selected track, date, budget and supported devices; and
- the selected scanner track passes the per-device, capture-clustered, adequately sampled
  evidence gate.

Do not begin production scanner UI until Phase 1A acceptance is green. Do not launch it until
Phases 1A-1C are green, D1 is approved, and the selected pilot passes Section 11.
