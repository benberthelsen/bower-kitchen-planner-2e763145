# Room Polygon Geometry — Plan, Critique, First Slice (2026-07-21)

Roadmap step 3. Make one authoritative room-geometry model that the scanner,
engine, validation, pricing and 3D all read, so L-shapes (and later any shape)
are handled properly instead of the current bounding-box approximation. This
doc plans it, re-examines the plan against real kitchen CAD, then defines the
first coding slice actually implemented in this batch.

## 0. Ground truth (what the code does today)

- `RoomConfig` = `{ width, depth, height, shape:'Rectangle'|'LShape',
  cutoutWidth, cutoutDepth, openings[], services[] }`. Openings/services attach
  to a `wall: 'N'|'E'|'S'|'W'` + `offsetMm`.
- **The L cutout is hardcoded to the SE (front-right) corner.** UnifiedScene
  draws the two notch walls at `x=cutoutWidth` (z from depth−cutoutDepth to
  depth) and `z=depth−cutoutDepth` (x from cutoutWidth to width). There is **no
  `cutoutCorner` field** — the corner is implicit.
- Consequence for an SE cutout: the **N and W walls stay full length; only E
  and S are shortened** (E to depth−cutoutDepth, S to cutoutWidth). The removed
  rectangle is `[cutoutWidth,width] × [depth−cutoutDepth,depth]`.
- `compileSpec`/`geometry.ts` use `wallLength(wall) = width|depth` (full
  bounding box) and ignore the cutout entirely. So a run on the E or S wall, or
  an island, can be placed into the void; `validate`'s `out-of-room` only tests
  the outer rectangle, so it passes them. **That is blocker 6.5.**
- Rotation convention (fixed 20 Jul): N:0, E:90, S:180, W:270, applied by
  `CabinetMesh` as `-degToRad(θ)`.
- Wall constants: `WALL_THICKNESS=200`, base depth 575, tall 580, wall-cab 350.

## 1. Plan v1 — the polygon model

**Core types** (`src/lib/layout/polygon.ts`, new, pure):
- `Vec2 { x, z }` (mm, plan coords; x→right, z→into-room-from-N).
- `WallSegment { id, a:Vec2, b:Vec2, length, normal:Vec2 (unit, into room),
  rotation (the cabinet rotation for a run on this segment), legacyWall?:Wall }`.
- `RoomPolygon { vertices:Vec2[] (ordered, closed), segments:WallSegment[],
  area }`.

**Bridge** — `polygonFromRoom(room): RoomPolygon`. The compact `RoomConfig`
stays the wire/storage format; the polygon is derived from it. Rectangle → 4
vertices/segments mapped to legacy N/E/S/W. LShape → 6 vertices with the cutout
removed from the chosen corner; the 4 outer segments keep their legacy wall id
(possibly shortened), the 2 notch segments get fresh ids.

**Operations** the engine/validation need:
- `pointInPolygon(p, poly)` (ray cast) and `rectInsidePolygon(rect, poly)`
  (all corners in + no edge crossing) — the authoritative in-room test.
- `rotationFromNormal(n)` — segment inward normal → cabinet rotation.
- `segmentToWorld(seg, t, widthMm, depthMm)` — generalises `wallToWorld`.
- `usableIntervalsOnSegment(seg, openings)` — generalises `usableIntervals`.
- vertex adjacency + interior angle (for corner-cabinet decisions).

**Wiring order:** model → authoritative validation (in-polygon) → compileSpec
segment placement → un-gate L-shape → re-implement the 10 `scope:'spatial'`
rules on the polygon → scanner 2D confirm edits the polygon → contract v2.

## 2. Fresh eyes vs real-world kitchen CAD — what v1 misses

Comparing to how real planners (2020, ProKitchen, Winner, IKEA/SketchUp) model
rooms surfaced five concrete improvements:

