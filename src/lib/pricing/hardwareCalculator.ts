// Hardware calculator - counts hardware items based on cabinet configuration

import { HardwareItem, HardwarePricingRecord, CabinetConfig } from './types';
import { HardwareOptions } from '@/types';

interface HardwareRules {
  hingesPerDoor: number;
  hingesPerTallDoor: number;
  runnersPerDrawer: number;
  legsPerCabinet: number;
  shelfPinsPerShelf: number;
  handlesPerDoor: number;
  handlesPerDrawer: number;
}

const DEFAULT_RULES: HardwareRules = {
  hingesPerDoor: 2,
  hingesPerTallDoor: 4,
  runnersPerDrawer: 1, // 1 pair per drawer
  legsPerCabinet: 4,
  shelfPinsPerShelf: 4,
  handlesPerDoor: 1,
  handlesPerDrawer: 1
};

/**
 * Construction consumables — screws belong to CONSTRUCTION STAGES, not to
 * hardware items (per shop practice):
 *  - carcase build: 28mm screws (e.g. ×4 per end-panel fixing)
 *  - installation: 45mm/70mm screws to fix cabinets to walls
 * Counts are per cabinet and tunable here until the admin
 * construction_consumables table lands (P1 of the pricing plan).
 */
interface ConsumableRule {
  stage: 'carcase' | 'install';
  name: string;
  /** matched against hardware_pricing name/item_code if present */
  match: string;
  qtyPerCabinet: number;
  fallbackUnitCost: number;
}

const CONSTRUCTION_CONSUMABLES: ConsumableRule[] = [
  { stage: 'carcase', name: '28mm Screws (carcase/end panels)', match: '28mm screw', qtyPerCabinet: 12, fallbackUnitCost: 0.04 },
  { stage: 'install', name: '45mm Screws (wall fixing)', match: '45mm screw', qtyPerCabinet: 4, fallbackUnitCost: 0.05 },
  { stage: 'install', name: '70mm Screws (wall fixing)', match: '70mm screw', qtyPerCabinet: 2, fallbackUnitCost: 0.07 },
];

/**
 * A flat board builds no box and hangs off no wall: it is screwed to the cabinet beside it, which is the
 * end-panel fixing above (x4). The full carcase and wall-fixing allowance also inflated its share of the
 * shop labour, which generateQuoteBOM spreads by part and hardware count.
 */
const FLAT_BOARD_CONSUMABLES: ConsumableRule[] = CONSTRUCTION_CONSUMABLES
  .filter(rule => rule.stage === 'carcase')
  .map(rule => ({ ...rule, qtyPerCabinet: 4 }));

/**
 * hardware_pricing.hardware_type is not written consistently — the catalogue
 * holds "Drawer Runner", "Hinge", "Handle", "Shelf Pin" alongside "runner",
 * "hinge". Matching the raw string meant 2,500 runner rows and every handle
 * row were skipped and the cabinet priced on the hardcoded fallback instead.
 * Compare on a normalised form so the catalogue is actually used.
 */
export function normaliseHardwareType(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/^drawer_runner$/, 'runner')
    .replace(/^drawer_slide$/, 'runner')
    .replace(/^knob$/, 'handle')
    .replace(/^handle_profile$/, 'handle')
    .replace(/^pull$/, 'handle');
}

const isType = (h: { hardware_type: string | null }, type: string) =>
  normaliseHardwareType(h.hardware_type) === type;

function resolvePositiveUnitCost(
  pricing: HardwarePricingRecord | undefined,
  fallback: number,
): { unitCost: number; isFallbackPrice: boolean } {
  const hasCatalogPrice = Number.isFinite(pricing?.unit_cost) && (pricing?.unit_cost ?? 0) > 0;
  return {
    unitCost: hasCatalogPrice ? pricing!.unit_cost : fallback,
    isFallbackPrice: !hasCatalogPrice,
  };
}

