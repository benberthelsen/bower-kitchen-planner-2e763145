/**
 * R4: Homeowner Guided Wizard
 * Step-by-step flow: Room → Cooking → Style → Design → Review & Quote
 * Style comes BEFORE the AI design step (style dictates layout and cabinet
 * use, and options generate/price with the real finishes from the start).
 * The room step includes wall selection (which walls may hold cabinets) —
 * fed to the engine as DesignBrief.allowedWalls.
 * No login required — consumer-facing lead capture.
 * URL state: design params synced to query string for sharing / bookmarking.
 */

import React, { useState, Suspense, useCallback, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { captureHandoffToken, usePlannerHandoff, useTokenizedPlannerHandoff } from '@/hooks/usePlannerHandoff';
import { handoffToStyleWords } from '@/lib/handoffBrief';
import {
  confirmedRoomScanV1Schema,
  parseLegacyWebsitePlannerHandoff,
  parseRoomScan,
  type CoordinateFrameV1,
  type RoomScanV1,
} from '@/lib/roomScan/contract';
import {
  Check, ChevronRight, ChevronLeft, Loader2, Send, DoorOpen, Share2, ClipboardCheck, RotateCcw,
  GripVertical,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { trackEvent } from '@/lib/analytics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { UnifiedScene } from '@/components/3d/UnifiedScene';
import Scene3DErrorBoundary from '@/components/3d/Scene3DErrorBoundary';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  FINISH_OPTIONS,
  BENCHTOP_OPTIONS,
  HANDLE_OPTIONS,
  DEFAULT_GLOBAL_DIMENSIONS,
} from '@/constants';
import type { MaterialOption, Opening, RoomConfig, RoomShape, ServicePoint } from '@/types';
import { z } from 'zod';
import {
  briefFromWizard, compileSpec, defaultSpecFor, priceDesign,
  inferLayoutShapeFromWalls, kitchenSpecSchema, MIN_WALL_RUN_MM,
  openingSchema, servicePointSchema,
} from '@/lib/layout';
import type { Wall, WallRunRanges } from '@/lib/layout';
import { RoomFeaturesEditor } from '@/components/shared/RoomFeaturesEditor';
import StepCook from './steps/StepCook';
import StepAppliances from './steps/StepAppliances';
import StepDesign from './steps/StepDesign';
import { useApplianceCatalog } from '@/hooks/useApplianceCatalog';
import {
  APPLIANCE_CATEGORY_ORDER,
  APPLIANCE_CATEGORY_LABELS,
  buildApplianceLineItems,
  enrichItemsWithChosenAppliances,
  synthesiseApplianceOverlays,
  undrawnApplianceCategories,

  appliancesTotal as sumAppliances,
  anyPlaceholderPrices,
} from './applianceSelection';
import { buildBrief, createWizardDesign, upgradeWizardDesign, type WizardDesign } from './wizardBrief';
import { evaluateDesign } from '@/lib/designV2';
import { STYLE_PRESETS } from '@/data/stylePresets';
import { useWizardPricing } from '@/hooks/useWizardPricing';
import { featureFlags } from '@/lib/featureFlags';
import {
  previewStyleFamilies,
  styleProfile,
  type KitchenSpec,
  type Priority,
  type ProposedRoomPatch,
  type StyleSpec,
} from '@/lib/layout';

// ─── Types ─────────────────────────────────────────────────────────────────────

type LayoutPreference = 'single-wall' | 'l-shape' | 'u-shape' | 'galley';
type LayoutStyle  = 'minimal' | 'standard' | 'full-storage';

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6;
  /** Homeowner appliance catalog (Stage 3). Map of category → product id.
   *  A value of '__none__' means the customer will supply their own for that
   *  category. Absent keys mean "not yet chosen". Empty on legacy states. */
  chosenAppliances: Record<string, string>;
  layoutPreference: LayoutPreference;
  roomWidth:   number;   // mm
  roomDepth:   number;   // mm
  roomHeight:  number;   // mm
  roomGeometryShape: RoomShape;
  roomCutoutWidth: number;
  roomCutoutDepth: number;
  layoutStyle: LayoutStyle;
  finishId:    string;
  benchtopId:  string;
  handleId:    string;
  styleFamilyId: string;
  styleFamilyVersion: number;
  styleVariantId: string;
  openings:    Opening[];
  services:    ServicePoint[];
  /** Walls the customer wants cabinetry on. Empty = auto (engine decides). */
  cabinetWalls: Wall[];
  /** Optional partial coverage along selected walls. */
  cabinetWallRanges: WallRunRanges;
  // "How you cook" (step 2)
  householdSize?: number;
  cooks?:       'rare' | 'daily' | 'entertainer';
  priorities:   Priority[];
  oven?:        '600' | '900';
  cooktop?:     'gas' | 'induction';
  dishwasher:   boolean;
  /** Exact manufactured sink cabinet derived from the selected catalog sink. */
  sinkCabinetWidthMm?: number;
  fridgeWidthMm: number;
  /** Exact selected-model cavity; absent uses the generic planning allowance. */
  fridgeOpeningWidthMm?: number;
  island:       'want' | 'no' | 'if-it-fits';
  // Inspiration + client-chosen finishes from a website flat-lay handoff — the
  // AI designer honours these as a strong style preference.
  styleWords?:  string;
  // chosen design (step 3) — spec is source of truth; items derived
  design:      WizardDesign | null;
  doorsOpen:   boolean;
  contactName:  string;
  contactEmail: string;
  contactPhone: string;
  // Scanner handoff context (master plan §5.3/§6.3): the tokenized capability
  // for atomic submission, the incoming (unconfirmed) scan pre-filling the
  // editor, and an edit counter that bumps roomRevision on any geometry change.
  handoffContext?: { handoffId: string; token?: string };
  incomingScan?: RoomScanV1;
  geometryEdits: number;
  pendingRoomPatch?: ProposedRoomPatch;
}

/** Manual wizard entry is already in canonical mm plan coordinates. */
const IDENTITY_FRAME: CoordinateFrameV1 = {
  assignment: 'source-orientation',
  sourcePlanAxes: 'x-z',
  sourceUnits: 'millimetres',
  sourceToCanonicalMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  snappedQuarterTurnDegrees: 0,
  originDescription: 'north-west-corner-in-canonical-plan',
};

/**
 * The room contract is `.strict()` with integer millimetres. Feature editors
 * can leave explicitly-undefined keys behind (e.g. switching a service point
 * from floor back to wall clears `xMm`/`zMm`) and fractional values from typed
 * input, so normalise before validating: drop undefined keys and round mm.
 */
const cleanFeature = <T extends Record<string, unknown>>(feature: T): T => {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(feature)) {
    if (value === undefined) continue;
    out[key] = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : value;
  }
  return out as T;
};



const DEFAULTS: Pick<WizardState, 'layoutPreference' | 'roomWidth' | 'roomDepth' | 'roomHeight' | 'roomGeometryShape' | 'roomCutoutWidth' | 'roomCutoutDepth' | 'layoutStyle' | 'finishId' | 'benchtopId' | 'handleId' | 'styleFamilyId' | 'styleFamilyVersion' | 'styleVariantId'> = {
  layoutPreference: 'single-wall',
  roomWidth:   3600,
  roomDepth:   3000,
  roomHeight:  2700,
  roomGeometryShape: 'Rectangle',
  roomCutoutWidth: 0,
  roomCutoutDepth: 0,
  layoutStyle: 'standard',
  finishId:    'do-classic-white',
  benchtopId:  'egger-premium-white',
  handleId:    'handle-bar-ss',
  styleFamilyId: 'classic-white',
  styleFamilyVersion: 1,
  styleVariantId: 'balanced',
};

function styleSpecFromState(state: Pick<WizardState,
  'finishId' | 'benchtopId' | 'handleId' | 'styleFamilyId' | 'styleFamilyVersion' | 'styleVariantId'>): StyleSpec {
  const profile = styleProfile(state.styleFamilyId);
  return {
    finishId: state.finishId,
    benchtopId: state.benchtopId,
    handleId: state.handleId,
    familyId: profile?.id ?? state.styleFamilyId,
    familyVersion: profile?.version ?? state.styleFamilyVersion,
    variantId: state.styleVariantId,
  };
}

// ─── URL serialisation helpers ──────────────────────────────────────────────────

const SHAPE_CODES: Record<LayoutPreference, string> = {
  'single-wall': 'sw', 'l-shape': 'l', 'u-shape': 'u', 'galley': 'g',
};
const CODE_SHAPES: Record<string, LayoutPreference> = Object.fromEntries(
  Object.entries(SHAPE_CODES).map(([k, v]) => [v, k as LayoutPreference]),
);
const LAYOUT_CODES: Record<LayoutStyle, string> = {
  minimal: 'min', standard: 'std', 'full-storage': 'full',
};
const CODE_LAYOUTS: Record<string, LayoutStyle> = Object.fromEntries(
  Object.entries(LAYOUT_CODES).map(([k, v]) => [v, k as LayoutStyle]),
);

function stateToParams(s: WizardState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.layoutPreference !== DEFAULTS.layoutPreference) p.set('s', SHAPE_CODES[s.layoutPreference]);
  if (s.roomWidth   !== DEFAULTS.roomWidth)   p.set('w',  String(s.roomWidth));
  if (s.roomDepth   !== DEFAULTS.roomDepth)   p.set('d',  String(s.roomDepth));
  if (s.roomHeight  !== DEFAULTS.roomHeight)  p.set('rh', String(s.roomHeight));
  if (s.layoutStyle !== DEFAULTS.layoutStyle) p.set('ls', LAYOUT_CODES[s.layoutStyle]);
  if (s.finishId    !== DEFAULTS.finishId)    p.set('f',  s.finishId);
  if (s.benchtopId  !== DEFAULTS.benchtopId)  p.set('b',  s.benchtopId);
  if (s.handleId    !== DEFAULTS.handleId)    p.set('h',  s.handleId);
  if (s.styleFamilyId !== DEFAULTS.styleFamilyId) p.set('sf', s.styleFamilyId);
  if (s.styleVariantId !== DEFAULTS.styleVariantId) p.set('sv', s.styleVariantId);
  if (s.cabinetWalls.length > 0)              p.set('cw', s.cabinetWalls.join(''));
  const rangeParam = s.cabinetWalls
    .flatMap(wall => {
      const range = s.cabinetWallRanges[wall];
      return range ? [`${wall}:${Math.round(range.startMm)}-${Math.round(range.endMm)}`] : [];
    })
    .join(',');
  if (rangeParam) p.set('wr', rangeParam);
  return p;
}

// ─── Session persistence ────────────────────────────────────────────────────────
// Mobile browsers aggressively reload background tabs; without this a tester
// who scans a room, switches apps, and comes back loses everything (pre-live
// audit item 4). Tab-scoped (sessionStorage), 24 h freshness cap, cleared on
// successful submission. URL params still win over restored state.

