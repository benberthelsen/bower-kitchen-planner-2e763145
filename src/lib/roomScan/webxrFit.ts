/**
 * WebXR corner-fit → UnconfirmedRoomScanV1 (master plan §10.1, discovery).
 * Pure module — no React, no XR — so the geometry is unit-testable.
 *
 * The first marked edge is the user's main wall and becomes canonical N,
 * whichever way round the room it is walked.
 * 4, 5, 7 or 8 corners fit an axis-aligned rectangle whose wall lines sit at
 * the mean of the corners on them (not a bounding box, which reads noisy
 * corners as a larger room).
 * 6 corners attempt a rectilinear L-SHAPE fit: corner u/v values are
 * clustered and snapped; the missing bounding-box corner identifies the
 * notch; the coordinate frame is then composed with quarter turns so the
 * notch lands at canonical SE (the planner's LShape convention), recorded
 * honestly in snappedQuarterTurnDegrees. A 6-corner capture that is not
 * rectilinear within tolerance falls back to the bounding rectangle with a
 * warning — never silently (§3.7 policy).
 *
 * The capture can also carry a measured ceiling height and door/window/
 * walkway spans (buildScanFromCapture), and hidden corners can be derived
 * by intersecting two wall lines (intersectWallLines) when a benchtop
 * blocks the physical floor corner.
 *
 * The aim-ray helpers (floorPointFromRay, hiddenCornerFromAims,
 * wallPlaneHeightFromRay) need only tracking and the floor plane, so a corner
 * or ceiling can be read where ARCore has detected no plane at all. A
 * wall-edge ceiling is confirmed from two distances (confirmWallEdgeHeight)
 * and kept as an estimate.
 */

import { parseRoomScan, type RoomScanV1 } from './contract';

export interface XrCorner { x: number; z: number } // metres, XR local-floor plan

/** A door/window span marked in AR: two floor points at the opening's jambs. */
export interface XrOpeningMark {
  a: XrCorner;
  b: XrCorner;
  type: 'door' | 'window' | 'walkway';
}

export interface XrCaptureExtras {
  /** measured ceiling height in mm (from a ceiling reticle tap); omit = default */
  heightMm?: number;
  /** 'wall-edge': read from aims at a wall's top edge rather than a ceiling
   *  surface, so it is kept as an estimate. Omitted = a surface reading. */
  heightSource?: 'surface' | 'wall-edge';
  openings?: XrOpeningMark[];
}

export const MIN_ROOM_WIDTH_MM = 1200;
export const MIN_ROOM_DEPTH_MM = 1200;
export const RECT_WARN_MM = 50;
export const RECT_REJECT_MM = 250;
export const MIN_CORNER_SEPARATION_M = 0.25;
export const MAX_CAPTURE_CORNERS = 8;

/** Opening spans narrower than this are treated as accidental taps. */
export const MIN_OPENING_WIDTH_MM = 300;
/** An opening whose midpoint sits further than this from every wall is dropped. */
export const MAX_OPENING_WALL_DISTANCE_MM = 400;
export const MIN_CEILING_MM = 2100;
export const MAX_CEILING_MM = 4500;
/** L-fit: u/v values within this distance cluster to one wall line. */
export const L_CLUSTER_TOL_M = 0.18;
/** L-fit: a notch smaller than this is treated as a rectangle. */
export const MIN_CUTOUT_MM = 300;

const distance = (a: XrCorner, b: XrCorner): number => Math.hypot(a.x - b.x, a.z - b.z);
const cross = (a: XrCorner, b: XrCorner, c: XrCorner): number =>
  (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);

function properSegmentsCross(a: XrCorner, b: XrCorner, c: XrCorner, d: XrCorner): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function hasCrossedEdges(corners: XrCorner[]): boolean {
  for (let i = 0; i < corners.length; i++) {
    const nextI = (i + 1) % corners.length;
    for (let j = i + 1; j < corners.length; j++) {
      const nextJ = (j + 1) % corners.length;
      if (i === j || nextI === j || nextJ === i) continue;
      if (properSegmentsCross(corners[i], corners[nextI], corners[j], corners[nextJ])) return true;
    }
  }
  return false;
}

type Wall = 'N' | 'E' | 'S' | 'W';

/** Map a canonical-plan point (mm, NW origin, u∈[0,W], v∈[0,D]) to its nearest
 *  wall and the along-wall coordinate. Exported for the RoomPlan importer. */
export function nearestWall(
  u: number,
  v: number,
  widthMm: number,
  depthMm: number,
): { wall: Wall; along: number; distMm: number } {
  // Canonical wall offsets run CLOCKWISE round the perimeter — see the header
  // of src/lib/layout/geometry.ts and sharedCornerAt():
  //   N t0 = W corner, E t0 = N corner, S t0 = E corner, W t0 = S corner.
  // The canonical plan measures u from the west edge and v from the north
  // edge, so S and W must be mirrored. Returning the raw u/v here placed every
  // opening on those two walls reflected about the wall's centre, and the
  // layout engine then kept cabinets clear of the wrong end of the wall.
  const candidates: { wall: Wall; along: number; distMm: number }[] = [
    { wall: 'N', along: u, distMm: Math.abs(v) },
    { wall: 'S', along: widthMm - u, distMm: Math.abs(depthMm - v) },
    { wall: 'W', along: depthMm - v, distMm: Math.abs(u) },
    { wall: 'E', along: v, distMm: Math.abs(widthMm - u) },
  ];
  candidates.sort((a, b) => a.distMm - b.distMm);
  return candidates[0];
}