/**
 * What the SCHEDULE ROW itself names, when the source says so.
 *
 * A Microvellum work order names the hinge, the hinge plate and the drawer runner on every product ("Hinge Salice
 * Silentia+ Series 100 105 deg Full Overlay_Dowel 52", "Hafele Alto Slim Drawer Kit H199 500mm 35kg White"), so
 * the row can carry the catalogue row those names resolved to instead of taking the job's one global pick. Values
 * are a hardware_pricing id or item_code, exactly like HardwareOptions.hingeType.
 *
 * Every field is optional and every one falls back to the job selection: a row that names nothing is priced
 * exactly as it was before this existed. A row that names something the catalogue does not hold falls back too -
 * loudly (HardwareItem.overrideUnresolved), never silently and never free.
 */
export interface RowHardwareSelection {
  /** hardware_pricing id / item_code of this row's hinge. */
  hingeType?: string | null;
  /** hardware_pricing id / item_code of this row's hinge PLATE. Without it the plate is guessed, as before. */
  hingePlateType?: string | null;
  /** hardware_pricing id / item_code of this row's drawer runner. */
  drawerType?: string | null;
  /**
   * The drawer kits the work order COUNTS on this row, per cabinet: a drawer bank is usually a shallow kit over
   * deep ones ("Alto Slim H135 500mm" x1 + "H199 500mm" x2), so one runner per row is wrong on most of them.
   * `type` is a hardware_pricing id / item_code; a kit with none (the name did not resolve) is priced on
   * `drawerType`, then on the job's runner - counted either way, never free. When any kit is listed the kits ARE
   * the runners of this cabinet: the engine's own one-per-drawer count is not added on top, and a cabinet whose
   * name gives no drawer count ("Tall 2 Door With Inner Drawers") still pays for the kits it has.
   */
  runnerKits?: Array<{ type?: string | null; qty: number }> | null;
  /** hardware_pricing id / item_code of this row's handle. Not in the catalogue: the job's handle, else the allowance. */
  handleId?: string | null;
  /**
   * How many handles the work order counts on this cabinet (0 = none: a push-to-open or finger-pull front). Omitted:
   * one per door and drawer front, as before.
   */
  handleCount?: number | null;
}

/** What a handle costs when no catalogue handle is chosen for it: Bower's standard handle allowance. */
export const HANDLE_ALLOWANCE = 15;
export const HANDLE_ALLOWANCE_CODE = 'HANDLE-ALLOWANCE';

/** A row selection that is actually set: a non-empty string. */
const rowKeyOf = (value: string | null | undefined): string | null => {
  const key = String(value ?? '').trim();
  return key ? key : null;
};

/**
 * The catalogue row a hardware KEY (id or item_code) names, of a given type.
 *
 * Exactly the lookup the global selection has always used: id or item_code anywhere in the catalogue first, then a
 * type-matched row whose name contains the key (which is how selections like "Series 200" or "Alto" resolve).
 */
/** The kits a row lists, cleaned: whole positive counts only. */
function rowRunnerKits(kits: RowHardwareSelection['runnerKits']): Array<{ type: string | null; qty: number }> {
  if (!Array.isArray(kits)) return [];
  const out: Array<{ type: string | null; qty: number }> = [];
  for (const k of kits) {
    const qty = Math.round(Number(k?.qty));
    if (Number.isFinite(qty) && qty > 0) out.push({ type: rowKeyOf(k?.type), qty });
  }
  return out;
}

function findHardwareByKey(
  hardwarePricing: HardwarePricingRecord[],
  key: string,
  type: string,
): HardwarePricingRecord | undefined {
  return hardwarePricing.find(h => h.id === key || h.item_code === key)
    ?? hardwarePricing.find(h =>
      isType(h, type) &&
      (h.name.toLowerCase().includes(key.toLowerCase()) || h.item_code === key));
}

/**
 * Calculate hardware requirements for a cabinet
 *
 * `rowHardware` is what the schedule row itself names (see RowHardwareSelection). Omitted - or with every field
 * empty - the cabinet is priced on `hardwareOptions` exactly as before.
 */
