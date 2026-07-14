/**
 * Auto-placement for newly added cabinets (refine F-6): back against the
 * nearest wall with a free run, instead of free-floating mid-room.
 *
 * Wall preference: back (N) → left (W) → right (E) → front (S).
 * The search is opening-aware, using the same rules as the placement
 * warnings: doors/walkways block every category; windows only block
 * wall/tall cabinetry (a base under a window is fine).
 *
 * All coordinates are CENTRE coordinates in room mm (x from the W wall,
 * z from the N wall) — the planner's single convention.
 */

import type { Opening, RoomConfig } from '../../types';

export interface AutoPlaceObstacle {
  x: number;
  z: number;
  rotation: number;
  width: number;
  depth: number;
  /** occupies the floor run (base/tall/appliance) */
  blocksFloor: boolean;
  /** occupies the wall run (wall/tall) */
  blocksWall: boolean;
}

export interface AutoPlaceRequest {
  room: RoomConfig;
  width: number;
  depth: number;
  category: 'Base' | 'Wall' | 'Tall' | 'Appliance';
  obstacles: AutoPlaceObstacle[];
  wallGap?: number;
  /** clearance kept between neighbours (mm) */
  clearance?: number;
}

export interface AutoPlacement {
  x: number;
  z: number;
  rotation: 0 | 90 | 180 | 270;
  wall: 'N' | 'E' | 'S' | 'W';
}

type Interval = [number, number];

const WALL_ORDER: Array<{ wall: 'N' | 'W' | 'E' | 'S'; rotation: 0 | 90 | 180 | 270 }> = [
  { wall: 'N', rotation: 0 },
  { wall: 'W', rotation: 270 },
  { wall: 'E', rotation: 90 },
  { wall: 'S', rotation: 180 },
];

const DEFAULT_DOOR_HEIGHT = 2040;

function axisAlignedFootprint(o: AutoPlaceObstacle): { x0: number; x1: number; z0: number; z1: number } {
  const rot = ((Math.round(o.rotation) % 360) + 360) % 360;
  const swapped = rot === 90 || rot === 270;
  const w = swapped ? o.depth : o.width;
  const d = swapped ? o.width : o.depth;
  return { x0: o.x - w / 2, x1: o.x + w / 2, z0: o.z - d / 2, z1: o.z + d / 2 };
}

/** Opening span projected onto the wall's axis (offsets run from the wall's
 *  left end viewed from inside — same mapping as the scene/warnings). */
function openingInterval(o: Opening, roomW: number, roomD: number): Interval {
  switch (o.wall) {
    case 'N': return [o.offsetMm, o.offsetMm + o.widthMm];
    case 'S': return [roomW - o.offsetMm - o.widthMm, roomW - o.offsetMm];
    case 'W': return [roomD - o.offsetMm - o.widthMm, roomD - o.offsetMm];
    default:  return [o.offsetMm, o.offsetMm + o.widthMm]; // E
  }
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .map(([a, b]): Interval => [Math.min(a, b), Math.max(a, b)])
    .sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const iv of sorted) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1]) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}

/**
 * F-11: is a room corner clear of openings along BOTH adjoining walls for a
 * corner unit whose arms reach `armMm` from the corner? Doors/walkways always
 * block; windows only block wall/tall corner units (same matrix as the
 * placement warnings).
 */
