/**
 * Exact planner/Microvellum capability registry.
 *
 * Style DNA may ask for a feature, but a customer-visible family is only
 * release-ready when every mandatory capability resolves to real catalogue
 * definition IDs. Empty definition lists are deliberate blockers, never
 * placeholders.
 */

export type CatalogCapabilityId =
  | 'base-cabinet'
  | 'closed-wall-cabinet'
  | 'open-wall-cabinet'
  | 'bifold-corner-cabinet'
  | 'blind-corner-cabinet'
  | 'tall-pantry'
  | 'oven-tower'
  | 'fridge-opening'
  | 'slab-door-profile'
  | 'slim-shaker-door-profile'
  | 'shaker-door-profile'
  | 'crown-moulding'
  | 'pillar-end'
  | 'fluted-end';

export interface CatalogCapability {
  id: CatalogCapabilityId;
  label: string;
  /** Exact IDs understood by the current renderer/export/catalogue path. */
  definitionIds: readonly string[];
  status: 'mapped' | 'unmapped';
  note?: string;
}

export const CATALOG_CAPABILITIES: Readonly<Record<CatalogCapabilityId, CatalogCapability>> = Object.freeze({
  'base-cabinet': {
    id: 'base-cabinet', label: 'Base cabinets', status: 'mapped',
    definitionIds: ['base_1_door', 'base_2_door', 'base_3_drawer', 'base_4_drawer', 'base_oven', 'sink_base_1_door', 'sink_base_2_door'],
  },
  'closed-wall-cabinet': {
    id: 'closed-wall-cabinet', label: 'Closed overhead cabinets', status: 'mapped',
    definitionIds: ['wall_1_door', 'wall_2_door', 'wall_corner_pie_cut_2_door', 'wall_corner_diagonal'],
  },
  'open-wall-cabinet': {
    id: 'open-wall-cabinet', label: 'Open wall shelving', status: 'mapped',
    definitionIds: ['open_wall'],
  },
  'bifold-corner-cabinet': {
    id: 'bifold-corner-cabinet', label: 'Two-door bi-fold corner cabinet', status: 'mapped',
    definitionIds: ['base_corner_pie_cut_2_door'],
  },
  'blind-corner-cabinet': {
    id: 'blind-corner-cabinet', label: 'Blind corner cabinet', status: 'mapped',
    definitionIds: ['base_corner_blind_left', 'base_corner_blind_right'],
  },
  'tall-pantry': {
    id: 'tall-pantry', label: 'Tall pantry', status: 'mapped',
    definitionIds: ['tall_1_door_pantry', 'tall_2_door_pantry'],
  },
  'oven-tower': {
    id: 'oven-tower', label: 'Oven tower', status: 'mapped',
    definitionIds: ['tall_oven'],
  },
  'fridge-opening': {
    id: 'fridge-opening', label: 'Fridge opening', status: 'mapped',
    definitionIds: ['fridge_opening', 'fridge_top_cabinet'],
  },
  'slab-door-profile': {
    id: 'slab-door-profile', label: 'Slab door profile', status: 'mapped',
    definitionIds: ['door-profile:slab'],
  },
  'slim-shaker-door-profile': {
    id: 'slim-shaker-door-profile', label: 'Slim shaker door profile', status: 'unmapped',
    definitionIds: [], note: 'Requires a confirmed Microvellum door-product definition before activation.',
  },
  'shaker-door-profile': {
    id: 'shaker-door-profile', label: 'Shaker door profile', status: 'unmapped',
    definitionIds: [], note: 'Requires a confirmed Microvellum door-product definition before activation.',
  },
  'crown-moulding': {
    id: 'crown-moulding', label: 'Overhead crown moulding', status: 'unmapped',
    definitionIds: [], note: 'Extruded Crown exists as a part but is not yet mapped as a planner feature product.',
  },
  'pillar-end': {
    id: 'pillar-end', label: 'Pillar end', status: 'unmapped',
    definitionIds: [], note: 'Requires a confirmed Microvellum product and width rules.',
  },
  'fluted-end': {
    id: 'fluted-end', label: 'Fluted end', status: 'unmapped',
    definitionIds: [], note: 'Requires a confirmed Microvellum product and width rules.',
  },
});

export function unmappedCapabilities(ids: readonly CatalogCapabilityId[]): CatalogCapability[] {
  return ids.map(id => CATALOG_CAPABILITIES[id]).filter(capability => capability.status !== 'mapped');
}

export function capabilitiesAreMapped(ids: readonly CatalogCapabilityId[]): boolean {
  return unmappedCapabilities(ids).length === 0;
}

export function definitionIdsForCapability(id: CatalogCapabilityId): readonly string[] {
  return CATALOG_CAPABILITIES[id].definitionIds;
}