export function calculateHardware(
  config: CabinetConfig,
  cabinetHeight: number,
  hardwareOptions: HardwareOptions,
  hardwarePricing: HardwarePricingRecord[],
  rowHardware?: RowHardwareSelection,
): HardwareItem[] {
  const items: HardwareItem[] = [];
  const rules = DEFAULT_RULES;
  
  // Determine if tall cabinet (affects hinge count)
  const isTall = cabinetHeight > 1200;
  
  // === HINGES ===
  // Sliding doors hang on a track, not hinges (config.slidingDoors); their handles are still counted below.
  if (config.numDoors > 0 && !config.slidingDoors) {
    const hingesPerDoor = isTall ? rules.hingesPerTallDoor : rules.hingesPerDoor;
    const hingeCount = config.numDoors * hingesPerDoor;
    
    // The row's own hinge beats the job's, and an unresolvable row hinge falls back to the job's rather than
    // pricing nothing. Same shape for the plate and the runner below.
    const hingeKey = rowKeyOf(rowHardware?.hingeType);
    const rowHinge = hingeKey ? findHardwareByKey(hardwarePricing, hingeKey, 'hinge') : undefined;
    const hingePricing = rowHinge ?? findHardwareByKey(hardwarePricing, hardwareOptions.hingeType, 'hinge');
    const hingeCost = resolvePositiveUnitCost(hingePricing, 8);

    items.push({
      itemCode: hingePricing?.item_code ?? hardwareOptions.hingeType,
      name: hingePricing?.name ?? hardwareOptions.hingeType,
      hardwareType: 'hinge',
      quantity: hingeCount,
      unitCost: hingeCost.unitCost,
      machiningCost: (hingePricing?.machining_cost ?? 0) * hingeCount,
      assemblyCost: (hingePricing?.assembly_cost ?? 0) * hingeCount,
      totalCost: hingeCost.unitCost * hingeCount +
                 (hingePricing?.machining_cost ?? 0) * hingeCount +
                 (hingePricing?.assembly_cost ?? 0) * hingeCount,
      isFallbackPrice: hingeCost.isFallbackPrice,
      selectedBy: rowHinge ? 'row' : 'job',
      ...(hingeKey ? { requestedCode: hingeKey } : {}),
      ...(hingeKey && !rowHinge ? { overrideUnresolved: true } : {}),
    });

    // === HINGE PLATES (separate item — plate type varies by hinge type) ===
    // With no plate named on the row this is still a GUESS: the first /plate/i row, preferring the hinge's own
    // series. A Microvellum work order names the plate on every product that names a hinge (and always at the
    // hinge's own quantity), so a row that carries one is priced on the plate the job actually buys.
    const plateKey = rowKeyOf(rowHardware?.hingePlateType);
    const rowPlate = plateKey
      ? (hardwarePricing.find(h => h.id === plateKey || h.item_code === plateKey)
        ?? hardwarePricing.find(h => /plate/i.test(`${h.hardware_type} ${h.name}`)
          && h.name.toLowerCase().includes(plateKey.toLowerCase())))
      : undefined;
    const platePricing = rowPlate ?? hardwarePricing.find(h =>
      /plate/i.test(`${h.hardware_type} ${h.name}`) &&
      (!hingePricing?.series || h.series === hingePricing.series)
    ) ?? hardwarePricing.find(h => /plate/i.test(`${h.hardware_type} ${h.name}`));
    const plateCost = resolvePositiveUnitCost(platePricing, 2.5);

    items.push({
      itemCode: platePricing?.item_code ?? 'hinge-plate',
      name: platePricing?.name ?? 'Hinge Plate',
      hardwareType: 'hinge-plate',
      quantity: hingeCount,
      unitCost: plateCost.unitCost,
      machiningCost: (platePricing?.machining_cost ?? 0) * hingeCount,
      assemblyCost: (platePricing?.assembly_cost ?? 0) * hingeCount,
      totalCost: plateCost.unitCost * hingeCount +
        (platePricing?.machining_cost ?? 0) * hingeCount +
        (platePricing?.assembly_cost ?? 0) * hingeCount,
      isFallbackPrice: plateCost.isFallbackPrice,
      selectedBy: rowPlate ? 'row' : 'job',
      ...(plateKey ? { requestedCode: plateKey } : {}),
      ...(plateKey && !rowPlate ? { overrideUnresolved: true } : {}),
    });
  }
  
  // === DRAWER RUNNERS ===
  // One line per kit the row lists (the work order's own names and counts); otherwise one runner per drawer on the
  // row's runner, else the job's.
  const kits = rowRunnerKits(rowHardware?.runnerKits);
  const pushRunner = (runnerKey: string | null, runnerCount: number) => {
    const rowRunner = runnerKey ? findHardwareByKey(hardwarePricing, runnerKey, 'runner') : undefined;
    const runnerPricing = rowRunner ?? findHardwareByKey(hardwarePricing, hardwareOptions.drawerType, 'runner');
    const runnerCost = resolvePositiveUnitCost(runnerPricing, 45);

    items.push({
      itemCode: runnerPricing?.item_code ?? hardwareOptions.drawerType,
      name: runnerPricing?.name ?? hardwareOptions.drawerType,
      hardwareType: 'runner',
      quantity: runnerCount,
      unitCost: runnerCost.unitCost,
      machiningCost: (runnerPricing?.machining_cost ?? 0) * runnerCount,
      assemblyCost: (runnerPricing?.assembly_cost ?? 0) * runnerCount,
      totalCost: runnerCost.unitCost * runnerCount +
                 (runnerPricing?.machining_cost ?? 0) * runnerCount +
                 (runnerPricing?.assembly_cost ?? 0) * runnerCount,
      isFallbackPrice: runnerCost.isFallbackPrice,
      selectedBy: rowRunner ? 'row' : 'job',
      ...(runnerKey ? { requestedCode: runnerKey } : {}),
      ...(runnerKey && !rowRunner ? { overrideUnresolved: true } : {}),
    });
  };
  if (kits.length > 0) {
    for (const kit of kits) pushRunner(kit.type ?? rowKeyOf(rowHardware?.drawerType), kit.qty);
  } else if (config.numDrawers > 0) {
    pushRunner(rowKeyOf(rowHardware?.drawerType), config.numDrawers * rules.runnersPerDrawer);
  }

  // === HANDLES ===
  // The row's own handle beats the job's; with neither in the catalogue each handle is the $15 allowance, so a
  // quote never goes out with the handles free. The row's own COUNT (what the work order drew) beats one per front.
  const handleKey = rowKeyOf(rowHardware?.handleId);
  if (hardwareOptions.handleId !== 'handle-none' || handleKey) {
    const rowCount = rowHardware?.handleCount == null ? NaN : Math.round(Number(rowHardware.handleCount));
    const handleCount = Number.isFinite(rowCount) && rowCount >= 0
      ? rowCount
      : (config.numDoors * rules.handlesPerDoor) + (config.numDrawers * rules.handlesPerDrawer);

    if (handleCount > 0) {
      const findHandle = (key: string | null | undefined) => (key
        ? hardwarePricing.find(h => isType(h, 'handle') && (h.id === key || h.item_code === key))
        : undefined);
      const rowHandle = findHandle(handleKey);
      const handlePricing = rowHandle ?? findHandle(hardwareOptions.handleId);
      const handleCost = resolvePositiveUnitCost(handlePricing, HANDLE_ALLOWANCE);

      items.push({
        itemCode: handlePricing?.item_code ?? HANDLE_ALLOWANCE_CODE,
        name: handlePricing?.name ?? 'Handle allowance (no handle selected)',
        hardwareType: 'handle',
        quantity: handleCount,
        unitCost: handleCost.unitCost,
        machiningCost: 0,
        assemblyCost: (handlePricing?.assembly_cost ?? 0) * handleCount,
        totalCost: handleCost.unitCost * handleCount +
                   (handlePricing?.assembly_cost ?? 0) * handleCount,
        isFallbackPrice: handleCost.isFallbackPrice,
        selectedBy: rowHandle ? 'row' : 'job',
        ...(handleKey ? { requestedCode: handleKey } : {}),
        ...(handleKey && !rowHandle ? { overrideUnresolved: true } : {}),
      });
    }
  }

  // === ADJUSTABLE LEGS ===
  // Replacement fronts hang on cabinets already standing - they bring no legs. Nor does a flat board: a panel,
  // filler or pelmet is fixed to a cabinet, and 10 Sands St's oven panel was billed four legs.
  // A toe-kick base IS the base - a ladder frame on the floor - so it has no adjustable legs of its own.
  if (hardwareOptions.adjustableLegs && !config.facesOnly && !config.flatBoard && !config.toeKick) {
    const legPricing = hardwarePricing.find(h => isType(h, 'leg'));
    const legCost = resolvePositiveUnitCost(legPricing, 3);
    
    items.push({
      itemCode: legPricing?.item_code ?? 'LEG-ADJ',
      name: legPricing?.name ?? 'Adjustable Leg',
      hardwareType: 'leg',
      quantity: rules.legsPerCabinet,
      unitCost: legCost.unitCost,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: legCost.unitCost * rules.legsPerCabinet,
      isFallbackPrice: legCost.isFallbackPrice,
    });
  }
  
  // === SHELF PINS ===
  if (config.numShelves > 0) {
    const pinCount = config.numShelves * rules.shelfPinsPerShelf;
    const pinPricing = hardwarePricing.find(h => isType(h, 'shelf_pin'));
    const pinCost = resolvePositiveUnitCost(pinPricing, 0.20);
    
    items.push({
      itemCode: pinPricing?.item_code ?? 'PIN-SHELF',
      name: pinPricing?.name ?? 'Shelf Pin',
      hardwareType: 'shelf_pin',
      quantity: pinCount,
      unitCost: pinCost.unitCost,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: pinCost.unitCost * pinCount,
      isFallbackPrice: pinCost.isFallbackPrice,
    });
  }
  
  // === CONSTRUCTION CONSUMABLES (stage-based screws) ===
  // Carcase screws build a box and wall screws fix one; replacement fronts do neither (their hinge plates
  // carry their own euro screws). A flat board takes only its end-panel fixing.
  const consumables = config.facesOnly ? [] : config.flatBoard ? FLAT_BOARD_CONSUMABLES : CONSTRUCTION_CONSUMABLES;
  for (const rule of consumables) {
    const pricing = hardwarePricing.find(h =>
      h.name.toLowerCase().includes(rule.match) || h.item_code?.toLowerCase?.() === rule.match
    );
    const resolvedCost = resolvePositiveUnitCost(pricing, rule.fallbackUnitCost);
    items.push({
      itemCode: pricing?.item_code ?? rule.match.replace(/\s+/g, '-'),
      name: pricing?.name ?? rule.name,
      hardwareType: `consumable-${rule.stage}`,
      quantity: rule.qtyPerCabinet,
      unitCost: resolvedCost.unitCost,
      machiningCost: 0,
      assemblyCost: 0,
      totalCost: resolvedCost.unitCost * rule.qtyPerCabinet,
      isFallbackPrice: resolvedCost.isFallbackPrice,
    });
  }

  return items;
}