/** Clamp an along-wall span into [0, wallLength] preserving at least minWidth. */
export function clampSpan(
  start: number,
  width: number,
  wallLength: number,
): { offsetMm: number; widthMm: number } | null {
  let s = Math.max(0, Math.round(start));
  let e = Math.min(wallLength, Math.round(start + width));
  if (e - s < MIN_OPENING_WIDTH_MM) {
    // Try to widen back to the minimum inside the wall.
    e = Math.min(wallLength, s + MIN_OPENING_WIDTH_MM);
    s = Math.max(0, e - MIN_OPENING_WIDTH_MM);
    if (e - s < MIN_OPENING_WIDTH_MM) return null;
  }
  return { offsetMm: s, widthMm: e - s };
}

/** Two taps on wall A and two on wall B (plan coords, metres — wall-surface
 *  hits with Y dropped) → the walls' floor-junction lines intersected = the
 *  corner point, even when the physical floor corner is hidden behind an
 *  existing kitchen. Returns null when the taps are too close together or the
 *  walls are near-parallel (no trustworthy intersection). */
export function intersectWallLines(
  a1: XrCorner, a2: XrCorner,
  b1: XrCorner, b2: XrCorner,
): XrCorner | null {
  const MIN_TAP_SEPARATION_M = 0.15;
  if (Math.hypot(a2.x - a1.x, a2.z - a1.z) < MIN_TAP_SEPARATION_M) return null;
  if (Math.hypot(b2.x - b1.x, b2.z - b1.z) < MIN_TAP_SEPARATION_M) return null;
  const dax = a2.x - a1.x, daz = a2.z - a1.z;
  const dbx = b2.x - b1.x, dbz = b2.z - b1.z;
  const denom = dax * dbz - daz * dbx;
  const lenProduct = Math.hypot(dax, daz) * Math.hypot(dbx, dbz);
  // sin of the angle between the walls; < ~11.5° is too parallel to trust.
  if (Math.abs(denom) / lenProduct < 0.2) return null;
  const t = ((b1.x - a1.x) * dbz - (b1.z - a1.z) * dbx) / denom;
  return { x: a1.x + t * dax, z: a1.z + t * daz };
}

// ─── Aim-ray geometry ───────────────────────────────────────────────────────
// Ported from the owner's room scanner (roomCapture/cornerScan.ts). ARCore
// finds few vertical planes on plain plasterboard and may return hit-test
// results only inside a detected plane, but it always knows where the phone
// is and where the floor is. The aim is the centre of the view, where the
// reticle sits and where the viewer-space hit test points.

export interface XrVec3 { x: number; y: number; z: number }
/** The centre-of-view ray: the viewer pose's position and its -Z axis. */
export interface XrAim { origin: XrVec3; direction: XrVec3 }

/** A corner tap must land near the floor. local-floor reference space puts
 *  y = 0 at the floor, so this rejects taps that hit a benchtop or island. */
export const FLOOR_TOLERANCE_M = 0.25;
/** An aim must point at least this far down to meet the floor usefully. */
export const MIN_FLOOR_DEPRESSION_DEG = 5;
export const MIN_AIM_RANGE_M = 0.3;
export const MAX_AIM_RANGE_M = 12;
/** Two aims at a hidden corner edge must be at least this far apart. */
export const MIN_HIDDEN_AIM_ANGLE_DEG = 15;
/** Lowest ceiling reading accepted while scanning (the fit warns below 2100). */
export const MIN_CEILING_READING_MM = 2000;
/** 4-point fallback taps must be wall points above benchtop height and below
 *  the ceiling. Without this a benchtop top or the floor counted as a wall. */
export const WALL_TAP_MIN_Y_M = 1.0;
export const WALL_TAP_MAX_Y_M = 2.0;
/** A hit pose's Y axis is the surface normal. Above this |normal.y| the
 *  surface is level (floor, benchtop, ceiling); at or below it, upright (a
 *  wall, a cabinet front). */
export const LEVEL_NORMAL_Y = 0.7;
/** Two wall-edge ceiling readings must come from distances to the wall at
 *  least this far apart, and agree to within WALL_EDGE_MAX_SPREAD_MM. */
export const WALL_EDGE_MIN_STEP_M = 0.75;
export const WALL_EDGE_MAX_SPREAD_MM = 60;

const unit = (v: XrVec3): XrVec3 | null => {
  const l = Math.hypot(v.x, v.y, v.z);
  return l > 0 ? { x: v.x / l, y: v.y / l, z: v.z / l } : null;
};

const horizontal = (d: XrVec3): XrCorner | null => {
  const l = Math.hypot(d.x, d.z);
  return l > 0 && l >= 0.1 * Math.hypot(d.x, d.y, d.z) ? { x: d.x / l, z: d.z / l } : null;
};

/** The aim of a viewer pose, from its column-major transform matrix. */
export function aimFromViewerMatrix(m: ArrayLike<number>): XrAim {
  return { origin: { x: m[12], y: m[13], z: m[14] }, direction: { x: -m[8], y: -m[9], z: -m[10] } };
}

/** The aim ray meeting the floor plane. Null for a level or upward aim, or
 *  when the floor is met outside MIN_AIM_RANGE_M–MAX_AIM_RANGE_M. */
