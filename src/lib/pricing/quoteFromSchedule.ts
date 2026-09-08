/**
 * Price a cabinet schedule and shape the result for Build Flow.
 *
 * This is the ONE place a Microvellum-style schedule (what cabinets, what
 * sizes, which room) becomes priced quote lines. The CLI
 * (scripts/price-kitchen.mjs) and the `price-quote` edge function both call
 * it, so Build Flow prices with the real engine and the live catalogue rather
 * than a copy of either. Pure: no I/O, no Supabase — callers fetch the
 * catalogue and pass it in.
 *
 * Output lines carry Build Flow's QuoteItem field names so the result drops
 * straight through its existing import path.
 */
import { generateQuoteBOM } from './bomGenerator';
import type { PricingData } from './types';
import type { PlacedItem, GlobalDimensions, HardwareOptions } from '@/types';
import type { SupplyMode } from './workshopModel';

export interface ScheduleItem {
  /** Microvellum product name, e.g. "Base 3 Drawer". Drives the part mapping. */
  name: string;
  qty?: number;
  w: number;
  h: number;
  d: number;
  room?: string | null;
  /** Source quote's sell figure, when known — passes through for items the cabinet engine does not price (stone). */
  mv_total?: number;
  /** Optional per-line material overrides. */
  carcaseMaterialId?: string;
  exteriorMaterialId?: string;
  edgeId?: string;
}

export interface QuoteSelections {
  carcaseMaterialId: string;
  exteriorMaterialId: string;
  edgeId: string;
  hingeType: string;
  drawerType: string;
  handleId?: string;
  cabinetTop?: 'rail' | 'top';
  adjustableLegs?: boolean;
}

export interface QuoteCommercial {
  /** Fraction, e.g. 0.40. From client_markup_settings — never a hardcoded guess. */
  markupPct: number;
  overheadPct?: number;
  supplyMode?: SupplyMode;
  /** Names where the markup came from, printed in the summary. */
  markupSource: string;
}

export interface PricedLine {
  description: string;
  quantity: number;
  unit: 'ea';
  unitPrice: number;
  total: number;
  costPrice: number;
  materialCost: number;
  laborCost: number;
  marginPercent: number;
  category: 'cabinetry' | 'general';
  roomName: string | null;
  /** 'bower' = priced by the engine; 'passthrough' = carried from the source quote (stone, buyouts). */
  source: 'bower' | 'passthrough';
}

/**
 * Build Flow's `MVWorkshopCosting` shape — what its Microvellum import writes to
 * quote_mv_workshop_costing and what the schedule (time allowances), budget and
 * purchase-order views read. Emitting it from the engine means "Price with
 * BowerOS" feeds every downstream consumer the MV import does, with better
 * data: real consolidated sheets, edge metres, hardware quantities and
 * per-station minutes rather than a PDF re-read.
 */
export interface WorkshopCosting {
  sheetStock: Array<{ material: string; thickness?: number; wastePercent: number; markupPercent: number; units: number; unitCost: number; markupCost: number; cost: number }>;
  solidStock: Array<{ material: string; thickness?: number; wastePercent: number; markupPercent: number; units: number; unitCost: number; markupCost: number; cost: number }>;
  edgebanding: Array<{ color: string; width: number; thickness?: number; linearMeters: number; unitCost: number; cost: number }>;
  hardware: Array<{ code: string; description: string; quantity: number; unitCost: number; markupCost: number; cost: number; category: 'hinge' | 'runner' | 'handle' | 'screw' | 'bracket' | 'other' }>;
  labor: Array<{ category: string; hours: number; rate: number; cost: number }>;
  laborMinutes: { drafting: number; machining: number; edgebanding: number; assembly: number; finishing: number; productHandling: number; installation: number; total: number };
  fileName: string;
  projectName?: string;
  cabinetCount: number;
  roomCount: number;
  partCount: number;
  hasStone: boolean;
  hasLaminex: boolean;
  hasTwoPack: boolean;
  hasBuyout: boolean;
  buyoutItems: string[];
  sheetStockTotal: number;
  solidStockTotal: number;
  edgebandingTotal: number;
  hardwareTotal: number;
  totalMaterials: number;
  shopLaborTotal: number;
  onsiteLaborTotal: number;
  totalLabor: number;
  markupPercent: number;
  markupAmount: number;
  overheadPercent: number;
  overheadAmount: number;
  totalProjectPrice: number;
  totalProjectPriceExGst: number;
  totalCost: number;
}