/**
 * Consolidate hardware across multiple cabinets
 */
export function consolidateHardware(
  cabinetHardware: HardwareItem[][]
): HardwareItem[] {
  const byCode = new Map<string, HardwareItem[]>();
  
  for (const hardware of cabinetHardware) {
    for (const item of hardware) {
      if (!byCode.has(item.itemCode)) {
        byCode.set(item.itemCode, []);
      }
      byCode.get(item.itemCode)!.push(item);
    }
  }
  
  const consolidated: HardwareItem[] = [];
  
  for (const [itemCode, items] of byCode) {
    const template = items[0];
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalMachiningCost = items.reduce((sum, i) => sum + i.machiningCost, 0);
    const totalAssemblyCost = items.reduce((sum, i) => sum + i.assemblyCost, 0);
    
    consolidated.push({
      itemCode,
      name: template.name,
      hardwareType: template.hardwareType,
      quantity: totalQuantity,
      unitCost: template.unitCost,
      machiningCost: totalMachiningCost,
      assemblyCost: totalAssemblyCost,
      totalCost: (template.unitCost * totalQuantity) + totalMachiningCost + totalAssemblyCost,
      isFallbackPrice: items.some(i => i.isFallbackPrice),
      // Two cabinets on the same catalogue code roll into one purchase line; it counts as row-chosen when any of
      // them named it, and as an unresolved override when any of them asked for something the catalogue lacks.
      ...(items.some(i => i.selectedBy) ? { selectedBy: items.some(i => i.selectedBy === 'row') ? 'row' as const : 'job' as const } : {}),
      ...(items.some(i => i.overrideUnresolved) ? { overrideUnresolved: true } : {}),
    });
  }
  
  return consolidated;
}