// v5 merges Style + Design. The v4 key is read once and migrated so existing
// customer work and shared designs are not lost.
export const WIZARD_STATE_KEY = 'bower.wizard.state.v5';
export const WIZARD_STATE_V4_KEY = 'bower.wizard.state.v4';
const WIZARD_STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function loadSavedWizardState(): Partial<WizardState> {
  try {
    const raw = sessionStorage.getItem(WIZARD_STATE_KEY) ?? sessionStorage.getItem(WIZARD_STATE_V4_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { v?: number; savedAt?: number; state?: WizardState };
    if ((parsed?.v !== 4 && parsed?.v !== 5) || typeof parsed.savedAt !== 'number'
      || Date.now() - parsed.savedAt > WIZARD_STATE_MAX_AGE_MS
      || typeof parsed.state !== 'object' || parsed.state === null
      || typeof parsed.state.step !== 'number') {
      sessionStorage.removeItem(WIZARD_STATE_KEY);
      sessionStorage.removeItem(WIZARD_STATE_V4_KEY);
      return {};
    }
    const source = parsed.state;
    const migratedStep = parsed.v === 4 && featureFlags.designStudio
      ? (source.step >= 6 ? 5 : source.step >= 4 ? 4 : source.step)
      : parsed.v === 5 && !featureFlags.designStudio
        ? (source.step >= 5 ? 6 : source.step)
        : source.step;
    const inferredFamily = STYLE_PRESETS.find(preset =>
      preset.style.finishId === source.finishId
      && preset.style.benchtopId === source.benchtopId
      && preset.style.handleId === source.handleId)?.id;
    const migratedFamilyId = inferredFamily === 'scandi' ? 'scandinavian' : inferredFamily;
    const family = styleProfile(source.styleFamilyId ?? migratedFamilyId ?? DEFAULTS.styleFamilyId);
    return {
      ...source,
      step: migratedStep,
      styleFamilyId: family?.id ?? DEFAULTS.styleFamilyId,
      styleFamilyVersion: family?.version ?? DEFAULTS.styleFamilyVersion,
      styleVariantId: source.styleVariantId ?? DEFAULTS.styleVariantId,
      design: upgradeWizardDesign(source.design),
    };
  } catch {
    return {};
  }
}

export function saveWizardState(state: WizardState): void {
  try {
    sessionStorage.setItem(WIZARD_STATE_KEY, JSON.stringify({ v: 5, savedAt: Date.now(), state }));
  } catch { /* storage full or unavailable — persistence is best-effort */ }
}

export function clearSavedWizardState(): void {
  try {
    sessionStorage.removeItem(WIZARD_STATE_KEY);
    sessionStorage.removeItem(WIZARD_STATE_V4_KEY);
  } catch { /* ignore */ }
}

/** Parse a numeric query param, ignoring anything non-finite so a stray or
 *  corrupt value can never hydrate a dimension as NaN. (The rich-share payload
 *  now lives under `sd`, never `d` — but this guard is the belt to that
 *  braces: `d` is only ever a depth number now, and any junk is dropped.) */
function numParam(p: URLSearchParams, key: string, min: number, max: number): number | undefined {
  if (!p.has(key)) return undefined;
  const n = Number(p.get(key));
  if (!Number.isFinite(n)) return undefined;
  return Math.max(min, Math.min(max, n));
}

function paramsToState(p: URLSearchParams): Partial<WizardState> {
  const out: Partial<WizardState> = {};
  if (p.has('s'))  out.layoutPreference = CODE_SHAPES[p.get('s')!] ?? DEFAULTS.layoutPreference;
  const w = numParam(p, 'w', 1200, 8000);   if (w  !== undefined) out.roomWidth  = w;
  const d = numParam(p, 'd', 1200, 6000);   if (d  !== undefined) out.roomDepth  = d;
  const rh = numParam(p, 'rh', 2100, 4000); if (rh !== undefined) out.roomHeight = rh;
  if (p.has('ls')) out.layoutStyle = CODE_LAYOUTS[p.get('ls')!] ?? DEFAULTS.layoutStyle;
  if (p.has('f'))  out.finishId    = p.get('f')!;
  if (p.has('b'))  out.benchtopId  = p.get('b')!;
  if (p.has('h'))  out.handleId    = p.get('h')!;
  if (p.has('sf')) {
    const family = styleProfile(p.get('sf') ?? undefined);
    if (family) {
      out.styleFamilyId = family.id;
      out.styleFamilyVersion = family.version;
    }
  }
  if (p.has('sv') && ['balanced', 'lighter', 'storage'].includes(p.get('sv')!)) {
    out.styleVariantId = p.get('sv')!;
  }
  if (p.has('cw')) {
    const walls = p.get('cw')!.split('').filter((c): c is Wall => ['N', 'E', 'S', 'W'].includes(c));
    out.cabinetWalls = [...new Set(walls)];
  }
  if (p.has('wr')) {
    const ranges: WallRunRanges = {};
    for (const token of p.get('wr')!.split(',')) {
      const match = /^([NESW]):(\d+)-(\d+)$/.exec(token);
      if (!match) continue;
      const wall = match[1] as Wall;
      const startMm = Number(match[2]);
      const endMm = Number(match[3]);
      if (Number.isFinite(startMm) && Number.isFinite(endMm) && endMm > startMm) {
        ranges[wall] = { startMm, endMm };
      }
    }
    if (Object.keys(ranges).length) out.cabinetWallRanges = ranges;
  }
  return out;
}

// ─── Rich share payload ─────────────────────────────────────────────────────────
// The short params above carry dimensions and style only. A shared link used
// to lose everything else — the chosen design, doors/windows/services, the
// room cutout, the cooking answers — so the recipient saw a default kitchen
// in an empty rectangle. The `sd` param fixes that: deflate-compressed
// base64url JSON of the full design context, decoded defensively (zod) on
// load. It uses its OWN key `sd` — NOT `d`, which already carries room depth;
// sharing both under `d` corrupted the recipient's depth to NaN. The payload
// is self-contained (it carries width/depth/height too), so it restores fully
// even if the short params are absent. Older browsers without CompressionStream
// simply share the short link.

interface SharePayloadV1 {
  v: 1;
  room?: { widthMm: number; depthMm: number; heightMm: number; shape: RoomShape; cutoutWidth: number; cutoutDepth: number };
  openings?: Opening[];
  services?: ServicePoint[];
  cabinetWalls?: Wall[];
  cabinetWallRanges?: WallRunRanges;
  cook?: {
    householdSize?: number;
    cooks?: WizardState['cooks'];
    priorities: Priority[];
    oven?: '600' | '900';
    cooktop?: 'gas' | 'induction';
    dishwasher: boolean;
    sinkCabinetWidthMm?: number;
    fridgeWidthMm: number;
    fridgeOpeningWidthMm?: number;
    island: WizardState['island'];
  };
  styleWords?: string;
  /** Homeowner appliance catalog picks (Stage 3). */
  chosenAppliances?: Record<string, string>;
  /** Finish/benchtop/handle so a shared design renders and re-prices with the
   *  sender's style, not the recipient's defaults. */
  style?: StyleSpec;
  /** proposalId is deliberately NOT shared — the recipient regenerates before
   *  chat-refining; the spec itself is the portable source of truth. The
   *  priceBand IS shared so the recipient sees the sender's canonical band
   *  for this design (rather than a locally recomputed number). */
  design?: { name: string; spec: KitchenSpec; aiGenerated: boolean; priceBand?: { lowAud: number; highAud: number } } | null;
}

const MAX_SHARE_ENCODED_CHARS = 6000;
const MAX_SHARE_DECODED_BYTES = 64 * 1024;

function bytesToB64u(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uToBytes(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function pipeBytes(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  maxOutputBytes: number,
): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value as Uint8Array;
    total += chunk.byteLength;
    if (total > maxOutputBytes) {
      await reader.cancel('share payload exceeds limit');
      throw new Error('share payload exceeds limit');
    }
    chunks.push(chunk);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export async function encodeSharePayload(state: WizardState): Promise<string | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const payload: SharePayloadV1 = {
      v: 1,
      room: {
        widthMm: state.roomWidth,
        depthMm: state.roomDepth,
        heightMm: state.roomHeight,
        shape: state.roomGeometryShape,
        cutoutWidth: state.roomCutoutWidth,
        cutoutDepth: state.roomCutoutDepth,
      },
      ...(state.openings.length ? { openings: state.openings } : {}),
      ...(state.services.length ? { services: state.services } : {}),
      ...(state.cabinetWalls.length ? { cabinetWalls: state.cabinetWalls } : {}),
      ...(Object.keys(state.cabinetWallRanges).length
        ? { cabinetWallRanges: state.cabinetWallRanges }
        : {}),
      cook: {
        householdSize: state.householdSize,
        cooks: state.cooks,
        priorities: state.priorities,
        oven: state.oven,
        cooktop: state.cooktop,
        dishwasher: state.dishwasher,
        ...(state.sinkCabinetWidthMm
          ? { sinkCabinetWidthMm: state.sinkCabinetWidthMm }
          : {}),
        fridgeWidthMm: state.fridgeWidthMm,
        ...(state.fridgeOpeningWidthMm
          ? { fridgeOpeningWidthMm: state.fridgeOpeningWidthMm }
          : {}),
        island: state.island,
      },
      ...(state.styleWords ? { styleWords: state.styleWords } : {}),
      ...(Object.keys(state.chosenAppliances ?? {}).length
        ? { chosenAppliances: state.chosenAppliances }
        : {}),
      style: styleSpecFromState(state),
      ...(state.design
        ? { design: {
              name: state.design.name,
              spec: state.design.spec,
              aiGenerated: state.design.aiGenerated,
              ...(state.design.priceBand ? { priceBand: state.design.priceBand } : {}),
            } }
        : {}),
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    if (bytes.byteLength > MAX_SHARE_DECODED_BYTES) return null;
    const packed = await pipeBytes(bytes, new CompressionStream('deflate-raw'), MAX_SHARE_ENCODED_CHARS);
    const encoded = bytesToB64u(packed);
    // Keep total URLs comfortably under browser/proxy limits.
    return encoded.length <= MAX_SHARE_ENCODED_CHARS ? encoded : null;
  } catch {
    return null;
  }
}

export async function decodeSharePayload(encoded: string): Promise<Partial<WizardState> | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  if (!encoded || encoded.length > MAX_SHARE_ENCODED_CHARS || !/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const json = new TextDecoder().decode(
      await pipeBytes(
        b64uToBytes(encoded),
        new DecompressionStream('deflate-raw'),
        MAX_SHARE_DECODED_BYTES,
      ),
    );
    const raw = JSON.parse(json) as SharePayloadV1;
    if (raw?.v !== 1) return null;
    const patch: Partial<WizardState> = {};

    if (raw.room && (raw.room.shape === 'Rectangle' || raw.room.shape === 'LShape')) {
      const dim = (v: unknown, min: number, max: number): number | undefined => {
        const n = Number(v);
        return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : undefined;
      };
      const w = dim(raw.room.widthMm, 1200, 8000);
      const d = dim(raw.room.depthMm, 1200, 6000);
      const h = dim(raw.room.heightMm, 2100, 4000);
      if (w !== undefined) patch.roomWidth = w;
      if (d !== undefined) patch.roomDepth = d;
      if (h !== undefined) patch.roomHeight = h;
      patch.roomGeometryShape = raw.room.shape;
      patch.roomCutoutWidth = raw.room.shape === 'Rectangle' ? 0
        : Math.max(0, Math.min(12000, Number(raw.room.cutoutWidth) || 0));
      patch.roomCutoutDepth = raw.room.shape === 'Rectangle' ? 0
        : Math.max(0, Math.min(12000, Number(raw.room.cutoutDepth) || 0));
    }
    const openings = z.array(openingSchema).max(12).safeParse(raw.openings ?? []);
    if (openings.success && openings.data.length) patch.openings = openings.data as unknown as Opening[];
    const services = z.array(servicePointSchema).max(12).safeParse(raw.services ?? []);
    if (services.success && services.data.length) patch.services = services.data as unknown as ServicePoint[];
    if (Array.isArray(raw.cabinetWalls)) {
      patch.cabinetWalls = [...new Set(raw.cabinetWalls.filter((w): w is Wall => ['N', 'E', 'S', 'W'].includes(w)))];
    }
    if (raw.cabinetWallRanges && typeof raw.cabinetWallRanges === 'object') {
      const ranges: WallRunRanges = {};
      for (const wall of ['N', 'E', 'S', 'W'] as Wall[]) {
        const candidate = raw.cabinetWallRanges[wall];
        if (!candidate || typeof candidate !== 'object') continue;
        const startMm = Number(candidate.startMm);
        const endMm = Number(candidate.endMm);
        if (Number.isFinite(startMm) && Number.isFinite(endMm)
          && startMm >= 0 && endMm <= 12000 && endMm > startMm) {
          ranges[wall] = { startMm, endMm };
        }
      }
      if (Object.keys(ranges).length) patch.cabinetWallRanges = ranges;
    }
    if (raw.cook && typeof raw.cook === 'object') {
      const c = raw.cook;
      if (typeof c.householdSize === 'number') patch.householdSize = Math.max(1, Math.min(12, Math.round(c.householdSize)));
      if (c.cooks === 'rare' || c.cooks === 'daily' || c.cooks === 'entertainer') patch.cooks = c.cooks;
      if (Array.isArray(c.priorities)) {
        patch.priorities = c.priorities.filter((p): p is Priority =>
          ['storage', 'drawers', 'bench-space', 'entertaining', 'baking', 'budget'].includes(p));
      }
      if (c.oven === '600' || c.oven === '900') patch.oven = c.oven;
      if (c.cooktop === 'gas' || c.cooktop === 'induction') patch.cooktop = c.cooktop;
      if (typeof c.dishwasher === 'boolean') patch.dishwasher = c.dishwasher;
      if (typeof c.sinkCabinetWidthMm === 'number') {
        patch.sinkCabinetWidthMm = Math.max(600, Math.min(1400, Math.round(c.sinkCabinetWidthMm)));
      }
      if (typeof c.fridgeWidthMm === 'number') patch.fridgeWidthMm = Math.max(500, Math.min(1400, c.fridgeWidthMm));
      if (typeof c.fridgeOpeningWidthMm === 'number') {
        patch.fridgeOpeningWidthMm = Math.max(500, Math.min(1800, c.fridgeOpeningWidthMm));
      }
      if (c.island === 'want' || c.island === 'no' || c.island === 'if-it-fits') patch.island = c.island;
    }
    if (typeof raw.styleWords === 'string' && raw.styleWords.trim()) {
      patch.styleWords = raw.styleWords.slice(0, 500);
    }
    // chosenAppliances: keep only known category keys + string values.
    if (raw.chosenAppliances && typeof raw.chosenAppliances === 'object') {
      const cleaned: Record<string, string> = {};
      for (const cat of APPLIANCE_CATEGORY_ORDER) {
        const v = (raw.chosenAppliances as Record<string, unknown>)[cat];
        if (typeof v === 'string' && v.length > 0 && v.length < 128) cleaned[cat] = v;
      }
      if (Object.keys(cleaned).length) patch.chosenAppliances = cleaned;
    }
    // Style ids: validated against the catalog — unknown ids drop to defaults
    // so a stale/renamed id can't crash rendering or silently show nothing.
    if (raw.style && typeof raw.style === 'object') {
      const s = raw.style;
      if (typeof s.finishId === 'string' && FINISH_OPTIONS.some(f => f.id === s.finishId)) {
        patch.finishId = s.finishId;
      }
      if (typeof s.benchtopId === 'string' && BENCHTOP_OPTIONS.some(b => b.id === s.benchtopId)) {
        patch.benchtopId = s.benchtopId;
      }
      if (typeof s.handleId === 'string' && HANDLE_OPTIONS.some(h => h.id === s.handleId)) {
        patch.handleId = s.handleId;
      }
      if (typeof s.familyId === 'string') {
        const family = styleProfile(s.familyId);
        if (family) {
          patch.styleFamilyId = family.id;
          patch.styleFamilyVersion = family.version;
        }
      }
      if (typeof s.variantId === 'string' && ['balanced', 'lighter', 'storage'].includes(s.variantId)) {
        patch.styleVariantId = s.variantId;
      }
    }
    if (raw.design && typeof raw.design === 'object') {
      const spec = kitchenSpecSchema.safeParse(raw.design.spec);
      if (spec.success) {
        // priceBand: require finite positive lo/hi with lo <= hi; else drop
        // the band so the recipient falls back to the local estimator rather
        // than seeing bogus numbers.
        let priceBand: { lowAud: number; highAud: number } | undefined;
        const pb = raw.design.priceBand;
        if (pb && typeof pb === 'object') {
          const lo = Number((pb as { lowAud?: unknown }).lowAud);
          const hi = Number((pb as { highAud?: unknown }).highAud);
          if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi > 0 && lo <= hi) {
            priceBand = { lowAud: lo, highAud: hi };
          }
        }
        patch.design = createWizardDesign({
          name: String(raw.design.name ?? 'Shared design').slice(0, 120) || 'Shared design',
          spec: spec.data as unknown as KitchenSpec,
          aiGenerated: raw.design.aiGenerated === true,
          ...(priceBand ? { priceBand } : {}),
        });
      }
    }
    return patch;
  } catch {
    return null;
  }
}

