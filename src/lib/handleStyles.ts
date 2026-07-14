import { HandleDefinition, HandleType } from '@/types';

/**
 * Handle style classification + registry.
 *
 * The supplier feed (hardware_pricing) has ~290 real handles. We can't model
 * each SKU individually, so every row is classified by name/series into a
 * visual STYLE, and each style has a parametric 3D model in HandleMesh.
 * The registry lets the 3D scene resolve a hardware_pricing row id (the value
 * stored in cabinet.hardware.handleType) to a renderable HandleDefinition.
 */

export type HandleStyleGroup =
  | 'bar'
  | 'd-pull'
  | 'knob'
  | 'cup-edge'
  | 'flush'
  | 'profile'
  | 'accessory';

/** Display metadata for the picker, in display order. */
export const HANDLE_STYLE_GROUPS: { key: HandleStyleGroup; label: string; description: string }[] = [
  { key: 'bar', label: 'Bar Handles', description: 'Straight bar / rail pulls' },
  { key: 'd-pull', label: 'D & Bow Pulls', description: 'Curved pulls with feet' },
  { key: 'knob', label: 'Knobs', description: 'Single-point knobs' },
  { key: 'cup-edge', label: 'Cup & Edge Pulls', description: 'Shell cups and edge/lip pulls' },
  { key: 'flush', label: 'Flush & Inset', description: 'Recessed into the front' },
  { key: 'profile', label: 'Profile / Handleless', description: 'Continuous grip rails' },
  // 'accessory' intentionally omitted — end caps, corners etc. are not pickable handles.
];

/** Rows matching this are fittings for profile systems, not handles themselves. */
const ACCESSORY_RE = /end ?cap|internal corner|external corner|mounting bracket|strengthening strip|spacer profile|filler profile|antique fittings/i;

export function classifyHandleStyle(name: string, _series?: string | null, hardwareType?: string | null): HandleStyleGroup {
  // Classify on the product NAME. The series ("Furniture Handles & Knobs")
  // and the feed's hardware_type are too coarse — e.g. edge pulls are typed
  // handle_profile — so hardware_type is only a late hint for profile rails.
  const s = name.toLowerCase();
  if (ACCESSORY_RE.test(s)) return 'accessory';
  if (/flush handle|inset handle/.test(s)) return 'flush';
  if (/cup pull|half-moon|edge pull|lip pull/.test(s)) return 'cup-edge';
  if (/knob/.test(s)) return 'knob';
  if (/\bd handle\b|\bd pull\b|bow handle|handle with base/.test(s)) return 'd-pull';
  if (/recessed grip|handle profile|profile handle|handle profiles/.test(s)
    || (hardwareType ?? '').toLowerCase() === 'handle_profile') {
    return 'profile';
  }
  return 'bar';
}

/** 3D mesh type for a style group. */
const STYLE_TO_MESH: Record<HandleStyleGroup, HandleType> = {
  bar: 'Bar',
  'd-pull': 'DPull',
  knob: 'Knob',
  'cup-edge': 'Cup',
  flush: 'Flush',
  profile: 'Profile',
  accessory: 'None',
};

export function meshTypeForStyle(style: HandleStyleGroup, name?: string): HandleType {
  // Edge/lip pulls share a group with cups in the UI but render differently.
  if (style === 'cup-edge' && name && /edge pull|lip pull/i.test(name)) return 'Lip';
  return STYLE_TO_MESH[style];
}

/**
 * Finish colour from the product name. Returns a hex only when the material
 * dictates the colour (brass, wood…). Plated/paintable materials (zinc alloy,
 * aluminium) return null so the user's chosen handle finish applies.
 */
export function finishHexFromName(name: string): string | null {
  const s = name.toLowerCase();
  if (/brass/.test(s)) return '#b5a642';
  if (/copper/.test(s)) return '#b87333';
  if (/wood/.test(s)) return '#a67c52';
  if (/porcelain/.test(s)) return '#f2ede4';
  if (/stainless/.test(s)) return '#d1d5db';
  if (/black/.test(s)) return '#1a1a1a';
  if (/white/.test(s)) return '#ffffff';
  return null;
}

/** The handle finish swatches offered in the UI (single source of truth). */
export const HANDLE_FINISH_COLORS = [
  { id: 'matte-black', name: 'Matte Black', hex: '#1a1a1a' },
  { id: 'brushed-nickel', name: 'Brushed Nickel', hex: '#c0c0c0' },
  { id: 'chrome', name: 'Chrome', hex: '#e8e8e8' },
  { id: 'brass', name: 'Brass', hex: '#b5a642' },
  { id: 'copper', name: 'Copper', hex: '#b87333' },
  { id: 'white', name: 'White', hex: '#ffffff' },
] as const;

export function handleFinishHex(finishId?: string | null): string | null {
  return HANDLE_FINISH_COLORS.find((c) => c.id === finishId)?.hex ?? null;
}

export interface CatalogHandleRow {
  id: string;
  name: string;
  brand?: string | null;
  series?: string | null;
  hardwareType?: string | null;
  unitCost?: number | null;
}

// ---------------------------------------------------------------------------
// Registry: hardware_pricing row id -> HandleDefinition.
// Populated by useMaterialsCatalog (outside the R3F canvas); read synchronously
// by the 3D components, which can't use react-query hooks across renderers.
// ---------------------------------------------------------------------------

const registry = new Map<string, HandleDefinition>();

export function registerHandleRows(rows: CatalogHandleRow[]): void {
  for (const r of rows) {
    const style = classifyHandleStyle(r.name, r.series, r.hardwareType);
    registry.set(r.id, {
      id: r.id,
      name: r.name,
      type: meshTypeForStyle(style, r.name),
      hex: finishHexFromName(r.name) ?? '#c0c0c0',
      price: r.unitCost ?? 0,
      finishLocked: finishHexFromName(r.name) !== null,
    });
  }
}

/** Resolve a stored handle id (catalog row id) to a renderable definition. */
export function resolveHandleDefinition(id?: string | null): HandleDefinition | undefined {
  if (!id) return undefined;
  if (id === 'none') {
    return { id: 'none', name: 'No Handle', type: 'None', hex: 'transparent', price: 0 };
  }
  return registry.get(id);
}
