import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ConfiguredCabinet, RoomHardwareDefaults, RoomMaterialDefaults } from '@/contexts/TradeRoomContext';
import { GlobalDimensions, HardwareOptions, PlacedItem } from '@/types';
import { generateQuoteBOM, PricingData, QuoteBOM } from '@/lib/pricing';
import { useClientMarkup } from '@/hooks/useClientMarkup';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
// Local binding: `export { … } from` (below) is a re-export only and does NOT
// bind toPlacedItems in this module's scope — calling it locally without this
// import is a `Cannot find name` typecheck error + runtime ReferenceError
// (release blocker 6.1).
import { toPlacedItems } from '@/lib/trade/cabinetPlacedItem';
import { allocateQuotedTotal } from '@/lib/trade/pricingPersistence';
import { fetchAllPricingRows } from '@/lib/pricing/fetchAllPricingRows';

export interface TradeRoomPricingInput {
  cabinets: ConfiguredCabinet[];
  dimensions: GlobalDimensions;
  materialDefaults?: RoomMaterialDefaults;
  hardwareDefaults: RoomHardwareDefaults;
}

export interface TradeRoomPricingResult {
  quoteBOM: QuoteBOM | null;
  bomSummary: QuoteBOM['grandTotal'] | null;
  /** Per-cabinet raw COST (ex commercial layer, ex GST). */
  perCabinetTotals: Record<string, number>;
  /** Per-cabinet SELL price (incl commercial + GST), cost-share of roomTotal.
   *  This is what the planner shows and what admin should label "Sell Price". */
  perCabinetSell: Record<string, number>;
  roomTotal: number;
  pricingVersion: string | null;
  pricingHash: string | null;
  /** Active matrix rows available for explicit room selection. */
  benchtopOptions: PricingData['benchtop'];
  isLoading: boolean;
}

async function fetchBundleMaterials(): Promise<unknown[] | null> {
  // Same supplier bundle the editor reads — keeps the quote's material ids
  // consistent with the material picker (identity; cost comes from the DB).
  try {
    const res = await fetch('/data/bower-supplier-catalog/planner-materials.json');
    if (res.ok) {
      const j = await res.json();
      const rows = Array.isArray(j) ? j : j.materials;
      if (rows && rows.length) return rows as unknown[];
    }
  } catch { /* fall through to Supabase */ }
  return null;
}

export async function fetchPricingData(): Promise<PricingData> {
  const bundleMaterials = await fetchBundleMaterials();
  const [parts, materials, edges, hardware, labor, doorDrawer, benchtop, appliances] = await Promise.all([
    fetchAllPricingRows<PricingData['parts'][number]>('parts_pricing', { visibility_status: 'Available' }),
    fetchAllPricingRows<PricingData['materials'][number]>('material_pricing', { visibility_status: 'Available' }),
    fetchAllPricingRows<PricingData['edges'][number]>('edge_pricing', { visibility_status: 'Available' }),
    fetchAllPricingRows<PricingData['hardware'][number]>('hardware_pricing', { visibility_status: 'Available' }),
    fetchAllPricingRows<PricingData['labor'][number]>('labor_rates'),
    fetchAllPricingRows<PricingData['doorDrawer'][number]>('door_drawer_pricing', { visibility_status: 'Available' }),
    fetchAllPricingRows<PricingData['benchtop'][number]>('benchtop_pricing'),
    fetchAllPricingRows<NonNullable<PricingData['appliances']>[number]>('appliance_products', { is_active: true }),
  ]);

  // The public bundle is the source of material IDENTITY (names, images,
  // dimensions) but must NOT carry raw supplier costs (review #1 — the bundle
  // is world-readable). COST is authoritative from the authenticated DB
  // (material_pricing, RLS = authenticated-only). Overlay DB cost onto each
  // bundle row (matched by id or item_code); DB-only rows are appended so
  // "Shop Materials" carcase boards still resolve.
  const dbMaterials = materials as PricingData['materials'];
  // Cost/spec fields that come from the DB, never the public bundle.
  const COST_FIELDS: (keyof PricingData['materials'][number])[] = [
    'area_cost', 'area_handling_cost', 'area_assembly_cost',
    'sheet_width', 'sheet_length', 'expected_yield_factor', 'minimum_job_area',
    'minimum_usage_rollover', 'double_sided_cost', 'horizontal_grain_surcharge',
    'captured_unit_price', 'price_status', 'price_unit',
  ];
  let mergedMaterials = dbMaterials;
  if (bundleMaterials && bundleMaterials.length) {
    const bundle = bundleMaterials as PricingData['materials'];
    const dbByKey = new Map<string, PricingData['materials'][number]>();
    for (const d of dbMaterials) {
      if (d.id) dbByKey.set(String(d.id), d);
      if (d.item_code) dbByKey.set(String(d.item_code), d);
    }
    const withCost = bundle.map((b) => {
      const d = dbByKey.get(String(b.id)) ?? dbByKey.get(String(b.item_code));
      if (!d) return b;
      const overlay: Record<string, unknown> = {};
      for (const f of COST_FIELDS) if (d[f] != null) overlay[f as string] = d[f];
      return { ...b, ...overlay } as PricingData['materials'][number];
    });
    const seen = new Set(bundle.map((m) => m.id));
    mergedMaterials = [...withCost, ...dbMaterials.filter((m) => !seen.has(m.id))];
  }

  return {
    parts: parts as PricingData['parts'],
    materials: mergedMaterials,
    edges: edges as PricingData['edges'],
    hardware: hardware as PricingData['hardware'],
    labor: labor as PricingData['labor'],
    doorDrawer: doorDrawer as PricingData['doorDrawer'],
    benchtop: benchtop as PricingData['benchtop'],
    appliances: appliances as PricingData['appliances'],
  };
}

