/**
 * R4: Homeowner Guided Wizard
 * Step-by-step flow: Room → Layout → Style → Review & Quote
 * No login required — consumer-facing lead capture.
 * URL state: design params synced to query string for sharing / bookmarking.
 */

import React, { useState, Suspense, useCallback, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { captureHandoffToken, usePlannerHandoff, useTokenizedPlannerHandoff } from '@/hooks/usePlannerHandoff';
import { handoffToStyleWords } from '@/lib/handoffBrief';
import {
  confirmedRoomScanV1Schema,
  parseLegacyWebsitePlannerHandoff,
  type CoordinateFrameV1,
  type RoomScanV1,
} from '@/lib/roomScan/contract';
import {
  Check, ChevronRight, ChevronLeft, Loader2, Send, DoorOpen, Share2, ClipboardCheck,
} from 'lucide-react';
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
import type { Opening, PlacedItem, RoomConfig, RoomShape, ServicePoint } from '@/types';
import { briefFromWizard, compileSpec, defaultSpecFor, priceDesign, validate } from '@/lib/layout';
import { RoomFeaturesEditor } from '@/components/shared/RoomFeaturesEditor';
import StepCook from './steps/StepCook';
import StepDesign from './steps/StepDesign';
import { buildBrief, type WizardDesign } from './wizardBrief';
import { STYLE_PRESETS } from '@/data/stylePresets';
import { useWizardPricing } from '@/hooks/useWizardPricing';
import type { KitchenSpec, Priority } from '@/lib/layout';

// ─── Types ─────────────────────────────────────────────────────────────────────

type KitchenShape = 'single-wall' | 'l-shape' | 'u-shape' | 'galley';
type LayoutStyle  = 'minimal' | 'standard' | 'full-storage';

interface WizardState {
  step: 1 | 2 | 3 | 4 | 5;
  roomShape:   KitchenShape;
  roomWidth:   number;   // mm
  roomDepth:   number;   // mm
  layoutStyle: LayoutStyle;
  finishId:    string;
  benchtopId:  string;
  handleId:    string;
  openings:    Opening[];
  services:    ServicePoint[];
  // "How you cook" (step 2)
  householdSize?: number;
  cooks?:       'rare' | 'daily' | 'entertainer';
  priorities:   Priority[];
  oven?:        '600' | '900';
  cooktop?:     'gas' | 'induction';
  dishwasher:   boolean;
  fridgeWidthMm: number;
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

const DEFAULTS: Pick<WizardState, 'roomShape' | 'roomWidth' | 'roomDepth' | 'layoutStyle' | 'finishId' | 'benchtopId' | 'handleId'> = {
  roomShape:   'single-wall',
  roomWidth:   3600,
  roomDepth:   3000,
  layoutStyle: 'standard',
  finishId:    'do-designer-white',
  benchtopId:  'egger-white-carrara',
  handleId:    'handle-bar-ss',
};

// ─── URL serialisation helpers ──────────────────────────────────────────────────

const SHAPE_CODES: Record<KitchenShape, string> = {
  'single-wall': 'sw', 'l-shape': 'l', 'u-shape': 'u', 'galley': 'g',
};
const CODE_SHAPES: Record<string, KitchenShape> = Object.fromEntries(
  Object.entries(SHAPE_CODES).map(([k, v]) => [v, k as KitchenShape]),
);
const LAYOUT_CODES: Record<LayoutStyle, string> = {
  minimal: 'min', standard: 'std', 'full-storage': 'full',
};
const CODE_LAYOUTS: Record<string, LayoutStyle> = Object.fromEntries(
  Object.entries(LAYOUT_CODES).map(([k, v]) => [v, k as LayoutStyle]),
);

function stateToParams(s: WizardState): URLSearchParams {
  const p = new URLSearchParams();
  if (s.roomShape   !== DEFAULTS.roomShape)   p.set('s',  SHAPE_CODES[s.roomShape]);
  if (s.roomWidth   !== DEFAULTS.roomWidth)   p.set('w',  String(s.roomWidth));
  if (s.roomDepth   !== DEFAULTS.roomDepth)   p.set('d',  String(s.roomDepth));
  if (s.layoutStyle !== DEFAULTS.layoutStyle) p.set('ls', LAYOUT_CODES[s.layoutStyle]);
  if (s.finishId    !== DEFAULTS.finishId)    p.set('f',  s.finishId);
  if (s.benchtopId  !== DEFAULTS.benchtopId)  p.set('b',  s.benchtopId);
  if (s.handleId    !== DEFAULTS.handleId)    p.set('h',  s.handleId);
  return p;
}

function paramsToState(p: URLSearchParams): Partial<WizardState> {
  const out: Partial<WizardState> = {};
  if (p.has('s'))  out.roomShape   = CODE_SHAPES[p.get('s')!]  ?? DEFAULTS.roomShape;
  if (p.has('w'))  out.roomWidth   = Math.max(1200, Math.min(8000, Number(p.get('w'))));
  if (p.has('d'))  out.roomDepth   = Math.max(1200, Math.min(6000, Number(p.get('d'))));
  if (p.has('ls')) out.layoutStyle = CODE_LAYOUTS[p.get('ls')!] ?? DEFAULTS.layoutStyle;
  if (p.has('f'))  out.finishId    = p.get('f')!;
  if (p.has('b'))  out.benchtopId  = p.get('b')!;
  if (p.has('h'))  out.handleId    = p.get('h')!;
  return out;
}

// ─── Layout engine bridge ───────────────────────────────────────────────────────
// Real deterministic layout engine (src/lib/layout): role-based cabinet runs,
// services/openings aware, validated geometry. Same signatures as the old
// hard-coded preview so the rest of the wizard is unchanged.

function generatePreviewItems(
  shape: KitchenShape,
  roomWidth: number,
  roomDepth: number,
  layoutStyle: LayoutStyle,
  finishId: string,
  openings: Opening[] = [],
  services: ServicePoint[] = [],
): PlacedItem[] {
  const brief = briefFromWizard({ roomShape: shape, roomWidth, roomDepth, layoutStyle }, { openings, services });
  const spec = defaultSpecFor(brief, shape, {
    finishId,
    benchtopId: DEFAULTS.benchtopId,
    handleId: DEFAULTS.handleId,
  });
  return compileSpec(spec, brief.room).items;
}

function estimatePrice(
  shape: KitchenShape, roomWidth: number, roomDepth: number, layoutStyle: LayoutStyle,
  openings: Opening[] = [], services: ServicePoint[] = [],
) {
  const brief = briefFromWizard({ roomShape: shape, roomWidth, roomDepth, layoutStyle }, { openings, services });
  const spec = defaultSpecFor(brief, shape);
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
function designWarnings(
  shape: KitchenShape, roomWidth: number, roomDepth: number, layoutStyle: LayoutStyle,
  openings: Opening[], services: ServicePoint[],
): string[] {
  const brief = briefFromWizard({ roomShape: shape, roomWidth, roomDepth, layoutStyle }, { openings, services });
  const spec = defaultSpecFor(brief, shape);
  const design = compileSpec(spec, brief.room);
  const violations = validate(design, brief.room, brief);
  violations.filter(v => v.severity === 'error')
    .forEach(v => console.warn('[wizard] layout error:', v.code, v.message));
  return Array.from(new Set(violations.filter(v => v.severity === 'warn').map(v => v.message)));
}

// ─── Step indicator ─────────────────────────────────────────────────────────────

const STEPS = ['Room', 'Cooking', 'Design', 'Style', 'Review'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center mb-8 overflow-x-auto pb-1">
      {STEPS.map((label, i) => {
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
            {i < STEPS.length - 1 && (
              <div className={cn(
                'h-px w-8 sm:w-12 mb-5 mx-1 flex-shrink-0 transition-colors',
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
    // Sync current design to URL first
    const params = stateToParams(state);
    setSearchParams(params, { replace: true });

    const url = `${window.location.origin}/wizard${params.toString() ? '?' + params.toString() : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy — copy the URL from your browser address bar');
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
      {copied ? <ClipboardCheck className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
      {copied ? 'Copied!' : 'Share design'}
    </Button>
  );
}

// ─── Shape icons ────────────────────────────────────────────────────────────────

function ShapeIcon({ shape, selected }: { shape: KitchenShape; selected: boolean }) {
  const s = selected ? '#0f172a' : '#94a3b8';
  const icons: Record<KitchenShape, JSX.Element> = {
    'single-wall': (
      <svg viewBox="0 0 60 40" className="w-10 h-7 sm:w-12 sm:h-8">
        <rect x="4" y="22" width="52" height="10" rx="2" fill={s} />
        <rect x="4" y="6"  width="52" height="8"  rx="2" fill={s} opacity="0.35" />
      </svg>
    ),
    'l-shape': (
      <svg viewBox="0 0 60 60" className="w-10 h-10 sm:w-12 sm:h-12">
        <rect x="4"  y="4"  width="52" height="10" rx="2" fill={s} />
        <rect x="4"  y="4"  width="10" height="52" rx="2" fill={s} />
        <rect x="4"  y="34" width="52" height="10" rx="2" fill={s} opacity="0.3" />
        <rect x="34" y="4"  width="10" height="52" rx="2" fill={s} opacity="0.3" />
      </svg>
    ),
    'u-shape': (
      <svg viewBox="0 0 60 60" className="w-10 h-10 sm:w-12 sm:h-12">
        <rect x="4"  y="4"  width="52" height="10" rx="2" fill={s} />
        <rect x="4"  y="4"  width="10" height="52" rx="2" fill={s} />
        <rect x="46" y="4"  width="10" height="52" rx="2" fill={s} />
        <rect x="4"  y="34" width="52" height="10" rx="2" fill={s} opacity="0.3" />
      </svg>
    ),
    galley: (
      <svg viewBox="0 0 60 60" className="w-10 h-10 sm:w-12 sm:h-12">
        <rect x="4" y="6"  width="52" height="10" rx="2" fill={s} />
        <rect x="4" y="44" width="52" height="10" rx="2" fill={s} />
      </svg>
    ),
  };
  return <div className={cn('rounded-md p-1', selected && 'bg-slate-100')}>{icons[shape]}</div>;
}

// ─── Step 1: Room ───────────────────────────────────────────────────────────────

function Step1Room({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  const shapes: { id: KitchenShape; label: string; desc: string }[] = [
    { id: 'single-wall', label: 'Single Wall', desc: 'One wall of cabinets' },
    { id: 'l-shape',     label: 'L-Shape',     desc: 'Two adjoining walls' },
    { id: 'u-shape',     label: 'U-Shape',     desc: 'Three-wall storage' },
    { id: 'galley',      label: 'Galley',      desc: 'Two facing runs' },
  ];
  const needsDepth = state.roomShape !== 'single-wall';

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">What shape is your kitchen?</h2>
        <p className="text-sm text-slate-500">This helps us suggest the best layout for your space.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {shapes.map(({ id, label, desc }) => (
          <button
            key={id}
            onClick={() => onChange({ roomShape: id })}
            className={cn(
              'flex flex-col items-center gap-2 p-3 sm:p-4 rounded-xl border-2 text-center transition-all',
              state.roomShape === id
                ? 'border-slate-900 bg-slate-50'
                : 'border-slate-200 hover:border-slate-300 bg-white',
            )}
          >
            <ShapeIcon shape={id} selected={state.roomShape === id} />
            <div>
              <p className="text-xs sm:text-sm font-medium text-slate-900 leading-tight">{label}</p>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{desc}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="space-y-2">
          <Label htmlFor="room-width">
            Wall length <span className="text-slate-400 font-normal">(mm)</span>
          </Label>
          <Input
            id="room-width"
            type="number"
            inputMode="numeric"
            min={1200}
            max={8000}
            step={100}
            value={state.roomWidth}
            onChange={e => onChange({ roomWidth: Number(e.target.value) })}
          />
          <p className="text-xs text-slate-400">
            {(state.roomWidth / 1000).toFixed(1)} m · typically 2.4–6 m
          </p>
        </div>

        {needsDepth && (
          <div className="space-y-2">
            <Label htmlFor="room-depth">
              Side wall length <span className="text-slate-400 font-normal">(mm)</span>
            </Label>
            <Input
              id="room-depth"
              type="number"
              inputMode="numeric"
              min={1200}
              max={6000}
              step={100}
              value={state.roomDepth}
              onChange={e => onChange({ roomDepth: Number(e.target.value) })}
            />
            <p className="text-xs text-slate-400">{(state.roomDepth / 1000).toFixed(1)} m</p>
          </div>
        )}
      </div>

      <div className="pt-5 border-t border-slate-100">
        <RoomFeaturesEditor
          widthMm={state.roomWidth}
          depthMm={needsDepth ? state.roomDepth : Math.max(Math.round(state.roomWidth * 0.7), 2400)}
          openings={state.openings}
          services={state.services}
          onChange={p => onChange(p)}
        />
      </div>
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
  const { low, high, linearMetres } = estimatePrice(state.roomShape, state.roomWidth, state.roomDepth, state.layoutStyle, state.openings, state.services);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">How much storage do you want?</h2>
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

function Step3Style({ state, onChange }: { state: WizardState; onChange: (p: Partial<WizardState>) => void }) {
  const selectedFinish   = FINISH_OPTIONS.find(f => f.id === state.finishId)   ?? FINISH_OPTIONS[0];
  const selectedBenchtop = BENCHTOP_OPTIONS.find(b => b.id === state.benchtopId) ?? BENCHTOP_OPTIONS[0];
  const selectedHandle   = HANDLE_OPTIONS.find(h => h.id === state.handleId)   ?? HANDLE_OPTIONS[0];

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Choose your style</h2>
        <p className="text-sm text-slate-500">Pick colours and hardware to preview in 3D on the next step.</p>
      </div>

      {/* Quick styles */}
      <div className="space-y-3">
        <Label>Quick styles</Label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STYLE_PRESETS.map(preset => {
            const active = state.finishId === preset.style.finishId
              && state.benchtopId === preset.style.benchtopId
              && state.handleId === preset.style.handleId;
            return (
              <button
                key={preset.id}
                onClick={() => {
                  trackEvent('style_preset_applied', { preset: preset.id });
                  onChange({
                    finishId: preset.style.finishId,
                    benchtopId: preset.style.benchtopId,
                    handleId: preset.style.handleId,
                  });
                }}
                className={cn(
                  'text-left p-2.5 rounded-xl border-2 transition-all',
                  active ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400 bg-white',
                )}
              >
                <div className="flex gap-1 mb-1.5">
                  <span className="w-4 h-4 rounded-full border border-slate-200" style={{ background: FINISH_OPTIONS.find(f => f.id === preset.style.finishId)?.hex }} />
                  <span className="w-4 h-4 rounded border border-slate-200" style={{ background: BENCHTOP_OPTIONS.find(b => b.id === preset.style.benchtopId)?.hex }} />
                </div>
                <p className="text-xs font-medium text-slate-900">{preset.name}</p>
                <p className="text-[10px] text-slate-400 leading-tight hidden sm:block">{preset.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Door colour */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Door Colour</Label>
          <span className="text-sm text-slate-500">{selectedFinish.name}</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {FINISH_OPTIONS.map(f => (
            <button
              key={f.id}
              title={f.name}
              onClick={() => onChange({ finishId: f.id })}
              className={cn(
                'w-9 h-9 rounded-full border-2 transition-all shadow-sm',
                state.finishId === f.id
                  ? 'border-slate-900 ring-2 ring-slate-900 ring-offset-2'
                  : 'border-slate-200 hover:border-slate-400',
              )}
              style={{ background: f.hex === '#fcfcfc' || f.hex === '#f4f4f4' ? '#e5e7eb' : f.hex }}
            />
          ))}
        </div>
      </div>

      {/* Benchtop */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Benchtop</Label>
          <span className="text-sm text-slate-500">{selectedBenchtop.name}</span>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {BENCHTOP_OPTIONS.map(b => (
            <button
              key={b.id}
              title={b.name}
              onClick={() => onChange({ benchtopId: b.id })}
              className={cn(
                'w-9 h-9 rounded-md border-2 transition-all shadow-sm',
                state.benchtopId === b.id
                  ? 'border-slate-900 ring-2 ring-slate-900 ring-offset-2'
                  : 'border-slate-200 hover:border-slate-400',
              )}
              style={{ background: b.hex }}
            />
          ))}
        </div>
      </div>

      {/* Handles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Handle Style</Label>
          <span className="text-sm text-slate-500">{selectedHandle.name}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {HANDLE_OPTIONS.map(h => (
            <button
              key={h.id}
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
  // Durable idempotency key: generated before the first submit attempt and
  // retained across retries so a lost response never creates two enquiries.
  const submissionKeyRef = useRef<string>(crypto.randomUUID());

  const brief = buildBrief(state);
  const activeSpec: KitchenSpec = {
    ...(state.design?.spec ?? defaultSpecFor(brief, state.roomShape)),
    style: { finishId: state.finishId, benchtopId: state.benchtopId, handleId: state.handleId },
  };
  const compiled = compileSpec(activeSpec, brief.room);
  const items = compiled.items;
  const buildNotes: string[] = Array.from(new Set<string>([
    ...compiled.notes,
    ...validate(compiled, brief.room, brief)
      .filter(v => v.severity === 'warn')
      .map(v => v.message),
  ]));
  const band = useWizardPricing(items, activeSpec.style);

  const roomDepthForScene = state.roomShape === 'single-wall'
    ? state.roomWidth * 0.7
    : state.roomDepth;

  const room3D: RoomConfig = {
    width: state.roomWidth,
    depth: roomDepthForScene,
    height: 2700,
    shape: (state.roomShape === 'single-wall' || state.roomShape === 'galley')
      ? 'Rectangle' : 'LShape' as RoomShape,
    cutoutWidth: Math.round(state.roomWidth * 0.5),
    cutoutDepth: Math.round(roomDepthForScene * 0.5),
  };

  const low = band.lowAud;
  const high = band.highAud;
  const selectedFinish   = FINISH_OPTIONS.find(f => f.id === state.finishId)   ?? FINISH_OPTIONS[0];
  const selectedBenchtop = BENCHTOP_OPTIONS.find(b => b.id === state.benchtopId) ?? BENCHTOP_OPTIONS[0];
  const selectedHandle   = HANDLE_OPTIONS.find(h => h.id === state.handleId)   ?? HANDLE_OPTIONS[0];

  const handleSubmit = async () => {
    if (!state.contactName.trim() || !state.contactEmail.trim()) {
      toast.error('Please enter your name and email');
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
          height: 2700,
          shape: 'Rectangle' as const,
          cutoutWidth: 0,
          cutoutDepth: 0,
          openings: state.openings,
          services: state.services,
        },
        confidence: incoming?.confidence ?? {
          overall: 1,
          fields: {
            height: 'default' as const,
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
      // Never block the enquiry on scan validity — an invalid build is a bug,
      // logged and omitted rather than shipped as trusted geometry.
      const scanParse = confirmedRoomScanV1Schema.safeParse(scanCandidate);
      if (!scanParse.success) console.warn('[wizard] roomScan omitted:', scanParse.error.issues[0]);

      const designData = {
        wizardVersion: 2,
        roomShape: state.roomShape, roomWidth: state.roomWidth, roomDepth: state.roomDepth,
        layoutStyle: state.layoutStyle, finishId: state.finishId,
        benchtopId: state.benchtopId, handleId: state.handleId, items,
        openings: state.openings, services: state.services,
        spec: activeSpec,
        designName: state.design?.name ?? 'Standard layout',
        aiGenerated: state.design?.aiGenerated ?? false,
        priceBand: { low, high, source: band.isBomBacked ? 'bom' : 'estimator' },
        ...(scanParse.success ? { roomScan: scanParse.data } : {}),
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
            name: `${state.contactName} – Kitchen Enquiry`,
            notes: [
              `Contact: ${state.contactName}`,
              `Email: ${state.contactEmail}`,
              state.contactPhone ? `Phone: ${state.contactPhone}` : null,
              `Kitchen shape: ${state.roomShape}`,
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
      trackEvent('quote_requested', { shape: state.roomShape, layout: state.layoutStyle });

      // Fire admin alert email (non-blocking — don't fail the submission if email fails)
      supabase.functions.invoke('send-email', {
        body: {
          type: 'new_lead',
          payload: {
            contact_name: state.contactName,
            contact_email: state.contactEmail,
            contact_phone: state.contactPhone || undefined,
            room_shape: state.roomShape,
            room_count: 1,
            admin_url: `${window.location.origin}/admin/leads`,
          },
        },
      }).catch((e: unknown) => console.warn('[send-email] new_lead failed:', e));

      setSubmitted(true);
      toast.success("Quote request sent! We'll be in touch soon.");
    } catch (err) {
      console.error('Quote submission error:', err);
      toast.error('Something went wrong. Please try again or call us directly.');
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
        <h2 className="text-2xl font-bold text-slate-900">Thanks, {state.contactName.split(' ')[0]}!</h2>
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
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Your kitchen preview</h2>
          <p className="text-sm text-slate-500">
            {items.length} cabinets · {selectedFinish.name} · {selectedBenchtop.name}
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
              room={brief.room}
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

      {/* Estimate banner */}
      <div className="bg-slate-900 text-white rounded-xl p-4 sm:p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">Estimated supply & install</p>
          <p className="text-lg sm:text-2xl font-bold mt-0.5">
            ${low.toLocaleString()} – ${high.toLocaleString()}
            <span className="text-xs sm:text-sm font-normal text-slate-400 ml-1.5">AUD inc. GST</span>
          </p>
        </div>
        <p className="text-right text-xs text-slate-400 max-w-[130px] hidden sm:block">
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
              onChange={e => onChange({ contactName: e.target.value })} autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cemail">Email <span className="text-red-500">*</span></Label>
            <Input id="cemail" type="email" placeholder="jane@example.com" value={state.contactEmail}
              onChange={e => onChange({ contactEmail: e.target.value })} autoComplete="email" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cphone">Phone <span className="text-slate-400 font-normal">(optional)</span></Label>
            <Input id="cphone" type="tel" placeholder="04xx xxx xxx" value={state.contactPhone}
              onChange={e => onChange({ contactPhone: e.target.value })} autoComplete="tel" />
          </div>
        </div>
        <Button
          className="w-full bg-slate-900 hover:bg-slate-800 text-white h-11"
          disabled={submitting}
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

  // Initialise from URL params on first mount
  const [state, setState] = useState<WizardState>(() => ({
    step: 1,
    openings: [],
    services: [],
    priorities: [],
    dishwasher: true,
    fridgeWidthMm: 940,
    island: 'if-it-fits',
    design: null,
    doorsOpen: false,
    contactName: '', contactEmail: '', contactPhone: '',
    geometryEdits: 0,
    ...DEFAULTS,
    ...paramsToState(searchParams),
  }));

  const onChange = useCallback((patch: Partial<WizardState>) => {
    setState(prev => {
      // Any user change to dimensions/openings/services bumps the revision
      // counter so a previously confirmed capture cannot stay "confirmed"
      // (master plan §5.3). Handoff application (incomingScan) is exempt.
      const fromHandoff = 'incomingScan' in patch;
      const touchesGeometry =
        !fromHandoff &&
        (['roomWidth', 'roomDepth', 'openings', 'services'] as const).some(k => k in patch);
      return {
        ...prev,
        ...patch,
        geometryEdits: touchesGeometry ? prev.geometryEdits + 1 : prev.geometryEdits,
      };
    });
  }, []);

  // Track wizard start once on mount
  useEffect(() => {
    trackEvent('wizard_started');
  }, []);

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
            incomingScan: scan,
            roomWidth: scan.room.width,
            roomDepth: scan.room.depth,
            openings: scan.room.openings,
            services: scan.room.services,
          }
        : {
            ...(h.dimensions?.widthMm ? { roomWidth: h.dimensions.widthMm } : {}),
            ...(h.dimensions?.depthMm ? { roomDepth: h.dimensions.depthMm } : {}),
          }),
      ...(styleWords ? { styleWords } : {}),
    });
    if (scan) toast.success('Room scan loaded — please check the room details.');
  }, [handoffPayload, handoffId, handoffToken, onChange]);

  // Sync design state to URL whenever it changes (not contact info)
  useEffect(() => {
    const params = stateToParams(state);
    setSearchParams(params, { replace: true });
  }, [
    state.roomShape, state.roomWidth, state.roomDepth,
    state.layoutStyle, state.finishId, state.benchtopId, state.handleId,
    // intentionally omitting step / doorsOpen / contact fields
  ]);

  const canAdvance =
    state.step === 1 ? state.roomWidth >= 1200 :
    state.step === 2 ? true :
    state.step === 3 ? state.design !== null :
    state.step === 4 ? true : false;

  const advance = () => {
    if (state.step < 5) {
      trackEvent('step_complete', {
        step: state.step,
        shape: state.roomShape,
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
        <Link to="/" className="font-bold text-base sm:text-lg text-slate-900">Bower</Link>
        <span className="text-xs sm:text-sm text-slate-400">Kitchen Planner</span>
      </header>

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
        <StepIndicator current={state.step} />

        {state.step === 1 && <Step1Room state={state} onChange={onChange} />}
        {state.step === 2 && <StepCook value={state} onChange={p => onChange(p)} />}
        {state.step === 3 && (
          <StepDesign
            brief={buildBrief(state)}
            shape={state.roomShape}
            style={{ finishId: state.finishId, benchtopId: state.benchtopId, handleId: state.handleId }}
            design={state.design}
            onDesignChange={d => onChange({ design: d })}
            onRoomPatched={patch => onChange(patch)}
          />
        )}
        {state.step === 4 && <Step3Style state={state} onChange={onChange} />}
        {state.step === 5 && <Step4Review state={state} onChange={onChange} />}

        {/* Nav footer */}
        {state.step < 5 ? (
          <div className="flex items-center justify-between mt-8 sm:mt-10 pt-5 border-t border-slate-100">
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
                {state.step === 4 ? 'Review & price' : 'Continue'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <Button variant="ghost" onClick={back} className="gap-1 text-slate-500">
              <ChevronLeft className="w-4 h-4" /> Edit style
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
