// Cabinet to parts mapping - defines which parts each cabinet type requires

import { CabinetConfig } from './types';

interface PartRequirement {
  partType: string;
  quantity: number | 'perDoor' | 'perDrawer' | 'perShelf';
}

interface CabinetPartDefinition {
  config: CabinetConfig;
  parts: PartRequirement[];
}

// Map cabinet definition IDs to their part requirements
export const CABINET_PART_MAP: Record<string, CabinetPartDefinition> = {
  // Base cabinets - single door
  'base-300-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-450-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-600-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  
  // Base cabinets - double door
  'base-800-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-900-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  
  // Base cabinets - drawers
  'base-450-4dr': {
    config: { numDoors: 0, numDrawers: 4, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'base-600-2dr': {
    config: { numDoors: 0, numDrawers: 2, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'base-600-3dr': {
    config: { numDoors: 0, numDrawers: 3, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'base-900-3dr': {
    config: { numDoors: 0, numDrawers: 3, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  
  // Base cabinets - special
  'base-150-po': {
    config: { numDoors: 0, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
    ]
  },
  'base-600-ov': {
    config: { numDoors: 0, numDrawers: 1, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  
  // Sink cabinets
  'base-600-sink': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: false, hasTop: false, hasRails: true, isSinkCabinet: true, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
    ]
  },
  'base-900-sink': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: false, hasTop: false, hasRails: true, isSinkCabinet: true, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
    ]
  },
  
  // Corner cabinets
  'base-1000-bc': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: false, isBlind: true },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 1 },
      { partType: 'Base Front Rail', quantity: 1 },
      { partType: 'Base Rear Rail', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'base-900-lc': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 1, hasSides: true, hasBack: true, hasBottom: true, hasTop: false, hasRails: true, isSinkCabinet: false, isCorner: true, isBlind: false },
    parts: [
      { partType: 'Base Left Side', quantity: 1 },
      { partType: 'Base Right Side', quantity: 1 },
      { partType: 'Base Bottom', quantity: 1 },
      { partType: 'Base Back', quantity: 2 },
      { partType: 'Base Front Rail', quantity: 2 },
      { partType: 'Base Rear Rail', quantity: 2 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  
  // Wall cabinets
  'wall-300-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-450-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-600-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-600-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-800-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-900-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'wall-600-rh': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
    ]
  },
  'wall-900-rh': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Wall Left Side', quantity: 1 },
      { partType: 'Wall Right Side', quantity: 1 },
      { partType: 'Wall Top', quantity: 1 },
      { partType: 'Wall Bottom', quantity: 1 },
      { partType: 'Wall Back', quantity: 1 },
    ]
  },
  
  // Tall cabinets
  'tall-450-1d': {
    config: { numDoors: 1, numDrawers: 0, numShelves: 5, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
      { partType: 'Tall Bottom', quantity: 1 },
      { partType: 'Tall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'tall-600-2d': {
    config: { numDoors: 2, numDrawers: 0, numShelves: 5, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
      { partType: 'Tall Bottom', quantity: 1 },
      { partType: 'Tall Back', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
    ]
  },
  'tall-600-ov': {
    config: { numDoors: 2, numDrawers: 1, numShelves: 2, hasSides: true, hasBack: true, hasBottom: true, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
      { partType: 'Tall Bottom', quantity: 1 },
      { partType: 'Tall Back', quantity: 1 },
      { partType: 'Fixed Shelf', quantity: 1 },
      { partType: 'Adjustable Shelf', quantity: 'perShelf' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Side', quantity: 'perDrawer' },
      { partType: 'Drawer Box Back', quantity: 'perDrawer' },
      { partType: 'Drawer Box Bottom', quantity: 'perDrawer' },
    ]
  },
  'tall-1000-ref': {
    config: { numDoors: 0, numDrawers: 0, numShelves: 0, hasSides: true, hasBack: false, hasBottom: false, hasTop: true, hasRails: false, isSinkCabinet: false, isCorner: false, isBlind: false },
    parts: [
      { partType: 'Tall Left Side', quantity: 1 },
      { partType: 'Tall Right Side', quantity: 1 },
      { partType: 'Tall Top', quantity: 1 },
    ]
  },
};

/**
 * Get the cabinet configuration and part list for a cabinet definition ID
 */
/** A definitionId that carries no semantics — a uuid or a Microvellum LinkID. */
const OPAQUE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9A-Z]{10,14}$/i;

export function getCabinetPartMapping(
  definitionId: string,
  /**
   * Product name to fall back on when the id is opaque. Placing a real
   * Microvellum product gives a uuid definitionId, which contains no "door" or
   * "drawer" text — so every such cabinet inferred 0 doors and 0 drawers and
   * priced as an empty box, silently. The catalog name ("Upper 3 Door") does
   * carry that information and is already passed into generateCabinetBOM.
   */
  fallbackName?: string,
): CabinetPartDefinition | null {
  const direct = CABINET_PART_MAP[definitionId];
  if (direct) return direct;
  if (fallbackName && OPAQUE_ID_RE.test((definitionId ?? '').trim())) {
    return buildGenericCabinetMapping(fallbackName);
  }
  return buildGenericCabinetMapping(definitionId);
}

/**
 * Generic part mapping derived from the product id, using the part names of
 * the shop's imported parts_pricing library (Base/Upper/Tall sides, Ls
 * corner parts, drawer box parts, rails, shelves). This makes EVERY catalog
 * product priceable without a hardcoded entry per id.
 */
/**
 * Flat boards: fillers, scribes, applied/end/return panels. Real product, one
 * panel, no carcass. Shared with bomGenerator so both agree on what is flat.
 */
export const FLAT_PANEL_RE = /filler|scribe|applied|panel$|end.?panel/;

/** Items with no fronts at all — kicks, rails, trims, openings. */
const NO_FRONT_RE = /kick|rail|trim|splash|opening/;

/**
 * Single source of truth for how many doors and drawers an item has, derived
 * from its id or its Microvellum product name.
 *
 * There were FOUR independent implementations of this: the pricing mapper, the
 * catalog's inferStaticMetadata (which drives the 3D render), the dead
 * microvellumParser, and the microvellum_products columns. They disagreed —
 * the render fell through to `return 2` for anything it did not recognise, so
 * fillers, toe kicks, light rails and applied panels all DREW as two-door
 * cabinets while pricing gave them no doors at all.
 */
export function inferFrontCounts(idOrName: string): { doors: number; drawers: number } {
  const s = (idOrName || '').toLowerCase();
  if (!s) return { doors: 0, drawers: 0 };
  // Flat boards and trims have no fronts, whatever else the name says.
  if (FLAT_PANEL_RE.test(s) || NO_FRONT_RE.test(s)) return { doors: 0, drawers: 0 };

  // Accept "3_door", "3-door" and "3 Door" alike.
  const doorMatch = s.match(/(\d+)\s*[_-]?\s*door/);
  const drawerMatch = s.match(/(\d+)\s*[_-]?\s*drawer/);
  let drawers = drawerMatch ? parseInt(drawerMatch[1], 10) : (/\bdrawer/.test(s) ? 1 : 0);
  let doors = doorMatch ? parseInt(doorMatch[1], 10) : 0;

  if (!doorMatch) {
    // Open units never have doors.
    if (/\bopen\b|open_|_open/.test(s)) doors = 0;
    else if (/\bdoor/.test(s)) doors = 1;
    else if (drawers > 0) doors = 0;
    else if (/sink/.test(s)) doors = 2;
  }
  return { doors: Math.max(0, doors), drawers: Math.max(0, drawers) };
}

export function buildGenericCabinetMapping(definitionId: string): CabinetPartDefinition | null {
  const id = (definitionId || '').toLowerCase();
  if (!id) return null;
  // Non-carcass items aren't priced through the parts engine.
  // Exception: 'ladder_kick' IS priced as a cabinet (mini-cabinet frame structure).
  // Plain 'kick' (adjustable-leg panels) are calculated in generateQuoteBOM from stock lengths.
  //
  // NOTE: this used to exclude anything matching oven|fridge|dishwasher|
  // rangehood|microwave. Those are APPLIANCE HOUSINGS - real carcasses with
  // sides, bottom, back and rails - so a 600 "Base Under Counter Oven" and a
  // 600 "Upper Rangehood Cabinet" were both being priced at $0.
  //
  // Fillers and panels are NOT carcasses, but they ARE real cut, edged boards
  // with a Microvellum product behind them ("Base Return Filler", "Upper
  // Return Filler"), so they price as a single flat panel rather than $0.
  // calculatePartDimensions sizes these height x WIDTH, not height x depth -
  // a 16mm filler measured across its depth would bill 35x the board.
  if (FLAT_PANEL_RE.test(id)) {
    const partType = /applied|end.?panel/.test(id)
      ? 'Applied Panel'
      : /return/.test(id)
        ? 'Return Panel'
        : 'Filler';
    return {
      config: {
        numDoors: 0, numDrawers: 0, numShelves: 0,
        hasSides: false, hasBack: false, hasBottom: false, hasTop: false,
        hasRails: false, isSinkCabinet: false, isCorner: /corner/.test(id), isBlind: false,
      },
      parts: [{ partType, quantity: 1 }],
    };
  }
  // True appliance openings have no carcass of their own.
  if (/opening/.test(id)) {
    return null;
  }
  if (/kick/.test(id) && !/ladder/.test(id)) {
    return null;
  }

  const isWall = id.startsWith('wall') || id.includes('upper');
  const isTall = id.startsWith('tall') || id.includes('pantry') || id.includes('broom') || id.includes('linen');
  const isCorner = id.includes('corner') || id.includes('pie');
  const isBlind = id.includes('blind');
  const isSink = id.includes('sink');

  // One shared implementation — see inferFrontCounts. Accepts "base_3_drawer",
  // "base-3-drawer" and "Base 3 Drawer" alike; Microvellum product names use a
  // space, which the old `(\d)[_-]?door` pattern missed entirely.
  const counts = inferFrontCounts(id);
  let numDoors = counts.doors;
  const numDrawers = counts.drawers;
  if (isSink && numDoors === 0) numDoors = 2;

  const numShelves = isTall ? 4 : isWall ? 2 : (numDrawers > 0 && numDoors === 0 ? 0 : 1);
  const prefix = isWall ? 'Upper' : isTall ? 'Tall' : 'Base';

  const config: CabinetConfig = {
    numDoors,
    numDrawers,
    numShelves,
    hasSides: true,
    hasBack: true,
    hasBottom: true,
    hasTop: isWall || isTall,
    hasRails: !isWall && !isTall,
    isSinkCabinet: isSink,
    isCorner,
    isBlind,
  };

  const parts: PartRequirement[] = [];

  if (isCorner && !isBlind && !isWall) {
    // Pie-cut / L-shape corner base (Ls part family)
    config.numDoors = 2;
    parts.push(
      { partType: 'Ls Base Left Side', quantity: 1 },
      { partType: 'Ls Base Right Side', quantity: 1 },
      { partType: 'Ls Base Left Back', quantity: 1 },
      { partType: 'Ls Base Right Back', quantity: 1 },
      { partType: 'Ls Base Bottom', quantity: 1 },
      { partType: 'Ls Rail On Edge', quantity: 2 },
      { partType: 'L Shape Shelf', quantity: 'perShelf' },
      { partType: 'Door', quantity: 'perDoor' },
    );
    return { config, parts };
  }

  if (isCorner && !isBlind && isWall) {
    parts.push(
      { partType: 'Ls Upper Left Side', quantity: 1 },
      { partType: 'Ls Upper Right Side', quantity: 1 },
      { partType: 'Ls Upper Left Back', quantity: 1 },
      { partType: 'Ls Upper Right Back', quantity: 1 },
      { partType: 'Ls Upper Bottom', quantity: 1 },
      { partType: 'L Shape Shelf', quantity: 'perShelf' },
      { partType: 'Door', quantity: 'perDoor' },
    );
    config.numDoors = Math.max(1, numDoors);
    return { config, parts };
  }

  // Standard carcass
  parts.push(
    { partType: `${prefix} Left Side`, quantity: 1 },
    { partType: `${prefix} Right Side`, quantity: 1 },
    { partType: `${prefix} Bottom`, quantity: 1 },
    { partType: `${prefix} Back`, quantity: 1 },
  );
  if (isWall || isTall) {
    parts.push({ partType: `${prefix} Top`, quantity: 1 });
  } else {
    parts.push({ partType: 'Rail On Flat', quantity: 2 });
  }
  if (numShelves > 0) {
    parts.push({ partType: 'Adjustable Shelf', quantity: 'perShelf' });
  }
  if (config.numDoors > 0) {
    parts.push({ partType: 'Door', quantity: 'perDoor' });
  }
  if (numDrawers > 0) {
    parts.push(
      { partType: 'Drawer Front', quantity: 'perDrawer' },
      { partType: 'Drawer Left Side', quantity: 'perDrawer' },
      { partType: 'Drawer Right Side', quantity: 'perDrawer' },
      { partType: 'Drawer Back', quantity: 'perDrawer' },
      { partType: 'Drawer Bottom', quantity: 'perDrawer' },
    );
  }

  return { config, parts };
}

/**
 * Calculate actual part quantities based on cabinet configuration
 */
export function getPartQuantities(
  parts: PartRequirement[],
  config: CabinetConfig
): Array<{ partType: string; quantity: number }> {
  const result: Array<{ partType: string; quantity: number }> = [];
  
  // Group parts by type to combine quantities
  const partMap = new Map<string, number>();
  
  for (const part of parts) {
    let qty: number;
    
    if (typeof part.quantity === 'number') {
      qty = part.quantity;
    } else if (part.quantity === 'perDoor') {
      qty = config.numDoors;
    } else if (part.quantity === 'perDrawer') {
      qty = config.numDrawers;
    } else if (part.quantity === 'perShelf') {
      qty = config.numShelves;
    } else {
      qty = 1;
    }
    
    if (qty > 0) {
      partMap.set(part.partType, (partMap.get(part.partType) ?? 0) + qty);
    }
  }

  partMap.forEach((qty, partType) => {
    result.push({ partType, quantity: qty });
  });

  return result;
}