export function isCornerClear(
  room: RoomConfig,
  corner: { x: number; z: number },
  armMm: number,
  category: 'Base' | 'Wall' | 'Tall' | 'Appliance' = 'Base',
): boolean {
  const openings = room.openings ?? [];
  if (!openings.length) return true;
  const roomW = room.width;
  const roomD = room.depth;

  const xWall: 'N' | 'S' = corner.z === 0 ? 'N' : 'S';
  const zWall: 'W' | 'E' = corner.x === 0 ? 'W' : 'E';
  const xSpan: Interval = corner.x === 0 ? [0, armMm] : [roomW - armMm, roomW];
  const zSpan: Interval = corner.z === 0 ? [0, armMm] : [roomD - armMm, roomD];

  for (const op of openings) {
    const blocksThis = op.type === 'window' ? category === 'Wall' || category === 'Tall' : true;
    if (!blocksThis) continue;
    const iv = openingInterval(op, roomW, roomD);
    if (op.wall === xWall && Math.min(iv[1], xSpan[1]) - Math.max(iv[0], xSpan[0]) > 10) return false;
    if (op.wall === zWall && Math.min(iv[1], zSpan[1]) - Math.max(iv[0], zSpan[0]) > 10) return false;
  }
  return true;
}

export function findAutoWallPlacement(req: AutoPlaceRequest): AutoPlacement | null {
  const { room, width, depth, category, obstacles } = req;
  const wallGap = req.wallGap ?? 10;
  const clearance = req.clearance ?? 5;
  const roomW = room.width;
  const roomD = room.depth;
  const openings = room.openings ?? [];

  const relevantObstacles = obstacles.filter((o) =>
    category === 'Wall' ? o.blocksWall : category === 'Tall' ? o.blocksFloor || o.blocksWall : o.blocksFloor,
  );

  for (const { wall, rotation } of WALL_ORDER) {
    const along = wall === 'N' || wall === 'S' ? roomW : roomD;
    if (along < width + 2 * wallGap) continue;

    // How far the new cabinet's front face reaches into the room from this wall.
    const bandDepth = wallGap + depth + 20;

    const blocked: Interval[] = [];

    // Existing cabinetry intruding into this wall's band.
    for (const o of relevantObstacles) {
      const f = axisAlignedFootprint(o);
      let intrudes = false;
      let span: Interval = [0, 0];
      switch (wall) {
        case 'N': intrudes = f.z0 < bandDepth; span = [f.x0, f.x1]; break;
        case 'S': intrudes = f.z1 > roomD - bandDepth; span = [f.x0, f.x1]; break;
        case 'W': intrudes = f.x0 < bandDepth; span = [f.z0, f.z1]; break;
        case 'E': intrudes = f.x1 > roomW - bandDepth; span = [f.z0, f.z1]; break;
      }
      if (intrudes) blocked.push([span[0] - clearance, span[1] + clearance]);
    }

    // Openings on this wall. Windows only block wall/tall runs; a base
    // cabinet under the sill is legitimate (mirrors openingWarnings).
    for (const op of openings) {
      if (op.wall !== wall) continue;
      const blocksThis =
        op.type === 'window'
          ? category === 'Wall' || category === 'Tall'
          : true;
      if (!blocksThis) continue;
      // Walkway/door height never matters for floor runs — they block anyway.
      void DEFAULT_DOOR_HEIGHT;
      const [a, b] = openingInterval(op, roomW, roomD);
      blocked.push([a - clearance, b + clearance]);
    }

    // First-fit gap scan from the wall's left corner.
    const usable: Interval = [wallGap, along - wallGap];
    const merged = mergeIntervals(blocked);
    let cursor = usable[0];
    for (const [b0, b1] of merged) {
      if (b0 - cursor >= width) break; // gap before this block fits
      cursor = Math.max(cursor, b1);
    }
    if (usable[1] - cursor < width) continue; // no room on this wall

    // The scan runs in room-axis coordinates (x for N/S walls, z for E/W),
    // matching the obstacle/opening intervals above.
    const uCenter = cursor + width / 2;
    const backOffset = wallGap + depth / 2;
    switch (wall) {
      case 'N': return { x: uCenter, z: backOffset, rotation, wall };
      case 'S': return { x: uCenter, z: roomD - backOffset, rotation, wall };
      case 'W': return { x: backOffset, z: uCenter, rotation, wall };
      case 'E': return { x: roomW - backOffset, z: uCenter, rotation, wall };
    }
  }

  return null;
}
