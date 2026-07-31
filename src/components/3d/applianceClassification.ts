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
import { rangehoodPresentationFromText } from '../../lib/appliances/rangehoodStyle';

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

/**
 * Rangehoods. `compileSpec` emits one above every cooktop as a full
 * wall-cabinet-sized `itemType: 'Appliance'` box, and without this it fell
 * through to the generic appliance branch — a tall slab with a recessed front
 * and a vertical handle, i.e. a fridge hanging over the hotplates.
 */
export function isRangehoodAppliance(item: PlacedItem, def: MaybeDef): boolean {
  const cat = categoryOf(def);
  if (cat) return /rangehood|range hood|extractor/.test(cat);
  const name = (def?.name ?? item.applianceSnapshot?.name ?? '').toLowerCase();
  if (/rangehood|range hood|extractor|canopy/.test(name)) return true;
  return (item.definitionId ?? '').includes('rangehood');
}

/**
 * Built-in rangehoods are joinery, visually: the motor and filters sit inside
 * a wall cabinet with the same door finish as the neighbouring uppers.
 * A chosen product snapshot outranks the generic `wall_rangehood` definition,
 * which cannot distinguish an undermount model from a canopy.
 */
export function isConcealedRangehoodAppliance(item: PlacedItem, def: MaybeDef): boolean {
  if (!isRangehoodAppliance(item, def)) return false;

  if (item.applianceSnapshot) {
    return rangehoodPresentationFromText(item.applianceSnapshot.name) === 'concealed';
  }

  const product = def?.applianceProduct;
  return rangehoodPresentationFromText(
    product?.name,
    product?.subcategory,
    product?.installation,
    product?.description,
    def?.name,
  ) === 'concealed';
}

/** Dishwashers — used to decide who draws the benchtop over the opening. */
export function isDishwasherAppliance(item: PlacedItem, def: MaybeDef): boolean {
  const cat = categoryOf(def);
  if (cat) return /dishwasher/.test(cat);
  const sku = (def?.sku ?? '').toUpperCase();
  if (sku && /(^|[^A-Z])DW([^A-Z]|$)/.test(sku)) return true;
  const name = (def?.name ?? item.applianceSnapshot?.name ?? '').toLowerCase();
  if (/dishwasher/.test(name)) return true;
  return (item.definitionId ?? '').includes('dishwasher');
}

/** Fully integrated / opening-only dishwashers receive a joinery panel in the
 * selected cabinet finish instead of a generic stainless pull and fascia. */
export function isIntegratedDishwasherAppliance(item: PlacedItem, def: MaybeDef): boolean {
  if (!isDishwasherAppliance(item, def)) return false;
  // A chosen product snapshot outranks the compiled layout placeholder. The
  // layout item can keep definitionId="dishwasher_opening" after a customer
  // selects a freestanding model, and treating that stale id as authoritative
  // would incorrectly hide the selected appliance behind joinery.
  if (item.applianceSnapshot) {
    const selectedProduct = `${item.applianceSnapshot.name} ${item.applianceSnapshot.finish ?? ''}`.toLowerCase();
    return /integrated|panel.?ready/.test(selectedProduct);
  }
  const name = (def?.name ?? '').toLowerCase();
  return /integrated|panel.?ready|dishwasher opening/.test(name)
    || (item.definitionId ?? '').includes('dishwasher_opening');
}

/**
 * Fridges. The layout engine emits a `fridge_opening` for every kitchen and
 * almost none of them carry a chosen product — the catalogue holds exactly one
 * fridge, an integrated unit — so this branch is what most customers actually
 * see. It gets real geometry from `appliances/fridgeModels.tsx`.
 */
export function isFridgeAppliance(item: PlacedItem, def: MaybeDef): boolean {
  const cat = categoryOf(def);
  if (cat) return /fridge|refriger|freezer/.test(cat);
  const name = (def?.name ?? item.applianceSnapshot?.name ?? '').toLowerCase();
  if (/fridge|refriger|freezer/.test(name)) return true;
  return /fridge|freezer/.test(item.definitionId ?? '');
}

/** True when the item follows the benchtop-inset Y convention (centred at
 *  `item.y` rather than base-at-`item.y`). */
export function isBenchtopInsetAppliance(item: PlacedItem, def: MaybeDef): boolean {
  return isSinkAppliance(item, def) || isCooktopAppliance(item, def);
}
