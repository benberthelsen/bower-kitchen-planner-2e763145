import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ConfiguredCabinet, RoomHardwareDefaults, RoomMaterialDefaults } from '@/contexts/TradeRoomContext';
import { GlobalDimensions, HardwareOptions, PlacedItem } from '@/types';
import { generateQuoteBOM, PricingData, QuoteBOM } from '@/lib/pricing';

export interface TradeRoomPricingInput {
  cabinets: ConfiguredCabinet[];
  dimensions: GlobalDimensions;
  materialDefaults?: RoomMaterialDefaults;
  hardwareDefaults: RoomHardwareDefaults;
}

export interface TradeRoomPricingResult {
  quoteBOM: QuoteBOM | null;
  bomSummary: QuoteBOM['grandTotal'] | null;
  perCabinetTotals: Record<string, number>;
  roomTotal: number;
  pricingVersion: string | null;
  pricingHash: string | null;
  isLoading: boolean;
}

async function fetchPricingData(): Promise<PricingData> {
  const [parts, materials, edges, hardware, labor, doorDrawer, stone] = await Promise.all([
    supabase.from('parts_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('material_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('edge_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('hardware_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('labor_rates').select('*'),
    supabase.from('door_drawer_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('stone_pricing').select('*'),
  ]);

  return {
    parts: (parts.data ?? []) as PricingData['parts'],
    materials: (materials.data ?? []) as PricingData['materials'],
    edges: (edges.data ?? []) as PricingData['edges'],
    hardware: (hardware.data ?? []) as PricingData['hardware'],
    labor: (labor.data ?? []) as PricingData['labor'],
    doorDrawer: (doorDrawer.data ?? []) as PricingData['doorDrawer'],
    stone: (stone.data ?? []) as PricingData['stone'],
  };
}

function toPlacedItems(cabinets: ConfiguredCabinet[], materialDefaults?: RoomMaterialDefaults): PlacedItem[] {
  return cabinets.map((cabinet) => ({
    instanceId: cabinet.instanceId,
    definitionId: cabinet.definitionId,
    itemType: cabinet.category === 'Appliance' ? 'Appliance' : 'Cabinet',
    cabinetNumber: cabinet.cabinetNumber,
    x: cabinet.position?.x ?? 0,
    y: cabinet.position?.y ?? 0,
    z: cabinet.position?.z ?? 0,
    rotation: cabinet.position?.rotation ?? 0,
    width: cabinet.dimensions.width,
    depth: cabinet.dimensions.depth,
    height: cabinet.dimensions.height,
    hinge: 'Left',
    finishColor: cabinet.materials?.exteriorFinish ?? materialDefaults?.exteriorFinish,
    handleType: cabinet.hardware?.handleType,
  }));
}

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

  const quoteBOM = useMemo<QuoteBOM | null>(() => {
    if (!pricingData) return null;

    const items = toPlacedItems(cabinets, materialDefaults);
    const hardwareOptions = toHardwareOptions(hardwareDefaults);

    return generateQuoteBOM(items, dimensions, hardwareOptions, pricingData);
  }, [cabinets, dimensions, hardwareDefaults, materialDefaults, pricingData]);

  const perCabinetTotals = useMemo(() => {
    if (!quoteBOM) return {};

    return quoteBOM.cabinets.reduce<Record<string, number>>((acc, cabinetBOM) => {
      acc[cabinetBOM.cabinetId] = cabinetBOM.totalCost;
      return acc;
    }, {});
  }, [quoteBOM]);

  const pricingVersionData = useMemo(() => {
    if (!pricingData) {
      return { pricingVersion: null, pricingHash: null };
    }

    const timestamp = new Date().toISOString();
    const pricingHash = hashString(stableStringify(pricingData));

    return {
      pricingVersion: `trade-bom-${timestamp}`,
      pricingHash,
    };
  }, [pricingData]);

  return {
    quoteBOM,
    bomSummary: quoteBOM?.grandTotal ?? null,
    perCabinetTotals,
    roomTotal: quoteBOM?.grandTotal.total ?? 0,
    pricingVersion: pricingVersionData.pricingVersion,
    pricingHash: pricingVersionData.pricingHash,
    isLoading,
  };
}
