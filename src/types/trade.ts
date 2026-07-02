import type { RoomConfig, GlobalDimensions } from '@/types';
import type { CatalogItemDefinition } from '@/types';

export const CANONICAL_TRADE_JOB_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'in_production',
  'completed',
] as const;

export type TradeJobStatus = (typeof CANONICAL_TRADE_JOB_STATUSES)[number];

export interface CabinetInstancePosition {
  x: number;
  y: number;
  z: number;
  rotation: number;
}

export interface CabinetMaterials {
  exteriorFinish: string;
  carcaseFinish: string;
  doorStyle: string;
  edgeBanding: string;
}

export interface CabinetHardware {
  handleType: string;
  handleColor: string;
  hingeType: string;
  drawerType: string;
  softClose: boolean;
}

export interface CabinetAccessories {
  shelfCount: number;
  adjustableShelves: boolean;
  dividers: boolean;
  softCloseUpgrade: boolean;
  specialFittings: string[];
}

export interface CabinetDimensions {
  width: number;
  height: number;
  depth: number;
}

/**
 * Construction prompts mirroring Microvellum's product prompts so the data
 * crosses over 1:1 in the XML export. Names follow the MV Base Corner
 * Cabinet prompt dialog: Cabinet Depth Left/Right, PieCut Distance (derived),
 * Toe Kick Height, Left/Right Filler Width, PieCut/Angled Front.
 */
export interface CabinetConstruction {
  secondWidth?: number;         // mm — corner SECOND wall run (Wall 2). Width = Wall 1; Depth = carcase return.
  cabinetDepthLeft?: number;    // mm — corner left arm carcase depth (MV: Cabinet Depth Left)
  cabinetDepthRight?: number;   // mm — corner right arm carcase depth (MV: Cabinet Depth Right)
  toeKickHeight?: number;       // mm — overrides room default (MV: Toe Kick Height)
  leftFillerWidth?: number;     // mm (MV: Left Filler Width)
  rightFillerWidth?: number;    // mm (MV: Right Filler Width)
  blindSide?: 'Left' | 'Right'; // blind corner orientation
  hingeSide?: 'Left' | 'Right'; // door hinging
  frontType?: 'PieCut' | 'Angled'; // corner front style (MV: PieCut/Angled Front)
}

export interface ConfiguredCabinet {
  instanceId: string;
  definitionId: string;
  cabinetNumber: string;
  productName: string;
  category: 'Base' | 'Wall' | 'Tall' | 'Appliance';
  dimensions: CabinetDimensions;
  materials: CabinetMaterials;
  hardware: CabinetHardware;
  accessories: CabinetAccessories;
  construction?: CabinetConstruction;
  position?: CabinetInstancePosition;
  isPlaced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomMaterialDefaults {
  exteriorFinish: string;
  carcaseFinish: string;
  doorStyle: string;
  edgeBanding: string;
}

export interface RoomHardwareDefaults {
  handleType: string;
  handleColor: string;
  hingeType: string;
  drawerType: string;
  softClose: boolean;
  supplyHardware: boolean;
  adjustableLegs: boolean;
}

export interface TradeRoom {
  id: string;
  name: string;
  description: string;
  shape: 'rectangular' | 'l-shaped';
  config: RoomConfig;
  dimensions: GlobalDimensions;
  materialDefaults: RoomMaterialDefaults;
  hardwareDefaults: RoomHardwareDefaults;
  cabinets: ConfiguredCabinet[];
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteSnapshot {
  roomId: string;
  roomTotal: number;
  perCabinetTotals: Record<string, number>;
  bomSummary?: Record<string, unknown> | null;
  pricingVersion?: string;
  pricingHash?: string;
  capturedAt: string;
}

export interface MicrovellumExportPayload {
  jobId: string;
  rooms: TradeRoom[];
}

export type TradeJob = {
  id: string;
  jobNumber: number;
  name: string;
  cost: number;
  updatedAt: string | null;
  status: TradeJobStatus;
};

export function isTradeJobStatus(status: string): status is TradeJobStatus {
  return (CANONICAL_TRADE_JOB_STATUSES as readonly string[]).includes(status);
}

export const TRADE_JOB_STATUS_LABELS: Record<TradeJobStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  in_production: 'In production',
  completed: 'Completed',
};

export type TradeJobStatusGroup = 'draft' | 'pending_approval' | 'production' | 'completed';

export function statusToGroup(status: TradeJobStatus): TradeJobStatusGroup {
  if (status === 'draft') return 'draft';
  if (status === 'pending_approval') return 'pending_approval';
  if (status === 'completed') return 'completed';
  return 'production';
}

export type TradeCatalogItem = CatalogItemDefinition;