export function floorPointFromRay(aim: XrAim, floorY = 0): { x: number; z: number; rangeM: number } | null {
  const d = unit(aim.direction);
  if (!d || d.y >= -Math.sin((MIN_FLOOR_DEPRESSION_DEG * Math.PI) / 180)) return null;
  const t = (floorY - aim.origin.y) / d.y;
  if (!(t >= MIN_AIM_RANGE_M && t <= MAX_AIM_RANGE_M)) return null;
  return { x: aim.origin.x + d.x * t, z: aim.origin.z + d.z * t, rangeM: t };
}

export interface FloorTarget { x: number; z: number; source: 'floor-hit' | 'floor-ray'; rangeM: number }

/** True when the plan path from `from` to `to` crosses the wall line within
 *  its detected extent and ends more than tolM behind it. */
function endsBehindWall(from: XrCorner, to: XrCorner, wall: WallLine, tolM: number): boolean {
  const wx = wall.b.x - wall.a.x;
  const wz = wall.b.z - wall.a.z;
  const len = Math.hypot(wx, wz);
  if (len === 0) return false;
  const side = (p: XrCorner) => (wx * (p.z - wall.a.z) - wz * (p.x - wall.a.x)) / len;
  const sFrom = side(from);
  const sTo = side(to);
  if (sFrom * sTo >= 0 || Math.abs(sTo) <= tolM) return false;
  const k = sFrom / (sFrom - sTo);
  const w = ((from.x + (to.x - from.x) * k - wall.a.x) * wx + (from.z + (to.z - from.z) * k - wall.a.z) * wz) / (len * len);
  return w >= 0 && w <= 1;
}

/** Where a corner mark lands: a floor-level hit, else the aim ray meeting the
 *  floor plane — when there is no hit, or the hit is a level surface such as
 *  a benchtop in front of the corner. Never through a wall: a hit on an
 *  upright surface above the floor (a wall, a cabinet front) has the floor
 *  the ray meets behind it, so it marks nothing; nor does a ray that passes a
 *  level hit and then a detected wall (a benchtop against that wall) to land
 *  more than wallTolM behind it. With no hit at all the ray met no detected
 *  surface on its way. Null while tracking is lost (no aim) or when nothing
 *  works. */
export function floorTargetFromAim(
  hit: (XrVec3 & { normalY?: number }) | null,
  aim: XrAim | null,
  walls: readonly WallLine[] = [],
  wallTolM = 0.15,
): FloorTarget | null {
  if (!aim) return null;
  if (hit && Math.abs(hit.y) <= FLOOR_TOLERANCE_M) {
    const rangeM = Math.hypot(hit.x - aim.origin.x, hit.y - aim.origin.y, hit.z - aim.origin.z);
    return { x: hit.x, z: hit.z, source: 'floor-hit', rangeM };
  }
  if (hit?.normalY !== undefined && Math.abs(hit.normalY) <= LEVEL_NORMAL_Y) return null;
  const ray = floorPointFromRay(aim);
  if (!ray || (hit && walls.some((wall) => endsBehindWall(hit, ray, wall, wallTolM)))) return null;
  return { ...ray, source: 'floor-ray' };
}

/** Why a new corner cannot be marked at this point, or null when it can. A
 *  point within MIN_CORNER_SEPARATION_M of any marked corner repeats it —
 *  most often corner 1 tapped again to close the room — and the fit would
 *  refuse the whole capture for it, so the mark is refused instead. */
export function cornerMarkIssue(corners: readonly XrCorner[], point: XrCorner): string | null {
  const index = corners.findIndex((c) => distance(c, point) < MIN_CORNER_SEPARATION_M);
  if (index === 0 && corners.length >= 4) return 'That is corner 1 again — the room is already closed.';
  if (index >= 0 && index === corners.length - 1) return 'That is the corner you just marked — move on to the next one.';
  if (index >= 0) return `That is corner ${index + 1}, already marked — move on to the next one.`;
  if (corners.length >= MAX_CAPTURE_CORNERS) {
    return `A room can have at most ${MAX_CAPTURE_CORNERS} corners — finish here, or remove a corner.`;
  }
  return null;
}

/** Plan angle between two aims (0–90°), or null when either is near vertical. */
export function aimSeparationDeg(a: XrAim, b: XrAim): number | null {
  const ha = horizontal(a.direction);
  const hb = horizontal(b.direction);
  if (!ha || !hb) return null;
  return (Math.asin(Math.min(1, Math.abs(ha.x * hb.z - ha.z * hb.x))) * 180) / Math.PI;
}

/** Two aims at the same vertical corner edge from two standing positions.
 *  Each aim is a vertical plane through the camera; they meet at the corner.
 *  Needs only tracking — no detected plane — and works with a benchtop in
 *  the way. Null when the aims are too close in angle or meet out of range. */
export function hiddenCornerFromAims(
  a: XrAim,
  b: XrAim,
): { x: number; z: number; rangeM: number; angleDeg: number } | null {
  const ha = horizontal(a.direction);
  const hb = horizontal(b.direction);
  const angleDeg = aimSeparationDeg(a, b);
  if (!ha || !hb || angleDeg === null || angleDeg < MIN_HIDDEN_AIM_ANGLE_DEG) return null;
  const cross = ha.x * hb.z - ha.z * hb.x;
  const ox = b.origin.x - a.origin.x;
  const oz = b.origin.z - a.origin.z;
  const s = (ox * hb.z - oz * hb.x) / cross;
  const u = (ox * ha.z - oz * ha.x) / cross;
  if (!(s >= MIN_AIM_RANGE_M && u >= MIN_AIM_RANGE_M && s <= MAX_AIM_RANGE_M && u <= MAX_AIM_RANGE_M)) return null;
  return { x: a.origin.x + ha.x * s, z: a.origin.z + ha.z * s, rangeM: Math.min(s, u), angleDeg };
}

