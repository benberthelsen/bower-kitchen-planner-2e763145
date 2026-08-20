/**
 * Workshop cost model — process-based shop labour, supply modes, install.
 *
 * Replaces the flat per-cabinet regression in laborCalculator.ts, which charged
 * a $235 base per cabinet regardless of what the cabinet actually was. On the
 * 3 Donkin Lane kitchen that produced $5,366 of shop labour against
 * Microvellum's $2,903 — 85% high — because 16 cabinets cost $3,760 in base
 * charges before a single door or drawer was counted.
 *
 * Microvellum bills the way a shop actually works: minutes per part, per metre
 * and per product, each at its station's hourly rate. The default rates below
 * are lifted directly from the Microvellum Labor Report for the Donkin kitchen
 * (18/08/2026, 141 parts / 21 products / 38:08 total), so the two models are
 * directly comparable line for line.
 *
 * Supply mode decides which stations run at all: a flat-pack job is cut, edged,
 * drilled and packed but never assembled, so the assembly and hardware-fitting
 * minutes drop out and the packing minutes go up.
 */

import type { CabinetBOM, PartDimension } from './types';

export type SupplyMode =
  | 'assembled_installed'
  | 'assembled'
  | 'flat_pack'
  | 'flat_pack_hw_loose';

export interface WorkshopRates {
  // ---- station rates, $/hr (MV: Drafting 98, machining 250, edge/assembly/
  // handling 100, hardware 98, loading 80, install 98) -----------------------
  draftingRate: number;
  machiningRate: number;
  edgebandingRate: number;
  assemblyRate: number;
  hardwareRate: number;
  handlingRate: number;
  loadingRate: number;
  installRate: number;

  // ---- minutes per unit ----------------------------------------------------
  draftingMinPerPart: number;
  leadInOutMinPerM: number;
  cuttingMinPerM: number;
  routingMinPerM: number;
  verticalDrillMinPerHole: number;
  horizontalDrillMinPerHole: number;
  labellingMinPerPart: number;
  edgebandMinPerM: number;
  handlingMinPerPart: number;
  assemblyMinPerPart: number;
  /** fallback when a hardware type is not in HARDWARE_FIT_MINUTES */
  hardwareMinPerItem: number;
  /** picking + boxing loose hardware when it is supplied but not fitted */
  hardwarePickMinPerItem: number;
  packingMinPerProduct: number;
  /** flat pack needs every part wrapped and labelled, not just the box */
  flatPackPackingMinPerPart: number;
  loadingMinPerProduct: number;
  loadingCrew: number;

  // ---- install -------------------------------------------------------------
  installMinPerCabinet: number;
  installTallExtraMin: number;
  installCornerExtraMin: number;
  installBenchtopMinPerM: number;
}

/** Straight from the Microvellum Labor Report for 3 Donkin Lane. */
export const DEFAULT_WORKSHOP_RATES: WorkshopRates = {
  draftingRate: 98,
  machiningRate: 250,
  edgebandingRate: 100,
  assemblyRate: 100,
  hardwareRate: 98,
  handlingRate: 100,
  loadingRate: 80,
  installRate: 98,

  draftingMinPerPart: 1.37,       // 141 parts -> 3:13
  leadInOutMinPerM: 0.05,
  cuttingMinPerM: 0.2,            // 268.13 m -> 0:53
  routingMinPerM: 0.2,
  verticalDrillMinPerHole: 0.04,  // 946 holes -> 0:37
  horizontalDrillMinPerHole: 0.2,
  labellingMinPerPart: 0.1,
  edgebandMinPerM: 1.0,           // 102.31 m -> 1:42
  handlingMinPerPart: 0.25,       // 141 parts -> 0:35
  assemblyMinPerPart: 2.5,        // 138 parts -> 5:45
  hardwareMinPerItem: 0.5,
  hardwarePickMinPerItem: 0.1,
  packingMinPerProduct: 0.3,      // 21 products -> 0:06
  flatPackPackingMinPerPart: 0.6,
  loadingMinPerProduct: 6,        // 21 products, 2 crew -> 4:11
  loadingCrew: 2,

  installMinPerCabinet: 30,       // 21 products -> 10:30 = $1,029.10
  installTallExtraMin: 15,
  installCornerExtraMin: 10,
  installBenchtopMinPerM: 12,
};

/**
 * Minutes to FIT each hardware type, from the Microvellum Hardware Assembly
 * section of the Donkin report. Fitting a drawer kit is two orders of magnitude
 * slower than driving a screw, so a single flat per-item figure is useless:
 * a flat 0.5 min/item gave $282 against Microvellum's $885 on the same job.
 *
 *   Hafele Alto drawer kit  25 /each      Handle Rod              5 /each
 *   Salice hinge             6 /each      Hettich hinge plate     2 /each
 *   Door buffer            0.5 /each      Shelf support         0.1 /each
 *   Knock-down fitting     0.1 /each      Screw 45x5            0.2 /each
 */