export interface PricedQuote {
  /** For quote_mv_workshop_costing — schedule time allowances, budget, POs. */
  workshopCosting: WorkshopCosting;
  lines: PricedLine[];
  totals: {
    cabinetCost: number;
    installCost: number;
    sellExGst: number;
    gst: number;
    sellIncGst: number;
    markupPct: number;
    markupSource: string;
    supplyMode: SupplyMode;
  };
  cost: {
    materials: number;
    edging: number;
    hardware: number;
    labor: number;
    processing: number;
  };
  workshop: { shopMinutes: number; installMinutes: number; stations: Array<{ station: string; minutes: number; cost: number }> } | null;
  warnings: string[];
}

const BENCHTOP_RE = /countertop|benchtop/i;
const g0 = (n: number | undefined) => n ?? 0;
const money = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const DEFAULT_DIMENSIONS: GlobalDimensions = {
  toeKickHeight: 135, shelfSetback: 5, baseHeight: 880, baseDepth: 555,
  wallHeight: 879, wallDepth: 330, tallHeight: 2400, tallDepth: 580,
  benchtopThickness: 24, benchtopOverhang: 25, splashbackHeight: 600,
  doorGap: 2, drawerGap: 2, leftGap: 1.5, rightGap: 1.5,
  topMargin: 0, bottomMargin: 0, wallGap: 10,
  boardThickness: 16, backPanelSetback: 16, topReveal: 3, sideReveal: 2, handleDrillSpacing: 32,
} as GlobalDimensions;

/** Microvellum leaves the first product's room blank; it belongs with the main run. */
function roomOf(item: ScheduleItem, fallback: string): string {
  const raw = String(item.room ?? '').trim();
  return !raw || /^\(?unnamed\)?$/i.test(raw) ? fallback : raw;
}