// Shared with proposalToTradeRoom (plan §11.1) so the two conversion
// directions cannot drift — the implementation lives in the pure module.
// Re-export the locally-imported binding (imported at the top) so callers of
// this module keep the public API while the local calls resolve correctly.
export { toPlacedItems };

function toHardwareOptions(hardwareDefaults: RoomHardwareDefaults): HardwareOptions {
  return {
    hingeType: hardwareDefaults.hingeType,
    drawerType: hardwareDefaults.drawerType,
    cabinetTop: 'Standard',
    supplyHardware: hardwareDefaults.supplyHardware,
    adjustableLegs: hardwareDefaults.adjustableLegs,
    handleId: hardwareDefaults.handleType,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const props = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
  return `{${props.join(',')}}`;
}

function hashString(input: string): string {
  let hash = 2166136261;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Single-cabinet BOM for the Product Configurator — SAME engine, data, and
 * commercial layer as the room quote, so the Parts List always matches the
 * planner's price for that cabinet.
 */
export function useCabinetBOM(cabinet: ConfiguredCabinet | null, dimensions?: GlobalDimensions) {
  const { data: pricingData, isLoading } = useQuery({
    queryKey: ['pricing-data', 'trade-room'],
    queryFn: fetchPricingData,
    staleTime: 5 * 60 * 1000,
  });
  const { commercial } = useClientMarkup();

  return useMemo(() => {
    if (!cabinet || !pricingData) return { bom: null, quote: null, pricingData: pricingData ?? null, isLoading };
    const items = toPlacedItems([cabinet]);
    const hardwareOptions = toHardwareOptions({
      handleType: cabinet.hardware?.handleType ?? '',
      handleColor: cabinet.hardware?.handleColor ?? '',
      hingeType: cabinet.hardware?.hingeType ?? '',
      drawerType: cabinet.hardware?.drawerType ?? '',
      softClose: cabinet.hardware?.softClose ?? true,
      supplyHardware: true,
      adjustableLegs: true,
    });
    const quote = generateQuoteBOM(items, dimensions ?? DEFAULT_GLOBAL_DIMENSIONS, hardwareOptions, pricingData, commercial);
    return { bom: quote.cabinets[0] ?? null, quote, pricingData, isLoading };
  }, [cabinet, pricingData, commercial, dimensions, isLoading]);
}

export function useTradeRoomPricing({
  cabinets,
  dimensions,
  materialDefaults,
  hardwareDefaults,
}: TradeRoomPricingInput): TradeRoomPricingResult {
  const { data: pricingData, isLoading } = useQuery({
    queryKey: ['pricing-data', 'trade-room'],
    queryFn: fetchPricingData,
    staleTime: 5 * 60 * 1000,
  });

  const { commercial } = useClientMarkup();

  const quoteBOM = useMemo<QuoteBOM | null>(() => {
    if (!pricingData) return null;

    const items = toPlacedItems(cabinets, materialDefaults);
    const hardwareOptions = toHardwareOptions(hardwareDefaults);

    return generateQuoteBOM(items, dimensions, hardwareOptions, pricingData, commercial, {
      benchtopPricingId: materialDefaults?.benchtopPricingId,
      benchtopFinishId: materialDefaults?.benchtopFinishId,
    });
  }, [cabinets, dimensions, hardwareDefaults, materialDefaults, pricingData, commercial]);

  const perCabinetTotals = useMemo(() => {
    if (!quoteBOM) return {};

    return quoteBOM.cabinets.reduce<Record<string, number>>((acc, cabinetBOM) => {
      acc[cabinetBOM.cabinetId] = cabinetBOM.totalCost;
      return acc;
    }, {});
  }, [quoteBOM]);

  // Per-cabinet SELL price: distribute the room's sell total (incl commercial
  // layer + GST) across cabinets by their cost-share. Sums to grandTotal.total
  // (benchtops/kick are job-level, not attributed to a cabinet), so this is the
  // trustworthy "Sell Price" for both the planner list and the admin table.
  const perCabinetSell = useMemo(() => {
    if (!quoteBOM) return {};
    const costWeights = quoteBOM.cabinets.reduce<Record<string, number>>((acc, cabinet) => {
      acc[cabinet.cabinetId] = cabinet.totalCost;
      return acc;
    }, {});
    return allocateQuotedTotal(costWeights, quoteBOM.grandTotal.total);
  }, [quoteBOM]);

  const pricingVersionData = useMemo(() => {
    if (!pricingData) {
      return { pricingVersion: null, pricingHash: null };
    }

    const pricingHash = hashString(stableStringify(pricingData));

    return {
      pricingVersion: `trade-bom-${pricingHash}`,
      pricingHash,
    };
  }, [pricingData]);

  return {
    quoteBOM,
    bomSummary: quoteBOM?.grandTotal ?? null,
    perCabinetTotals,
    perCabinetSell,
    roomTotal: quoteBOM?.grandTotal.total ?? 0,
    pricingVersion: pricingVersionData.pricingVersion,
    pricingHash: pricingVersionData.pricingHash,
    benchtopOptions: pricingData?.benchtop.filter(option => option.is_active !== false) ?? [],
    isLoading,
  };
}
