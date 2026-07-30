import type { CabinetType } from '@/types';
import { CATALOG_VERSION } from '@/lib/layout/versions';

export type HomeownerCabinetFamilyId =
  | 'base-doors'
  | 'base-drawers'
  | 'sink-base'
  | 'bin-pullout'
  | 'spice-pullout'
  | 'oven-base'
  | 'microwave-base'
  | 'dishwasher-opening'
  | 'blind-corner'
  | 'pie-cut-corner'
  | 'wall-doors'
  | 'wall-glass'
  | 'wall-open'
  | 'wall-rangehood'
  | 'wall-fridge-top'
  | 'wall-corner'
  | 'pantry'
  | 'pantry-drawers'
  | 'broom'
  | 'oven-tower'
  | 'oven-microwave-tower'
  | 'fridge-housing'
  | 'open-tall';

export interface HomeownerCabinetVariant {
  definitionId: string;
  label: string;
  widthsMm: readonly number[];
  handing?: 'left' | 'right';
}

export interface HomeownerCabinetFamily {
  id: HomeownerCabinetFamilyId;
  name: string;
  purpose: string;
  category: CabinetType;
  defaultWidthMm: number;
  variants: readonly HomeownerCabinetVariant[];
  tags: readonly string[];
}

export const HOMEOWNER_CABINET_CATALOG_VERSION = CATALOG_VERSION;

