/**
 * Warn-only, category/height-aware opening conflict detection for manual
 * trade placement (master plan §8.2). Pure module — no React, no IO — so the
 * matrix is unit-testable and the planner recomputes it via useMemo on every
 * placement/edit/undo state change.
 *
 * Rules:
 * - Doors and walkways conflict with ANY cabinet whose footprint blocks the
 *   opening's approach strip (base, tall, wall, appliance).
 * - Windows conflict only where the cabinet's VERTICAL range overlaps the
 *   glazing: wall and tall cabinets warn; a base cabinet below the sill does
 *   not (50mm tolerance kills the base-top-vs-900-sill false positive).
 * - Phase 1 warns; it never blocks placement.
 *
 * Plan coordinates match PlannerScene/planViewPdf: x∈[0,width] from the W
 * wall, z∈[0,depth] from the N wall. Opening offsets run from the wall's
 * left end AS VIEWED FROM INSIDE THE ROOM (same mapping as
 * PlannerScene.OpeningFootprints).
 */

import type { GlobalDimensions, Opening } from '@/types';
import type { ConfiguredCabinet } from '@/types/trade';

export interface PlacementWarning {
  cabinetId: string;
  cabinetLabel: string;
  openingId: string;
  openingType: Opening['type'];
  message: string;
}

interface Rect { x0: number; x1: number; z0: number; z1: number; }

/** How far a cabinet can sit from the wall and still block the opening. */
const STRIP_DEPTH_MM = 700;
/** Minimum overlap before we call it a conflict (kills grazing contacts). */
const H_EPS_MM = 10;
const V_EPS_MM = 50;

const DEFAULT_DOOR_HEIGHT = 2040;
const DEFAULT_WINDOW_HEIGHT = 1200;
const DEFAULT_SILL = 900;
const BENCHTOP_MM = 40;

function openingStrip(o: Opening, roomW: number, roomD: number): Rect {
  const w = o.widthMm;
  switch (o.wall) {
    case 'N': return { x0: o.offsetMm, x1: o.offsetMm + w, z0: 0, z1: STRIP_DEPTH_MM };
    case 'S': return { x0: roomW - o.offsetMm - w, x1: roomW - o.offsetMm, z0: roomD - STRIP_DEPTH_MM, z1: roomD };
    case 'W': return { x0: 0, x1: STRIP_DEPTH_MM, z0: roomD - o.offsetMm - w, z1: roomD - o.offsetMm };
    default:  return { x0: roomW - STRIP_DEPTH_MM, x1: roomW, z0: o.offsetMm, z1: o.offsetMm + w }; // E
  }
}

function cabinetFootprint(cab: ConfiguredCabinet): Rect | null {
  if (!cab.isPlaced || !cab.position) return null;
  const rot = ((Math.round(cab.position.rotation) % 360) + 360) % 360;
  const rotated = rot === 90 || rot === 270;
  const w = rotated ? cab.dimensions.depth : cab.dimensions.width;
  const d = rotated ? cab.dimensions.width : cab.dimensions.depth;
  return {
    x0: cab.position.x - w / 2,
    x1: cab.position.x + w / 2,
    z0: cab.position.z - d / 2,
    z1: cab.position.z + d / 2,
  };
}

function overlapMm(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function cabinetVerticalRange(cab: ConfiguredCabinet, dims: GlobalDimensions): [number, number] {
  switch (cab.category) {
    case 'Wall': {
      const mount = dims.wallMountHeight ?? 1350;
      return [mount, mount + cab.dimensions.height];
    }
    case 'Tall':
      return [0, dims.toeKickHeight + cab.dimensions.height];
    default: // Base, Appliance
      return [0, dims.toeKickHeight + cab.dimensions.height + BENCHTOP_MM];
  }
}

function openingVerticalRange(o: Opening): [number, number] {
  if (o.type === 'window') {
    const sill = o.sillHeightMm ?? DEFAULT_SILL;
    return [sill, sill + (o.heightMm ?? DEFAULT_WINDOW_HEIGHT)];
  }
  return [0, o.heightMm ?? DEFAULT_DOOR_HEIGHT];
}

const OPENING_LABEL: Record<Opening['type'], string> = {
  door: 'the doorway',
  walkway: 'the walkway',
  window: 'the window',
};

export function computeOpeningWarnings(
  room: { width: number; depth: number; openings?: Opening[] },
  dims: GlobalDimensions,
  cabinets: ConfiguredCabinet[],
): PlacementWarning[] {
  const openings = room.openings ?? [];
  if (!openings.length) return [];

  const warnings: PlacementWarning[] = [];
  for (const cab of cabinets) {
    const foot = cabinetFootprint(cab);
    if (!foot) continue;
    const [cabLo, cabHi] = cabinetVerticalRange(cab, dims);

    for (const o of openings) {
      const strip = openingStrip(o, room.width, room.depth);
      const hx = overlapMm(foot.x0, foot.x1, strip.x0, strip.x1);
      const hz = overlapMm(foot.z0, foot.z1, strip.z0, strip.z1);
      if (hx < H_EPS_MM || hz < H_EPS_MM) continue;

      if (o.type === 'window') {
        const [winLo, winHi] = openingVerticalRange(o);
        if (overlapMm(cabLo, cabHi, winLo, winHi) < V_EPS_MM) continue; // e.g. base below sill
      }

      warnings.push({
        cabinetId: cab.instanceId,
        cabinetLabel: `${cab.cabinetNumber} ${cab.productName}`.trim(),
        openingId: o.id,
        openingType: o.type,
        message: `${cab.cabinetNumber || cab.productName} ${
          o.type === 'window' ? 'sits across' : 'blocks'
        } ${OPENING_LABEL[o.type]} on the ${
          { N: 'back', E: 'right', S: 'front', W: 'left' }[o.wall]
        } wall`,
      });
    }
  }
  return warnings;
}
