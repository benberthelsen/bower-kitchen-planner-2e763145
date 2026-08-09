/**
 * buildBrief — assemble a full DesignBrief from wizard state.
 * Richer than briefFromWizard (which serves the legacy bridge): includes
 * household, priorities, appliances, and island preference from the
 * "How you cook" step.
 */

import type { Opening, RoomShape, ServicePoint } from '@/types';
import { toRoomSpec } from '@/lib/layout';
import {
  CATALOG_VERSION,
  ENGINE_VERSION,
  PRICING_VERSION,
  PROPOSAL_SCHEMA_VERSION,
} from '@/lib/layout';
import type { DesignBrief, KitchenSpec, Priority, StyleSpec, Wall, WallRunRanges } from '@/lib/layout';
import type { LayoutShape } from '@/lib/layout';

export interface WizardBriefFields {
  layoutPreference: LayoutShape;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  roomGeometryShape: RoomShape;
  roomCutoutWidth: number;
  roomCutoutDepth: number;
  layoutStyle: 'minimal' | 'standard' | 'full-storage';
  openings: Opening[];
  services: ServicePoint[];
  householdSize?: number;
  cooks?: 'rare' | 'daily' | 'entertainer';
  priorities: Priority[];
  oven?: '600' | '900';
  cooktop?: 'gas' | 'induction';
  dishwasher: boolean;
  sinkCabinetWidthMm?: number;
  fridgeWidthMm: number;
  fridgeOpeningWidthMm?: number;
  microwave?: 'built-in' | 'benchtop' | 'none';
  island: 'want' | 'no' | 'if-it-fits';
  /** Inspiration + client-chosen finishes (e.g. from a website flat-lay handoff).
   *  The AI designer treats this as a strong style preference. */
  styleWords?: string;
  /** Walls the customer wants cabinetry on (wizard wall picker). Empty/absent
   *  = auto. Fed to the engine as DesignBrief.allowedWalls. */
  cabinetWalls?: Wall[];
  /** Exact start/finish coverage for selected walls. */
  cabinetWallRanges?: WallRunRanges;
  /** Style-first: chosen at step 3, fed to generation as brief.styleIds. */
  finishId: string;
  benchtopId: string;
  handleId: string;
  styleFamilyId?: string;
  styleFamilyVersion?: number;
  styleVariantId?: string;
}

/** A chosen design in wizard state: the spec is the source of truth; items,
 *  price and warnings are derived on render via the engine. */
export interface WizardDesign {
  schemaVersion: typeof PROPOSAL_SCHEMA_VERSION;
  engineVersion: string;
  catalogVersion: string;
  pricingVersion: string;
  createdAt: string;
  name: string;
  spec: KitchenSpec;
  aiGenerated: boolean;
  /** True only after the customer saves cabinet-level edits. Engine upgrades
   *  must preserve these designs instead of silently regenerating them. */
  customerEdited?: boolean;
  proposalId?: string;
  /** Canonical price band from the server proposal — when present, this is
   *  the ONE band shown for this design (option card, 3D overlay, review,
   *  submission). Prevents the option-card and overlay showing different
   *  numbers for the same selection. Absent for the deterministic default
   *  layout, which falls back to the local estimator band. */
  priceBand?: { lowAud: number; highAud: number };
}

const AUTOMATIC_STARTER_NAMES = new Set(['Designer recommended', 'Standard layout']);

function isAutomaticStarter(input: Partial<WizardDesign> | null | undefined): boolean {
  if (!input || typeof input.name !== 'string' || !input.spec) return false;
  const manuallyEdited = input.customerEdited === true || input.name.endsWith(' (edited)');
  return !manuallyEdited
    && input.aiGenerated !== true
    && AUTOMATIC_STARTER_NAMES.has(input.name);
}

/**
 * Automatic starter layouts are safe to recreate when the layout engine
 * changes. Selected alternatives, AI proposals, shared designs and manual
 * cabinet edits remain the customer's design and are never silently replaced.
 */
export function shouldRefreshAutomaticStarter(
  input: Partial<WizardDesign> | null | undefined,
): boolean {
  return isAutomaticStarter(input)
    && input.engineVersion !== ENGINE_VERSION;
}

