/**
 * WebXR corner-fit → UnconfirmedRoomScanV1 (master plan §10.1, discovery).
 * Pure module — no React, no XR — so the geometry is unit-testable.
 *
 * The first marked edge is the user's main wall and becomes canonical N.
 * Corners are axis-aligned by that yaw, bounded to a rectangle, and the
 * full source(metres)→canonical(mm) affine is recorded invertibly
 * (rotation+scale ⇒ determinant 1e6 > 0). Deviation from a true rectangle
 * is surfaced as a normalization warning and caps confidence at 0.5 —
 * never silently discarded (§3.7 policy).
 *
 * Buildout (scanner two-lane plan): the capture can now also carry
 *   - a measured ceiling height (reticle tap on the ceiling), and
 *   - door/window/walkway spans marked as two floor points each,
 * via buildScanFromCapture. buildScanFromCorners remains as the
 * corners-only wrapper so existing callers/tests are untouched.
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
  const candidates: { wall: Wall; along: number; distMm: number }[] = [
    { wall: 'N', along: u, distMm: Math.abs(v) },
    { wall: 'S', along: u, distMm: Math.abs(depthMm - v) },
    { wall: 'W', along: v, distMm: Math.abs(u) },
    { wall: 'E', along: v, distMm: Math.abs(widthMm - u) },
  ];
  candidates.sort((a, b) => a.distMm - b.distMm);
  return candidates[0];
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

  const yaw = Math.atan2(corners[1].z - corners[0].z, corners[1].x - corners[0].x);
  const cos = Math.cos(-yaw);
  const sin = Math.sin(-yaw);
  const rotated = corners.map((c) => ({ u: c.x * cos - c.z * sin, v: c.x * sin + c.z * cos }));

  const minU = Math.min(...rotated.map((p) => p.u));
  const maxU = Math.max(...rotated.map((p) => p.u));
  const minV = Math.min(...rotated.map((p) => p.v));
  const maxV = Math.max(...rotated.map((p) => p.v));
  const widthMm = Math.round((maxU - minU) * 1000);
  const depthMm = Math.round((maxV - minV) * 1000);
  if (widthMm < MIN_ROOM_WIDTH_MM || depthMm < MIN_ROOM_DEPTH_MM) {
    return {
      ok: false,
      reason: 'captured area is too small — walk the full room and mark each corner at floor level',
    };
  }

  // Worst corner deviation from the fitted rectangle's edges.
  const warnings: string[] = [];
  let worst = 0;
  for (const p of rotated) {
    const du = Math.min(Math.abs(p.u - minU), Math.abs(p.u - maxU));
    const dv = Math.min(Math.abs(p.v - minV), Math.abs(p.v - maxV));
    worst = Math.max(worst, Math.min(du, dv) * 1000);
  }
  if (worst > RECT_REJECT_MM) {
    return {
      ok: false,
      reason: 'this scan is not rectangular enough for automatic fitting — use manual room entry or request a designer review',
    };
  }
  if (worst > RECT_WARN_MM) {
    warnings.push(`room shape simplified — corners deviate up to ${Math.round(worst)}mm from a rectangle`);
  }

  // source(m) → canonical(mm): rotate by -yaw, ×1000, translate min→origin.
  const a = cos * 1000;
  const b = -sin * 1000;
  const d = sin * 1000;
  const e = cos * 1000;
  const c = -minU * 1000;
  const f = -minV * 1000;
  const toCanonical = (p: XrCorner) => ({ u: a * p.x + b * p.z + c, v: d * p.x + e * p.z + f });

  // Ceiling height: measured if plausible, else default (with a warning when
  // the measurement was clearly bad rather than silently swallowing it).
  let heightMm = 2700;
  let heightField: 'measured' | 'default' = 'default';
  if (extras.heightMm !== undefined) {
    const h = Math.round(extras.heightMm);
    if (h >= MIN_CEILING_MM && h <= MAX_CEILING_MM) {
      heightMm = h;
      heightField = 'measured';
    } else {
      warnings.push(`ceiling measurement ${h}mm looked wrong — using the standard 2700mm instead`);
    }
  }

  // Opening spans → wall + offset in the canonical plan.
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
    const alongA = hit.wall === 'N' || hit.wall === 'S' ? pa.u : pa.v;
    const alongB = hit.wall === 'N' || hit.wall === 'S' ? pb.u : pb.v;
    const wallLen = hit.wall === 'N' || hit.wall === 'S' ? widthMm : depthMm;
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
      snappedQuarterTurnDegrees: 0 as const,
      originDescription: 'north-west-corner-in-canonical-plan' as const,
    },
    room: {
      width: widthMm,
      depth: depthMm,
      height: heightMm,
      shape: 'Rectangle' as const,
      cutoutWidth: 0,
      cutoutDepth: 0,
      openings: kept,
      services: [],
    },
    confidence: {
      overall: warnings.length ? 0.5 : 0.7,
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
