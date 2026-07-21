/**
 * polygon — the authoritative room-geometry model (roadmap step 3, slice 1).
 *
 * Today the engine treats every room as its bounding rectangle, so an L-shaped
 * room's missing corner is invisible to placement and validation (blocker 6.5).
 * This module derives a real room POLYGON from the compact RoomConfig and
 * exposes the operations the engine/validation need. RoomConfig stays the
 * wire/storage format; the polygon is derived — nothing stored changes yet.
 *
 * Conventions (must match geometry.ts / the 3D scene — corner origin):
 *   plan coords x → right, z → into the room from the N (back) wall;
 *   x ∈ [0,width], z ∈ [0,depth]; N wall z=0, S z=depth, W x=0, E x=width.
 *
 * Winding: vertices are ordered so the room interior is on the LEFT of each
 * directed edge, which makes the left-normal (-dz, dx) point INTO the room.
 * The rectangle case reproduces the legacy N:0/E:90/S:180/W:270 rotations and
 * wallToWorld positions exactly — that equivalence is the oracle test.
 */

import type { RoomConfig } from '@/types';
import type { Wall } from './types';

export interface Vec2 { x: number; z: number }

export interface WallSegment {
  id: string;
  a: Vec2;
  b: Vec2;
  length: number;
  /** unit inward normal (points into the room) */
  normal: Vec2;
  /** cabinet rotation for a run sitting against this segment (deg, matches WALL_ROTATION) */
  rotation: number;
  /** the canonical wall this segment belongs to, when it aligns with one */
  legacyWall?: Wall;
}

export interface RoomPolygon {
  vertices: Vec2[];
  segments: WallSegment[];
  /** signed-area-derived floor area (mm²), always positive */
  area: number;
}

/** L-shape cutout corner. Defaults to 'SE' — the corner the current 3D
 *  rendering and existing data assume. */
export type CutoutCorner = 'NE' | 'NW' | 'SE' | 'SW';

const EPS = 1e-6;

function sub(a: Vec2, b: Vec2): Vec2 { return { x: a.x - b.x, z: a.z - b.z }; }
function len(v: Vec2): number { return Math.hypot(v.x, v.z); }
function norm(v: Vec2): Vec2 { const l = len(v) || 1; return { x: v.x / l, z: v.z / l }; }

/** Inward normal → cabinet rotation, snapped to the nearest quarter turn (so
 *  near-orthogonal scanned walls still resolve cleanly). Verified against the
 *  legacy convention: normal (0,1)→0, (-1,0)→90, (0,-1)→180, (1,0)→270. */
export function rotationFromNormal(n: Vec2): number {
  const q = ((Math.round(Math.atan2(-n.x, n.z) / (Math.PI / 2)) % 4) + 4) % 4;
  return q * 90;
}

function makeSegment(a: Vec2, b: Vec2, id: string, legacyWall?: Wall): WallSegment {
  const dir = norm(sub(b, a));
  // interior is on the left of a→b, so the left-normal (-dz, dx) points inward
  const normal = { x: -dir.z, z: dir.x };
  return { id, a, b, length: len(sub(b, a)), normal, rotation: rotationFromNormal(normal), ...(legacyWall ? { legacyWall } : {}) };
}

function polygonArea(vertices: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i], b = vertices[(i + 1) % vertices.length];
    s += a.x * b.z - b.x * a.z;
  }
  return Math.abs(s) / 2;
}

/**
 * Build the room polygon from a RoomConfig. Rectangle → 4 walls mapped to
 * N/E/S/W. LShape → 6 walls with the cutout removed from `cutoutCorner`
 * (default 'SE', matching the current rendering exactly:
 * removed rect = x∈[cutoutWidth,width], z∈[depth−cutoutDepth,depth]). The two
 * notch walls get their own ids and a legacyWall hint for the arm they extend.
 */