// ─── Layout engine bridge ───────────────────────────────────────────────────────
// Real deterministic layout engine (src/lib/layout): role-based cabinet runs,
// services/openings aware, validated geometry. Same signatures as the old
// hard-coded preview so the rest of the wizard is unchanged.

function estimatePrice(
  state: Pick<WizardState,
    | 'layoutPreference'
    | 'roomWidth'
    | 'roomDepth'
    | 'roomHeight'
    | 'roomGeometryShape'
    | 'roomCutoutWidth'
    | 'roomCutoutDepth'
    | 'layoutStyle'
    | 'openings'
    | 'services'
    | 'cabinetWalls'
    | 'cabinetWallRanges'
  >,
) {
  const brief = briefFromWizard({
    layoutPreference: state.layoutPreference,
    roomWidth: state.roomWidth,
    roomDepth: state.roomDepth,
    layoutStyle: state.layoutStyle,
    cabinetWalls: state.cabinetWalls,
    cabinetWallRanges: state.cabinetWallRanges,
  }, {
    height: state.roomHeight,
    shape: state.roomGeometryShape,
    cutoutWidth: state.roomCutoutWidth,
    cutoutDepth: state.roomCutoutDepth,
    openings: state.openings,
    services: state.services,
  });
  const spec = defaultSpecFor(brief, state.layoutPreference);
  const design = compileSpec(spec, brief.room);
  const band = priceDesign(design.items, spec.style);
  const lm = design.items
    .filter(i => i.y === 0 && i.height <= 800)
    .reduce((sum, i) => sum + i.width, 0) / 1000;
  return { low: band.lowAud, high: band.highAud, linearMetres: Math.round(lm * 10) / 10 };
}

/** Buildability notes (validator warnings) for the current design — e.g.
 *  "sink far from plumbing: re-plumbing required". Errors are engine bugs and
 *  are logged rather than shown. */
// ─── Step indicator ─────────────────────────────────────────────────────────────

const SPLIT_STEPS = ['Room', 'Cooking', 'Appliances', 'Style', 'Design', 'Review'];
const STUDIO_STEPS = ['Room', 'Cooking', 'Appliances', 'Design Studio', 'Review'];

// ─── Wall selection ─────────────────────────────────────────────────────────────
// Which walls each layout strategy needs: every inner group must have at least
// one allowed wall. Mirrors strategyPlausible() in the layout engine.
const WALL_LABELS: Record<Wall, string> = {
  N: 'Back wall',
  E: 'Right wall',
  S: 'Front wall',
  W: 'Left wall',
};

function wallLengthForRoom(wall: Wall, widthMm: number, depthMm: number): number {
  return wall === 'N' || wall === 'S' ? widthMm : depthMm;
}

function layoutLabel(shape: LayoutPreference): string {
  return ({
    'single-wall': 'Single Wall',
    'l-shape': 'L-Shape',
    'u-shape': 'U-Shape',
    galley: 'Galley',
  } as const)[shape];
}

function shapeCompatibleWithWalls(shape: LayoutPreference, walls: Wall[]): boolean {
  if (walls.length === 0) return true; // auto — engine decides
  return inferLayoutShapeFromWalls(walls) === shape;
}

