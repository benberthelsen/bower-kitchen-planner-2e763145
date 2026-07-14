/**
 * RoomFeaturesEditor — top-down room diagram for placing doors, windows,
 * and service points (plumbing / power / gas) on walls.
 *
 * Interactions:
 * - Pick a feature chip, tap a wall → placed there (and selected).
 * - Tap any placed feature to select it; drag it along a wall — or onto a
 *   different wall — to move it.
 * - The selected feature gets a detail panel: distance from the left corner,
 *   width/height, window sill height, power-point height above the floor,
 *   door swing — plus a plain-English description of exactly where it sits.
 *
 * Shared by the homeowner wizard (Step 1) and the trade RoomSetupWizard.
 * Emits core `Opening[]` + `ServicePoint[]` (src/types.ts) — the same
 * RoomSpec the layout engine and AI designer consume.
 */

import React, { useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { Opening, ServicePoint, WallId } from '@/types';

type FeatureKind = Opening['type'] | ServicePoint['type'];

interface Props {
  /** room size in mm */
  widthMm: number;
  depthMm: number;
  openings: Opening[];
  services: ServicePoint[];
  onChange: (patch: { openings?: Opening[]; services?: ServicePoint[] }) => void;
  className?: string;
}

const OPENING_KINDS: { id: Opening['type']; label: string; color: string; defaults: Partial<Opening> }[] = [
  { id: 'door', label: 'Door', color: '#b45309', defaults: { widthMm: 870, heightMm: 2040, swing: 'in-left' } },
  { id: 'window', label: 'Window', color: '#0369a1', defaults: { widthMm: 1200, heightMm: 1200, sillHeightMm: 900 } },
  { id: 'walkway', label: 'Open walkway', color: '#a1a1aa', defaults: { widthMm: 1200 } },
];

const SERVICE_KINDS: { id: ServicePoint['type']; label: string; color: string; defaultHeight: number }[] = [
  { id: 'drain', label: 'Sink / drain', color: '#2563eb', defaultHeight: 400 },
  { id: 'water-supply', label: 'Water supply', color: '#0891b2', defaultHeight: 500 },
  { id: 'gpo', label: 'Power point', color: '#dc2626', defaultHeight: 300 },
  { id: 'gas', label: 'Gas point', color: '#ca8a04', defaultHeight: 250 },
  { id: 'hood-duct', label: 'Rangehood duct', color: '#7c3aed', defaultHeight: 2100 },
];

const WALL_LABELS: Record<WallId, string> = { N: 'back wall', E: 'right wall', S: 'front wall', W: 'left wall' };
const SWINGS: { id: NonNullable<Opening['swing']>; label: string }[] = [
  { id: 'in-left', label: 'Opens in, hinge left' },
  { id: 'in-right', label: 'Opens in, hinge right' },
  { id: 'out', label: 'Opens outward' },
  { id: 'slider', label: 'Sliding' },
];

let seq = 1;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${seq++}`;
const snap = (v: number, step = 10) => Math.round(v / step) * step;

const VIEW = 300;
const PAD = 34;

export function RoomFeaturesEditor({ widthMm, depthMm, openings, services, onChange, className }: Props) {
  const [mode, setMode] = useState<FeatureKind>('door');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dragRef = useRef<{ id: string; kind: 'opening' | 'service'; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const scale = (VIEW - PAD * 2) / Math.max(widthMm, depthMm);
  const rw = widthMm * scale;
  const rd = depthMm * scale;
  const x0 = (VIEW - rw) / 2;
  const y0 = (VIEW - rd) / 2;

  const wallLen = (wall: WallId) => (wall === 'N' || wall === 'S' ? widthMm : depthMm);
  const isOpeningKind = (k: FeatureKind): k is Opening['type'] =>
    k === 'door' || k === 'window' || k === 'walkway';

  const svgPoint = (e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      px: ((e.clientX - rect.left) / rect.width) * VIEW,
      py: ((e.clientY - rect.top) / rect.height) * VIEW,
    };
  };

  /** nearest wall + offset (mm from left corner facing the wall from inside) */
  const nearestWall = (px: number, py: number): { wall: WallId; offsetMm: number; dist: number } => {
    const cx = Math.max(x0, Math.min(x0 + rw, px));
    const cy = Math.max(y0, Math.min(y0 + rd, py));
    const cands: { wall: WallId; dist: number; offsetMm: number }[] = [
      { wall: 'N', dist: Math.abs(py - y0), offsetMm: (cx - x0) / scale },
      { wall: 'S', dist: Math.abs(py - (y0 + rd)), offsetMm: (x0 + rw - cx) / scale },
      { wall: 'W', dist: Math.abs(px - x0), offsetMm: (y0 + rd - cy) / scale },
      { wall: 'E', dist: Math.abs(px - (x0 + rw)), offsetMm: (cy - y0) / scale },
    ];
    return cands.sort((a, b) => a.dist - b.dist)[0];
  };

  // ── mutations ──
  const updateOpening = (id: string, patch: Partial<Opening>) =>
    onChange({ openings: openings.map(o => (o.id === id ? { ...o, ...patch } : o)) });
  const updateService = (id: string, patch: Partial<ServicePoint>) =>
    onChange({ services: services.map(s => (s.id === id ? { ...s, ...patch } : s)) });
  const removeFeature = (id: string) => {
    setSelectedId(cur => (cur === id ? null : cur));
    onChange({
      openings: openings.filter(o => o.id !== id),
      services: services.filter(s => s.id !== id),
    });
  };

  const addAt = (wall: WallId, offsetMm: number) => {
    if (isOpeningKind(mode)) {
      const kind = OPENING_KINDS.find(k => k.id === mode)!;
      const w = kind.defaults.widthMm ?? 900;
      const start = snap(Math.max(0, Math.min(wallLen(wall) - w, offsetMm - w / 2)));
      const opening: Opening = { id: nextId('op'), wall, type: mode, offsetMm: start, widthMm: w, ...kind.defaults };
      onChange({ openings: [...openings, opening] });
      setSelectedId(opening.id);
    } else {
      const kind = SERVICE_KINDS.find(k => k.id === mode)!;
      const service: ServicePoint = {
        id: nextId('sv'), wall, type: mode,
        offsetMm: snap(Math.max(0, Math.min(wallLen(wall), offsetMm))),
        heightMm: kind.defaultHeight,
      };
      onChange({ services: [...services, service] });
      setSelectedId(service.id);
    }
  };

  // ── drag to move (pointer events cover mouse + touch) ──
  const startDrag = (e: React.PointerEvent, id: string, kind: 'opening' | 'service') => {
    e.stopPropagation();
    dragRef.current = { id, kind, moved: false };
    setSelectedId(id);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.moved = true;
    const { px, py } = svgPoint(e);
    const hit = nearestWall(px, py);
    if (drag.kind === 'opening') {
      const o = openings.find(x => x.id === drag.id);
      if (!o) return;
      const start = snap(Math.max(0, Math.min(wallLen(hit.wall) - o.widthMm, hit.offsetMm - o.widthMm / 2)));
      updateOpening(drag.id, { wall: hit.wall, offsetMm: start });
    } else {
      updateService(drag.id, {
        wall: hit.wall,
        offsetMm: snap(Math.max(0, Math.min(wallLen(hit.wall), hit.offsetMm))),
      });
    }
  };

  const endDrag = () => { dragRef.current = null; };

  const onSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // features handle their own pointerdown (startDrag); this handles empty wall taps
    const { px, py } = svgPoint(e);
    const hit = nearestWall(px, py);
    if (hit.dist <= 14) {
      addAt(hit.wall, hit.offsetMm);
    } else {
      setSelectedId(null);
    }
  };

  // ── geometry for rendering ──
  const openingSeg = (o: Opening) => {
    const c = OPENING_KINDS.find(k => k.id === o.type)?.color ?? '#888';
    const w = o.widthMm * scale;
    const t = o.offsetMm * scale;
    switch (o.wall) {
      case 'N': return { x: x0 + t, y: y0 - 4, w, h: 8, color: c };
      case 'S': return { x: x0 + rw - t - w, y: y0 + rd - 4, w, h: 8, color: c };
      case 'W': return { x: x0 - 4, y: y0 + rd - t - w, w: 8, h: w, color: c };
      case 'E': return { x: x0 + rw - 4, y: y0 + t, w: 8, h: w, color: c };
    }
  };
  const serviceDot = (s: ServicePoint) => {
    const c = SERVICE_KINDS.find(k => k.id === s.type)?.color ?? '#888';
    const t = s.offsetMm * scale;
    switch (s.wall) {
      case 'N': return { cx: x0 + t, cy: y0, color: c };
      case 'S': return { cx: x0 + rw - t, cy: y0 + rd, color: c };
      case 'W': return { cx: x0, cy: y0 + rd - t, color: c };
      case 'E': return { cx: x0 + rw, cy: y0 + t, color: c };
    }
  };

  // ── descriptions ──
  const describeOpening = (o: Opening) => {
    const kind = OPENING_KINDS.find(k => k.id === o.type)!;
    let d = `${kind.label} on the ${WALL_LABELS[o.wall]} — left edge ${Math.round(o.offsetMm)}mm from the corner, ${Math.round(o.widthMm)}mm wide`;
    if (o.heightMm) d += ` × ${Math.round(o.heightMm)}mm high`;
    if (o.type === 'window' && o.sillHeightMm != null) d += `, sill ${Math.round(o.sillHeightMm)}mm above the floor`;
    if (o.type === 'door' && o.swing) d += ` · ${SWINGS.find(s => s.id === o.swing)?.label.toLowerCase()}`;
    return d;
  };
  const describeService = (s: ServicePoint) => {
    const kind = SERVICE_KINDS.find(k => k.id === s.type)!;
    let d = `${kind.label} on the ${WALL_LABELS[s.wall]} — ${Math.round(s.offsetMm)}mm from the corner`;
    if (s.heightMm != null) d += `, ${Math.round(s.heightMm)}mm above the floor`;
    return d;
  };

  const selOpening = openings.find(o => o.id === selectedId) ?? null;
  const selService = !selOpening ? services.find(s => s.id === selectedId) ?? null : null;

  const numField = (
    label: string, value: number | undefined, set: (v: number) => void,
    opts: { min?: number; max?: number; step?: number } = {},
  ) => (
    <div className="space-y-1">
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input
        type="number" inputMode="numeric"
        min={opts.min ?? 0} max={opts.max} step={opts.step ?? 10}
        value={value ?? ''}
        onChange={e => set(Number(e.target.value))}
        className="h-8 text-sm"
      />
    </div>
  );

  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <p className="text-sm font-medium text-slate-900">Doors, windows &amp; connections</p>
        <p className="text-xs text-slate-500">
          Pick a feature and tap the wall where it sits — then drag it to fine-tune, or tap it to
          edit exact measurements. This keeps the sink near your plumbing and doorways clear.
        </p>
      </div>

      {/* mode picker */}
      <div className="flex flex-wrap gap-1.5">
        {[...OPENING_KINDS, ...SERVICE_KINDS].map(k => (
          <button
            key={k.id}
            type="button"
            onClick={() => setMode(k.id as FeatureKind)}
            className={cn(
              'px-2.5 py-1 rounded-full border text-xs flex items-center gap-1.5 transition-colors',
              mode === k.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-600 hover:border-slate-400',
            )}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: (k as { color: string }).color }} />
            {k.label}
          </button>
        ))}
      </div>

      {/* diagram */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="w-full max-w-sm mx-auto touch-none cursor-crosshair select-none rounded-lg border border-slate-200 bg-slate-50"
        onPointerDown={onSvgPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        role="application"
        aria-label="Room diagram — tap a wall to add the selected feature; drag features to move them"
      >
        <rect x={x0} y={y0} width={rw} height={rd} fill="white" stroke="#0f172a" strokeWidth={3} />
        <text x={VIEW / 2} y={y0 - 12} textAnchor="middle" fontSize={10} fill="#64748b">
          Back · {(widthMm / 1000).toFixed(1)}m
        </text>
        <text x={VIEW / 2} y={y0 + rd + 18} textAnchor="middle" fontSize={10} fill="#94a3b8">Front</text>
        <text x={x0 - 12} y={VIEW / 2} textAnchor="middle" fontSize={10} fill="#94a3b8" transform={`rotate(-90 ${x0 - 12} ${VIEW / 2})`}>
          Left · {(depthMm / 1000).toFixed(1)}m
        </text>

        {openings.map(o => {
          const seg = openingSeg(o);
          const active = o.id === selectedId;
          return (
            <g key={o.id} onPointerDown={e => startDrag(e, o.id, 'opening')} className="cursor-grab">
              {/* generous invisible hit area */}
              <rect x={seg.x - 6} y={seg.y - 6} width={seg.w + 12} height={seg.h + 12} fill="transparent" />
              <rect
                x={seg.x} y={seg.y} width={seg.w} height={seg.h} rx={2}
                fill={seg.color}
                stroke={active ? '#0f172a' : 'white'}
                strokeWidth={active ? 2 : 0.5}
              />
            </g>
          );
        })}
        {services.map(s => {
          const d = serviceDot(s);
          const active = s.id === selectedId;
          return (
            <g key={s.id} onPointerDown={e => startDrag(e, s.id, 'service')} className="cursor-grab">
              <circle cx={d.cx} cy={d.cy} r={13} fill="transparent" />
              <circle
                cx={d.cx} cy={d.cy} r={active ? 8 : 6}
                fill={d.color} stroke={active ? '#0f172a' : 'white'} strokeWidth={active ? 2 : 1.5}
              />
            </g>
          );
        })}
      </svg>

      {/* detail panel for the selected feature */}
      {(selOpening || selService) && (
        <div className="rounded-xl border-2 border-slate-900 bg-white p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-slate-600 leading-snug">
              {selOpening ? describeOpening(selOpening) : describeService(selService!)}
            </p>
            <button type="button" onClick={() => setSelectedId(null)} className="text-slate-300 hover:text-slate-600 flex-shrink-0" aria-label="Close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {selOpening && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {numField('From left corner (mm)', selOpening.offsetMm,
                  v => updateOpening(selOpening.id, { offsetMm: Math.max(0, Math.min(wallLen(selOpening.wall) - selOpening.widthMm, v)) }),
                  { max: wallLen(selOpening.wall), step: 10 })}
                {numField('Width (mm)', selOpening.widthMm,
                  v => updateOpening(selOpening.id, { widthMm: Math.max(200, v) }), { min: 200, step: 10 })}
                {selOpening.type !== 'walkway' && numField('Height (mm)', selOpening.heightMm,
                  v => updateOpening(selOpening.id, { heightMm: Math.max(200, v) }), { min: 200, step: 10 })}
                {selOpening.type === 'window' && numField('Sill height (mm)', selOpening.sillHeightMm,
                  v => updateOpening(selOpening.id, { sillHeightMm: Math.max(0, v) }), { step: 10 })}
              </div>
              {selOpening.type === 'door' && (
                <div className="flex flex-wrap gap-1.5">
                  {SWINGS.map(sw => (
                    <button
                      key={sw.id}
                      type="button"
                      onClick={() => updateOpening(selOpening.id, { swing: sw.id })}
                      className={cn(
                        'px-2 py-1 rounded-full border text-[11px] transition-colors',
                        selOpening.swing === sw.id ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 text-slate-500 hover:border-slate-400',
                      )}
                    >
                      {sw.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {selService && (
            <div className="grid grid-cols-2 gap-2.5">
              {numField('From left corner (mm)', selService.offsetMm,
                v => updateService(selService.id, { offsetMm: Math.max(0, Math.min(wallLen(selService.wall), v)) }),
                { max: wallLen(selService.wall), step: 10 })}
              {numField('Height above floor (mm)', selService.heightMm,
                v => updateService(selService.id, { heightMm: Math.max(0, Math.min(2400, v)) }), { max: 2400, step: 10 })}
            </div>
          )}

          <Button
            type="button" variant="ghost" size="sm"
            className="h-7 text-xs text-red-500 hover:text-red-600 px-2"
            onClick={() => removeFeature(selectedId!)}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Remove
          </Button>
        </div>
      )}

      {/* summary list */}
      {(openings.length > 0 || services.length > 0) ? (
        <div className="space-y-1">
          {[...openings.map(o => ({ id: o.id, text: describeOpening(o), color: OPENING_KINDS.find(k => k.id === o.type)?.color })),
            ...services.map(s => ({ id: s.id, text: describeService(s), color: SERVICE_KINDS.find(k => k.id === s.type)?.color }))]
            .map(row => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSelectedId(row.id)}
                className={cn(
                  'w-full text-left flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 border transition-colors',
                  row.id === selectedId ? 'border-slate-900 bg-slate-50' : 'border-slate-200 bg-white hover:border-slate-400',
                )}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: row.color }} />
                <span className="text-slate-600 leading-snug">{row.text}</span>
              </button>
            ))}
        </div>
      ) : (
        <p className="text-xs text-center text-slate-400 py-1">
          Nothing added yet — tap a wall above to place your first door, window or connection.
        </p>
      )}

      <Button
        type="button" variant="ghost" size="sm"
        className="text-xs text-slate-400 h-7"
        onClick={() => { setSelectedId(null); onChange({ openings: [], services: [] }); }}
        disabled={openings.length === 0 && services.length === 0}
      >
        Clear all
      </Button>
    </div>
  );
}

export default RoomFeaturesEditor;
