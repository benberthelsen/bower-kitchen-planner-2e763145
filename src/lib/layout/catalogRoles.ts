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

export const ROLE_PRODUCTS: Record<SegmentRole, RoleProduct> = {
  sink:        { definitionId: 'sink_base_2_door',    widths: [900, 800, 600], kind: 'base',      priceWeight: 620 },
  cooktop:     { definitionId: 'base_2_door',         widths: [900, 600],      kind: 'base',      priceWeight: 560 },
  dishwasher:  { definitionId: 'dishwasher_opening',  widths: [600],           kind: 'appliance', priceWeight: 160 },
  drawers:     { definitionId: 'base_3_drawer',       widths: [900, 600, 450], kind: 'base',      priceWeight: 890 },
  doors:       { definitionId: 'base_2_door',         widths: [900, 600, 450, 300], kind: 'base', priceWeight: 520 },
  pantry:      { definitionId: 'tall_2_door_pantry',  widths: [900, 600, 450], kind: 'tall',      priceWeight: 1150 },
  'oven-tower':{ definitionId: 'tall_oven',           widths: [600],           kind: 'tall',      priceWeight: 980 },
  'fridge-gap':{ definitionId: 'fridge_opening',      widths: [940, 920, 860], kind: 'appliance', priceWeight: 220 },
  corner:      { definitionId: 'base_corner_blind_left', widths: [900, 1000],  kind: 'base',      priceWeight: 950 },
};

/** Single-door variant when a narrow width is used. */
export function resolveDefinition(role: SegmentRole, widthMm: number): string {
  if (role === 'doors' && widthMm <= 600) return 'base_1_door';
  if (role === 'sink' && widthMm <= 600) return 'sink_base_1_door';
  if (role === 'drawers' && widthMm <= 450) return 'base_3_drawer';
  return ROLE_PRODUCTS[role].definitionId;
}

/** Wall-cabinet fill products (above base runs). */
export const WALL_CAB = { definitionId: 'wall_2_door', narrowId: 'wall_1_door', widths: [900, 600, 450, 300] };
export const RANGEHOOD_ID = 'wall_rangehood';
export const FRIDGE_TOP_ID = 'fridge_top_cabinet';

/** Fixed appliance/role widths that must not be resized to fit. */
export const FIXED_WIDTH_ROLES: SegmentRole[] = ['dishwasher', 'oven-tower'];
