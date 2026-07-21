/**
 * Wall/plan geometry helpers for the layout engine.
 *
 * Conventions (MUST match UnifiedScene's room rendering — corner origin):
 * - Room spans x ∈ [0, width], z ∈ [0, depth] (mm; scene divides by 1000).
 * - N wall (back) at z = 0, items face +z, rotation 0.
 * - E wall (right) at x = width, rotation 90.
 * - S wall (front) at z = depth, rotation 180.
 * - W wall (left) at x = 0, rotation 270.
 *   (CabinetMesh applies rotation as -degToRad(θ); these values match the
 *   manual planner's wallSnapping.ts — left wall 270, right wall 90. The old
 *   E:270/W:90 mapping rendered side-wall runs facing INTO the wall.)
 * - Wall offsets (t, mm) are measured from the wall's LEFT corner when facing
 *   the wall from inside the room. Under this convention, low-t is always the
 *   cabinet row's LEFT end as seen from the room, on every wall — which is
 *   what PlacedItem.endPanelLeft / fillerLeft refer to.
 */

import type { Opening, RoomConfig } from '@/types';
import type { PlacedItem } from '@/types';
import type { Wall } from './types';

export const WALL_ROTATION: Record<Wall, number> = { N: 0, E: 90, S: 180, W: 270 };

export function wallLength(wall: Wall, room: RoomConfig): number {
  return wall === 'N' || wall === 'S' ? room.width : room.depth;
}

/** World-space center for an item of `widthMm` at wall offset `t`, sitting
 *  against the wall with carcase depth `depthMm`. */
export function wallToWorld(
  wall: Wall, t: number, widthMm: number, depthMm: number, room: RoomConfig,
): { x: number; z: number; rotation: number } {
  const c = t + widthMm / 2; // center along the wall
  switch (wall) {
    case 'N': return { x: c, z: depthMm / 2, rotation: 0 };
    case 'E': return { x: room.width - depthMm / 2, z: c, rotation: 90 };
    case 'S': return { x: room.width - c, z: room.depth - depthMm / 2, rotation: 180 };
    case 'W': return { x: depthMm / 2, z: room.depth - c, rotation: 270 };
  }
}

/** Axis-aligned plan-view rect for a placed item (rotations are multiples of 90°). */
export interface PlanRect { minX: number; maxX: number; minZ: number; maxZ: number }

export function itemRect(item: PlacedItem): PlanRect {
  const rot = ((item.rotation % 360) + 360) % 360;
  const alongX = rot === 0 || rot === 180;
  const sx = alongX ? item.width : item.depth;
  const sz = alongX ? item.depth : item.width;
  return {
    minX: item.x - sx / 2, maxX: item.x + sx / 2,
    minZ: item.z - sz / 2, maxZ: item.z + sz / 2,
  };
}

export function rectsOverlap(a: PlanRect, b: PlanRect, toleranceMm = 1): boolean {
  return a.minX < b.maxX - toleranceMm && a.maxX > b.minX + toleranceMm
    && a.minZ < b.maxZ - toleranceMm && a.maxZ > b.minZ + toleranceMm;
}

/** 1-D interval on a wall. */
export interface Interval { start: number; end: number }

/** Blocked intervals on a wall for BASE/TALL cabinets: doors + walkways (+margin).
 *  Margin covers the architrave plus a scribe allowance so cabinets never butt
 *  hard against a doorway (the run closes the gap with a filler). */
export function baseBlockedIntervals(wall: Wall, openings: Opening[], marginMm = 50): Interval[] {
  return openings
    .filter(o => o.wall === wall && (o.type === 'door' || o.type === 'walkway'))
    .map(o => ({ start: o.offsetMm - marginMm, end: o.offsetMm + o.widthMm + marginMm }));
}

/** Blocked intervals for WALL cabinets: doors, walkways, and windows.
 *  (Base cabinets can sit under a window; wall cabinets cannot cross one.) */
export function wallCabBlockedIntervals(wall: Wall, openings: Opening[], marginMm = 50): Interval[] {
  return openings
    .filter(o => o.wall === wall)
    .map(o => ({ start: o.offsetMm - marginMm, end: o.offsetMm + o.widthMm + marginMm }));
}

/** Subtract blocked intervals from [0, length] → sorted usable intervals. */
export function usableIntervals(lengthMm: number, blocked: Interval[]): Interval[] {
  const sorted = [...blocked].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  let cursor = 0;
  for (const b of sorted) {
    if (b.start > cursor) out.push({ start: cursor, end: Math.min(b.start, lengthMm) });
    cursor = Math.max(cursor, b.end);
    if (cursor >= lengthMm) break;
  }
  if (cursor < lengthMm) out.push({ start: cursor, end: lengthMm });
  return out.filter(i => i.end - i.start >= 100);
}

/** Distance between a wall offset position and a plan point, both projected to world. */
export function wallPointWorld(wall: Wall, t: number, room: RoomConfig): { x: number; z: number } {
  const p = wallToWorld(wall, t, 0, 0, room);
  return { x: p.x, z: p.z };
}

export function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Where (in wall-offset terms) does `wall` meet `other`?
 * Returns 'start' (t=0), 'end' (t=length), or null if not adjacent.
 * Derived from the offset conventions at the top of this file:
 *   N t0=W corner, N tEnd=E corner; E t0=N corner, E tEnd=S corner;
 *   S t0=E corner, S tEnd=W corner; W t0=S corner, W tEnd=N corner.
 */
export function sharedCornerAt(wall: Wall, other: Wall): 'start' | 'end' | null {
  const map: Record<string, 'start' | 'end'> = {
    'N|W': 'start', 'N|E': 'end',
    'E|N': 'start', 'E|S': 'end',
    'S|E': 'start', 'S|W': 'end',
    'W|S': 'start', 'W|N': 'end',
  };
  return map[`${wall}|${other}`] ?? null;
}