export const HARDWARE_FIT_MINUTES: Record<string, number> = {
  runner: 25,
  handle: 5,
  hinge: 6,
  'hinge-plate': 2,
  leg: 1.5,
  shelf_pin: 0.1,
  buffer: 0.5,
  screw: 0.2,
  cam: 0.1,
};

/** Look up fit minutes by hardware type, falling back to the flat rate. */
export function hardwareFitMinutes(hardwareType: string, fallback: number): number {
  const t = (hardwareType || '').toLowerCase();
  if (t in HARDWARE_FIT_MINUTES) return HARDWARE_FIT_MINUTES[t];
  if (t.startsWith('consumable-')) return HARDWARE_FIT_MINUTES.screw;
  for (const [key, min] of Object.entries(HARDWARE_FIT_MINUTES)) {
    if (t.includes(key)) return min;
  }
  return fallback;
}

export interface WorkshopLine {
  station: string;
  units: number;
  unitLabel: string;
  minutes: number;
  hours: number;
  rate: number;
  cost: number;
}

export interface WorkshopCost {
  mode: SupplyMode;
  lines: WorkshopLine[];
  shopMinutes: number;
  shopHours: number;
  shopCost: number;
  installMinutes: number;
  installHours: number;
  installCost: number;
  /** inputs, exposed so a quote can show its working */
  inputs: {
    products: number;
    parts: number;
    cutLengthM: number;
    edgeLm: number;
    verticalHoles: number;
    hardwareItems: number;
    benchtopLm: number;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Perimeter cut length for a part, in metres, times its quantity. */
function partCutLengthM(p: PartDimension): number {
  const perimeterMm = 2 * ((p.length ?? 0) + (p.width ?? 0));
  return (perimeterMm / 1000) * Math.max(1, p.quantity ?? 1);
}

/**
 * Drilled hole estimate. Microvellum counts real machining tokens; we do not
 * have the drilling program here, so this approximates from configuration:
 * construction cams/dowels per box, shelf-pin rows, hinge cup + plate, and
 * runner fixings. Calibrated against the Donkin report (21 products, 946
 * vertical holes ~ 45/product).
 */
function estimateVerticalHoles(cab: CabinetBOM): number {
  const parts = cab.parts ?? [];
  const doors = parts.filter((p) => /(^|\s)door/i.test(p.partType))
    .reduce((s, p) => s + (p.quantity ?? 0), 0);
  const drawerFronts = parts.filter((p) => /drawer front/i.test(p.partType))
    .reduce((s, p) => s + (p.quantity ?? 0), 0);
  const shelves = parts.filter((p) => /shelf/i.test(p.partType))
    .reduce((s, p) => s + (p.quantity ?? 0), 0);
  const carcassParts = parts.filter((p) => !/door|drawer|shelf/i.test(p.partType))
    .reduce((s, p) => s + (p.quantity ?? 0), 0);
  return (
    carcassParts * 4 +   // cam / dowel construction holes per panel
    shelves * 8 +        // pin rows both sides
    doors * 6 +          // cup + plate
    drawerFronts * 8     // runner + front fixing
  );
}

export function calculateWorkshopCost(
  cabinets: CabinetBOM[],
  opts: {
    mode?: SupplyMode;
    rates?: Partial<WorkshopRates>;
    /** total benchtop run in metres, for install scribing/fitting time */
    benchtopLm?: number;
    /**
     * True when the edge rows already carry an `application_cost` — 870 of the
     * 888 available edges do, and edgeCalculator folds it into the edging line.
     * Charging the Edgebanding station as well would bill the same labour
     * twice, so it is skipped. Bower's edge pricing is the trusted source here;
     * Microvellum's edging was never set up correctly.
     */
    edgeApplicationAlreadyPriced?: boolean;
    /**
     * Boards that are priced at job level rather than on a cabinet — toe kick
     * panels. They are still cut, drilled, handled and fitted, so they belong
     * in the labour count even though they carry no CabinetBOM.
     */
    extraParts?: number;
    extraCutLengthM?: number;
    /** extra products to install (kick runs, benchtop pieces) */
    extraInstallProducts?: number;
  } = {},
): WorkshopCost {
  const r: WorkshopRates = { ...DEFAULT_WORKSHOP_RATES, ...(opts.rates ?? {}) };
  const mode: SupplyMode = opts.mode ?? 'assembled_installed';
  const assembles = mode === 'assembled' || mode === 'assembled_installed';
  const fitsHardware = assembles;
  const suppliesLooseHardware = mode === 'flat_pack_hw_loose';
  const installs = mode === 'assembled_installed';

  // Only cabinets that actually produced parts count as products.
  const priced = cabinets.filter((c) => (c.parts?.length ?? 0) > 0);

  let parts = 0;
  let cutLengthM = 0;
  let verticalHoles = 0;
  let hardwareItems = 0;
  let edgeLm = 0;
  // fitting time is per hardware TYPE, not per item — see HARDWARE_FIT_MINUTES
  let hardwareFitMin = 0;

  for (const cab of priced) {
    for (const p of cab.parts ?? []) {
      parts += Math.max(1, p.quantity ?? 1);
      cutLengthM += partCutLengthM(p);
    }
    verticalHoles += estimateVerticalHoles(cab);
    for (const h of cab.hardware ?? []) {
      const qty = h.quantity ?? 0;
      hardwareItems += qty;
      hardwareFitMin += qty * hardwareFitMinutes(h.hardwareType ?? '', r.hardwareMinPerItem);
    }
    edgeLm += (cab.edgeTape ?? []).reduce((s, e) => s + (e.linearMeters ?? 0), 0);
  }

  // job-level boards (toe kick) still cost labour
  parts += Math.max(0, opts.extraParts ?? 0);
  cutLengthM += Math.max(0, opts.extraCutLengthM ?? 0);

  const products = priced.length + Math.max(0, opts.extraInstallProducts ?? 0);
  const benchtopLm = opts.benchtopLm ?? 0;

  const lines: WorkshopLine[] = [];
  const add = (station: string, units: number, unitLabel: string, minPerUnit: number, rate: number, crew = 1) => {
    if (units <= 0 || minPerUnit <= 0) return;
    const minutes = units * minPerUnit * crew;
    const hours = minutes / 60;
    lines.push({
      station, units: round2(units), unitLabel,
      minutes: round2(minutes), hours: round2(hours),
      rate, cost: round2(hours * rate),
    });
  };

  // ---- always ---------------------------------------------------------------
  add('Drafting', parts, 'part', r.draftingMinPerPart, r.draftingRate);
  add('Panel lead-in / lead-out', cutLengthM, 'm', r.leadInOutMinPerM, r.machiningRate);
  add('Panel cutting', cutLengthM, 'm', r.cuttingMinPerM, r.machiningRate);
  add('Vertical drilling', verticalHoles, 'hole', r.verticalDrillMinPerHole, r.machiningRate);
  add('Part labelling', parts, 'part', r.labellingMinPerPart, r.machiningRate);
  if (!opts.edgeApplicationAlreadyPriced) {
    add('Edgebanding', edgeLm, 'm', r.edgebandMinPerM, r.edgebandingRate);
  }
  add('Part handling', parts, 'part', r.handlingMinPerPart, r.handlingRate);

  // ---- assembly, only when the shop assembles ------------------------------
  if (assembles) {
    add('Shop part assembly', parts, 'part', r.assemblyMinPerPart, r.assemblyRate);
  }
  if (fitsHardware && hardwareFitMin > 0) {
    // minutes already carry the per-type weighting, so pass 1 min/unit
    add('Hardware assembly', hardwareFitMin, 'min', 1, r.hardwareRate);
    lines[lines.length - 1].units = round2(hardwareItems);
    lines[lines.length - 1].unitLabel = 'item';
  } else if (suppliesLooseHardware) {
    add('Hardware pick & box', hardwareItems, 'item', r.hardwarePickMinPerItem, r.hardwareRate);
  }

  // ---- packing differs by mode ---------------------------------------------
  if (assembles) {
    add('Inspection & packaging', products, 'product', r.packingMinPerProduct, r.handlingRate);
  } else {
    add('Flat pack wrap & label', parts, 'part', r.flatPackPackingMinPerPart, r.handlingRate);
  }

  add('Loading & unloading', products, 'product', r.loadingMinPerProduct, r.loadingRate, r.loadingCrew);

  const shopMinutes = lines.reduce((s, l) => s + l.minutes, 0);
  const shopCost = lines.reduce((s, l) => s + l.cost, 0);

  // ---- install --------------------------------------------------------------
  let installMinutes = 0;
  if (installs) {
    for (const cab of priced) {
      const id = (cab.cabinetSku ?? '').toLowerCase();
      const name = (cab.cabinetName ?? '').toLowerCase();
      const isTall = (cab.dimensions?.height ?? 0) >= 1500
        || /tall|pantry|broom|linen/.test(id + ' ' + name);
      const isCorner = /corner|pie|blind/.test(id + ' ' + name);
      installMinutes += r.installMinPerCabinet
        + (isTall ? r.installTallExtraMin : 0)
        + (isCorner ? r.installCornerExtraMin : 0);
    }
    // kick runs and benchtop pieces are installed products too
    installMinutes += Math.max(0, opts.extraInstallProducts ?? 0) * r.installMinPerCabinet;
    installMinutes += benchtopLm * r.installBenchtopMinPerM;
  }
  const installHours = installMinutes / 60;
  const installCost = installHours * r.installRate;

  return {
    mode,
    lines,
    shopMinutes: round2(shopMinutes),
    shopHours: round2(shopMinutes / 60),
    shopCost: round2(shopCost),
    installMinutes: round2(installMinutes),
    installHours: round2(installHours),
    installCost: round2(installCost),
    inputs: {
      products,
      parts,
      cutLengthM: round2(cutLengthM),
      edgeLm: round2(edgeLm),
      verticalHoles,
      hardwareItems,
      benchtopLm: round2(benchtopLm),
    },
  };
}