/** Ceiling height from an aim at the line where a marked wall meets the
 *  ceiling: the ray meets that wall's vertical plane at ceiling height. The
 *  corners are a closed outline (two corners are one wall). */
export function wallPlaneHeightFromRay(
  aim: XrAim,
  corners: readonly XrCorner[],
): { heightMm: number; wallIndex: number; rangeM: number; planRangeM: number } | null {
  const d = unit(aim.direction);
  if (!d || corners.length < 2) return null;
  const hl = Math.hypot(d.x, d.z);
  if (hl < 0.1) return null;
  const ux = d.x / hl;
  const uz = d.z / hl;
  let best: { s: number; wallIndex: number } | null = null;
  const walls = corners.length === 2 ? 1 : corners.length;
  for (let i = 0; i < walls; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    const wx = b.x - a.x;
    const wz = b.z - a.z;
    const den = ux * wz - uz * wx;
    if (Math.abs(den) < 1e-9) continue;
    const qx = a.x - aim.origin.x;
    const qz = a.z - aim.origin.z;
    const s = (qx * wz - qz * wx) / den; // plan metres along the aim
    const w = (qx * uz - qz * ux) / den; // fraction along the wall
    if (s < MIN_AIM_RANGE_M || w < -0.1 || w > 1.1) continue;
    if (!best || s < best.s) best = { s, wallIndex: i };
  }
  if (!best) return null;
  const t = best.s / hl;
  const heightMm = Math.round((aim.origin.y + d.y * t) * 1000);
  if (t > MAX_AIM_RANGE_M || heightMm < MIN_CEILING_READING_MM || heightMm > MAX_CEILING_MM) return null;
  return { heightMm, wallIndex: best.wallIndex, rangeM: t, planRangeM: best.s };
}

export interface CeilingReading {
  heightMm: number;
  source: 'ceiling-hit' | 'wall-edge';
  /** wall-edge only: plan metres from the phone to the wall along the aim */
  planRangeM?: number;
}

/** Ceiling height from a ceiling surface hit, else from an aim at the top
 *  edge of a marked wall — which needs no ceiling detection, but is right
 *  only with the ring on that edge (see confirmWallEdgeHeight). */
export function ceilingReading(
  hit: XrVec3 | null,
  aim: XrAim | null,
  corners: readonly XrCorner[],
): CeilingReading | null {
  if (hit) {
    const heightMm = Math.round(hit.y * 1000);
    if (heightMm >= MIN_CEILING_READING_MM && heightMm <= MAX_CEILING_MM) return { heightMm, source: 'ceiling-hit' };
  }
  const byWall = aim ? wallPlaneHeightFromRay(aim, corners) : null;
  return byWall && { heightMm: byWall.heightMm, source: 'wall-edge', planRangeM: byWall.planRangeM };
}

/** A wall-edge reading is right only when the ring sits exactly on the line
 *  where the wall meets the ceiling. Aimed at the ceiling itself, the ray
 *  carries on to the wall's plane above the ceiling and the reading grows
 *  with the distance to the wall (eye 1.5 m, 1.5 m from the wall, true
 *  ceiling 2.40 m: 2.76 m at 40° up, 3.64 m at 55°). Two readings from
 *  distances at least WALL_EDGE_MIN_STEP_M apart agree only when both were
 *  on the line. `restart` drops the first reading. */
export function confirmWallEdgeHeight(
  first: { heightMm: number; planRangeM: number },
  second: { heightMm: number; planRangeM: number },
): { ok: true; heightMm: number } | { ok: false; restart: boolean; reason: string } {
  if (Math.abs(second.planRangeM - first.planRangeM) < WALL_EDGE_MIN_STEP_M) {
    return {
      ok: false,
      restart: false,
      reason: 'Step at least 1 m closer to or further from the wall, then put the ring on the same wall–ceiling line again.',
    };
  }
  const spreadMm = Math.abs(second.heightMm - first.heightMm);
  if (spreadMm > WALL_EDGE_MAX_SPREAD_MM) {
    return {
      ok: false,
      restart: true,
      reason: `The two readings differ by ${spreadMm} mm, so the ring was not on the line where the wall meets the ceiling. Put it exactly on that line and start again.`,
    };
  }
  return { ok: true, heightMm: Math.round((first.heightMm + second.heightMm) / 2) };
}

/** Why a 4-point fallback tap is not a wall point, or null when it is. A hit
 *  pose's Y axis is the surface normal; when known, a level surface (floor,
 *  benchtop, ceiling) is refused whatever its height. */
export function wallTapIssue(hit: { y: number; normalY?: number }): string | null {
  if (hit.normalY !== undefined && Math.abs(hit.normalY) > LEVEL_NORMAL_Y) {
    return 'That is a flat surface, not a wall — aim at the wall itself.';
  }
  if (hit.y < WALL_TAP_MIN_Y_M) return 'That point is below benchtop height — aim at the wall above the benchtop.';
  if (hit.y > WALL_TAP_MAX_Y_M) return 'That point is too high — aim at the wall just above the benchtop.';
  return null;
}