/**
 * A style-family change is a composition change, not a finish overlay. An
 * automatic starter can therefore be rebuilt safely when a short-link style
 * overrides the style stored in session state. Selected alternatives and
 * customer-edited designs remain untouched.
 */
export function shouldRegenerateAutomaticStarterForStyle(
  input: Partial<WizardDesign> | null | undefined,
  style: Pick<StyleSpec, 'familyId' | 'familyVersion' | 'variantId'>,
): boolean {
  if (!isAutomaticStarter(input) || !input?.spec) return false;
  const stored = input.spec.style;
  return stored.familyId !== style.familyId
    || stored.familyVersion !== style.familyVersion
    || stored.variantId !== style.variantId;
}

export function createWizardDesign(
  input: Omit<WizardDesign, 'schemaVersion' | 'engineVersion' | 'catalogVersion' | 'pricingVersion' | 'createdAt'>,
): WizardDesign {
  return {
    schemaVersion: PROPOSAL_SCHEMA_VERSION,
    engineVersion: ENGINE_VERSION,
    catalogVersion: CATALOG_VERSION,
    pricingVersion: PRICING_VERSION,
    createdAt: new Date().toISOString(),
    ...input,
  };
}

export function upgradeWizardDesign(input: Partial<WizardDesign> | null | undefined): WizardDesign | null {
  if (!input || typeof input.name !== 'string' || !input.spec) return null;
  if (shouldRefreshAutomaticStarter(input)) return null;
  return {
    ...createWizardDesign({
      name: input.name,
      spec: input.spec,
      aiGenerated: input.aiGenerated === true,
      ...(input.customerEdited === true ? { customerEdited: true } : {}),
      ...(input.proposalId ? { proposalId: input.proposalId } : {}),
      ...(input.priceBand ? { priceBand: input.priceBand } : {}),
    }),
    ...(typeof input.engineVersion === 'string' ? { engineVersion: input.engineVersion } : {}),
    ...(typeof input.catalogVersion === 'string' ? { catalogVersion: input.catalogVersion } : {}),
    ...(typeof input.pricingVersion === 'string' ? { pricingVersion: input.pricingVersion } : {}),
    ...(typeof input.createdAt === 'string' ? { createdAt: input.createdAt } : {}),
  };
}

export function buildBrief(f: WizardBriefFields): DesignBrief {
  const priorities: Priority[] = f.priorities.length > 0
    ? f.priorities
    : f.layoutStyle === 'full-storage' ? ['storage']
    : f.layoutStyle === 'minimal' ? ['bench-space']
    : [];

  return {
    room: toRoomSpec({
      width: f.roomWidth,
      depth: f.roomDepth,
      height: f.roomHeight,
      shape: f.roomGeometryShape,
      cutoutWidth: f.roomCutoutWidth,
      cutoutDepth: f.roomCutoutDepth,
      openings: f.openings,
      services: f.services,
    }),
    household: { size: f.householdSize, cooks: f.cooks },
    priorities,
    appliances: {
      oven: f.oven,
      cooktop: f.cooktop,
      dishwasher: f.dishwasher,
      ...(f.sinkCabinetWidthMm ? { sinkCabinetWidthMm: f.sinkCabinetWidthMm } : {}),
      fridgeWidthMm: f.fridgeWidthMm,
      ...(f.fridgeOpeningWidthMm ? { fridgeOpeningWidthMm: f.fridgeOpeningWidthMm } : {}),
      microwave: f.microwave,
    },
    island: f.island,
    ...(f.styleWords ? { styleWords: f.styleWords } : {}),
    styleIds: {
      finishId: f.finishId,
      benchtopId: f.benchtopId,
      handleId: f.handleId,
      ...(f.styleFamilyId ? { familyId: f.styleFamilyId } : {}),
      ...(f.styleFamilyVersion ? { familyVersion: f.styleFamilyVersion } : {}),
      ...(f.styleVariantId ? { variantId: f.styleVariantId } : {}),
    },
    ...(f.cabinetWalls && f.cabinetWalls.length > 0 ? { allowedWalls: f.cabinetWalls } : {}),
    ...(f.cabinetWallRanges && Object.keys(f.cabinetWallRanges).length > 0
      ? { wallRanges: f.cabinetWallRanges }
      : {}),
  };
}
