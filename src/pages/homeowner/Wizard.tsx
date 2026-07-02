/**
 * R4: Homeowner Guided Wizard
 * Step-by-step flow: Room → Layout → Style → Review & Quote
 * No login required — consumer-facing lead capture.
 * URL state: design params synced to query string for sharing / bookmarking.
 */

import React, { useState, Suspense, useCallback, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import type { PlacedItem, RoomConfig, RoomShape } from '@/types';

// ─── Types ─────────────────────────────────────────────────────────────────────

type KitchenShape = 'single-wall' | 'l-shape' | 'u-shape' | 'galley';
type LayoutStyle  = 'minimal' | 'standard' | 'full-storage';

interface WizardState {
  step: 1 | 2 | 3 | 4;
  roomShape:   KitchenShape;
  roomWidth:   number;   // mm
  roomDepth:   number;   // mm
  layoutStyle: LayoutStyle;
  finishId:    string;
  benchtopId:  string;
  handleId:    string;
  doorsOpen:   boolean;
  contactName:  string;
  contactEmail: string;
  contactPhone: string;
}

const DEFAULTS: Omit<WizardState, 'step' | 'doorsOpen' | 'contactName' | 'contactEmail' | 'contactPhone'> = {
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

// ─── Auto-layout ───────────────────────────────────────────────────────────────

function generatePreviewItems(
  shape: KitchenShape,
  roomWidth: number,
  roomDepth: number,
  layoutStyle: LayoutStyle,
  finishId: string,
): PlacedItem[] {
  const BASE_HEIGHT = 730;
  const BASE_DEPTH  = 575;
  const CAB_WIDTH   = 600;
  const items: PlacedItem[] = [];
  let n = 1;

  const mkCab = (x: number, z: number, rot: number, def = 'base_1_door', w = CAB_WIDTH): PlacedItem => ({
    instanceId: `wiz-${n++}`,
    definitionId: def,
    itemType: 'Cabinet',
    cabinetNumber: `C${String(n - 1).padStart(2, '0')}`,
    x, y: 0, z, rotation: rot,
    width: w, height: BASE_HEIGHT, depth: BASE_DEPTH,
    finishColor: finishId,
  });

  const backZ  = -roomDepth / 2 + BASE_DEPTH / 2;
  const leftX  = -roomWidth / 2 + BASE_DEPTH / 2;
  const rightX =  roomWidth / 2 - BASE_DEPTH / 2;

  const backCount = Math.max(2, Math.floor(roomWidth / CAB_WIDTH));
  const backStartX = -((backCount - 1) * CAB_WIDTH) / 2;
  for (let i = 0; i < backCount; i++) {
    const def = backCount > 4 && i % 3 === 1 ? 'base_2_door' : 'base_1_door';
    items.push(mkCab(backStartX + i * CAB_WIDTH, backZ, 0, def));
  }

  if (shape === 'l-shape' || shape === 'u-shape') {
    const sLen = Math.floor((roomDepth - CAB_WIDTH) / CAB_WIDTH);
    const sStartZ = -roomDepth / 2 + CAB_WIDTH + BASE_DEPTH / 2;
    for (let i = 0; i < sLen; i++) items.push(mkCab(leftX, sStartZ + i * CAB_WIDTH, 90));
  }

  if (shape === 'u-shape') {
    const sLen = Math.floor((roomDepth - CAB_WIDTH) / CAB_WIDTH);
    const sStartZ = -roomDepth / 2 + CAB_WIDTH + BASE_DEPTH / 2;
    for (let i = 0; i < sLen; i++) items.push(mkCab(rightX, sStartZ + i * CAB_WIDTH, 270));
  }

  if (shape === 'galley') {
    const facingZ  = roomDepth / 2 - BASE_DEPTH / 2;
    const gCount   = Math.max(2, Math.floor((roomWidth * 0.6) / CAB_WIDTH));
    const gStartX  = -((gCount - 1) * CAB_WIDTH) / 2;
    for (let i = 0; i < gCount; i++) items.push(mkCab(gStartX + i * CAB_WIDTH, facingZ, 180));
  }

  if (layoutStyle === 'full-storage' && roomWidth >= 3600 && shape === 'single-wall') {
    items.push(mkCab(-CAB_WIDTH / 2, 200, 0, 'base_2_door', 1200));
  }

  return items;
}

// ─── Price estimate ─────────────────────────────────────────────────────────────

function estimatePrice(shape: KitchenShape, roomWidth: number, roomDepth: number, layoutStyle: LayoutStyle) {
  const CAB_WIDTH = 600;
  let lm = roomWidth / 1000;
  if (shape === 'l-shape')  lm += (roomDepth - 0.6) / 1000;
  if (shape === 'u-shape')  lm += 2 * (roomDepth - 0.6) / 1000;
  if (shape === 'galley')   lm += (roomWidth * 0.6) / 1000;
  lm = Math.round(lm / (CAB_WIDTH / 1000)) * (CAB_WIDTH / 1000);
  const mult = layoutStyle === 'minimal' ? 0.75 : layoutStyle === 'full-storage' ? 1.25 : 1.0;
  const base = lm * 2400 * mult;
  return {
    low: Math.round(base * 0.85 / 500) * 500,
    high: Math.round(base * 1.15 / 500) * 500,
    linearMetres: Math.round(lm * 10) / 10,
  };
}

// ─── Step indicator ─────────────────────────────────────────────────────────────

const STEPS = ['Room', 'Layout', 'Style', 'Review'];

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
  const { low, high, linearMetres } = estimatePrice(state.roomShape, state.roomWidth, state.roomDepth, state.layoutStyle);

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

  const items = generatePreviewItems(
    state.roomShape, state.roomWidth, state.roomDepth, state.layoutStyle, state.finishId,
  );

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

  const { low, high } = estimatePrice(state.roomShape, state.roomWidth, state.roomDepth, state.layoutStyle);
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
      const designData = {
        wizardVersion: 1,
        roomShape: state.roomShape, roomWidth: state.roomWidth, roomDepth: state.roomDepth,
        layoutStyle: state.layoutStyle, finishId: state.finishId,
        benchtopId: state.benchtopId, handleId: state.handleId, items,
      };
      const { data: inserted, error } = await supabase.from('jobs').insert([{
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
        design_data: designData as any,
        cost_excl_tax: (low + high) / 2 / 1.1,
        cost_incl_tax: (low + high) / 2,
        status: 'enquiry',
        delivery_method: 'pickup',
      }]).select('id').single();
      if (error) throw error;
      if (inserted?.id) setSubmittedJobId(inserted.id);
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
    doorsOpen: false,
    contactName: '', contactEmail: '', contactPhone: '',
    ...DEFAULTS,
    ...paramsToState(searchParams),
  }));

  const onChange = useCallback((patch: Partial<WizardState>) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  // Track wizard start once on mount
  useEffect(() => {
    trackEvent('wizard_started');
  }, []);

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
    state.step === 3 ? true : false;

  const advance = () => {
    if (state.step < 4) {
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

        {state.step === 1 && <Step1Room   state={state} onChange={onChange} />}
        {state.step === 2 && <Step2Layout state={state} onChange={onChange} />}
        {state.step === 3 && <Step3Style  state={state} onChange={onChange} />}
        {state.step === 4 && <Step4Review state={state} onChange={onChange} />}

        {/* Nav footer */}
        {state.step < 4 ? (
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
                {state.step === 3 ? 'Preview in 3D' : 'Continue'}
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
