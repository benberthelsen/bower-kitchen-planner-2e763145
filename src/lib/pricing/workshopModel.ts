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
  | 'flat_pack_hw_loose'
  /** Opt out of the process model and fall back to the flat regression. */
  | 'none';

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

  // ---- laminated solid-surface benchtops (see benchtopLaminate.ts) ---------
  // PLACEHOLDER minutes: Microvellum carries no countertop fabrication labour,
  // so there is no external calibration source. Confirm from shop timing.
  /** CNC / saw cut per metre of layer-piece perimeter, at machiningRate */
  benchtopCutMinPerM: number;
  /** glue-up per m2 per glue line (layers - 1): mix, spread, clamp, cure handling */
  benchtopLaminateMinPerSqm: number;
  /** fit and flush build-up strips per metre x (layers - 1) */
  benchtopBuildUpMinPerM: number;
  /** Mitred / rebated apron per metre: 45 deg cut, fold, glue, clamp every 70-80 mm, flush. */
  benchtopMitreMinPerM: number;
  /** per mitre / field / width join: seam glue, clamp, sand flush */
  benchtopJoinMin: number;
  /** face sanding and polishing per m2 */
  benchtopPolishMinPerSqm: number;
  /** edge profile sand / polish per metre */
  benchtopEdgePolishMinPerM: number;
  benchtopSinkCutoutMin: number;
  benchtopCooktopCutoutMin: number;
  benchtopTapHoleMin: number;
}

/**
 * Fabrication quantities for laminated benchtops priced at schedule level.
 * Every field is a plain count so a caller can sum rows. All stations no-op
 * at 0, so a job without benchtops is byte-identical to before this existed.
 */
export interface BenchtopFabricationInputs {
  /** cut pieces across every layer — drafted, labelled, handled */
  parts: number;
  /** metres of layer-piece perimeter to cut */
  cutLm: number;
  /** m2 of glue line = areaSqm x (layers - 1) */
  laminateSqm: number;
  /** metres of build-up strip = edgeLm x (layers - 1) */
  buildUpLm: number;
  /** Metres of mitred / rebated apron edge (HM2120 2-2, 2-3) - deeper than stacked strip. */
  mitreLm: number;
  /** Substrate packer behind a mitred apron, m2. */
  substrateSqm: number;
  /** mitres + field joins + width/length joins */
  joins: number;
  /** finished face m2 to sand and polish */
  polishSqm: number;
  /** finished edge metres to profile and polish */
  edgePolishLm: number;
  sink: number;
  cooktop: number;
  tapHole: number;
  /** metres of finished top, for install scribing/fitting */
  benchtopLm: number;
  /** finished tops to pack, load and install */
  products: number;
}

export const EMPTY_BENCHTOP_FABRICATION: BenchtopFabricationInputs = {
  parts: 0, cutLm: 0, laminateSqm: 0, buildUpLm: 0, mitreLm: 0, substrateSqm: 0, joins: 0,
  polishSqm: 0, edgePolishLm: 0, sink: 0, cooktop: 0, tapHole: 0,
  benchtopLm: 0, products: 0,
};