// ─── Plane-detection assist ─────────────────────────────────────────────────
// WebXR plane detection (ARCore) hands us detected wall planes. These pure
// helpers turn a plane's polygon (projected to the floor) into a wall LINE,
// and snap tapped points onto the nearest wall line or wall∩wall corner —
// fixing the "tap lands near, not on, the wall" drift of raw hit-testing.

export interface WallLine { a: XrCorner; b: XrCorner }

/** Longest chord of a plane polygon projected to the plan — the wall line.
 *  Returns null for fragments shorter than 0.4 m (noise planes). */
export function dominantLine(pts: XrCorner[]): WallLine | null {
  let best: WallLine | null = null;
  let bestD = 0.4;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
      if (d > bestD) { bestD = d; best = { a: pts[i], b: pts[j] }; }
    }
  }
  return best;
}

function projectOntoLine(p: XrCorner, line: WallLine): { point: XrCorner; distM: number } {
  const dx = line.b.x - line.a.x, dz = line.b.z - line.a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((p.x - line.a.x) * dx + (p.z - line.a.z) * dz) / len2 : 0;
  // Allow slack past the detected extent — planes grow as ARCore refines them,
  // and real walls extend beyond what is detected so far. This is load-bearing
  // for the hidden-corner flow: when a benchtop blocks the floor corner ARCore
  // never sees the last ~0.5 m of either wall, so there is nothing to
  // intersect. Do NOT reduce this to control snap distance — that is what
  // snapToPlanes' tolM and CORNER_SNAP_FACTOR are for. Reducing it to 0.12
  // made `snapToPlanes` return kind:'none' at a real corner.
  const len = Math.sqrt(len2);
  const slack = len > 0 ? 0.5 / len : 0;
  t = Math.max(-slack, Math.min(1 + slack, t));
  const point = { x: line.a.x + t * dx, z: line.a.z + t * dz };
  return { point, distM: Math.hypot(p.x - point.x, p.z - point.z) };
}

export interface PlaneSnap {
  point: XrCorner;
  kind: 'corner' | 'wall' | 'none';
  /** The recognised wall plane when kind=wall. */
  line?: WallLine;
  /** The two recognised wall planes used when kind=corner. */
  cornerLines?: [WallLine, WallLine];
}

/**
 * Intersect two device-detected wall planes, optionally rejecting an
 * intersection that is implausibly far from the point the customer aimed at.
 * This is the geometry behind the scanner's two-tap "Smart wall lock" mode.
 */
export function intersectDetectedWallLines(
  first: WallLine,
  second: WallLine,
  aimedNear?: XrCorner,
  maxDistanceM = 2,
): XrCorner | null {
  const corner = intersectWallLines(first.a, first.b, second.a, second.b);
  if (!corner) return null;
  if (aimedNear && distance(corner, aimedNear) > maxDistanceM) return null;
  return corner;
}

/** Snap a tapped point onto detected wall geometry: the intersection of the
 *  two nearest (sufficiently angled) walls when both are close — a corner —
 *  else the nearest wall line, else the raw point. */
/** A corner snap must never be LOOSER than a wall snap. It is derived from two
 *  intersecting lines, so it amplifies each line's bearing error — yet this was
 *  previously 1.5x the wall tolerance (0.45 m at the old default, 0.825 m in
 *  hidden mode). Equal tolerance is the conservative choice: it cuts the old
 *  budget by a factor of three without inventing a threshold we have no field
 *  data for. Tighten further only with real measurements to justify it. */
export const CORNER_SNAP_FACTOR = 1;

export function snapToPlanes(p: XrCorner, lines: WallLine[], tolM = 0.15): PlaneSnap {
  const near = lines
    .map(line => ({ line, ...projectOntoLine(p, line) }))
    .filter(h => h.distM <= tolM)
    .sort((x, y) => x.distM - y.distM);
  if (near.length >= 2) {
    const cornerTol = tolM * CORNER_SNAP_FACTOR;
    for (let j = 1; j < near.length; j++) {
      const corner = intersectDetectedWallLines(near[0].line, near[j].line, p, cornerTol);
      if (corner && Math.hypot(corner.x - p.x, corner.z - p.z) <= cornerTol) {
        return { point: corner, kind: 'corner', cornerLines: [near[0].line, near[j].line] };
      }
    }
  }
  if (near.length >= 1) return { point: near[0].point, kind: 'wall', line: near[0].line };
  return { point: p, kind: 'none' };
}

// ─── Rectilinear L-shape fit ────────────────────────────────────────────────

/** 1-D clustering: sorted values grouped when within tol of the group mean. */
function cluster1d(values: number[], tolM: number): number[] {
  const sorted = [...values].sort((x, y) => x - y);
  const groups: number[][] = [];
  for (const value of sorted) {
    const group = groups[groups.length - 1];
    if (group && Math.abs(value - group.reduce((s, x) => s + x, 0) / group.length) <= tolM) {
      group.push(value);
    } else {
      groups.push([value]);
    }
  }
  return groups.map(g => g.reduce((s, x) => s + x, 0) / g.length);
}

interface LFit {
  widthMm: number;
  depthMm: number;
  cutoutWidthMm: number;
  cutoutDepthMm: number;
  /** quarter turns applied so the notch sits at canonical SE */
  quarterTurns: 0 | 1 | 2 | 3;
  /** shift applied before rotation (metres, in yaw-aligned space) */
  shiftU: number;
  shiftV: number;
  /** fitted extents before rotation (metres, in yaw-aligned space) */
  spanU: number;
  spanV: number;
  residualMm: number;
}