export function polygonFromRoom(room: RoomConfig): RoomPolygon {
  const W = room.width, D = room.depth;
  const NW: Vec2 = { x: 0, z: 0 };
  const NE: Vec2 = { x: W, z: 0 };
  const SE: Vec2 = { x: W, z: D };
  const SW: Vec2 = { x: 0, z: D };

  if (room.shape !== 'LShape' || !room.cutoutWidth || !room.cutoutDepth) {
    const vertices = [NW, NE, SE, SW];
    const segments = [
      makeSegment(NW, NE, 'N', 'N'),
      makeSegment(NE, SE, 'E', 'E'),
      makeSegment(SE, SW, 'S', 'S'),
      makeSegment(SW, NW, 'W', 'W'),
    ];
    return { vertices, segments, area: polygonArea(vertices) };
  }

  const cw = room.cutoutWidth, cd = room.cutoutDepth;
  const corner: CutoutCorner = (room as RoomConfig & { cutoutCorner?: CutoutCorner }).cutoutCorner ?? 'SE';

  // Each corner removes an axis-aligned rectangle; the polygon walks the
  // remaining outline keeping interior-on-the-left winding. SE reproduces the
  // legacy geometry byte-for-byte; the other three mirror it symmetrically.
  let vertices: Vec2[];
  let segments: WallSegment[];
  const seg = makeSegment;

  switch (corner) {
    case 'SE': {
      const r1: Vec2 = { x: W, z: D - cd };     // E wall foot (shortened)
      const reflex: Vec2 = { x: cw, z: D - cd };
      const r2: Vec2 = { x: cw, z: D };         // S wall end (shortened)
      vertices = [NW, NE, r1, reflex, r2, SW];
      segments = [
        seg(NW, NE, 'N', 'N'),
        seg(NE, r1, 'E', 'E'),
        seg(r1, reflex, 'notch-h', 'S'),  // interior wall facing the room (S-like)
        seg(reflex, r2, 'notch-v', 'E'),  // interior wall facing the room (E-like)
        seg(r2, SW, 'S', 'S'),
        seg(SW, NW, 'W', 'W'),
      ];
      break;
    }
    case 'SW': {
      const r1: Vec2 = { x: W - cw, z: D };     // S wall end (shortened from left)
      const reflex: Vec2 = { x: W - cw, z: D - cd };
      const r2: Vec2 = { x: 0, z: D - cd };     // W wall foot (shortened)
      vertices = [NW, NE, SE, r1, reflex, r2];
      segments = [
        seg(NW, NE, 'N', 'N'),
        seg(NE, SE, 'E', 'E'),
        seg(SE, r1, 'S', 'S'),
        seg(r1, reflex, 'notch-v', 'W'),
        seg(reflex, r2, 'notch-h', 'S'),
        seg(r2, NW, 'W', 'W'),
      ];
      break;
    }
    case 'NE': {
      const r1: Vec2 = { x: W - cw, z: 0 };     // N wall end (shortened from right)
      const reflex: Vec2 = { x: W - cw, z: cd };
      const r2: Vec2 = { x: W, z: cd };         // E wall head (shortened)
      vertices = [NW, r1, reflex, r2, SE, SW];
      segments = [
        seg(NW, r1, 'N', 'N'),
        seg(r1, reflex, 'notch-v', 'E'),
        seg(reflex, r2, 'notch-h', 'N'),
        seg(r2, SE, 'E', 'E'),
        seg(SE, SW, 'S', 'S'),
        seg(SW, NW, 'W', 'W'),
      ];
      break;
    }
    case 'NW': {
      const r1: Vec2 = { x: cw, z: 0 };         // N wall start (shortened from left)
      const reflex: Vec2 = { x: cw, z: cd };
      const r2: Vec2 = { x: 0, z: cd };         // W wall head (shortened)
      vertices = [r1, NE, SE, SW, r2, reflex];
      segments = [
        seg(r1, NE, 'N', 'N'),
        seg(NE, SE, 'E', 'E'),
        seg(SE, SW, 'S', 'S'),
        seg(SW, r2, 'W', 'W'),
        seg(r2, reflex, 'notch-h', 'N'),
        seg(reflex, r1, 'notch-v', 'W'),
      ];
      break;
    }
  }
  return { vertices, segments, area: polygonArea(vertices) };
}

/** World position + rotation for an item of `widthMm` at offset `t` along a
 *  segment (measured from segment.a), sitting against the wall with carcase
 *  depth `depthMm`. Generalises geometry.ts `wallToWorld`. */
export function segmentToWorld(seg: WallSegment, t: number, widthMm: number, depthMm: number): { x: number; z: number; rotation: number } {
  const dir = norm(sub(seg.b, seg.a));
  const along = t + widthMm / 2;
  const cx = seg.a.x + dir.x * along + seg.normal.x * (depthMm / 2);
  const cz = seg.a.z + dir.z * along + seg.normal.z * (depthMm / 2);
  return { x: cx, z: cz, rotation: seg.rotation };
}

// ─── point / rect in polygon ────────────────────────────────────────────────

/** Ray-cast point-in-polygon (interior true; boundary handled by the caller's
 *  tolerance via distToBoundary). */
export function pointInPolygon(p: Vec2, poly: RoomPolygon): boolean {
  const v = poly.vertices;
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const zi = v[i].z, zj = v[j].z, xi = v[i].x, xj = v[j].x;
    const intersects = (zi > p.z) !== (zj > p.z)
      && p.x < ((xj - xi) * (p.z - zi)) / ((zj - zi) || EPS) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distPointToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const d = sub(b, a);
  const l2 = d.x * d.x + d.z * d.z;
  if (l2 < EPS) return len(sub(p, a));
  let u = ((p.x - a.x) * d.x + (p.z - a.z) * d.z) / l2;
  u = Math.max(0, Math.min(1, u));
  return len(sub(p, { x: a.x + u * d.x, z: a.z + u * d.z }));
}

export function distToBoundary(p: Vec2, poly: RoomPolygon): number {
  let best = Infinity;
  for (const s of poly.segments) best = Math.min(best, distPointToSegment(p, s.a, s.b));
  return best;
}