1. **Cutout corner must be explicit.** Real L-kitchens put the notch in any of
   the four corners (chimney breast, hallway, ensuite intrusion). v1 inherited
   the hardcoded SE. → **Add `cutoutCorner:'NE'|'NW'|'SE'|'SW'` to RoomConfig,
   default `'SE'`** (backward-compatible with today's rendering and data).

2. **The notch creates two *usable* wall segments.** The inside faces of an L
   are prime cabinet real estate — real designs run cabinets along them. v1
   only shortens the outer walls. A complete solution places runs on
   *segments*, which means `Run.wall: Wall` eventually becomes a segment
   reference. That's a DSL change, so **phase it**: slice 1 makes geometry
   authoritative and rejects void placement; a later slice adds segment-native
   runs to actually *use* the notch walls.

3. **Corner-cabinet logic keys off interior angle, not "two walls touch."** A
   rectangle's four 90° interior corners are corner-cabinet spots. An L adds a
   **270° reflex vertex** (the inside of the L) which is *not* a corner-cabinet
   spot — runs just end there with end panels. The current `sharedCornerAt`
   assumes rectangular adjacency and would mis-handle this. → the polygon
   computes interior angles; corner cabinets only at ~90° interior vertices
   where two runs meet.

4. **Scans are never perfectly orthogonal.** Real tap-to-measure gives walls a
   degree or two off square. The polygon should tolerate near-orthogonal and
   snap to 90° for beta (full non-orthogonal support later). → note for the
   scanner-confirm slice; assume orthogonal now.

5. **Don't migrate storage yet.** Arbitrary-polygon *storage* is a
   scanner-contract v2 concern with a data migration. Keep `RoomConfig`
   (+`cutoutCorner`) as the compact format and derive the polygon. → contract
   v2 is later; nothing stored changes in slice 1.

**Revised plan (v2):** same model, plus explicit `cutoutCorner`; interior-angle
-aware corners; segment-native runs and scanner/contract changes explicitly
deferred to later slices. The rotation-from-normal math is **verified against
the legacy rectangle oracle** (N/E/S/W must reproduce 0/90/180/270 exactly)
rather than trusted by hand — orientation sign errors are the classic trap.

## 3. First coding slice (this batch) — model + authoritative validation

Scope chosen to deliver the foundation and the *core* of the 6.5 fix without
destabilising the working generator in the same turn:

1. **`polygon.ts`** — the model and all pure ops above, with
   `polygonFromRoom` handling Rectangle and LShape (all four `cutoutCorner`
   values). Heavily tested; the rectangle path reproduces the legacy
   rotations/offsets exactly (oracle).
2. **`cutoutCorner`** added to `RoomConfig` (optional, default `'SE'`) and to
   the layout `RoomSpec`/schema passthrough — backward compatible.
3. **Authoritative in-room validation** — the `out-of-room` hard rule now tests
   `rectInsidePolygon` against the real polygon. For a Rectangle the polygon IS
   the bounding box, so behaviour is identical (sweep stays green). For an
   LShape it now **rejects any cabinet in the cutout void** — phantom cabinets
   can no longer pass validation. This is the concrete core of 6.5.

**Deliberately NOT in slice 1** (next slice, its own batch): changing
`compileSpec` placement to use segments (shorten E/S, run along the notch),
then un-gating L-shape generation. Until then the wizard L-shape gate stays;
the engine is simply now *honest* about L-shapes (rejects void placement)
instead of silently accepting them. The rectangle path — everything the beta
actually generates today — is provably unchanged.

**Verification:** rectangle oracle (rotations/offsets match `wallToWorld`);
`pointInPolygon`/`rectInsidePolygon` unit tests incl. the reflex corner and all
four cutout corners; the 18-check engine smoke and the placement sweep stay
identical for rectangles (0 errors); a new L-shape test shows a void placement
is rejected and an in-bounds placement passes.

---

## 4. Slice 1 — IMPLEMENTED & VERIFIED (2026-07-21)

Shipped to disk (uncommitted):

- **`src/lib/layout/polygon.ts`** (new) — the model + all pure ops:
  `polygonFromRoom` (Rectangle + LShape, all four `cutoutCorner` values, SE =
  the current rendering exactly), `segmentToWorld`, `rotationFromNormal`,
  `pointInPolygon`, `rectInsidePolygon`, `interiorAngles`, adjacency helpers.
- **`src/lib/layout/rules.ts`** — the `out-of-room` hard rule now tests
  `rectInsidePolygon` against the real polygon.
- **`src/lib/layout/index.ts`** — exports the polygon API.

Verification (all in the sandbox against the transpiled engine):
- **Oracle — 43/43** (`backups/polygon.test.cjs`): for a rectangle the four
  segments reproduce `WALL_ROTATION` and `segmentToWorld == wallToWorld` at
  sampled offsets/dims exactly; `rectInsidePolygon` matches the legacy
  bounding-box test; interior angles are 90°. For an L: area = box − cutout,
  void points/rects excluded for all four corners, notch-straddle rejected, one
  ~270° reflex + five ~90° vertices.
- **No regression:** 18/18 engine smoke; placement sweep byte-identical
  (2,774 candidates, 0 errors); rules-engine 17/17.
- **L-shape integration — 5/5** (`backups/l-shape-integration.test.cjs`):
  re-validating a compiled design against an L-room flags *exactly* the void
  cabinets (not more, not fewer), leaves the rectangle at 0 out-of-room errors,
  and doesn't false-flag safe cabinets. The engine is now **honest** about
  L-shapes instead of silently accepting phantom cabinets.

### Scope notes / deferred (deliberate)
- `cutoutCorner` is fully supported and tested in `polygonFromRoom` (default
  `'SE'` via a cast) but is **not yet a typed `RoomConfig` field or UI-settable**
  — that lands with the rendering/scanner slice, since nothing sets it today
  (all L-rooms are SE). No behaviour or data changes now.
- `compileSpec` placement is **unchanged** — it still positions on the four
  canonical walls with bounding lengths. So L-shape candidates that place into
  the void are now *rejected* by the new rule (correct, honest) rather than
  fixed; the wizard L-shape gate stays until slice 2.

### Slice 2 (next batch)
Make `compileSpec` polygon/segment-aware: shorten E/S arms via segment lengths,
run cabinets along the notch segments, use `interiorAngles` for corner-cabinet
placement (90° corners only, not the reflex), then **un-gate L-shape
generation**. After that, re-implement the remaining nine `scope:'spatial'`
rules on the polygon and thread `cutoutCorner` through the model + 3D rendering.

---

## 5. Slice 2 — L-SHAPE PLACEMENT IMPLEMENTED & VERIFIED (2026-07-21)

`compileSpec` is now polygon/segment-aware. Three geometry calls were swapped
for their polygon equivalents (all reproduce the legacy math exactly for
rectangles, so the rectangle path is unchanged):
- `wallLength(wall)` → `segmentForWall(poly, wall).length` (L arms get their
  true shortened length);
- `wallToWorld(wall, …)` → `segmentToWorld(seg, …)` (base row, wall-cab row,
  rangehood);
- `sharedCornerAt(a, b)` → `segmentSharedCornerAt(segA, segB)` (an L's
  notch-separated walls no longer reserve a phantom corner).

Verification:
- **Rectangle path byte-identical:** 18/18 smoke, sweep 2,774 candidates / 0
  errors, polygon oracle 43/43, L-integration 5/5 — all unchanged.
- **L-shape now places validly** (`backups/l-shape-generation.test.cjs`):
  48/48 default L designs (4 sizes × 4 cutout corners × 3 strategies) place
  **void-free**; 402 cabinets checked, **0 in the void**; all 12 L candidate
  pools non-empty with 36 error-free candidates. Before this slice every L
  candidate carried void cabinets and was rejected.

### Un-gating — READY, recommend a 3D check first
The engine now produces valid L-shape designs, so the wizard's L-shape block
(`StepDesign.tsx` `isLShape` guard) can be lifted — a one-line change. Held
back from flipping live this turn only because: (a) UnifiedScene renders the
cutout for the **SE corner only** (the wizard's L-shapes are SE), and (b) a
human should eyeball one L in 3D (same caution as the corner blind-side check).
Recommend: verify an SE L-room in `npm run dev`, then remove the `isLShape`
generation block. Non-SE corners + `cutoutCorner` UI/rendering remain a later
slice (the model already supports all four).

### Still deferred (later slices)
Segment-native runs *along the notch* walls (the DSL still targets N/E/S/W, so
the notch interior faces aren't used for cabinets yet — the L is designed on
its outer walls); island auto-fit inside an L (a void island is currently
rejected by validation rather than repositioned); the other 9 `scope:'spatial'`
rules re-implemented on the polygon; scanner 2D-confirm editing the polygon.