/** Try to fit yaw-aligned 6-corner points as a rectilinear L. Returns null
 *  when the points don't form a clean axis-aligned rect-minus-one-corner. */
function tryFitLShape(rotated: { u: number; v: number }[]): LFit | null {
  if (rotated.length !== 6) return null;
  const us = cluster1d(rotated.map(p => p.u), L_CLUSTER_TOL_M);
  const vs = cluster1d(rotated.map(p => p.v), L_CLUSTER_TOL_M);
  if (us.length !== 3 || vs.length !== 3) return null;

  const nearest = (arr: number[], x: number) => arr.reduce((best, c) => (Math.abs(c - x) < Math.abs(best - x) ? c : best), arr[0]);
  let residual = 0;
  const snapped = rotated.map(p => {
    const su = nearest(us, p.u);
    const sv = nearest(vs, p.v);
    residual = Math.max(residual, Math.hypot(p.u - su, p.v - sv));
    return { u: su, v: sv };
  });
  const residualMm = residual * 1000;
  if (residualMm > RECT_REJECT_MM) return null;

  const [u0, u1, u2] = us;
  const [v0, v1, v2] = vs;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  const has = (u: number, v: number) => snapped.some(p => near(p.u, u) && near(p.v, v));

  // Exactly one bounding-box corner must be missing (the notch), and the
  // inner reflex vertex (u1, v1) must be present.
  const bbox: [number, number][] = [[u0, v0], [u2, v0], [u2, v2], [u0, v2]];
  const missing = bbox.filter(([u, v]) => !has(u, v));
  if (missing.length !== 1 || !has(u1, v1)) return null;

  // Quarter turns to bring the notch to SE (max-u, max-v). The op
  // (u,v) → (Vmax−v, u) cycles NE→SE→SW→NW.
  const [mu, mv] = missing[0];
  const isMin = (x: number, m: number) => near(x, m);
  const notch = isMin(mu, u0)
    ? (isMin(mv, v0) ? 'NW' : 'SW')
    : (isMin(mv, v0) ? 'NE' : 'SE');
  const quarterTurns = ({ SE: 0, NE: 1, NW: 2, SW: 3 } as const)[notch];

  // Rotate cluster values to the final frame to read off dims + cutout.
  let W = u2 - u0;
  let D = v2 - v0;
  let uMid = u1 - u0;
  let vMid = v1 - v0;
  for (let k = 0; k < quarterTurns; k++) {
    const [nW, nD] = [D, W];
    const [nU, nV] = [D - vMid, uMid];
    W = nW; D = nD; uMid = nU; vMid = nV;
  }
  const widthMm = Math.round(W * 1000);
  const depthMm = Math.round(D * 1000);
  const cutoutWidthMm = Math.round((W - uMid) * 1000);
  const cutoutDepthMm = Math.round((D - vMid) * 1000);
  if (cutoutWidthMm < MIN_CUTOUT_MM || cutoutDepthMm < MIN_CUTOUT_MM) return null;
  if (cutoutWidthMm >= widthMm || cutoutDepthMm >= depthMm) return null;

  return {
    widthMm, depthMm, cutoutWidthMm, cutoutDepthMm, quarterTurns,
    shiftU: u0, shiftV: v0, spanU: u2 - u0, spanV: v2 - v0, residualMm,
  };
}

/** The two wall lines of one axis of a rectangle fit, each the mean of the
 *  corners on it. Four corners each sit on one line per axis, so they are
 *  split at the middle; dropping one of them for being far from the extreme
 *  would bias the line outward again. With more corners, one further than
 *  RECT_REJECT_MM inside both lines (an open-plan bump, a point marked
 *  mid-wall) is left out of that axis and flagged by the caller. */
function edgeLines(values: number[]): [number, number] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const tol = values.length === 4 ? (hi - lo) / 2 : RECT_REJECT_MM / 1000;
  const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  return [mean(values.filter((x) => x - lo <= tol)), mean(values.filter((x) => hi - x <= tol))];
}

// ─── Capture → scan ─────────────────────────────────────────────────────────

