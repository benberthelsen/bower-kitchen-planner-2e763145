/**
 * AI Kitchen Designer — layout engine types.
 * Pure types, no runtime deps. The KitchenSpec DSL is the contract between
 * the AI harness (which decides intent) and the deterministic layout engine
 * (which produces valid, priceable geometry).
 */

import type { Opening, RoomConfig, ServicePoint, WallId } from '@/types';

export type Wall = WallId;

/** Room description consumed by the engine. Same shape as RoomConfig but with
 *  openings/services guaranteed present. */
export interface RoomSpec extends RoomConfig {
  openings: Opening[];
  services: ServicePoint[];
}

/** A room change suggested by AI. It is never applied without user review. */
export interface ProposedRoomPatch {
  width?: number;
  depth?: number;
  height?: number;
  shape?: RoomConfig['shape'];
  cutoutWidth?: number;
  cutoutDepth?: number;
  openings?: Opening[];
  services?: ServicePoint[];
}

// ─── Design brief (what the user tells us) ─────────────────────────────────

export type CookFrequency = 'rare' | 'daily' | 'entertainer';
export type Priority = 'storage' | 'bench-space' | 'entertaining' | 'baking' | 'budget';
export type BudgetBand = 'value' | 'mid' | 'premium';

export interface ApplianceChoices {
  oven?: '600' | '900';
  cooktop?: 'gas' | 'induction';
  dishwasher: boolean;
  fridgeWidthMm?: number;
  microwave?: 'built-in' | 'benchtop' | 'none';
}

export interface DesignBrief {
  room: RoomSpec;
  household: { size?: number; cooks?: CookFrequency };
  priorities: Priority[];
  appliances: ApplianceChoices;
  island: 'want' | 'no' | 'if-it-fits';
  styleWords?: string;
  budgetBand?: BudgetBand;
}

// ─── KitchenSpec DSL (what the AI writes) ──────────────────────────────────

export type SegmentRole =
  | 'sink'
  | 'cooktop'
  | 'dishwasher'
  | 'drawers'
  | 'doors'
  | 'pantry'
  | 'oven-tower'
  | 'fridge-gap'
  | 'corner';

export type Segment =
  | { kind: 'cabinet'; role: SegmentRole; widthMm?: number }
  | { kind: 'filler'; widthMm: number }
  | { kind: 'gap'; reason: string; widthMm: number };

export interface Run {
  wall: Wall;
  segments: Segment[];
  /** add wall cabinets above this run where openings allow */
  wallCabinets: boolean;
  /** solve the run from the far corner backward (segments listed corner-first) */
  fromEnd?: boolean;
}

export interface StyleSpec {
  finishId: string;
  benchtopId: string;
  handleId: string;
  kickId?: string;
  tapId?: string;
}

export interface IslandSpec {
  lengthMm: number;
  depthMm: number;
  features: ('seating' | 'sink' | 'storage')[];
}

export interface KitchenSpec {
  runs: Run[];
  island?: IslandSpec;
  style: StyleSpec;
  /** Plain-English explanation of why this layout works — shown to the user. */
  rationale: string;
}

// ─── Engine outputs ────────────────────────────────────────────────────────

export interface Violation {
  code: string;
  severity: 'error' | 'warn';
  message: string;
  itemIds?: string[];
}

export interface PriceBand {
  lowAud: number;
  highAud: number;
  estimateSource: 'engine' | 'fallback';
}

/** A segment resolved to a concrete catalog product + position along a wall. */
export interface ResolvedSegment {
  segment: Segment;
  definitionId: string | null; // null for gaps
  /** distance from the wall's left corner (mm) */
  startMm: number;
  widthMm: number;
}

// ─── Room capture (scanner-agnostic) ───────────────────────────────────────

export type RoomScanSource = 'manual' | 'webxr' | 'arcore' | 'cubicasa' | 'roomplan' | 'magicplan';

/**
 * Universal room-capture wrapper. Every capture method (manual diagram, WebXR
 * tap-to-measure, native scanners, RoomPlan) produces this; the planner/AI
 * consume only `room`. See docs/ROOM-SCANNER-RESEARCH.md.
 */
export interface RoomScan {
  room: RoomSpec;
  confidence: { overall: number; perWall?: Partial<Record<Wall, number>> };
  source: RoomScanSource;
  photos?: { url: string; tag?: 'plumbing' | 'power' | 'window' | 'general' }[];
  /** original scan artifact (zip/usdz) for reprocessing */
  rawArtifactUrl?: string;
  capturedAt: string; // ISO date
}