export function sumBenchtopFabrication(list: BenchtopFabricationInputs[]): BenchtopFabricationInputs {
  const out: BenchtopFabricationInputs = { ...EMPTY_BENCHTOP_FABRICATION };
  for (const f of list) {
    for (const k of Object.keys(out) as Array<keyof BenchtopFabricationInputs>) out[k] += f[k] ?? 0;
  }
  return out;
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

  // laminated benchtops — DEFAULT placeholders, not calibrated (MV board cut is 0.2/m)
  benchtopCutMinPerM: 0.6,
  benchtopLaminateMinPerSqm: 20,
  benchtopBuildUpMinPerM: 6,
  benchtopMitreMinPerM: 14,
  benchtopJoinMin: 45,
  benchtopPolishMinPerSqm: 25,
  benchtopEdgePolishMinPerM: 8,
  benchtopSinkCutoutMin: 30,
  benchtopCooktopCutoutMin: 20,
  benchtopTapHoleMin: 5,
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
    /**
     * Laminated solid-surface benchtops priced at schedule level
     * (benchtopLaminate.ts). Adds the benchtop stations, and folds the cut
     * pieces into drafting / labelling / handling and the finished tops into
     * packing / loading / install. Omit (or pass zeros) for no change.
     */
    benchtops?: BenchtopFabricationInputs;
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

  // Laminated benchtop pieces are drafted, labelled and handled like any part
  // but are NOT box-assembled and NOT flat-pack wrapped, so they are kept out
  // of `parts` and added only where they belong. Their cutting has its own
  // station (solid surface is slower than board), so nothing goes into
  // cutLengthM either.
  const bt: BenchtopFabricationInputs = { ...EMPTY_BENCHTOP_FABRICATION, ...(opts.benchtops ?? {}) };
  const btParts = Math.max(0, bt.parts);
  const btProducts = Math.max(0, bt.products);

  const products = priced.length + Math.max(0, opts.extraInstallProducts ?? 0) + btProducts;
  const benchtopLm = (opts.benchtopLm ?? 0) + Math.max(0, bt.benchtopLm);

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
  add('Drafting', parts + btParts, 'part', r.draftingMinPerPart, r.draftingRate);
  add('Panel lead-in / lead-out', cutLengthM, 'm', r.leadInOutMinPerM, r.machiningRate);
  add('Panel cutting', cutLengthM, 'm', r.cuttingMinPerM, r.machiningRate);
  add('Vertical drilling', verticalHoles, 'hole', r.verticalDrillMinPerHole, r.machiningRate);
  add('Part labelling', parts + btParts, 'part', r.labellingMinPerPart, r.machiningRate);
  if (!opts.edgeApplicationAlreadyPriced) {
    add('Edgebanding', edgeLm, 'm', r.edgebandMinPerM, r.edgebandingRate);
  }
  add('Part handling', parts + btParts, 'part', r.handlingMinPerPart, r.handlingRate);

  // ---- laminated benchtops, whatever the supply mode -----------------------
  // A benchtop cannot be flat-packed: it is fabricated in the shop regardless.
  // Station names are chosen so quoteFromSchedule's laborMinutes buckets catch
  // them: 'cutting' -> machining; lamination / build-up / joins / polishing /
  // cut-outs -> finishing. None contain 'edge' (that bucket is edgebanding) or
  // 'assembly'.
  add('Benchtop cutting', bt.cutLm, 'm', r.benchtopCutMinPerM, r.machiningRate);
  add('Benchtop lamination glue-up', bt.laminateSqm, 'm2', r.benchtopLaminateMinPerSqm, r.assemblyRate);
  add('Benchtop build-up strips', bt.buildUpLm, 'm', r.benchtopBuildUpMinPerM, r.assemblyRate);
  add('Benchtop mitred apron', bt.mitreLm, 'm', r.benchtopMitreMinPerM, r.assemblyRate);
  add('Benchtop joins', bt.joins, 'join', r.benchtopJoinMin, r.assemblyRate);
  add('Benchtop face sanding & polishing', bt.polishSqm, 'm2', r.benchtopPolishMinPerSqm, r.assemblyRate);
  add('Benchtop profile polishing', bt.edgePolishLm, 'm', r.benchtopEdgePolishMinPerM, r.assemblyRate);
  {
    // weighted minutes per cut-out type, like Hardware assembly below
    const cutoutMin = Math.max(0, bt.sink) * r.benchtopSinkCutoutMin
      + Math.max(0, bt.cooktop) * r.benchtopCooktopCutoutMin
      + Math.max(0, bt.tapHole) * r.benchtopTapHoleMin;
    if (cutoutMin > 0) {
      add('Benchtop cut-outs', cutoutMin, 'min', 1, r.machiningRate);
      lines[lines.length - 1].units = round2(Math.max(0, bt.sink) + Math.max(0, bt.cooktop) + Math.max(0, bt.tapHole));
      lines[lines.length - 1].unitLabel = 'cut-out';
    }
  }

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
    installMinutes += (Math.max(0, opts.extraInstallProducts ?? 0) + btProducts) * r.installMinPerCabinet;
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
