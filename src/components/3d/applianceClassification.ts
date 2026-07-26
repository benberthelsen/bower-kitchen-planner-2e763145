/**
 * Shared appliance sub-type classification.
 *
 * Sinks and cooktops use a benchtop-inset Y convention (centred at
 * `item.y`) while every other appliance uses the standard base-at-`item.y`
 * convention. Three render paths need this rule — the procedural
 * ApplianceMesh, the GLB ApplianceModel, and the AR ViewInRoomAr upgrade
 * loop — so it lives here to keep them from drifting.
 *
 * Priority:
 *   1. `def.applianceProduct.category` — authoritative, set on catalog rows.
 *   2. Anchored SKU pattern — avoids substring collisions like `PRODUCT`
 *      matching `CT` or `ELECTSINK` matching `SINK`.
 *   3. `def.name` — human string, still useful for Microvellum items.
 *   4. `item.applianceSnapshot.name` — last resort when `def` hasn't
 *      resolved yet so the placeholder classifies the same way the real
 *      mesh will once the query settles.
 */
import type { PlacedItem } from '../../types';
import type { ExtendedCatalogItem } from '../../hooks/useCatalog';

type MaybeDef = ExtendedCatalogItem | null | undefined;

const CT_SKU = /(^|[^A-Z])CT([^A-Z]|$)/;
const SINK_SKU = /(^|[^A-Z])SINK([^A-Z]|$)/;

function categoryOf(def: MaybeDef): string {
  return (def?.applianceProduct?.category ?? '').toLowerCase();
}

export function isSinkAppliance(item: PlacedItem, def: MaybeDef): boolean {
  const cat = categoryOf(def);
  if (cat) return /sink/.test(cat);
  const sku = (def?.sku ?? '').toUpperCase();
  if (sku && SINK_SKU.test(sku)) return true;
  const name = (def?.name ?? item.applianceSnapshot?.name ?? '').toLowerCase();
  return /sink/.test(name);
}

export function isCooktopAppliance(item: PlacedItem, def: MaybeDef): boolean {
  const cat = categoryOf(def);
  if (cat) return /cooktop/.test(cat);
  const sku = (def?.sku ?? '').toUpperCase();
  if (sku && CT_SKU.test(sku)) return true;
  const name = (def?.name ?? item.applianceSnapshot?.name ?? '').toLowerCase();
  return /cooktop/.test(name);
}

/** True when the item follows the benchtop-inset Y convention (centred at
 *  `item.y` rather than base-at-`item.y`). */
export function isBenchtopInsetAppliance(item: PlacedItem, def: MaybeDef): boolean {
  return isSinkAppliance(item, def) || isCooktopAppliance(item, def);
}