export function quoteFromSchedule(
  schedule: ScheduleItem[],
  pricing: PricingData,
  selections: QuoteSelections,
  commercial: QuoteCommercial,
  opts: { dimensions?: GlobalDimensions; defaultRoom?: string } = {},
): PricedQuote {
  const dims = opts.dimensions ?? DEFAULT_DIMENSIONS;
  const defaultRoom = opts.defaultRoom ?? 'Kitchen';
  const supplyMode: SupplyMode = commercial.supplyMode ?? 'assembled_installed';
  const uplift = (1 + (commercial.overheadPct ?? 0)) * (1 + commercial.markupPct);

  const cabinetRows = schedule.filter((r) => !BENCHTOP_RE.test(r.name));
  const otherRows = schedule.filter((r) => BENCHTOP_RE.test(r.name));

  // One PlacedItem per unit so a qty-3 line prices as three cabinets.
  const items: PlacedItem[] = [];
  const originOf: number[] = [];
  cabinetRows.forEach((r, idx) => {
    const qty = Math.max(1, Math.round(r.qty ?? 1));
    for (let n = 0; n < qty; n++) {
      originOf.push(idx);
      items.push({
        instanceId: `line-${idx}-${n}`,
        definitionId: r.name,
        itemType: 'Cabinet',
        productName: r.name,
        cabinetNumber: `C${String(items.length + 1).padStart(2, '0')}`,
        x: 0, y: 0, z: 0, rotation: 0,
        width: r.w, height: r.h, depth: r.d,
        carcaseMaterialId: r.carcaseMaterialId ?? selections.carcaseMaterialId,
        exteriorMaterialId: r.exteriorMaterialId ?? selections.exteriorMaterialId,
        edgeId: r.edgeId ?? selections.edgeId,
      } as PlacedItem);
    }
  });

  const hardwareOptions = {
    hingeType: selections.hingeType,
    drawerType: selections.drawerType,
    handleId: selections.handleId,
    cabinetTop: selections.cabinetTop ?? 'rail',
    supplyHardware: true,
    adjustableLegs: selections.adjustableLegs ?? true,
  } as unknown as HardwareOptions;

  const bom = generateQuoteBOM(items, dims, hardwareOptions, pricing, { supplyMode });

  // Fold per-unit costs back onto their schedule line.
  const lineCost = new Array(cabinetRows.length).fill(0) as number[];
  const lineSplit = cabinetRows.map(() => ({ material: 0, labor: 0 }));
  bom.cabinets.forEach((c, i) => {
    const idx = originOf[i];
    lineCost[idx] += c.totalCost ?? 0;
    lineSplit[idx].material += c.subtotals.materials + c.subtotals.edging + c.subtotals.hardware;
    lineSplit[idx].labor += c.subtotals.labor + c.subtotals.handling + c.subtotals.machining + c.subtotals.assembly;
  });

  const installCost = bom.workshop?.installCost ?? 0;
  const cabinetCost = lineCost.reduce((a, b) => a + b, 0);
  const marginPercent = money(commercial.markupPct * 100);

  const lines: PricedLine[] = cabinetRows.map((r, idx) => {
    const qty = Math.max(1, Math.round(r.qty ?? 1));
    const total = money(lineCost[idx] * uplift);
    return {
      description: r.name,
      quantity: qty,
      unit: 'ea',
      unitPrice: money(total / qty),
      total,
      costPrice: money(lineCost[idx]),
      materialCost: money(lineSplit[idx].material),
      laborCost: money(lineSplit[idx].labor),
      marginPercent,
      category: 'cabinetry',
      roomName: roomOf(r, defaultRoom),
      source: 'bower',
    };
  });

  // Stone and other items the cabinet engine does not price pass through at the
  // source quote's figure so nothing silently vanishes from the client's quote.
  for (const r of otherRows) {
    const total = money(r.mv_total ?? 0);
    if (total <= 0) continue;
    lines.push({
      description: r.name, quantity: 1, unit: 'ea', unitPrice: total, total,
      costPrice: total, materialCost: total, laborCost: 0, marginPercent: 0,
      category: 'cabinetry', roomName: roomOf(r, defaultRoom), source: 'passthrough',
    });
  }

  // Install is billed at cost: the engine adds it after the margin layer and
  // client_markup_settings carries no install category.
  if (installCost > 0) {
    const total = money(installCost);
    const mainRoom = lines.length
      ? [...lines.reduce((m, l) => m.set(l.roomName, (m.get(l.roomName) ?? 0) + 1), new Map<string | null, number>()).entries()]
          .sort((a, b) => b[1] - a[1])[0][0]
      : defaultRoom;
    lines.push({
      description: 'Installation — onsite', quantity: 1, unit: 'ea', unitPrice: total, total,
      costPrice: total, materialCost: 0, laborCost: total, marginPercent: 0,
      category: 'general', roomName: mainRoom, source: 'bower',
    });
  }

  const sellExGst = money(lines.reduce((s, l) => s + l.total, 0));

  // ---- workshop costing for Build Flow's downstream consumers ---------------
  const hwCategory = (t: string): WorkshopCosting['hardware'][number]['category'] => {
    const k = t.toLowerCase();
    if (/hinge/.test(k)) return 'hinge';
    if (/runner|slide|drawer/.test(k)) return 'runner';
    if (/handle|knob|pull/.test(k)) return 'handle';
    if (/screw|consumable/.test(k)) return 'screw';
    if (/bracket|leg|plate|pin/.test(k)) return 'bracket';
    return 'other';
  };
  const mk = commercial.markupPct;
  const sheetStock = bom.consolidatedSheets.map((sh) => ({
    material: sh.materialName,
    thickness: pricing.materials.find((m) => m.id === sh.materialId)?.thickness as number | undefined,
    wastePercent: money((1 - (sh.yieldFactor ?? 1)) * 100),
    markupPercent: money(mk * 100),
    units: money(sh.chargeableArea ?? sh.totalPartArea),
    unitCost: money(sh.areaCostPerSqm),
    markupCost: money(sh.totalMaterialCost * mk),
    cost: money(sh.totalMaterialCost),
  }));
  const edgebanding = bom.consolidatedEdgeTape.map((e) => ({
    color: e.edgeName,
    width: 22,
    thickness: e.thickness,
    linearMeters: money(e.linearMeters),
    unitCost: money(e.costPerMeter),
    cost: money(e.totalCost),
  }));
  const hardware = bom.consolidatedHardware.map((h) => ({
    code: h.itemCode,
    description: h.name,
    quantity: h.quantity,
    unitCost: money(h.unitCost),
    markupCost: money(h.totalCost * mk),
    cost: money(h.totalCost),
    category: hwCategory(h.hardwareType ?? ''),
  }));
  const st = bom.workshop?.lines ?? [];
  const minutesOf = (re: RegExp) => money(st.filter((l) => re.test(l.station)).reduce((a, l) => a + l.minutes, 0));
  const laborMinutes = {
    drafting: minutesOf(/draft/i),
    machining: minutesOf(/lead|cutting|drill|label/i),
    edgebanding: minutesOf(/edge/i),
    assembly: minutesOf(/assembly/i),
    finishing: 0,
    productHandling: minutesOf(/handling|packag|loading/i),
    installation: money(bom.workshop?.installMinutes ?? 0),
    total: 0,
  };
  laborMinutes.total = money(Object.entries(laborMinutes).filter(([k]) => k !== 'total').reduce((a, [, v]) => a + (v as number), 0));
  const labor = st.map((l) => ({ category: l.station, hours: money(l.hours), rate: l.rate, cost: money(l.cost) }));
  if (bom.workshop) labor.push({ category: 'Installation (onsite)', hours: money(bom.workshop.installHours), rate: 0, cost: money(bom.workshop.installCost) });
  const shopLaborTotal = money(bom.workshop?.shopCost ?? g0(bom.grandTotal.labor));
  const totalMaterials = money(bom.grandTotal.materials + bom.grandTotal.edging + bom.grandTotal.hardware);
  const rooms = new Set(lines.map((l) => l.roomName ?? defaultRoom));
  const workshopCosting: WorkshopCosting = {
    sheetStock, solidStock: [], edgebanding, hardware, labor, laborMinutes,
    fileName: 'BowerOS pricing engine',
    cabinetCount: items.length,
    roomCount: rooms.size,
    partCount: bom.cabinets.reduce((a, c) => a + c.parts.reduce((b, p) => b + Math.max(1, p.quantity ?? 1), 0), 0),
    hasStone: otherRows.some((r) => BENCHTOP_RE.test(r.name)),
    hasLaminex: false, hasTwoPack: false,
    hasBuyout: otherRows.length > 0,
    buyoutItems: otherRows.map((r) => r.name),
    sheetStockTotal: money(sheetStock.reduce((a, x) => a + x.cost, 0)),
    solidStockTotal: 0,
    edgebandingTotal: money(edgebanding.reduce((a, x) => a + x.cost, 0)),
    hardwareTotal: money(hardware.reduce((a, x) => a + x.cost, 0)),
    totalMaterials,
    shopLaborTotal,
    onsiteLaborTotal: money(installCost),
    totalLabor: money(shopLaborTotal + installCost),
    markupPercent: money(mk * 100),
    markupAmount: money(cabinetCost * mk),
    overheadPercent: money((commercial.overheadPct ?? 0) * 100),
    overheadAmount: money(cabinetCost * (commercial.overheadPct ?? 0)),
    totalProjectPrice: money(sellExGst * 1.1),
    totalProjectPriceExGst: sellExGst,
    totalCost: money(cabinetCost + installCost),
  };
  const gst = money(sellExGst * 0.1);
  const g = bom.grandTotal;

  return {
    workshopCosting,
    lines,
    totals: {
      cabinetCost: money(cabinetCost),
      installCost: money(installCost),
      sellExGst,
      gst,
      sellIncGst: money(sellExGst + gst),
      markupPct: commercial.markupPct,
      markupSource: commercial.markupSource,
      supplyMode,
    },
    cost: {
      materials: money(g.materials),
      edging: money(g.edging),
      hardware: money(g.hardware),
      labor: money(g.labor),
      processing: money(g.handling + g.machining + g.assembly),
    },
    workshop: bom.workshop
      ? {
          shopMinutes: bom.workshop.shopMinutes,
          installMinutes: bom.workshop.installMinutes,
          stations: bom.workshop.lines.map((l) => ({ station: l.station, minutes: l.minutes, cost: l.cost })),
        }
      : null,
    warnings: bom.warnings ?? [],
  };
}
