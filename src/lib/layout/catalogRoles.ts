/**
 * Role → catalog product mapping.
 * v1 maps to the STATIC_LIBRARY_TEMPLATES ids in useCatalog.ts (these always
 * render in UnifiedScene). A DB-backed resolver can override per role later —
 * keep this the single place role→SKU knowledge lives.
 */

import type { SegmentRole } from './types';

export interface RoleProduct {
  definitionId: string;
  /** preferred widths in priority order (mm) */
  widths: number[];
  kind: 'base' | 'tall' | 'appliance';
  /** price weight used by the v1 estimator (AUD per unit at 600mm, ex GST) */
  priceWeight: number;
}

/** Planner default side ventilation/service clearance. A selected appliance's
 * manufacturer instructions remain authoritative at final specification. */
export const FRIDGE_SIDE_CLEARANCE_MM = 50;

/** Hard minimum door-swing spacer between a fridge opening and a perpendicular
 * room wall. This sits outside the opening's own 50mm appliance side gap. */
export const FRIDGE_ROOM_CORNER_CLEARANCE_MM = 150;

/** Preferred landing cupboard used instead of a spacer whenever the run has room. */
export const FRIDGE_PREFERRED_CORNER_LANDING_MM = 600;

/** Cabinet-run width required for the appliance plus both side clearances. */
export function fridgeOpeningWidthMm(applianceWidthMm: number): number {
  return applianceWidthMm + FRIDGE_SIDE_CLEARANCE_MM * 2;
}

/**
 * Recover the appliance body width from a reserved opening.
 *
 * New compiled layouts stamp the explicit body width so adding clearance never
 * shrinks the appliance. The fallback gives older saved openings safe gaps.
 */
export function fridgeBodyWidthMm(
  openingWidthMm: number,
  explicitBodyWidthMm?: number,
): number {
  if (explicitBodyWidthMm !== undefined) {
    // Exact manufacturer cavities can be much tighter than the generic
    // freestanding allowance (for example 908mm body in a 914mm frame).
    // Preserve the nominated body and only guard against impossible data.
    return Math.min(Math.max(200, explicitBodyWidthMm), openingWidthMm);
  }
  return Math.max(200, openingWidthMm - FRIDGE_SIDE_CLEARANCE_MM * 2);
}

export const ROLE_PRODUCTS: Record<SegmentRole, RoleProduct> = {
  sink:        { definitionId: 'sink_base_2_door',    widths: [900, 800, 600], kind: 'base',      priceWeight: 620 },
  cooktop:     { definitionId: 'base_2_door',         widths: [900, 600],      kind: 'base',      priceWeight: 560 },
  dishwasher:  { definitionId: 'dishwasher_opening',  widths: [600],           kind: 'appliance', priceWeight: 160 },
  // Bower's normal drawer bank is a prompt-sized 500mm four-drawer unit.
  drawers:     { definitionId: 'base_4_drawer',       widths: [500],           kind: 'base',      priceWeight: 890 },
  doors:       { definitionId: 'base_2_door',         widths: [900, 600, 450, 300], kind: 'base', priceWeight: 520 },
  pantry:      { definitionId: 'tall_2_door_pantry',  widths: [900, 600, 450], kind: 'tall',      priceWeight: 1150 },
  'oven-tower':{ definitionId: 'tall_oven',           widths: [600],           kind: 'tall',      priceWeight: 980 },
  // Normal nominated appliance widths are 600/700/800/900mm; these are the
  // corresponding openings after the planner's default 50mm allowance each side.
  'fridge-gap':{ definitionId: 'fridge_opening',      widths: [1000, 900, 800, 700], kind: 'appliance', priceWeight: 220 },
  // The normal internal-corner product is a 900 x 900 two-door pie-cut
  // cabinet with linked bi-fold doors. Blind corners remain a fallback.
  corner:      { definitionId: 'base_corner_pie_cut_2_door', widths: [900], kind: 'base', priceWeight: 950 },
  'corner-buffer': { definitionId: 'base_2_door',     widths: [600],           kind: 'base',      priceWeight: 520 },
  // Full-height mapped pantry used between a physical room corner and the
  // fridge. It keeps the tall bank visually continuous while giving the
  // fridge doors a full cabinet width of clearance.
  'fridge-corner-pantry': { definitionId: 'tall_2_door_pantry', widths: [600], kind: 'tall', priceWeight: 1150 },
};

/** Single-door variant when a narrow width is used. */
export function resolveDefinition(role: SegmentRole, widthMm: number): string {
  if ((role === 'doors' || role === 'corner-buffer') && widthMm <= 450) return 'base_1_door';
  if (role === 'doors' || role === 'corner-buffer') return 'base_2_door';
  if (role === 'sink' && widthMm <= 600) return 'sink_base_1_door';
  if (role === 'drawers') return widthMm === 500 ? 'base_4_drawer' : 'base_3_drawer';
  if (role === 'pantry' && widthMm <= 600) return 'tall_1_door_pantry';
  if (role === 'pantry') return 'tall_2_door_pantry';
  return ROLE_PRODUCTS[role].definitionId;
}

/**
 * Blind-corner variant by which side of the cabinet (as seen from the room,
 * i.e. in wall-offset terms: low-t = Left) faces the corner. The blind panel
 * must be on the corner side so the doors open clear of the adjacent run.
 */
export function resolveCornerVariant(blindSide: 'Left' | 'Right'): string {
  return blindSide === 'Left' ? 'base_corner_blind_left' : 'base_corner_blind_right';
}

/** Wall-cabinet fill products (above base runs). */
export const WALL_CAB = { definitionId: 'wall_2_door', narrowId: 'wall_1_door', widths: [900, 600, 450, 300] };
export const OPEN_WALL_CAB = { definitionId: 'open_wall', widths: [900, 600, 450, 300] };
export const RANGEHOOD_ID = 'wall_rangehood';
export const FRIDGE_TOP_ID = 'fridge_top_cabinet';

/** Fixed appliance/role widths that must not be resized to fit. */
export const FIXED_WIDTH_ROLES: SegmentRole[] = [
  'dishwasher', 'drawers', 'oven-tower', 'corner', 'corner-buffer', 'fridge-corner-pantry',
];