/** Point is inside, or within `tol` of the boundary (matches the legacy ±1mm
 *  outward tolerance on the old bounding-box fit check). */
export function pointInsideOrNear(p: Vec2, poly: RoomPolygon, tol = 1): boolean {
  return pointInPolygon(p, poly) || distToBoundary(p, poly) <= tol;
}

/** Proper segment–segment intersection (endpoints touching does not count). */
function segmentsCross(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const o = (a: Vec2, b: Vec2, c: Vec2) => Math.sign((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x));
  const o1 = o(p1, p2, p3), o2 = o(p1, p2, p4), o3 = o(p3, p4, p1), o4 = o(p3, p4, p2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

export interface PlanRect { minX: number; maxX: number; minZ: number; maxZ: number }

/**
 * Is an axis-aligned rect fully inside the room? Rigorous for concave (L)
 * polygons: every corner must be inside-or-near, AND no polygon edge may cross
 * a rect edge (which would mean the rect straddles the notch/void). For a
 * convex rectangle room this reduces exactly to the legacy bounding-box test,
 * so the rectangle path is unchanged.
 */
export function rectInsidePolygon(rect: PlanRect, poly: RoomPolygon, tol = 1): boolean {
  const corners: Vec2[] = [
    { x: rect.minX, z: rect.minZ }, { x: rect.maxX, z: rect.minZ },
    { x: rect.maxX, z: rect.maxZ }, { x: rect.minX, z: rect.maxZ },
  ];
  if (!corners.every(c => pointInsideOrNear(c, poly, tol))) return false;
  // Edge-cross test on a rect INSET by tol, so a sub-tolerance poke at a
  // straight wall (allowed by the ±tol corner test — and by the legacy
  // bounding-box check) is not counted, while a real straddle across the
  // concave notch/void still crosses an inset edge and is rejected.
  const inset = tol + EPS;
  if (rect.maxX - rect.minX > 2 * inset && rect.maxZ - rect.minZ > 2 * inset) {
    const ic: Vec2[] = [
      { x: rect.minX + inset, z: rect.minZ + inset }, { x: rect.maxX - inset, z: rect.minZ + inset },
      { x: rect.maxX - inset, z: rect.maxZ - inset }, { x: rect.minX + inset, z: rect.maxZ - inset },
    ];
    for (let i = 0; i < ic.length; i++) {
      const c1 = ic[i], c2 = ic[(i + 1) % ic.length];
      for (const s of poly.segments) {
        if (segmentsCross(c1, c2, s.a, s.b)) return false;
      }
    }
  }
  return true;
}

/** Find the segment for a canonical wall (outer walls have id === wall). */
export function segmentForWall(poly: RoomPolygon, wall: Wall): WallSegment | undefined {
  return poly.segments.find(s => s.id === wall);
}

/**
 * Do two segments meet at a shared corner, and is it at segA's start (t=0, its
 * `a` end) or end (t=length, its `b` end)? Generalises geometry.ts
 * `sharedCornerAt`: reproduces it exactly for a rectangle's canonical walls,
 * and correctly returns null for walls separated by an L's notch (e.g. E and S
 * of an SE cutout no longer touch), so no phantom corner is reserved there.
 */
export function segmentSharedCornerAt(segA: WallSegment, segB: WallSegment, tol = 1): 'start' | 'end' | null {
  const near = (p: Vec2, q: Vec2) => len(sub(p, q)) <= tol;
  if (near(segA.a, segB.a) || near(segA.a, segB.b)) return 'start';
  if (near(segA.b, segB.a) || near(segA.b, segB.b)) return 'end';
  return null;
}

// ─── vertex adjacency / interior angles (corner-cabinet decisions) ──────────

/** Interior angle (deg) at each vertex. ~90° = convex inside corner (a
 *  corner-cabinet spot where two runs meet); ~270° = reflex (the inside of an
 *  L — runs just end there, no corner cabinet). */
export function interiorAngles(poly: RoomPolygon): number[] {
  const v = poly.vertices, n = v.length, out: number[] = [];
  const area2 = v.reduce((s, a, i) => { const b = v[(i + 1) % n]; return s + a.x * b.z - b.x * a.z; }, 0);
  const ccw = area2 > 0; // in z-down coords this reflects our winding
  for (let i = 0; i < n; i++) {
    const prev = v[(i - 1 + n) % n], cur = v[i], next = v[(i + 1) % n];
    const d1 = norm(sub(prev, cur)), d2 = norm(sub(next, cur));
    let ang = (Math.atan2(d2.z, d2.x) - Math.atan2(d1.z, d1.x)) * 180 / Math.PI;
    ang = ((ang % 360) + 360) % 360;
    // interior side depends on winding (verified against the rectangle oracle:
    // a rectangle's corners must read ~90°, an L's reflex vertex ~270°).
    out.push(ccw ? 360 - ang : ang);
  }
  return out;
}