export const HOMEOWNER_CABINET_FAMILIES: readonly HomeownerCabinetFamily[] = [
  { id: 'base-doors', name: 'Door base cabinet', purpose: 'General storage with shelves', category: 'Base', defaultWidthMm: 600, tags: ['storage', 'shelves'], variants: [
    { definitionId: 'base_1_door', label: 'Single door', widthsMm: [300, 450, 600] },
    { definitionId: 'base_2_door', label: 'Double door', widthsMm: [600, 750, 900] },
  ] },
  { id: 'base-drawers', name: 'Drawer base cabinet', purpose: 'Easy-access pots, plates, and everyday storage', category: 'Base', defaultWidthMm: 600, tags: ['drawers', 'storage'], variants: [
    { definitionId: 'base_3_drawer', label: 'Three drawers', widthsMm: [450, 600, 750, 900] },
    { definitionId: 'base_4_drawer', label: 'Four drawers', widthsMm: [450, 600, 750, 900] },
  ] },
  { id: 'sink-base', name: 'Sink cabinet', purpose: 'Sink bowl and plumbing storage', category: 'Base', defaultWidthMm: 900, tags: ['sink', 'plumbing'], variants: [
    { definitionId: 'sink_base_1_door', label: 'Compact sink cabinet', widthsMm: [600] },
    { definitionId: 'sink_base_2_door', label: 'Double sink cabinet', widthsMm: [800, 900] },
  ] },
  { id: 'bin-pullout', name: 'Pull-out bin cabinet', purpose: 'Integrated waste and recycling', category: 'Base', defaultWidthMm: 450, tags: ['bin', 'waste'], variants: [
    { definitionId: 'base_bin_pullout', label: 'Pull-out bin', widthsMm: [300, 450, 600] },
  ] },
  { id: 'spice-pullout', name: 'Narrow pull-out', purpose: 'Oils, spices, and narrow-item storage', category: 'Base', defaultWidthMm: 300, tags: ['spices', 'narrow'], variants: [
    { definitionId: 'base_spice_pullout', label: 'Spice pull-out', widthsMm: [150, 200, 300] },
  ] },
  { id: 'oven-base', name: 'Under-bench oven cabinet', purpose: 'Housing for a 600 mm under-bench oven', category: 'Base', defaultWidthMm: 600, tags: ['oven', 'appliance'], variants: [
    { definitionId: 'base_oven', label: '600 mm oven', widthsMm: [600] },
  ] },
  { id: 'microwave-base', name: 'Microwave base cabinet', purpose: 'Open housing for a built-in microwave', category: 'Base', defaultWidthMm: 600, tags: ['microwave', 'appliance'], variants: [
    { definitionId: 'base_microwave', label: 'Built-in microwave', widthsMm: [600] },
  ] },
  { id: 'dishwasher-opening', name: 'Dishwasher opening', purpose: 'Correct opening and benchtop support for a dishwasher', category: 'Base', defaultWidthMm: 600, tags: ['dishwasher', 'appliance'], variants: [
    { definitionId: 'dishwasher_opening', label: '600 mm dishwasher', widthsMm: [600] },
  ] },
  { id: 'blind-corner', name: 'Blind corner cabinet', purpose: 'Turns an L or U corner with usable storage', category: 'Base', defaultWidthMm: 900, tags: ['corner', 'l-shape', 'u-shape'], variants: [
    { definitionId: 'base_corner_blind_left', label: 'Left blind', widthsMm: [900, 1000], handing: 'left' },
    { definitionId: 'base_corner_blind_right', label: 'Right blind', widthsMm: [900, 1000], handing: 'right' },
  ] },
  { id: 'pie-cut-corner', name: 'Corner cabinet', purpose: 'Two-door corner storage', category: 'Base', defaultWidthMm: 900, tags: ['corner', 'storage'], variants: [
    { definitionId: 'base_corner_pie_cut_2_door', label: 'Two-door corner', widthsMm: [900] },
  ] },
  { id: 'wall-doors', name: 'Wall cabinet', purpose: 'Everyday storage above the benchtop', category: 'Wall', defaultWidthMm: 600, tags: ['wall', 'storage'], variants: [
    { definitionId: 'wall_1_door', label: 'Single door', widthsMm: [300, 450, 600] },
    { definitionId: 'wall_2_door', label: 'Double door', widthsMm: [600, 750, 900] },
    { definitionId: 'wall_3_door', label: 'Triple door', widthsMm: [900, 1200] },
  ] },
  { id: 'wall-glass', name: 'Glass wall cabinet', purpose: 'Display storage with glazed doors', category: 'Wall', defaultWidthMm: 600, tags: ['wall', 'glass', 'display'], variants: [
    { definitionId: 'glass_wall_1_door', label: 'Single glass door', widthsMm: [300, 450, 600] },
    { definitionId: 'glass_wall_2_door', label: 'Double glass door', widthsMm: [600, 750, 900] },
  ] },
  { id: 'wall-open', name: 'Open wall shelf', purpose: 'Open display and quick-access storage', category: 'Wall', defaultWidthMm: 600, tags: ['wall', 'open', 'display'], variants: [
    { definitionId: 'open_wall', label: 'Open wall cabinet', widthsMm: [300, 450, 600, 900] },
  ] },
  { id: 'wall-rangehood', name: 'Rangehood cabinet', purpose: 'Housing around the cooking extraction', category: 'Wall', defaultWidthMm: 900, tags: ['rangehood', 'cooking'], variants: [
    { definitionId: 'wall_rangehood', label: 'Rangehood cabinet', widthsMm: [600, 900] },
  ] },
  { id: 'wall-fridge-top', name: 'Fridge-top cabinet', purpose: 'Storage above the refrigerator opening', category: 'Wall', defaultWidthMm: 900, tags: ['fridge', 'wall'], variants: [
    { definitionId: 'fridge_top_cabinet', label: 'Fridge-top storage', widthsMm: [800, 900, 1000] },
  ] },
  { id: 'wall-corner', name: 'Wall corner cabinet', purpose: 'Continues wall storage around a corner', category: 'Wall', defaultWidthMm: 600, tags: ['wall', 'corner'], variants: [
    { definitionId: 'wall_corner_blind_left', label: 'Left blind', widthsMm: [600, 750], handing: 'left' },
    { definitionId: 'wall_corner_blind_right', label: 'Right blind', widthsMm: [600, 750], handing: 'right' },
    { definitionId: 'wall_corner_diagonal', label: 'Diagonal corner', widthsMm: [600] },
  ] },
  { id: 'pantry', name: 'Tall pantry', purpose: 'Full-height food and appliance storage', category: 'Tall', defaultWidthMm: 600, tags: ['pantry', 'storage'], variants: [
    { definitionId: 'tall_1_door_pantry', label: 'Single door', widthsMm: [450, 600] },
    { definitionId: 'tall_2_door_pantry', label: 'Double door', widthsMm: [600, 750, 900] },
  ] },
  { id: 'pantry-drawers', name: 'Pantry with drawers', purpose: 'Tall storage with easy-access lower drawers', category: 'Tall', defaultWidthMm: 600, tags: ['pantry', 'drawers'], variants: [
    { definitionId: 'tall_2_door_pantry_2_drawer', label: 'Doors and drawers', widthsMm: [600, 750, 900] },
  ] },
  { id: 'broom', name: 'Broom cabinet', purpose: 'Tall cleaning and utility storage', category: 'Tall', defaultWidthMm: 450, tags: ['utility', 'cleaning'], variants: [
    { definitionId: 'tall_broom', label: 'Broom storage', widthsMm: [450, 600] },
  ] },
  { id: 'oven-tower', name: 'Oven tower', purpose: 'Ergonomic elevated oven housing', category: 'Tall', defaultWidthMm: 600, tags: ['oven', 'appliance'], variants: [
    { definitionId: 'tall_oven', label: 'Single oven tower', widthsMm: [600] },
  ] },
  { id: 'oven-microwave-tower', name: 'Oven and microwave tower', purpose: 'Combined built-in appliance housing', category: 'Tall', defaultWidthMm: 600, tags: ['oven', 'microwave', 'appliance'], variants: [
    { definitionId: 'tall_oven_microwave', label: 'Oven and microwave', widthsMm: [600] },
  ] },
  { id: 'fridge-housing', name: 'Fridge housing', purpose: 'Tall cabinet treatment around the refrigerator', category: 'Tall', defaultWidthMm: 900, tags: ['fridge', 'appliance'], variants: [
    { definitionId: 'tall_fridge', label: 'Fridge housing', widthsMm: [800, 900, 1000] },
  ] },
  { id: 'open-tall', name: 'Open tall cabinet', purpose: 'Open display or appliance storage', category: 'Tall', defaultWidthMm: 600, tags: ['open', 'display'], variants: [
    { definitionId: 'open_tall', label: 'Open tall storage', widthsMm: [450, 600, 900] },
  ] },
] as const;

export function findHomeownerCabinetFamily(id: string): HomeownerCabinetFamily | undefined {
  return HOMEOWNER_CABINET_FAMILIES.find(family => family.id === id);
}

export function resolveHomeownerCabinetVariant(
  familyId: HomeownerCabinetFamilyId,
  widthMm: number,
  handing?: 'left' | 'right',
): HomeownerCabinetVariant | null {
  const family = findHomeownerCabinetFamily(familyId);
  if (!family) return null;
  return family.variants.find(variant =>
    variant.widthsMm.includes(widthMm)
    && (!variant.handing || variant.handing === handing)
  ) ?? null;
}