/** Tappable floor-plan with precise start/finish limits for selected walls. */
function WallPicker({
  value,
  ranges,
  widthMm,
  depthMm,
  onChange,
}: {
  value: Wall[];
  ranges: WallRunRanges;
  widthMm: number;
  depthMm: number;
  onChange: (walls: Wall[], ranges: WallRunRanges) => void;
}) {
  const toggle = (w: Wall) => {
    if (value.includes(w)) {
      const nextRanges = { ...ranges };
      delete nextRanges[w];
      onChange(value.filter(x => x !== w), nextRanges);
      return;
    }
    if (value.length >= 3) {
      toast.info('Choose up to three cabinet walls. Four-wall layouts need a designer review.');
      return;
    }
    onChange([...value, w], ranges);
  };
  const updateClearance = (wall: Wall, side: 'left' | 'right', rawValue: number) => {
    const length = wallLengthForRoom(wall, widthMm, depthMm);
    const current = ranges[wall] ?? { startMm: 0, endMm: length };
    const currentLeft = Math.max(0, Math.min(length, current.startMm));
    const currentRight = Math.max(0, Math.min(length, length - current.endMm));
    const valueMm = Math.max(0, Math.round(Number.isFinite(rawValue) ? rawValue : 0));
    const nextLeft = side === 'left'
      ? Math.min(valueMm, Math.max(0, length - currentRight - MIN_WALL_RUN_MM))
      : currentLeft;
    const nextRight = side === 'right'
      ? Math.min(valueMm, Math.max(0, length - currentLeft - MIN_WALL_RUN_MM))
      : currentRight;
    const nextRanges = { ...ranges };
    if (nextLeft === 0 && nextRight === 0) {
      delete nextRanges[wall];
    } else {
      nextRanges[wall] = { startMm: nextLeft, endMm: length - nextRight };
    }
    onChange(value, nextRanges);
  };
  const updateRange = (wall: Wall, rawStartMm: number, rawEndMm: number) => {
    const length = wallLengthForRoom(wall, widthMm, depthMm);
    const startMm = Math.max(
      0,
      Math.min(length - MIN_WALL_RUN_MM, Math.round(rawStartMm)),
    );
    const endMm = Math.max(
      startMm + MIN_WALL_RUN_MM,
      Math.min(length, Math.round(rawEndMm)),
    );
    const nextRanges = { ...ranges };
    if (startMm === 0 && endMm === length) {
      delete nextRanges[wall];
    } else {
      nextRanges[wall] = { startMm, endMm };
    }
    onChange(value, nextRanges);
  };
  const wallBtn = (w: Wall, label: string, cls: string) => {
    const on = value.includes(w);
    return (
      <button
        type="button"
        onClick={() => toggle(w)}
        aria-pressed={on}
        className={cn(
          'absolute flex items-center justify-center text-[11px] font-medium rounded-md border-2 transition-all',
          cls,
          on
            ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400',
        )}
      >
        {label}
      </button>
    );
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative w-48 h-40 flex-shrink-0">
        <div className="absolute inset-6 rounded-lg bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center">
          <span className="text-[10px] text-slate-400">your room</span>
        </div>
        {wallBtn('N', 'Back wall',  'top-0 left-8 right-8 h-7')}
        {wallBtn('S', 'Front wall', 'bottom-0 left-8 right-8 h-7')}
        {wallBtn('W', 'Left',       'left-0 top-9 bottom-9 w-7 [writing-mode:vertical-rl] rotate-180')}
        {wallBtn('E', 'Right',      'right-0 top-9 bottom-9 w-7 [writing-mode:vertical-rl]')}
      </div>
      <div className="text-xs text-slate-500 space-y-1.5">
        {value.length === 0 ? (
          <p><span className="font-medium text-slate-700">Auto:</span> the designer picks the walls using your layout preference.</p>
        ) : (
          <p>
            Cabinets on: <span className="font-medium text-slate-700">
              {value.map(wall => WALL_LABELS[wall].toLowerCase()).join(', ')}
            </span>.
          </p>
        )}
        <p className="text-slate-400">Choose the exact walls. Your layout type follows these choices instead of replacing them.</p>
        {value.length > 0 && (
          <button type="button" className="text-slate-500 underline underline-offset-2" onClick={() => onChange([], {})}>
            Let the designer choose walls
          </button>
        )}
      </div>
      </div>

      {value.length > 0 && (
        <div className="grid gap-3">
          {value.map(wall => {
            const length = wallLengthForRoom(wall, widthMm, depthMm);
            const range = ranges[wall] ?? { startMm: 0, endMm: length };
            const leftClearance = Math.max(0, Math.min(length, range.startMm));
            const rightClearance = Math.max(0, Math.min(length, length - range.endMm));
            const endMm = length - rightClearance;
            const instructionId = `wall-${wall}-range-instructions`;
            return (
              <div key={wall} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800">{WALL_LABELS[wall]}</p>
                  <p className="text-xs text-slate-500">
                    {Math.round(length - leftClearance - rightClearance)} mm of {length} mm
                  </p>
                </div>
                <SliderPrimitive.Root
                  className="relative mx-4 mt-1 flex h-12 w-[calc(100%-2rem)] touch-none select-none items-center"
                  value={[leftClearance, endMm]}
                  min={0}
                  max={length}
                  step={50}
                  minStepsBetweenThumbs={Math.ceil(MIN_WALL_RUN_MM / 50)}
                  onValueChange={([start, end]) => updateRange(wall, start, end)}
                  aria-describedby={instructionId}
                  data-wall-run-slider={wall}
                >
                  <SliderPrimitive.Track className="relative h-3 w-full grow overflow-hidden rounded-full bg-slate-200">
                    <SliderPrimitive.Range className="absolute h-full rounded-full bg-emerald-500" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb
                    aria-label={`${WALL_LABELS[wall]} cabinet run start`}
                    aria-valuetext={`${Math.round(leftClearance)} millimetres clear at left`}
                    className="group relative block h-px w-px rounded-full focus-visible:outline-none"
                  >
                    <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-emerald-600 bg-white text-emerald-700 shadow-md transition-transform group-active:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-emerald-600 group-focus-visible:ring-offset-2">
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </span>
                  </SliderPrimitive.Thumb>
                  <SliderPrimitive.Thumb
                    aria-label={`${WALL_LABELS[wall]} cabinet run finish`}
                    aria-valuetext={`${Math.round(rightClearance)} millimetres clear at right`}
                    className="group relative block h-px w-px rounded-full focus-visible:outline-none"
                  >
                    <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-emerald-600 bg-white text-emerald-700 shadow-md transition-transform group-active:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-emerald-600 group-focus-visible:ring-offset-2">
                        <GripVertical className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </span>
                  </SliderPrimitive.Thumb>
                </SliderPrimitive.Root>
                <p id={instructionId} className="text-[11px] text-slate-500">
                  Drag either handle to set where cabinets start and finish. Use the fields for exact measurements.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor={`wall-${wall}-left`} className="text-xs">Clear at left (mm)</Label>
                    <Input
                      id={`wall-${wall}-left`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={Math.max(0, length - rightClearance - MIN_WALL_RUN_MM)}
                      step={50}
                      value={Math.round(leftClearance)}
                      onChange={event => updateClearance(wall, 'left', Number(event.target.value))}
                      className="mt-1 h-9 bg-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`wall-${wall}-right`} className="text-xs">Clear at right (mm)</Label>
                    <Input
                      id={`wall-${wall}-right`}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={Math.max(0, length - leftClearance - MIN_WALL_RUN_MM)}
                      step={50}
                      value={Math.round(rightClearance)}
                      onChange={event => updateClearance(wall, 'right', Number(event.target.value))}
                      className="mt-1 h-9 bg-white"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StepIndicator({ current, steps }: { current: number; steps: string[] }) {
  return (
    <div className="flex items-center justify-center mb-8 overflow-x-auto pb-1">
      {steps.map((label, i) => {
        const n = i + 1;
        const done   = n < current;
        const active = n === current;
        return (
          <React.Fragment key={n}>
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors',
                done   && 'bg-emerald-500 text-white',
                active && 'bg-slate-900 text-white',
                !done && !active && 'bg-slate-100 text-slate-400',
              )}>
                {done ? <Check className="w-4 h-4" /> : n}
              </div>
              <span className={cn(
                'text-xs whitespace-nowrap',
                active ? 'text-slate-900 font-medium' : 'text-slate-400',
              )}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn(
                'h-px w-3 sm:w-12 mb-5 mx-0.5 sm:mx-1 flex-shrink-0 transition-colors',
                done ? 'bg-emerald-400' : 'bg-slate-200',
              )} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Share button ───────────────────────────────────────────────────────────────

function ShareButton({ state }: { state: WizardState }) {
  const [copied, setCopied] = useState(false);
  const [, setSearchParams] = useSearchParams();

  const handleShare = async () => {
    const params = stateToParams(state);
    // The copied link and address-bar fallback carry the same full context
    // (openings, services, cooking answers, chosen design spec) so the
    // recipient sees the actual kitchen, not a default in an empty room.
    const rich = await encodeSharePayload(state);
    const shareParams = new URLSearchParams(params);
    if (rich) shareParams.set('sd', rich); // own key — never 'd' (room depth)
    setSearchParams(shareParams, { replace: true });

    const url = `${window.location.origin}/wizard${shareParams.toString() ? '?' + shareParams.toString() : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(rich ? 'Design link copied — it carries your full design' : 'Link copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy automatically — the full design link is now in your browser address bar');
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleShare}
      className="gap-1.5"
      aria-label={copied ? 'Design link copied' : 'Share design'}
    >
      {copied ? <ClipboardCheck className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
      <span className="hidden sm:inline">{copied ? 'Copied!' : 'Share design'}</span>
    </Button>
  );
}

// ─── Shape icons ────────────────────────────────────────────────────────────────

/** Stylised mini floor-plan for each cabinet layout: soft room outline, warm
 *  timber benchtop runs with rounded ends, and a subtle floor wash. */
function ShapeIcon({ shape, selected }: { shape: LayoutPreference; selected: boolean }) {
  const bench = selected ? '#b08d57' : '#cbbba2';
  const benchEdge = selected ? '#8a6d3f' : '#b3a488';
  const floor = selected ? '#f8f5f0' : '#fafafa';
  const wall = selected ? '#0f172a' : '#cbd5e1';

  const Run = (p: { x: number; y: number; w: number; h: number }) => (
    <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={4}
      fill={bench} stroke={benchEdge} strokeWidth={1} />
  );

  const runs: Record<LayoutPreference, JSX.Element> = {
    'single-wall': <Run x={10} y={10} w={44} h={11} />,
    'l-shape': (
      <>
        <Run x={10} y={10} w={44} h={11} />
        <Run x={10} y={10} w={11} h={44} />
      </>
    ),
    'u-shape': (
      <>
        <Run x={10} y={10} w={44} h={11} />
        <Run x={10} y={10} w={11} h={44} />
        <Run x={43} y={10} w={11} h={44} />
      </>
    ),
    galley: (
      <>
        <Run x={10} y={10} w={44} h={11} />
        <Run x={10} y={43} w={44} h={11} />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 64 64" className="w-16 h-16 sm:w-20 sm:h-20">
      {/* floor */}
      <rect x={6} y={6} width={52} height={52} rx={6} fill={floor} />
      {/* benchtop runs */}
      {runs[shape]}
      {/* room outline drawn last so runs tuck under the walls */}
      <rect x={6} y={6} width={52} height={52} rx={6}
        fill="none" stroke={wall} strokeWidth={selected ? 2.5 : 1.5} />
    </svg>
  );
}

// ─── Step 1: Room ───────────────────────────────────────────────────────────────

/** Draft-then-commit numeric input for the room measurements. Mirrors the
 *  NumField pattern in RoomFeaturesEditor (TEST-FINDINGS.md F-5): typing does
 *  NOT clamp mid-stroke, so "3600" survives and "50" is not silently rewritten
 *  to 1200. The committed value is only applied on blur/Enter, and out-of-range
 *  values keep the user's text visible with aria-invalid + an inline message. */
function RoomMmField({
  id, label, hint, value, min, max, step, invalidMessage, onCommit, onInvalidChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  invalidMessage: string;
  onCommit: (v: number) => void;
  onInvalidChange: (bad: boolean) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const hintId = `${id}-hint`;

  const shown = draft ?? String(value);

  // Live validity derived from the DRAFT as typed (not the committed value,
  // which is always in-range by construction). Surface the error only after
  // the field has been touched so the initial state stays clean.
  const draftInvalid = (() => {
    if (draft === null) return false;
    const trimmed = draft.trim();
    if (trimmed === '') return true;
    const n = Number(trimmed);
    return !Number.isFinite(n) || n < min || n > max;
  })();
  const invalid = touched && draftInvalid;

  // Keep parent notified without churning on callback identity changes.
  const onInvalidChangeRef = useRef(onInvalidChange);
  onInvalidChangeRef.current = onInvalidChange;
  useEffect(() => { onInvalidChangeRef.current(invalid); }, [invalid]);
  useEffect(() => () => { onInvalidChangeRef.current(false); }, []);

  const commit = () => {
    setTouched(true);
    if (draft === null) return;
    const trimmed = draft.trim();
    const n = Number(trimmed);
    if (trimmed === '' || !Number.isFinite(n) || n < min || n > max) {
      // Keep the user's typed text visible so they can correct it in place.
      return;
    }
    onCommit(n);
    setDraft(null);
    setTouched(false);
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-invalid={invalid || undefined}
        aria-describedby={hintId}
        onChange={e => setDraft(e.target.value)}
        // Only seed the draft on focus if there isn't already one in flight —
        // never silently resync an invalid draft back to the committed value.
        onFocus={() => { if (draft === null) setDraft(String(value)); }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      />
      <p
        id={hintId}
        role={invalid ? 'alert' : undefined}
        className={cn('text-xs', invalid ? 'text-red-500' : 'text-slate-400')}
      >
        {invalid ? invalidMessage : hint}
      </p>
    </div>
  );
}


function Step1Section({ n, title, subtitle, children }: {
  n: number; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <div className="flex items-start gap-3 mb-4 sm:mb-5">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-900 text-white text-sm font-semibold flex items-center justify-center">
          {n}
        </span>
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 leading-tight outline-none">{title}</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}


function Step1Room({ state, onChange, onValidityChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void; onValidityChange: (hasInvalid: boolean) => void }) {
  const [invalidMap, setInvalidMap] = useState<{ w: boolean; d: boolean; h: boolean }>({ w: false, d: false, h: false });
  useEffect(() => {
    onValidityChange(invalidMap.w || invalidMap.d || invalidMap.h);
  }, [invalidMap, onValidityChange]);
  useEffect(() => () => { onValidityChange(false); }, [onValidityChange]);

  const shapes: { id: LayoutPreference; label: string; desc: string }[] = [
    { id: 'single-wall', label: 'Single Wall', desc: 'One wall of cabinets' },
    { id: 'l-shape',     label: 'L-Shape',     desc: 'Two adjoining walls' },
    { id: 'u-shape',     label: 'U-Shape',     desc: 'Three-wall storage' },
    { id: 'galley',      label: 'Galley',      desc: 'Two facing runs' },
  ];
  const manualLayout = inferLayoutShapeFromWalls(state.cabinetWalls);
  const pending = state.pendingRoomPatch;
  const pendingSummary = pending ? [
    pending.width !== undefined ? `Width: ${pending.width} mm` : null,
    pending.depth !== undefined ? `Depth: ${pending.depth} mm` : null,
    pending.height !== undefined ? `Ceiling: ${pending.height} mm` : null,
    pending.shape !== undefined ? `Room shape: ${pending.shape === 'LShape' ? 'L-shaped' : 'Rectangular'}` : null,
    pending.cutoutWidth !== undefined ? `Cutout width: ${pending.cutoutWidth} mm` : null,
    pending.cutoutDepth !== undefined ? `Cutout depth: ${pending.cutoutDepth} mm` : null,
    pending.openings !== undefined ? `Openings: ${pending.openings.length}` : null,
    pending.services !== undefined ? `Services: ${pending.services.length}` : null,
  ].filter((value): value is string => value !== null) : [];

  const applyPendingRoomPatch = () => {
    if (!pending) return;
    const nextShape = pending.shape ?? state.roomGeometryShape;
    onChange({
      roomWidth: pending.width ?? state.roomWidth,
      roomDepth: pending.depth ?? state.roomDepth,
      roomHeight: pending.height ?? state.roomHeight,
      roomGeometryShape: nextShape,
      roomCutoutWidth: nextShape === 'Rectangle' ? 0 : (pending.cutoutWidth ?? state.roomCutoutWidth),
      roomCutoutDepth: nextShape === 'Rectangle' ? 0 : (pending.cutoutDepth ?? state.roomCutoutDepth),
      openings: pending.openings ?? state.openings,
      services: pending.services ?? state.services,
      pendingRoomPatch: undefined,
      // The old design (and its proposalId/session) is stale against the new
      // geometry (brief v4.3 §4.6): clear it so the Design stage recreates a
      // fresh Standard layout on entry.
      design: null,
    });
    toast.success('Suggested room details applied. Your design will be recreated for the new room.');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {pending && (
        <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-3" role="status">
          <div>
            <p className="text-sm font-semibold text-amber-900">Review the AI-suggested room change</p>
            <p className="text-xs text-amber-800 mt-1">Nothing has changed yet. Apply the suggestion, check the room details below, then continue to confirm them.</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {pendingSummary.map(item => <span key={item} className="text-xs text-amber-900">{item}</span>)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={applyPendingRoomPatch}>Apply suggestion</Button>
            <Button size="sm" variant="outline" onClick={() => onChange({ pendingRoomPatch: undefined })}>Keep measured room</Button>
          </div>
        </div>
      )}

      <Step1Section n={1} title="Your room" subtitle="Rough sizes are fine to start — scan with your phone or type them in.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <RoomMmField
            id="room-width"
            label="Room width (mm)"
            hint={`${(state.roomWidth / 1000).toFixed(1)} m · typically 2.4–6 m`}
            value={state.roomWidth}
            min={1200} max={8000} step={100}
            invalidMessage="Enter 1200–8000 mm"
            onCommit={v => onChange({ roomWidth: v })}
            onInvalidChange={bad => setInvalidMap(m => m.w === bad ? m : { ...m, w: bad })}
          />
          <RoomMmField
            id="room-depth"
            label="Room depth (mm)"
            hint={`${(state.roomDepth / 1000).toFixed(1)} m`}
            value={state.roomDepth}
            min={1200} max={6000} step={100}
            invalidMessage="Enter 1200–6000 mm"
            onCommit={v => onChange({ roomDepth: v })}
            onInvalidChange={bad => setInvalidMap(m => m.d === bad ? m : { ...m, d: bad })}
          />
          <RoomMmField
            id="room-height"
            label="Ceiling height (mm)"
            hint={`${(state.roomHeight / 1000).toFixed(2)} m`}
            value={state.roomHeight}
            min={2100} max={4000} step={50}
            invalidMessage="Enter 2100–4000 mm"
            onCommit={v => onChange({ roomHeight: v })}
            onInvalidChange={bad => setInvalidMap(m => m.h === bad ? m : { ...m, h: bad })}
          />
        </div>
        <div className="mt-4">
          <ScanRoomEntry />
        </div>
      </Step1Section>

      <Step1Section n={2} title="Which walls should hold cabinets?" subtitle="Leave it on auto, or rule walls in and out — windows, open sides, walkways.">
        <WallPicker
          value={state.cabinetWalls}
          ranges={state.cabinetWallRanges}
          widthMm={state.roomWidth}
          depthMm={state.roomDepth}
          onChange={(walls, ranges) => {
            const inferred = inferLayoutShapeFromWalls(walls);
            onChange({
              cabinetWalls: walls,
              cabinetWallRanges: ranges,
              ...(inferred ? { layoutPreference: inferred } : {}),
            });
          }}
        />
      </Step1Section>

      <Step1Section
        n={3}
        title={manualLayout ? 'Layout created from your wall choices' : 'Which cabinet layout do you prefer?'}
        subtitle={manualLayout
          ? 'Your selected walls are authoritative.'
          : 'This preference is used only while wall placement is set to auto.'}
      >
        {manualLayout ? (
          <div className="flex items-center gap-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/60 p-4">
            <ShapeIcon shape={manualLayout} selected />
            <div>
              <p className="font-semibold text-slate-900">{layoutLabel(manualLayout)} from your walls</p>
              <p className="text-sm text-slate-600">
                There is no second competing choice. Change the wall buttons above to change the arrangement.
              </p>
            </div>
          </div>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3" role="group" aria-label="Kitchen layout shape">
          {shapes.map(({ id, label, desc }) => {
            const compatible = shapeCompatibleWithWalls(id, state.cabinetWalls);
            return (
            <button
              key={id}
              aria-pressed={state.layoutPreference === id}
              onClick={() => compatible && onChange({ layoutPreference: id })}
              disabled={!compatible}
              className={cn(
                'group flex flex-col items-center gap-1.5 p-3 sm:p-4 rounded-2xl border-2 text-center transition-all',
                state.layoutPreference === id
                  ? 'border-slate-900 bg-gradient-to-b from-slate-50 to-white shadow-sm'
                  : 'border-slate-200 hover:border-slate-300 hover:shadow-sm bg-white',
                !compatible && 'opacity-40 cursor-not-allowed hover:border-slate-200 hover:shadow-none',
              )}
            >
              <ShapeIcon shape={id} selected={state.layoutPreference === id} />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-slate-900 leading-tight">{label}</p>
                <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 hidden sm:block">
                  {compatible ? desc : 'Not with your wall picks'}
                </p>
              </div>
              {state.layoutPreference === id && (
                <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Selected
                </span>
              )}
            </button>
            );
          })}
        </div>
        )}
      </Step1Section>

      <Step1Section n={4} title="Doors, windows & existing connections" subtitle="Choose a feature, then mark it on a wall or through the floor — useful for island plumbing and gas.">
        <RoomFeaturesEditor
          widthMm={state.roomWidth}
          depthMm={state.roomDepth}
          openings={state.openings}
          services={state.services}
          cabinetLayout={state.layoutPreference}
          cabinetWalls={state.cabinetWalls}
          cabinetWallRanges={state.cabinetWallRanges}
          showHeading={false}
          onChange={p => onChange(p)}
        />
      </Step1Section>
    </div>
  );
}

/** "Scan my room" entry — only rendered on devices that can actually run the
 *  WebXR capture (master plan §10.1: capability check, never UA sniffing). */
function ScanRoomEntry() {
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    if (!window.isSecureContext) return;
    const xr = (navigator as unknown as { xr?: { isSessionSupported(m: string): Promise<boolean> } }).xr;
    xr?.isSessionSupported('immersive-ar').then(setSupported).catch(() => {});
  }, []);
  if (!supported) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
      <p className="text-xs text-slate-600">
        Got your phone? Point the camera and tap each corner — the room measures itself.
      </p>
      <Link
        to="/wizard/scan"
        className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium px-3 py-2 hover:bg-slate-700"
      >
        Scan my room
      </Link>
    </div>
  );
}

// ─── Step 2: Layout ──────────────────────────────────────────────────────────────

function Step2Layout({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  const opts: { id: LayoutStyle; label: string; desc: string; icon: string }[] = [
    { id: 'minimal',      label: 'Open & Airy',      desc: 'Fewer upper cabinets, open shelving accents. Great for smaller rooms.',        icon: '✦' },
    { id: 'standard',     label: 'Balanced',          desc: 'Full base run + upper cabinets above the benchtop. The most popular choice.', icon: '◈' },
    { id: 'full-storage', label: 'Maximum Storage',   desc: 'Floor-to-ceiling storage including tall pantry cabinets.',                    icon: '⬛' },
  ];
  const { low, high, linearMetres } = estimatePrice(state);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1 outline-none">How much storage do you want?</h2>
        <p className="text-sm text-slate-500">We'll plan your cabinet layout to suit.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {opts.map(({ id, label, desc, icon }) => (
          <button
            key={id}
            onClick={() => onChange({ layoutStyle: id })}
            className={cn(
              'flex flex-col items-start gap-2 sm:gap-3 p-4 sm:p-5 rounded-xl border-2 text-left transition-all',
              state.layoutStyle === id
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 hover:border-slate-300 bg-white',
            )}
          >
            <span className="text-xl sm:text-2xl">{icon}</span>
            <div>
              <p className="font-semibold text-slate-900 text-sm sm:text-base">{label}</p>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">{desc}</p>
            </div>
            {state.layoutStyle === id && (
              <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Selected
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="bg-slate-50 rounded-xl p-4 sm:p-5 border border-slate-200">
        <p className="text-xs sm:text-sm text-slate-500 mb-1">Estimated supply & install</p>
        <p className="text-xl sm:text-2xl font-bold text-slate-900">
          ${low.toLocaleString()} – ${high.toLocaleString()}
          <span className="text-xs sm:text-sm font-normal text-slate-400 ml-2">AUD inc. GST</span>
        </p>
        <p className="text-xs text-slate-400 mt-2">
          Based on {linearMetres} linear metres · indicative only · final quote after consultation
        </p>
      </div>
    </div>
  );
}

// ─── Step 3: Style ───────────────────────────────────────────────────────────────

function MaterialSwatch({
  option,
  className,
}: {
  option: MaterialOption;
  className?: string;
}) {
  return (
    <span
      className={cn('relative block overflow-hidden bg-slate-100', className)}
      style={{ backgroundColor: option.hex }}
    >
      {option.swatchUrl && (
        <img
          src={option.swatchUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}

function Step3Style({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  const selectedFinish   = FINISH_OPTIONS.find(f => f.id === state.finishId)   ?? FINISH_OPTIONS[0];
  const selectedBenchtop = BENCHTOP_OPTIONS.find(b => b.id === state.benchtopId) ?? BENCHTOP_OPTIONS[0];
  const selectedHandle   = HANDLE_OPTIONS.find(h => h.id === state.handleId)   ?? HANDLE_OPTIONS[0];
  const studioPresets = previewStyleFamilies().map(profile => ({
    id: profile.id,
    name: profile.name,
    blurb: profile.description,
    style: {
      ...profile.defaultStyle,
      familyId: profile.id,
      familyVersion: profile.version,
      variantId: state.styleFamilyId === profile.id ? state.styleVariantId : 'balanced',
    } satisfies StyleSpec,
  }));
  const presets = featureFlags.designStudio ? studioPresets : STYLE_PRESETS;
  const activeProfile = styleProfile(state.styleFamilyId);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1 outline-none">
          {featureFlags.designStudio ? 'Choose a design direction' : 'Choose your style'}
        </h2>
        <p className="text-sm text-slate-500">
          {featureFlags.designStudio
            ? 'Style changes the cabinet composition, storage and overheads—not only the colours.'
            : 'Pick colours and hardware to preview in 3D on the next step.'}
        </p>
      </div>

      {/* Quick styles */}
      <div className="space-y-3">
        <Label>Quick styles</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Quick styles">
          {presets.map(preset => {
            const active = featureFlags.designStudio
              ? state.styleFamilyId === preset.id
              : state.finishId === preset.style.finishId
              && state.benchtopId === preset.style.benchtopId
              && state.handleId === preset.style.handleId;
            return (
              <button
                key={preset.id}
                aria-pressed={active}
                onClick={() => {
                  trackEvent('style_preset_applied', { preset: preset.id });
                  onChange({
                    finishId: preset.style.finishId,
                    benchtopId: preset.style.benchtopId,
                    handleId: preset.style.handleId,
                    ...(featureFlags.designStudio && preset.style.familyId
                      ? {
                          styleFamilyId: preset.style.familyId,
                          styleFamilyVersion: preset.style.familyVersion ?? 1,
                          styleVariantId: preset.style.variantId ?? 'balanced',
                        }
                      : {}),
                  });
                }}
                className={cn(
                  'text-left p-2.5 rounded-xl border-2 transition-all',
                  active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400 bg-white',
                )}
              >
                <div className="flex gap-1 mb-2">
                  <MaterialSwatch
                    option={FINISH_OPTIONS.find(f => f.id === preset.style.finishId) ?? FINISH_OPTIONS[0]}
                    className="w-8 h-8 rounded-md border border-slate-200"
                  />
                  <MaterialSwatch
                    option={BENCHTOP_OPTIONS.find(b => b.id === preset.style.benchtopId) ?? BENCHTOP_OPTIONS[0]}
                    className="w-8 h-8 rounded-md border border-slate-200"
                  />
                </div>
                <p className="text-xs font-medium text-slate-900">{preset.name}</p>
                <p className="text-[10px] text-slate-400 leading-tight hidden sm:block">{preset.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      {featureFlags.designStudio && activeProfile && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div>
            <Label>Composition</Label>
            <p className="mt-1 text-xs text-slate-500">
              {activeProfile.storageCharacter.replace(/-/g, ' ')} · {activeProfile.tallUnitMassing.replace(/-/g, ' ')} · {Math.round(activeProfile.overheadCoverage.target * 100)}% overhead target
            </p>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Style composition variant">
            {activeProfile.variants.map(variant => (
              <button
                type="button"
                key={variant.id}
                aria-pressed={state.styleVariantId === variant.id}
                onClick={() => onChange({ styleVariantId: variant.id })}
                className={cn(
                  'rounded-lg border-2 px-3 py-1.5 text-xs transition-all',
                  state.styleVariantId === variant.id
                    ? 'border-slate-900 bg-slate-900 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400',
                )}
              >
                {variant.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Door colour */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Door Colour</Label>
          <span className="text-xs text-slate-500">
            {selectedFinish.supplier} {selectedFinish.supplierCode}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5" role="group" aria-label="Door colour">
          {FINISH_OPTIONS.map(f => (
            <button
              key={f.id}
              title={f.name}
              aria-label={f.name}
              aria-pressed={state.finishId === f.id}
              onClick={() => onChange({ finishId: f.id })}
              className={cn(
                'relative overflow-hidden rounded-xl border-2 bg-white text-left transition-all',
                state.finishId === f.id
                  ? 'border-slate-900 ring-2 ring-slate-900 ring-offset-2'
                  : 'border-slate-200 hover:border-slate-400',
              )}
            >
              <MaterialSwatch option={f} className="aspect-[4/3] w-full border-b border-slate-100" />
              <span className="block p-2">
                <span className="block text-[11px] font-semibold leading-tight text-slate-900">{f.name}</span>
                <span className="mt-1 block text-[9px] text-slate-500">{f.supplierCode}</span>
              </span>
              {state.finishId === f.id && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-900 p-1 text-white">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Benchtop */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Benchtop</Label>
          <span className="text-xs text-slate-500">
            {selectedBenchtop.supplier} {selectedBenchtop.supplierCode}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5" role="group" aria-label="Benchtop">
          {BENCHTOP_OPTIONS.map(b => (
            <button
              key={b.id}
              title={b.name}
              aria-label={b.name}
              aria-pressed={state.benchtopId === b.id}
              onClick={() => onChange({ benchtopId: b.id })}
              className={cn(
                'relative overflow-hidden rounded-xl border-2 bg-white text-left transition-all',
                state.benchtopId === b.id
                  ? 'border-slate-900 ring-2 ring-slate-900 ring-offset-2'
                  : 'border-slate-200 hover:border-slate-400',
              )}
            >
              <MaterialSwatch option={b} className="aspect-[4/3] w-full border-b border-slate-100" />
              <span className="block p-2">
                <span className="block text-[11px] font-semibold leading-tight text-slate-900">{b.name}</span>
                <span className="mt-1 block text-[9px] text-slate-500">{b.supplierCode}</span>
              </span>
              {state.benchtopId === b.id && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-slate-900 p-1 text-white">
                  <Check className="h-3 w-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Handles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Handle Style</Label>
          <span className="text-sm text-slate-500">{selectedHandle.name}</span>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Handle style">
          {HANDLE_OPTIONS.map(h => (
            <button
              key={h.id}
              aria-pressed={state.handleId === h.id}
              onClick={() => onChange({ handleId: h.id })}
              className={cn(
                'px-3 py-1.5 rounded-lg border-2 text-xs sm:text-sm transition-all',
                state.handleId === h.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-700 hover:border-slate-400',
              )}
            >
              {h.name}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── Step 4: Review & Quote ──────────────────────────────────────────────────────

function Step4Review({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [submittedJobId, setSubmittedJobId] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  // Durable idempotency key: generated before the first submit attempt and
  // retained across retries so a lost response never creates two enquiries.
  const submissionKeyRef = useRef<string>(crypto.randomUUID());

  const brief = buildBrief(state);
  const activeSpec: KitchenSpec = {
    ...(state.design?.spec ?? defaultSpecFor(brief, state.layoutPreference)),
    style: {
      ...(state.design?.spec.style ?? {}),
      ...styleSpecFromState(state),
    },
  };
  const compiled = compileSpec(activeSpec, brief.room);
  // Stage 3 — homeowner appliance catalog. Chosen products are (a) stamped
  // onto matching engine-placed slots so the 3D preview renders real GLBs,
  // and (b) priced independently below (so sinks/taps/ovens with no visible
  // slot still contribute to the estimate). Empty when the customer skipped.
  const { products: applianceProducts } = useApplianceCatalog({ activeOnly: true });
  const items = React.useMemo(
    () => [
      ...enrichItemsWithChosenAppliances(compiled.items, state.chosenAppliances, applianceProducts),
      // Sinks, cooktops and ovens sit in cabinets, so the engine never emits
      // them as appliance items. Overlays are appended after compileSpec and
      // stay out of both pricing paths — see applianceSelection.ts.
      ...synthesiseApplianceOverlays(compiled, state.chosenAppliances, applianceProducts),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [compiled, state.chosenAppliances, applianceProducts],
  );
  const applianceLineItems = React.useMemo(
    () => buildApplianceLineItems(state.chosenAppliances, applianceProducts),
    [state.chosenAppliances, applianceProducts],
  );
  const applianceSubtotal = sumAppliances(applianceLineItems);
  const applianceHasPlaceholder = anyPlaceholderPrices(applianceLineItems);

  const evald = evaluateDesign(compiled, brief.room, brief, activeSpec);
  const designViolations = evald.violations;
  const blockingErrors = designViolations.filter(v => v.severity === 'error');
  const conceptBlocked = evald.conceptBlocker || blockingErrors.length > 0;
  // Anything the customer chose that no engine slot or overlay ended up
  // carrying (a microwave with no tower, a rangehood in a layout with no wall
  // cabinets) is called out rather than drawn somewhere arbitrary.
  const undrawnAppliances = undrawnApplianceCategories(state.chosenAppliances, applianceProducts, items);
  const undrawnLabel = undrawnAppliances
    .map(c => APPLIANCE_CATEGORY_LABELS[c].singular)
    .join(' and ');
  const buildNotes: string[] = Array.from(new Set<string>([
    ...compiled.notes,
    ...designViolations
      .filter(v => v.severity === 'warn')
      .map(v => v.message),
    ...(undrawnLabel
      ? [`Your chosen ${undrawnLabel} is included in your price but not shown in this layout — we'll confirm placement with you before manufacturing.`]
      : []),
  ]));

  const band = useWizardPricing(compiled.items, activeSpec.style);

  const room3D: RoomConfig = brief.room;

  // Prefer the stored server-proposal band so the option card, Design overlay
  // and this Review panel all show the SAME numbers for the SAME design.
  // The default (non-AI) layout has no stored band and keeps the estimator.
  const stored = state.design?.priceBand;
  const cabinetsLow  = stored ? stored.lowAud  : band.lowAud;
  const cabinetsHigh = stored ? stored.highAud : band.highAud;
  const low  = cabinetsLow  + applianceSubtotal;
  const high = cabinetsHigh + applianceSubtotal;
  const selectedFinish   = FINISH_OPTIONS.find(f => f.id === state.finishId)   ?? FINISH_OPTIONS[0];
  const selectedBenchtop = BENCHTOP_OPTIONS.find(b => b.id === state.benchtopId) ?? BENCHTOP_OPTIONS[0];
  const selectedHandle   = HANDLE_OPTIONS.find(h => h.id === state.handleId)   ?? HANDLE_OPTIONS[0];
  const contactName = state.contactName.trim();
  const contactEmail = state.contactEmail.trim();
  const contactPhone = state.contactPhone.trim();
  const contactNameValid = contactName.length >= 2 && contactName.length <= 100;
  const contactEmailValid = contactEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(contactEmail);
  const contactPhoneValid = !contactPhone || (
    contactPhone.length >= 6
    && contactPhone.length <= 30
    && /^[+\d()\s.-]+$/.test(contactPhone)
  );

  const handleSubmit = async () => {
    setSubmitAttempted(true);
    if (conceptBlocked) {
      toast.error('This layout has a blocking problem. Return to Design and choose or generate another option.');
      return;
    }
    if (!contactNameValid || !contactEmailValid || !contactPhoneValid) {
      toast.error('Please check your contact details');
      return;
    }
    setSubmitting(true);
    try {
      // Build a schema-valid CONFIRMED room scan (master plan §5.3): pressing
      // "send" IS the person's confirmation of the geometry on screen. Any
      // edit since an incoming scanner capture bumps the revision.
      const incoming = state.incomingScan;
      const roomRevision = incoming
        ? incoming.roomRevision + (state.geometryEdits > 0 ? 1 : 0)
        : 1;
      const now = new Date().toISOString();
      const scanCandidate = {
        state: 'confirmed' as const,
        schemaVersion: 1 as const,
        source: incoming?.source ?? ('manual' as const),
        roomRevision,
        confirmedRevision: roomRevision,
        coordinateFrame: incoming?.coordinateFrame ?? IDENTITY_FRAME,
        room: {
          width: state.roomWidth,
          depth: state.roomDepth,
          height: state.roomHeight,
          shape: state.roomGeometryShape,
          cutoutWidth: state.roomCutoutWidth,
          cutoutDepth: state.roomCutoutDepth,
          openings: state.openings,
          services: state.services,
        },
        confidence: incoming
          ? {
              ...incoming.confidence,
              fields: {
                ...incoming.confidence.fields,
                ...(state.roomHeight !== incoming.room.height ? { height: 'estimated' as const } : {}),
              },
            }
          : {
              overall: 1,
              fields: {
                height: state.roomHeight === DEFAULTS.roomHeight ? ('default' as const) : ('estimated' as const),
                openings: state.openings.length ? ('user-marked' as const) : ('none-captured' as const),
                services: state.services.length ? ('user-marked' as const) : ('none-captured' as const),
              },
            },
        ...(incoming?.photos ? { photos: incoming.photos } : {}),
        ...(incoming?.rawArtifacts ? { rawArtifacts: incoming.rawArtifacts } : {}),
        ...(incoming?.normalizationWarnings ? { normalizationWarnings: incoming.normalizationWarnings } : {}),
        capturedAt: incoming?.capturedAt ?? now,
        confirmedAt: now,
      };
      const scanParse = confirmedRoomScanV1Schema.safeParse(scanCandidate);
      if (!scanParse.success) {
        console.error('[wizard] room confirmation invalid:', scanParse.error.issues);
        toast.error('Please review the room measurements and openings before requesting a quote.');
        return;
      }

      // Stage 3 — appliance line items come from the customer's catalog picks
      // on the Appliances step (not from placed engine items), so sinks/taps/
      // ovens/cooktops/microwaves that don't correspond to a visible slot
      // still price. The displayed band above already includes the subtotal.
      const applianceItemsPayload = applianceLineItems;
      const appliancesTotalPayload = applianceSubtotal;

      const designData = {
        wizardVersion: 2,
        roomShape: state.layoutPreference,
        layoutPreference: state.layoutPreference,
        roomWidth: state.roomWidth,
        roomDepth: state.roomDepth,
        roomHeight: state.roomHeight,
        roomGeometryShape: state.roomGeometryShape,
        roomCutoutWidth: state.roomCutoutWidth,
        roomCutoutDepth: state.roomCutoutDepth,
        layoutStyle: state.layoutStyle, finishId: state.finishId,
        benchtopId: state.benchtopId, handleId: state.handleId, items,
        styleFamilyId: state.styleFamilyId,
        styleFamilyVersion: state.styleFamilyVersion,
        styleVariantId: state.styleVariantId,
        openings: state.openings, services: state.services,
        cabinetWalls: state.cabinetWalls,
        cabinetWallRanges: state.cabinetWallRanges,
        spec: activeSpec,
        designName: state.design?.name ?? 'Standard layout',
        aiGenerated: state.design?.aiGenerated ?? false,
        // Server-side proposal lineage: staff promotion (promote-ai-design)
        // verifies the submitted spec against this stored proposal row.
        aiProposalId: state.design?.proposalId ?? null,
        priceBand: { low, high, source: stored ? 'proposal' : (band.isBomBacked ? 'bom' : 'estimator') },
        chosenAppliances: state.chosenAppliances,
        applianceItems: applianceItemsPayload,
        appliancesTotal: appliancesTotalPayload,
        roomScan: scanParse.data,
        buildNotes,
      };
      // Atomic server-side submission (master plan §6.4): one restricted RPC
      // creates the job and consumes/links the handoff; the browser never
      // inserts into jobs directly.
      const { data: submitData, error } = await supabase.functions.invoke('submit-planner-enquiry', {
        body: {
          submissionKey: submissionKeyRef.current,
          ...(state.handoffContext?.token
            ? { handoffId: state.handoffContext.handoffId, token: state.handoffContext.token }
            : {}),
          job: {
            name: `${contactName} – Kitchen Enquiry`,
            notes: [
              `Contact: ${contactName}`,
              `Email: ${contactEmail}`,
              contactPhone ? `Phone: ${contactPhone}` : null,
              `Cabinet layout preference: ${state.layoutPreference}`,
              `Width: ${(state.roomWidth / 1000).toFixed(1)} m`,
              `Layout: ${state.layoutStyle}`,
              `Finish: ${selectedFinish.name}`,
              `Benchtop: ${selectedBenchtop.name}`,
              `Handle: ${selectedHandle.name}`,
              `Estimate: $${low.toLocaleString()} – $${high.toLocaleString()} AUD`,
            ].filter(Boolean).join('\n'),
            design_data: designData,
            cost_excl_tax: (low + high) / 2 / 1.1,
            cost_incl_tax: (low + high) / 2,
            status: 'enquiry',
            delivery_method: 'pickup',
          },
        },
      });
      if (error) throw error;
      const jobId = (submitData as { jobId?: string } | null)?.jobId;
      if (jobId) setSubmittedJobId(jobId);
      trackEvent('lead_captured', { stage: 'quote-request', shape: state.layoutPreference });
      trackEvent('quote_requested', { shape: state.layoutPreference, layout: state.layoutStyle });

      // The admin new-lead alert email is sent server-side by
      // submit-planner-enquiry with the service role — an anonymous browser
      // call could never authenticate (pre-live audit P1.2).

      // A completed enquiry ends the session — don't restore it on reload.
      clearSavedWizardState();
      setSubmitted(true);
      toast.success("Quote request sent! We'll be in touch soon.");
    } catch (err) {
      console.error('Quote submission error:', err);
      let code = '';
      const context = (err as { context?: Response } | null)?.context;
      if (context && typeof context.clone === 'function') {
        try {
          code = String((await context.clone().json())?.error ?? '');
        } catch { /* use the safe generic retry message */ }
      }
      const message = code === 'rate_limited'
        ? 'Too many quote attempts were received from this connection. Please wait a little and try again.'
        : code === 'unconfirmed_scan'
          ? 'Please return to the Room step and confirm the room details before requesting your quote.'
          : 'Your quote was not sent. Your design is still here — check your connection and try again.';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="text-center py-10 sm:py-16 space-y-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 outline-none">Thanks, {contactName.split(' ')[0]}!</h2>
        <p className="text-slate-500 max-w-sm mx-auto text-sm">
          We've received your kitchen enquiry and will be in touch within one business day.
        </p>
        <p className="text-sm text-slate-400">
          Estimate: <strong className="text-slate-700">${low.toLocaleString()} – ${high.toLocaleString()} AUD</strong>
        </p>
        <div className="pt-4 flex flex-col items-center gap-3">
          {submittedJobId && (
            <Link
              to={`/quote/${submittedJobId}`}
              className="inline-flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-slate-700 transition-colors"
            >
              Track your enquiry →
            </Link>
          )}
          <div className="flex items-center gap-3">
            <ShareButton state={state} />
            <Link to="/"><Button variant="outline">Explore the full planner</Button></Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 mb-1 outline-none">Your kitchen preview</h2>
          <p className="text-sm text-slate-500">
            {items.length} items · {selectedFinish.name} · {selectedBenchtop.name}
          </p>
        </div>
        <ShareButton state={state} />
      </div>

      {/* 3D Preview */}
      <div
        className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50"
        style={{ height: 'clamp(240px, 40vw, 360px)' }}
      >
        <div className="absolute top-2 right-2 z-10">
          <Button
            size="sm"
            variant={state.doorsOpen ? 'default' : 'outline'}
            className="h-7 text-xs shadow"
            onClick={() => onChange({ doorsOpen: !state.doorsOpen })}
          >
            <DoorOpen className="w-3 h-3 mr-1" />
            {state.doorsOpen ? 'Close' : 'Open doors'}
          </Button>
        </div>
        <Scene3DErrorBoundary>
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          }>
            <UnifiedScene
              items={items}
              room={room3D}
              globalDimensions={DEFAULT_GLOBAL_DIMENSIONS}
              selectedItemId={null}
              draggedItemId={null}
              placementItemId={null}
              onItemSelect={() => {}}
              onItemMove={() => {}}
              is3D={true}
              doorsOpen={state.doorsOpen}
              selectedFinish={selectedFinish}
              selectedBenchtop={selectedBenchtop}
            />
          </Suspense>
        </Scene3DErrorBoundary>
      </div>

      {buildNotes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-1">
          <p className="text-xs font-semibold text-amber-800">Things to know about this layout</p>
          {buildNotes.map((m, i) => (
            <p key={i} className="text-xs text-amber-700">• {m}</p>
          ))}
        </div>
      )}

      {blockingErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3.5 space-y-1" role="alert">
          <p className="text-xs font-semibold text-red-800">Quote request blocked until the layout is repaired</p>
          {blockingErrors.map(error => (
            <p key={`${error.code}-${error.message}`} className="text-xs text-red-700">{error.message}</p>
          ))}
        </div>
      )}

      {/* Appliances — line items chosen on the Appliances step. */}
      {applianceLineItems.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Appliances</h3>
            <span className="text-xs text-slate-500">
              Subtotal <strong className="text-slate-900">${Math.round(applianceSubtotal).toLocaleString()}</strong>
            </span>
          </div>
          <ul className="divide-y divide-slate-100">
            {applianceLineItems.map(l => (
              <li key={l.productId} className="py-2 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="text-slate-900 truncate">{l.name}</p>
                  <p className="text-[11px] text-slate-400 capitalize">
                    {APPLIANCE_CATEGORY_LABELS[l.category as keyof typeof APPLIANCE_CATEGORY_LABELS]?.singular ?? l.category}
                    {l.isPlaceholderPrice ? ' · indicative price' : ''}
                  </p>
                </div>
                <span className="text-slate-700 whitespace-nowrap">
                  {l.lineTotal > 0 ? `$${Math.round(l.lineTotal).toLocaleString()}` : '—'}
                </span>
              </li>
            ))}
          </ul>
          {applianceHasPlaceholder && (
            <p className="text-[11px] text-amber-600 pt-1">
              Some appliance prices are indicative and will be confirmed in your final quote.
            </p>
          )}
        </div>
      )}

      {/* Estimate banner — lead with the custom kitchen, then keep optional
          supplied appliances visibly separate from the cabinetry comparison. */}
      <div className="rounded-xl bg-slate-900 p-4 text-white sm:p-5">
        <p className="text-xs uppercase tracking-wide text-slate-400">Your estimate at a glance</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:divide-x sm:divide-slate-700">
          <div>
            <p className="text-xs text-slate-400">Custom kitchen</p>
            <p className="mt-0.5 text-lg font-bold">
              ${cabinetsLow.toLocaleString()} – ${cabinetsHigh.toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Cabinetry, benchtop &amp; installation</p>
          </div>
          <div className="border-t border-slate-700 pt-3 sm:border-t-0 sm:pl-4 sm:pt-0">
            <p className="text-xs text-slate-400">Selected appliances</p>
            <p className="mt-0.5 text-lg font-semibold">
              {applianceSubtotal > 0
                ? `$${Math.round(applianceSubtotal).toLocaleString()}`
                : 'None selected'}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">Kept separate for easy comparison</p>
          </div>
          <div className="border-t border-slate-700 pt-3 sm:border-t-0 sm:pl-4 sm:pt-0">
            <p className="text-xs text-slate-400">Combined estimate</p>
            <p className="mt-0.5 text-lg font-semibold">
              ${Math.round(low).toLocaleString()} – ${Math.round(high).toLocaleString()}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">AUD inc. GST</p>
          </div>
        </div>
        <p className="mt-3 border-t border-slate-700 pt-3 text-[11px] text-slate-400">
          Indicative only. Final price confirmed after site measure.
        </p>
      </div>

      {/* Contact form */}
      <div className="space-y-4 pt-1">
        <h3 className="font-semibold text-slate-900">Get your personalised quote</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cname">Full name <span className="text-red-500">*</span></Label>
            <Input id="cname" placeholder="Jane Smith" value={state.contactName}
              onChange={e => onChange({ contactName: e.target.value })} autoComplete="name"
              maxLength={100}
              aria-invalid={submitAttempted && !contactNameValid}
              aria-describedby={submitAttempted && !contactNameValid ? 'cname-error' : undefined} />
            {submitAttempted && !contactNameValid && (
              <p id="cname-error" role="alert" className="text-xs text-red-600">Please enter your full name.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cemail">Email <span className="text-red-500">*</span></Label>
            <Input id="cemail" type="email" placeholder="jane@example.com" value={state.contactEmail}
              onChange={e => onChange({ contactEmail: e.target.value })} autoComplete="email"
              maxLength={254}
              aria-invalid={submitAttempted && !contactEmailValid}
              aria-describedby={submitAttempted && !contactEmailValid ? 'cemail-error' : undefined} />
            {submitAttempted && !contactEmailValid && (
              <p id="cemail-error" role="alert" className="text-xs text-red-600">Enter a valid email so we can send your quote.</p>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cphone">Phone <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input id="cphone" type="tel" placeholder="04xx xxx xxx" value={state.contactPhone}
              onChange={e => onChange({ contactPhone: e.target.value })} autoComplete="tel"
              maxLength={30}
              aria-invalid={submitAttempted && !contactPhoneValid}
              aria-describedby={submitAttempted && !contactPhoneValid ? 'cphone-error' : undefined} />
            {submitAttempted && !contactPhoneValid && (
              <p id="cphone-error" role="alert" className="text-xs text-red-600">
                Enter a valid phone number using digits, spaces, brackets, +, dots or dashes.
              </p>
            )}
          </div>
        </div>
        <Button
          className="w-full bg-slate-900 hover:bg-slate-800 text-white h-11"
          disabled={submitting || conceptBlocked}
          onClick={handleSubmit}
        >
          {submitting
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending…</>
            : <><Send className="w-4 h-4 mr-2" /> Request my free quote</>}
        </Button>
        <p className="text-xs text-center text-slate-400">No spam. We'll reach out within 1 business day.</p>
      </div>
    </div>
  );
}

// ─── Main shell ──────────────────────────────────────────────────────────────────

export default function HomeownerWizard() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialise from defaults ← saved session (mobile reload survival) ← URL
  // params. URL params win: they are synced FROM state, so on a plain reload
  // they agree with the saved copy, and an explicit deep link still applies.
  const initialState = (): WizardState => ({
    step: 1,
    openings: [],
    services: [],
    cabinetWalls: [],
    cabinetWallRanges: {},
    priorities: [],
    dishwasher: true,
    fridgeWidthMm: 900,
    island: 'if-it-fits',
    design: null,
    doorsOpen: false,
    contactName: '', contactEmail: '', contactPhone: '',
    geometryEdits: 0,
    chosenAppliances: {},
    ...DEFAULTS,
  });

  const [state, setState] = useState<WizardState>(() => ({
    ...initialState(),
    ...loadSavedWizardState(),
    ...paramsToState(searchParams),
  }));

  // Step-1 measurement validity (draft-then-commit inputs). Bubbled up so the
  // footer Continue button can disable and surface a single inline hint while
  // any of the room-size fields is out of range.
  const [step1Invalid, setStep1Invalid] = useState(false);
  const handleStep1Validity = useCallback((bad: boolean) => setStep1Invalid(bad), []);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const performReset = () => {
    clearSavedWizardState();
    setStep1Invalid(false);
    setState(initialState());
    setSearchParams(new URLSearchParams(), { replace: true });
    setResetConfirmOpen(false);
  };

  // Persist every change for the life of the tab (cleared on submit).
  useEffect(() => { saveWizardState(state); }, [state]);

  // On step change: reset scroll and move focus to the step's h2 so screen
  // readers land at the new content instead of stranded on the old page.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: 0 });
    const h = document.querySelector('main h2') as HTMLElement | null;
    if (h) {
      h.setAttribute('tabindex', '-1');
      h.focus({ preventScroll: true });
    }
  }, [state.step]);

  const onChange = useCallback((patch: Partial<WizardState>) => {
    setState(prev => {
      // Any user change to dimensions/openings/services bumps the revision
      // counter so a previously confirmed capture cannot stay "confirmed"
      // (master plan §5.3). Handoff application (incomingScan) is exempt.
      const fromHandoff = 'incomingScan' in patch;
      const touchesGeometry =
        !fromHandoff &&
        (['roomWidth', 'roomDepth', 'roomHeight', 'roomGeometryShape', 'roomCutoutWidth', 'roomCutoutDepth', 'openings', 'services'] as const)
          .some(k => k in patch);
      return {
        ...prev,
        ...patch,
        design: touchesGeometry || 'layoutPreference' in patch || 'layoutStyle' in patch
          || 'cabinetWalls' in patch || 'cabinetWallRanges' in patch
          || 'householdSize' in patch || 'cooks' in patch || 'priorities' in patch
          || 'oven' in patch || 'cooktop' in patch || 'dishwasher' in patch
          || 'sinkCabinetWidthMm' in patch
          || 'fridgeWidthMm' in patch || 'fridgeOpeningWidthMm' in patch || 'island' in patch
          || 'styleFamilyId' in patch || 'styleVariantId' in patch
          ? null
          : ('design' in patch ? patch.design ?? null : prev.design),
        geometryEdits: touchesGeometry ? prev.geometryEdits + 1 : prev.geometryEdits,
      };
    });
  }, []);

  // Track wizard start once on mount
  useEffect(() => {
    trackEvent('wizard_started');
  }, []);

  // Rich share payload (?sd=): captured once at mount (the URL-sync effect
  // rewrites the query string and would erase it), decoded async, applied
  // directly via setState — bypassing onChange on purpose, since onChange
  // would see the openings in the patch and null out the restored design.
  const [sharedPayload] = useState<string | null>(() => searchParams.get('sd'));
  const sharedApplied = useRef(false);
  useEffect(() => {
    if (!sharedPayload || sharedApplied.current) return;
    sharedApplied.current = true;
    decodeSharePayload(sharedPayload).then(patch => {
      if (!patch) return;
      setState(prev => ({ ...prev, ...patch }));
      trackEvent('shared_design_opened', { hasDesign: !!patch.design });
      if (patch.design) {
        toast.success(`Shared design loaded: “${patch.design.name}” — continue through to the Design step to view or revise it.`);
      }
    });
  }, [sharedPayload]);

  // Website handoff (?handoff=<id>#handoffToken=<token>): the fragment token
  // is captured once, stashed in session storage, scrubbed from the URL, and
  // retrieval goes through the tokenized edge function — anonymous visitors
  // never read the table (master plan §6.3). Tokenless staff visits fall back
  // to the direct read permitted by the staff RLS policy.
  // Captured ONCE at mount: the design-params URL sync below rewrites the
  // query string and would otherwise erase ?handoff= before the tokenized
  // fetch resolves (test-pass finding F-2), flipping the query key to null.
  const [handoffId] = useState<string | null>(() => searchParams.get('handoff'));
  const [handoffToken] = useState<string | null>(() => captureHandoffToken(handoffId));
  const tokenized = useTokenizedPlannerHandoff(handoffId, handoffToken);
  const { data: staffRow } = usePlannerHandoff(handoffToken ? null : handoffId);
  const handoffPayload = tokenized.data?.payload ?? staffRow?.payload ?? null;
  const handoffApplied = useRef(false);
  useEffect(() => {
    if (!handoffPayload || handoffApplied.current || !handoffId) return;
    handoffApplied.current = true;
    // Defensive parse — legacy v0 payloads normalize; invalid nested capture
    // data is stripped with issues rather than crashing the wizard.
    const parsed = parseLegacyWebsitePlannerHandoff(handoffPayload);
    if (!parsed.ok) return;
    const h = parsed.handoff;
    const styleWords = handoffToStyleWords(h);
    const scan = h.roomScan;
    onChange({
      handoffContext: { handoffId, ...(handoffToken ? { token: handoffToken } : {}) },
      ...(scan
        ? {
            step: 1,
            design: null,
            incomingScan: scan,
            roomWidth: scan.room.width,
            roomDepth: scan.room.depth,
            roomHeight: scan.room.height,
            roomGeometryShape: scan.room.shape,
            roomCutoutWidth: scan.room.cutoutWidth,
            roomCutoutDepth: scan.room.cutoutDepth,
            openings: scan.room.openings as Opening[],
            services: scan.room.services as ServicePoint[],
          }
        : {
            ...(h.dimensions?.widthMm ? { roomWidth: h.dimensions.widthMm } : {}),
            ...(h.dimensions?.depthMm ? { roomDepth: h.dimensions.depthMm } : {}),
          }),
      ...(styleWords ? { styleWords } : {}),
    });
    if (scan) toast.success('Room scan loaded — please check the room details.');
  }, [handoffPayload, handoffId, handoffToken, onChange]);

  // WebXR capture handoff (/wizard/scan → sessionStorage → here). One-shot:
  // the pending scan is consumed on pickup; parse failures fall back to the
  // manual wizard without crashing (master plan §5.3 — unconfirmed scans
  // pre-fill the editor, never drive generation until confirmed).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('bower.pendingScan');
      if (!raw) return;
      sessionStorage.removeItem('bower.pendingScan');
      const parsed = parseRoomScan(JSON.parse(raw));
      if (!parsed.ok || parsed.scan.state !== 'unconfirmed') return;
      const scan = parsed.scan;
      onChange({
        step: 1,
        design: null,
        incomingScan: scan,
        roomWidth: scan.room.width,
        roomDepth: scan.room.depth,
        // The scan is authoritative for the full geometry: height (measured
        // or defaulted by the scanner) and shape/cutouts (L-scans land as L).
        roomHeight: scan.room.height,
        roomGeometryShape: scan.room.shape,
        roomCutoutWidth: scan.room.cutoutWidth,
        roomCutoutDepth: scan.room.cutoutDepth,
        openings: scan.room.openings as Opening[],
        services: scan.room.services as ServicePoint[],
      });
      toast.success('Room scanned — check the size and mark doors, windows and plumbing.');
    } catch {
      // Storage unavailable or corrupt payload — manual entry still works.
    }
  }, [onChange]);

  // Sync design state to URL whenever it changes (not contact info)
  useEffect(() => {
    const params = stateToParams(state);
    setSearchParams(params, { replace: true });
  }, [
    state.layoutPreference, state.roomWidth, state.roomDepth, state.roomHeight,
    state.layoutStyle, state.finishId, state.benchtopId, state.handleId,
    state.cabinetWalls, state.cabinetWallRanges,
    // intentionally omitting step / doorsOpen / contact fields
  ]);

  const selectedDesignHasBlockingErrors = (() => {
    if (!state.design) return false;
    const brief = buildBrief(state);
    const spec = {
      ...state.design.spec,
      style: { ...state.design.spec.style, ...styleSpecFromState(state) },
    };
    // One rules pipeline (brief v4.3 §4.4): the concept gate comes from
    // evaluateDesign, not hand-rolled severity filtering.
    return evaluateDesign(compileSpec(spec, brief.room), brief.room, brief, spec).conceptBlocker;
  })();

  const designStudioEnabled = featureFlags.designStudio;
  const designStep = designStudioEnabled ? 4 : 5;
  const reviewStep = designStudioEnabled ? 5 : 6;
  const stepLabels = designStudioEnabled ? STUDIO_STEPS : SPLIT_STEPS;

  const canAdvance =
    state.step === 1
      ? state.roomWidth >= 1200 && state.roomDepth >= 1200 && state.roomHeight >= 2100 && !step1Invalid :
    state.step === 2 ? true :
    state.step === 3 ? true :
    state.step === 4 ? (designStudioEnabled ? state.design !== null && !selectedDesignHasBlockingErrors : true) :
    state.step === 5 ? (!designStudioEnabled && state.design !== null && !selectedDesignHasBlockingErrors) : false;

  const advance = () => {
    if (state.step < reviewStep) {
      trackEvent('step_complete', {
        step: state.step,
        shape: state.layoutPreference,
        layout: state.layoutStyle,
      });
      onChange({ step: (state.step + 1) as WizardState['step'] });
    }
  };
  const back    = () => { if (state.step > 1) onChange({ step: (state.step - 1) as WizardState['step'] }); };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-100 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between sticky top-0 bg-white z-20">
        <Link to="/wizard" className="font-bold text-base sm:text-lg text-slate-900">Bower</Link>
        <div className="flex items-center gap-3">
          {state.step >= 2 && (
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              className="inline-flex items-center gap-1 text-xs sm:text-sm text-slate-400 hover:text-slate-700"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Start new design
            </button>
          )}
          <span className="hidden text-xs text-slate-400 sm:inline sm:text-sm">Kitchen Planner</span>
          <Link
            to="/trade-planner"
            className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 sm:px-3 sm:text-sm"
          >
            Trade login
          </Link>
        </div>
      </header>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start a new design?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current design and details will be cleared. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={performReset}>Start new design</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hero — only shown on step 1, compact on mobile */}
      {state.step === 1 && (
        <div className="bg-slate-900 text-white px-4 sm:px-6 py-8 sm:py-12 text-center">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">Design your dream kitchen</h1>
          <p className="text-slate-400 text-sm sm:text-base max-w-md mx-auto">
            Answer a few quick questions and we'll give you a 3D preview + price estimate in under 2 minutes.
          </p>
        </div>
      )}

      {/* Wizard body */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <StepIndicator current={state.step} steps={stepLabels} />

        {state.step === 1 && <Step1Room state={state} onChange={onChange} onValidityChange={handleStep1Validity} />}
        {state.step === 2 && <StepCook value={state} onChange={p => onChange(p)} />}
        {state.step === 3 && (
          <StepAppliances
            chosen={state.chosenAppliances}
            cooking={{
              oven: state.oven,
              cooktop: state.cooktop,
              dishwasher: state.dishwasher,
              fridgeWidthMm: state.fridgeWidthMm,
            }}
            onChange={next => onChange({ chosenAppliances: next })}
            onSinkCabinetWidthChange={sinkCabinetWidthMm => onChange({ sinkCabinetWidthMm })}
            onFridgeDimensionsChange={({ bodyWidthMm, openingWidthMm }) => onChange({
              fridgeWidthMm: bodyWidthMm,
              fridgeOpeningWidthMm: openingWidthMm,
            })}
          />
        )}
        {state.step === 4 && (
          <div className="space-y-10">
            <Step3Style state={state} onChange={onChange} />
            {designStudioEnabled && (
              <div className="border-t border-slate-200 pt-8">
                <StepDesign
                  key={`${state.layoutPreference}|${state.roomGeometryShape}|${state.roomWidth}x${state.roomDepth}x${state.roomHeight}|${state.roomCutoutWidth}x${state.roomCutoutDepth}|${state.styleFamilyId}|${state.styleVariantId}`}
                  brief={buildBrief(state)}
                  shape={state.layoutPreference}
                  style={styleSpecFromState(state)}
                  design={state.design}
                  chosenAppliances={state.chosenAppliances}
                  onDesignChange={d => onChange({ design: d })}
                  onRoomPatchProposed={patch => onChange({ pendingRoomPatch: patch, step: 1 })}
                  onReturnToRoom={() => onChange({ step: 1 })}
                />
              </div>
            )}
          </div>
        )}
        {!designStudioEnabled && state.step === 5 && (
          <StepDesign
            key={`${state.layoutPreference}|${state.roomGeometryShape}|${state.roomWidth}x${state.roomDepth}x${state.roomHeight}|${state.roomCutoutWidth}x${state.roomCutoutDepth}|${state.styleFamilyId}|${state.styleVariantId}`}
            brief={buildBrief(state)}
            shape={state.layoutPreference}
            style={styleSpecFromState(state)}
            design={state.design}
            chosenAppliances={state.chosenAppliances}
            onDesignChange={d => onChange({ design: d })}
            onRoomPatchProposed={patch => onChange({ pendingRoomPatch: patch, step: 1 })}
            onReturnToRoom={() => onChange({ step: 1 })}
          />
        )}
        {state.step === reviewStep && <Step4Review state={state} onChange={onChange} />}

        {/* Nav footer */}
        {state.step < reviewStep ? (
          <div className="mt-8 sm:mt-10 pt-5 border-t border-slate-100">
            {state.step === 1 && step1Invalid && (
              <p className="text-xs text-red-600 mb-3 text-center sm:text-right">
                Fix the highlighted room measurements to continue.
              </p>
            )}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                onClick={back}
                disabled={state.step === 1}
                className="gap-1 text-slate-500"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </Button>
              <div className="flex items-center gap-3">
                {state.step >= 2 && <ShareButton state={state} />}
                <Button
                  onClick={advance}
                  disabled={!canAdvance}
                  className="gap-1 bg-slate-900 hover:bg-slate-800 text-white px-5 sm:px-6"
                >
                  {state.step === designStep ? 'Review & price' : 'Continue'}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={back} className="gap-1 text-slate-500">
              <ChevronLeft className="w-4 h-4" /> Edit design
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