export function buildScanFromCapture(
  corners: XrCorner[],
  extras: XrCaptureExtras = {},
  capturedAt = new Date().toISOString(),
):
  | { ok: true; scan: RoomScanV1; warnings: string[] }
  | { ok: false; reason: string } {
  if (corners.length < 4) return { ok: false, reason: 'mark all 4 corners of the room in order' };
  if (corners.length > MAX_CAPTURE_CORNERS) return { ok: false, reason: `mark no more than ${MAX_CAPTURE_CORNERS} corners` };
  if (corners.some(c => !Number.isFinite(c.x) || !Number.isFinite(c.z))) {
    return { ok: false, reason: 'one or more corner measurements were invalid — scan the room again' };
  }
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      if (distance(corners[i], corners[j]) < MIN_CORNER_SEPARATION_M) {
        return { ok: false, reason: 'two marked corners are too close together — undo the duplicate point' };
      }
    }
  }
  if (distance(corners[0], corners[1]) < 0.5) {
    return { ok: false, reason: 'the first wall is too short — mark two different room corners first' };
  }
  if (hasCrossedEdges(corners)) {
    return { ok: false, reason: 'the corner path crosses itself — mark each corner in order around the room' };
  }

  // The first wall marked becomes canonical N whichever way round the room
  // the customer walks. Turning corner 0→1 to +u leaves the room on the +v
  // side only for one walking direction (positive shoelace area); walked the
  // other way the first wall landed at S and a door marked on it came out on
  // the opposite wall. Taking the yaw from corner 1 back to corner 0 then
  // gives the same frame both ways — a rotation, never a mirror.
  let twiceArea = 0;
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i];
    const q = corners[(i + 1) % corners.length];
    twiceArea += p.x * q.z - q.x * p.z;
  }
  const [from, to] = twiceArea >= 0 ? [corners[0], corners[1]] : [corners[1], corners[0]];
  const yaw = Math.atan2(to.z - from.z, to.x - from.x);
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const rotated = corners.map((c) => ({ u: c.x * cos - c.z * sin, v: c.x * sin + c.z * cos }));

  const warnings: string[] = [];

  // Frame pieces shared by both fits. source(m)→canonical(mm):
  // rotate by -yaw, ×1000, translate fit-origin→(0,0), then 0–3 quarter turns.
  let a = cos * 1000;
  let b = -sin * 1000;
  let d = sin * 1000;
  let e = cos * 1000;
  let c: number;
  let f: number;
  let widthMm: number;
  let depthMm: number;
  let cutoutWidthMm = 0;
  let cutoutDepthMm = 0;
  let shape: 'Rectangle' | 'LShape' = 'Rectangle';
  let quarterTurnDegrees: 0 | 90 | 180 | 270 = 0;
  /** True when the walked outline is a poor fit for the rectangle we emit. */
  let heavilySimplified = false;

  const lfit = corners.length === 6 ? tryFitLShape(rotated) : null;
  if (lfit) {
    shape = 'LShape';
    widthMm = lfit.widthMm;
    depthMm = lfit.depthMm;
    cutoutWidthMm = lfit.cutoutWidthMm;
    cutoutDepthMm = lfit.cutoutDepthMm;
    quarterTurnDegrees = (lfit.quarterTurns * 90) as 0 | 90 | 180 | 270;
    c = -lfit.shiftU * 1000;
    f = -lfit.shiftV * 1000;
    // Compose quarter turns: (u,v) → (Vmax−v, u), applied in mm space. Vmax
    // is the fitted (cluster-mean) extent, not the outermost corner.
    let curW = Math.round(lfit.spanU * 1000);
    let curD = Math.round(lfit.spanV * 1000);
    for (let k = 0; k < lfit.quarterTurns; k++) {
      const [na, nb, nc] = [-d, -e, curD - f];
      const [nd, ne, nf] = [a, b, c];
      a = na; b = nb; c = nc; d = nd; e = ne; f = nf;
      const [nW, nD] = [curD, curW];
      curW = nW; curD = nD;
    }
    if (lfit.residualMm > RECT_WARN_MM) {
      warnings.push(`L-shape fitted — corners adjusted up to ${Math.round(lfit.residualMm)}mm to square the walls`);
    }
  } else {
    // Each wall line sits at the MEAN of the corners on it. A bounding box
    // put every line at its outermost corner, and the extreme of noisy
    // corners is biased outward: at 30 mm per-axis corner noise a seeded
    // 4000-run simulation read rooms 42 mm too wide and 25 mm too deep on
    // average (scripts/webxr-fit-smoke.mjs now holds the mean near zero).
    const [westU, eastU] = edgeLines(rotated.map((p) => p.u));
    const [northV, southV] = edgeLines(rotated.map((p) => p.v));
    widthMm = Math.round((eastU - westU) * 1000);
    depthMm = Math.round((southV - northV) * 1000);

    // Worst corner deviation from the fitted rectangle's edges.
    let worst = 0;
    for (const p of rotated) {
      const du = Math.min(Math.abs(p.u - westU), Math.abs(p.u - eastU));
      const dv = Math.min(Math.abs(p.v - northV), Math.abs(p.v - southV));
      worst = Math.max(worst, Math.min(du, dv) * 1000);
    }
    // A capture is NEVER thrown away for being non-rectangular. It used to
    // hard-reject above RECT_REJECT_MM, which meant an open-plan kitchen —
    // where the walked outline is nothing like a rectangle — lost the whole
    // capture after the customer had already done corners, height AND
    // openings. A loudly-flagged approximate outline they can correct beats
    // no outline at all. The severity is carried in the warning and in the
    // confidence score so nothing is simplified silently.
    heavilySimplified = worst > RECT_REJECT_MM;
    if (worst > RECT_WARN_MM) {
      const off = Math.round(worst);
      warnings.push(
        heavilySimplified
          ? `this room is not rectangular — corners sit up to ${off}mm off the fitted rectangle, so the outline below is approximate. Check every dimension before ordering.`
          : `room shape simplified — corners deviate up to ${off}mm from a rectangle`,
      );
    }
    if (corners.length === 6) {
      warnings.push('six corners captured but the room did not fit a clean L-shape — simplified to a rectangle; adjust it in the plan editor');
    }
    c = -westU * 1000;
    f = -northV * 1000;
  }

  if (widthMm < MIN_ROOM_WIDTH_MM || depthMm < MIN_ROOM_DEPTH_MM) {
    return {
      ok: false,
      reason: 'captured area is too small — walk the full room and mark each corner at floor level',
    };
  }

  const toCanonical = (p: XrCorner) => ({ u: a * p.x + b * p.z + c, v: d * p.x + e * p.z + f });

  // Ceiling height: measured if plausible, else default (with a warning when
  // the measurement was clearly bad rather than silently swallowing it).
  let heightMm = 2700;
  let heightField: 'measured' | 'estimated' | 'default' = 'default';
  if (extras.heightMm !== undefined) {
    const h = Math.round(extras.heightMm);
    if (h >= MIN_CEILING_MM && h <= MAX_CEILING_MM) {
      heightMm = h;
      // A wall-edge height comes from aims, not a ceiling surface.
      heightField = extras.heightSource === 'wall-edge' ? 'estimated' : 'measured';
    } else {
      warnings.push(`ceiling measurement ${h}mm looked wrong — using the standard 2700mm instead`);
    }
  }

  // Opening spans → wall + offset in the canonical plan. On an L-shape, the
  // E wall physically ends at depth−cutoutDepth and the S wall at
  // width−cutoutWidth; spans landing on the cut-away part are skipped.
  const openings: {
    id: string; wall: Wall; type: 'door' | 'window' | 'walkway';
    offsetMm: number; widthMm: number;
  }[] = [];
  for (const [i, mark] of (extras.openings ?? []).entries()) {
    const pa = toCanonical(mark.a);
    const pb = toCanonical(mark.b);
    const mid = { u: (pa.u + pb.u) / 2, v: (pa.v + pb.v) / 2 };
    const hit = nearestWall(mid.u, mid.v, widthMm, depthMm);
    if (hit.distMm > MAX_OPENING_WALL_DISTANCE_MM) {
      warnings.push(`a marked ${mark.type} was not near any wall and was skipped — re-mark it in the plan editor`);
      continue;
    }
    // Raw plan coordinates first: the L-shape cut-away test below is written
    // against these, and mirroring before it would invert its meaning.
    const rawA = hit.wall === 'N' || hit.wall === 'S' ? pa.u : pa.v;
    const rawB = hit.wall === 'N' || hit.wall === 'S' ? pb.u : pb.v;
    let wallLen = hit.wall === 'N' || hit.wall === 'S' ? widthMm : depthMm;
    if (shape === 'LShape') {
      if (hit.wall === 'E') wallLen = depthMm - cutoutDepthMm;
      if (hit.wall === 'S') wallLen = widthMm - cutoutWidthMm;
      if (Math.min(rawA, rawB) >= wallLen) {
        warnings.push(`a marked ${mark.type} sits on the cut-away part of the room and was skipped — re-mark it in the plan editor`);
        continue;
      }
    }
    // Same clockwise convention as nearestWall: S runs from the E corner and W
    // from the S corner, so both are measured back from the far end.
    const mirrored = hit.wall === 'S' || hit.wall === 'W';
    const alongA = mirrored ? wallLen - rawA : rawA;
    const alongB = mirrored ? wallLen - rawB : rawB;
    const span = clampSpan(Math.min(alongA, alongB), Math.abs(alongB - alongA), wallLen);
    if (!span) {
      warnings.push(`a marked ${mark.type} was too narrow to keep — re-mark both sides of the opening`);
      continue;
    }
    openings.push({ id: `scan-${mark.type}-${i + 1}`, wall: hit.wall, type: mark.type, ...span });
  }

  // Overlapping spans on one wall confuse the editor — keep the first, warn.
  const kept: typeof openings = [];
  for (const o of openings) {
    const clash = kept.find(k =>
      k.wall === o.wall && o.offsetMm < k.offsetMm + k.widthMm && k.offsetMm < o.offsetMm + o.widthMm);
    if (clash) {
      warnings.push(`two marked openings overlap on wall ${o.wall} — kept the first, re-check in the plan editor`);
      continue;
    }
    kept.push(o);
  }

  const candidate = {
    state: 'unconfirmed' as const,
    schemaVersion: 1 as const,
    source: 'webxr' as const,
    roomRevision: 1,
    coordinateFrame: {
      assignment: 'user-main-wall' as const,
      sourcePlanAxes: 'x-z' as const,
      sourceUnits: 'metres' as const,
      sourceToCanonicalMatrix: [a, b, c, d, e, f, 0, 0, 1] as [
        number, number, number, number, number, number, 0, 0, 1,
      ],
      snappedQuarterTurnDegrees: quarterTurnDegrees,
      originDescription: 'north-west-corner-in-canonical-plan' as const,
    },
    room: {
      width: widthMm,
      depth: depthMm,
      height: heightMm,
      shape,
      cutoutWidth: cutoutWidthMm,
      cutoutDepth: cutoutDepthMm,
      openings: kept,
      services: [],
    },
    confidence: {
      // A heavily simplified outline is a sketch, not a measurement. Keep this
      // below the manual-entry score so staff triage catches it.
      overall: heavilySimplified ? 0.3 : warnings.length ? 0.5 : 0.7,
      fields: {
        height: heightField,
        openings: kept.length ? ('user-marked' as const) : ('none-captured' as const),
        services: 'none-captured' as const,
      },
    },
    ...(warnings.length ? { normalizationWarnings: warnings } : {}),
    capturedAt,
  };

  const parsed = parseRoomScan(candidate);
  if ('reason' in parsed) return { ok: false, reason: parsed.reason };
  return { ok: true, scan: parsed.scan, warnings };
}

/** Corners-only wrapper — the original public API, unchanged behaviour. */
export function buildScanFromCorners(
  corners: XrCorner[],
  capturedAt = new Date().toISOString(),
):
  | { ok: true; scan: RoomScanV1; warnings: string[] }
  | { ok: false; reason: string } {
  return buildScanFromCapture(corners, {}, capturedAt);
}
