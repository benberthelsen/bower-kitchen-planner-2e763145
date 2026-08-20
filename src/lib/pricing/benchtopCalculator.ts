// Benchtop pricing -- groups base/corner/sink cabinets by wall (rotation),
// merges each group into a single run, and prices it from the benchtop_pricing
// table. Supports three pricing methods:
//   per_sheet  -- Meganite solid surface (ceil sheets from stock length)
//   per_lm     -- Egger laminate worktops (run length x price per LM)
//   per_sqm    -- Legacy stone / custom (area x rate)

import { PlacedItem, GlobalDimensions } from '@/types';
import { PricingData, BenchtopAllocation } from './types';

/** Items that never sit under a benchtop, whatever they are called. */
const NON_BENCHTOP_RE = /opening|applied|panel$|kick|rail|splash/i;
/** Wall/upper cabinets carry no benchtop. */
const WALL_CAB_RE = /^(wall|upper)|[_-](wall|upper)/i;

/** Labels for each wall group in rotation order */
const WALL_LABELS = 'ABCDEFGHIJKLMNOP';

/**
 * Calculate benchtop runs from placed cabinets.
 *
 * Groups eligible cabinets by normalised rotation (0/90/180/270deg), sums their
 * widths into a run length, and prices each run according to the pricing_method
 * of the first benchtop material in pricingData. Returns an empty array when
 * there are no base cabinets or no benchtop material is configured.
 */
export function calculateBenchtops(
  items: PlacedItem[],
  globalDims: GlobalDimensions,
  pricingData: PricingData
): BenchtopAllocation[] {
  if (pricingData.benchtop.length === 0) return [];

  // A cabinet carries benchtop if it stands on the floor and is not a wall unit
  // or a non-carcass item. The old test whitelisted ids STARTING WITH
  // base|corner|sink|pie, which silently dropped 'open_base' (starts with
  // "open") and every Microvellum product name — on the Donkin kitchen that
  // lost 632mm of run from the sink side.
  const benchtopCabs = items.filter((i) => {
    if (i.itemType !== 'Cabinet') return false;
    const id = i.definitionId ?? '';
    if (NON_BENCHTOP_RE.test(id) || WALL_CAB_RE.test(id)) return false;
    return (i.y ?? 0) <= 1; // floor-standing
  });

  if (benchtopCabs.length === 0) return [];

  // Honour the material flagged is_default. Taking benchtop[0] from an
  // unordered select meant the row order decided the price: it returned
  // "Hafele Impact Laminate 38mm" ($105.51/lm) while the default is
  // "Meganite Snow White" ($493/sheet), so solid-surface jobs were quoted as
  // laminate. (Phase 2 will add a per-room selector; until then, default wins.)
  const material =
    pricingData.benchtop.find((b) => (b as { is_default?: boolean }).is_default) ??
    pricingData.benchtop[0];
  const overhang = globalDims.benchtopOverhang ?? 25;
  const method = material.pricing_method ?? 'per_sqm';

  // -- Group by normalised rotation ------------------------------------------
  const byWall = new Map<number, PlacedItem[]>();
  for (const cab of benchtopCabs) {
    const raw = cab.rotation ?? 0;
    const normRot = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
    const group = byWall.get(normRot) ?? [];
    group.push(cab);
    byWall.set(normRot, group);
  }

  // Sort walls by rotation so Wall A is always the 0deg wall
  const sortedWalls = [...byWall.entries()].sort(([a], [b]) => a - b);

  const materialName = [material.brand, material.range_tier].filter(Boolean).join(' - ');

  return sortedWalls.map(([rot, cabs], idx) => {
    const runLengthMm = cabs.reduce((sum, c) => sum + c.width, 0);
    const maxCabDepthMm = Math.max(...cabs.map(c => c.depth));
    const depthMm = maxCabDepthMm + overhang;
    const areaSqm = (runLengthMm / 1000) * (depthMm / 1000);

    let supplyCost = 0;
    let installCost = 0;
    let sheetsRequired: number | undefined;
    let linearMetres: number | undefined;
    let pricePerUnit = 0;
    let tradeSupplyPerSqm = 0;
    let installSupplyPerSqm = 0;

    if (method === 'per_sheet') {
      // -- Meganite solid surface -----------------------------------------------
      // Sheets are ordered to length: ceil(run / stock_length_mm) sheets.
      // Width: 760mm stock covers standard 600mm bench depth with offcut.
      const stockLengthMm = material.stock_length_mm ?? 3660;
      sheetsRequired = Math.ceil(runLengthMm / stockLengthMm);
      pricePerUnit = material.price_per_sheet ?? 0;
      supplyCost = sheetsRequired * pricePerUnit;
      // Install is a separate fabrication quote; set to 0 unless configured
      installCost = 0;
      tradeSupplyPerSqm = areaSqm > 0 ? supplyCost / areaSqm : 0;
      installSupplyPerSqm = 0;

    } else if (method === 'per_lm') {
      // -- Egger laminate worktops ----------------------------------------------
      // Priced per linear metre of run length.
      linearMetres = runLengthMm / 1000;
      pricePerUnit = material.price_per_lm ?? 0;
      supplyCost = linearMetres * pricePerUnit;
      const installPerLm = material.install_per_lm ?? 0;
      installCost = linearMetres * installPerLm;
      tradeSupplyPerSqm = areaSqm > 0 ? supplyCost / areaSqm : 0;
      installSupplyPerSqm = areaSqm > 0 ? installCost / areaSqm : 0;

    } else {
      // -- Legacy per-sqm (stone) -----------------------------------------------
      tradeSupplyPerSqm = material.trade_supply_per_sqm ?? 0;
      installSupplyPerSqm = material.install_supply_per_sqm ?? 0;
      pricePerUnit = tradeSupplyPerSqm;
      supplyCost = areaSqm * tradeSupplyPerSqm;
      installCost = areaSqm * installSupplyPerSqm;
    }

    return {
      wallLabel: `Wall ${WALL_LABELS[idx] ?? String(idx + 1)}`,
      rotation: rot,
      runLengthMm,
      depthMm,
      areaSqm,
      materialId: material.id,
      materialName,
      materialType: material.material_type ?? 'stone',
      pricingMethod: method,
      ...(sheetsRequired !== undefined && { sheetsRequired }),
      ...(linearMetres !== undefined && { linearMetres }),
      pricePerUnit,
      tradeSupplyPerSqm,
      installSupplyPerSqm,
      supplyCost,
      installCost,
      totalCost: supplyCost + installCost,
    };
  });
}
