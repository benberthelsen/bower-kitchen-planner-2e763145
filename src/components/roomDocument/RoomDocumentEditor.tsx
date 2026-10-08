import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { wallEvidenceAppearance, wallGeometrySource } from '@/lib/roomDocument/wallEvidenceAppearance';
import { wallEditForPlanClick, type WallConnection } from './roomPlanPlacement';
import './RoomDocumentEditor.css';
import {
  applyRoomEdit,
  footprintCorners,
  objectPose,
  wallGeometry,
  type RoomDocumentV1,
  type RoomEdit,
  type RoomOpening,
  type RoomObject,
  type RoomPlacement,
  type RoomIssue,
  type RoomService,
  type RoomWall,
  type RoomPoint,
  type DimensionSource,
} from '@/lib/roomDocument';

interface Props {
  document: RoomDocumentV1;
  onChange: (document: RoomDocumentV1) => void;
  className?: string;
}

const SIZE = 440;
const PAD = 42;
const round = (value: number) => Math.round(value);
const pretty = (value: number) => Number.isFinite(value) ? round(value).toString() : '—';
const normaliseAngle = (angle: number) => ((angle + 180) % 360 + 360) % 360 - 180;
const evidenceSources: DimensionSource[] = ['measured', 'observed', 'inferred', 'unknown'];
const SERVICE_LABELS: Record<string, string> = { 'water-supply': 'Water', drain: 'Waste', gpo: 'Power point', gas: 'Gas',
  'hood-duct': 'Rangehood duct', light: 'Light', fan: 'Fan', door: 'Door', window: 'Window', walkway: 'Opening' };
const plainKind = (kind: string) => SERVICE_LABELS[kind] ?? kind;
const plainEvidence = (id: string) => /^photo:(\d{4})$/.test(id) ? `Seen in photo ${Number(id.slice(6)) + 1}` : id;

function NumberField({ id, label, value, onCommit, min, max, step = 1, disabled = false }: {
  id: string;
  label: string;
  value: number | undefined;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const roundedValue = value === undefined ? undefined : round(value * 10) / 10;
  const displayed = draft ?? (roundedValue === undefined ? '' : String(roundedValue));
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    if (!disabled && draft.trim() && Number.isFinite(parsed) && (min === undefined || parsed >= min) && (max === undefined || parsed <= max)
      && (roundedValue === undefined || parsed !== roundedValue)) onCommit(parsed);
    setDraft(null);
  };
  return <div className="space-y-1">
    <Label htmlFor={id} className="text-xs text-slate-600">{label}</Label>
    <Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} value={displayed}
      onFocus={() => setDraft(roundedValue === undefined ? '' : String(roundedValue))}
      onChange={event => setDraft(event.target.value)} onBlur={commit} disabled={disabled}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setDraft(null); }} />
  </div>;
}

/** The same wall editor is used by room setup and the trade planner. All edits
 * are applied to the authoritative millimetre document in one transaction. */
export default function RoomDocumentEditor({ document, onChange, className }: Props) {
  const [selectedWallId, setSelectedWallId] = useState<string | null>(document.walls[0]?.id ?? null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [past, setPast] = useState<RoomDocumentV1[]>([]);
  const [future, setFuture] = useState<RoomDocumentV1[]>([]);
  const [issues, setIssues] = useState<RoomIssue[]>([]);
  const [newLength, setNewLength] = useState(1200);
  const [newAngle, setNewAngle] = useState(0);
  const [newStartX, setNewStartX] = useState<number | null>(null);
  const [newStartZ, setNewStartZ] = useState<number | null>(null);
  const [splitOffsets, setSplitOffsets] = useState<Record<string, number>>({});
  const [addEnd, setAddEnd] = useState<'start' | 'end' | 'separate'>('end');
  const [planMode, setPlanMode] = useState<'select' | 'draw-walls' | 'floor-drain' | 'floor-gpo'>('select');
  const [pendingWallStart, setPendingWallStart] = useState<RoomPoint | null>(null);
  const [planMessage, setPlanMessage] = useState('');
  const [showOpenings, setShowOpenings] = useState(true);
  const [showObjects, setShowObjects] = useState(true);
  const [showServices, setShowServices] = useState(true);
  const [dragCorner, setDragCorner] = useState<{ id: string; xMm: number; zMm: number } | null>(null);
  const lastId = useRef(document.id);

  useEffect(() => {
    if (document.id !== lastId.current) {
      lastId.current = document.id;
      setPast([]); setFuture([]); setIssues([]);
      setSplitOffsets({});
      setNewStartX(null); setNewStartZ(null);
      setPlanMode('select'); setPendingWallStart(null); setPlanMessage('');
      setSelectedWallId(document.walls[0]?.id ?? null);
      setSelectedOpeningId(null);
      setSelectedServiceId(null);
      setSelectedObjectId(null);
    }
  }, [document.id, document.walls]);

  const wall = document.walls.find(candidate => candidate.id === selectedWallId) ?? document.walls[0];
  const geometry = wall ? wallGeometry(document, wall.id) : null;
  const chain = document.chains.find(candidate => candidate.wallIds.includes(wall?.id ?? '')) ?? document.chains[0];
  const selectedOpening = document.openings.find(opening => opening.id === selectedOpeningId);
  const selectedService = document.services.find(service => service.id === selectedServiceId);
  const selectedObject = document.objects.find(object => object.id === selectedObjectId);
  const chainIndex = chain?.wallIds.indexOf(wall?.id ?? '') ?? -1;
  const previousWall = chainIndex > 0 ? document.walls.find(candidate => candidate.id === chain!.wallIds[chainIndex - 1]) : undefined;
  const previousGeometry = previousWall ? wallGeometry(document, previousWall.id) : null;
  const cornerTurn = geometry && previousGeometry ? normaliseAngle(geometry.angleDeg - previousGeometry.angleDeg) : undefined;
  const splitOffset = wall && geometry
    ? Math.min(Math.max(1, round(splitOffsets[wall.id] ?? geometry.lengthMm / 2)), Math.max(1, round(geometry.lengthMm - 1)))
    : 1;
  const selectedJoinId = previousWall && wall
    ? [wall.startCornerId, wall.endCornerId].find(id => id === previousWall.startCornerId || id === previousWall.endCornerId)
    : undefined;

  const apply = (edit: RoomEdit): boolean => {
    const result = applyRoomEdit(document, edit);
    setIssues(result.issues);
    if (!result.applied) return false;
    setPast(previous => [...previous.slice(-49), result.previous]);
    setFuture([]);
    onChange(result.document);
    return true;
  };
  const undo = () => {
    if (!past.length) return;
    setFuture(next => [document, ...next]);
    onChange({ ...past[past.length - 1], revision: document.revision + 1 });
    setPast(previous => previous.slice(0, -1));
    setIssues([]);
  };
  const redo = () => {
    if (!future.length) return;
    setPast(previous => [...previous, document]);
    onChange({ ...future[0], revision: document.revision + 1 });
    setFuture(next => next.slice(1));
    setIssues([]);
  };

  const points = document.corners;
  const separateStart = {
    xMm: newStartX ?? (points.length ? Math.max(...points.map(point => point.xMm)) + 300 : 0),
    zMm: newStartZ ?? (points.length ? Math.min(...points.map(point => point.zMm)) : 0),
  };
  const bounds = useMemo(() => {
    const xs = points.map(point => point.xMm), zs = points.map(point => point.zMm);
    // Keep a useful six-metre drawing area even before the first wall exists.
    // Actual geometry expands the view when it extends beyond that area.
    const minX = Math.min(0, ...xs), maxX = Math.max(6000, ...xs);
    const minZ = Math.min(0, ...zs), maxZ = Math.max(6000, ...zs);
    const scale = (SIZE - PAD * 2) / Math.max(maxX - minX, maxZ - minZ, 1);
    return { minX, minZ, scale, xPad: (SIZE - (maxX - minX) * scale) / 2, zPad: (SIZE - (maxZ - minZ) * scale) / 2 };
  }, [points]);
  const px = (xMm: number) => bounds.xPad + (xMm - bounds.minX) * bounds.scale;
  const py = (zMm: number) => bounds.zPad + (zMm - bounds.minZ) * bounds.scale;
  const byId = (id: string) => dragCorner?.id === id ? dragCorner : document.corners.find(corner => corner.id === id);
  const pointOnPlan = (clientX: number, clientY: number, svg: SVGSVGElement | null) => {
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = (clientX - rect.left) * SIZE / rect.width;
    const z = (clientY - rect.top) * SIZE / rect.height;
    return {
      xMm: Math.round((bounds.minX + (x - bounds.xPad) / bounds.scale) / 10) * 10,
      zMm: Math.round((bounds.minZ + (z - bounds.zPad) / bounds.scale) / 10) * 10,
    };
  };
  const dragPoint = (event: React.PointerEvent<SVGCircleElement>) =>
    pointOnPlan(event.clientX, event.clientY, event.currentTarget.ownerSVGElement);

  const choosePlanMode = (mode: typeof planMode) => {
    setPlanMode(current => current === mode ? 'select' : mode);
    setPendingWallStart(null);
    setPlanMessage('');
  };
  const clickPlan = (event: React.MouseEvent<SVGRectElement>) => {
    if (planMode === 'select') return;
    const point = pointOnPlan(event.clientX, event.clientY, event.currentTarget.ownerSVGElement);
    if (!point) return;
    if (planMode === 'floor-drain' || planMode === 'floor-gpo') {
      const kind: RoomService['kind'] = planMode === 'floor-drain' ? 'drain' : 'gpo';
      const service: RoomService = {
        id: crypto.randomUUID(), kind,
        placement: { type: 'free', xMm: point.xMm, zMm: point.zMm, rotationDeg: 0 },
        heightMm: kind === 'drain' ? 0 : 300,
      };
      if (apply({ type: 'upsert-service', service })) {
        setSelectedServiceId(service.id);
        setSelectedOpeningId(null); setSelectedObjectId(null);
        setPlanMode('select'); setPlanMessage('');
      }
      return;
    }
    const wallId = crypto.randomUUID();
    const outcome = wallEditForPlanClick(document, wall?.id ?? null, addEnd as WallConnection,
      point, pendingWallStart, wallId);
    if (outcome.kind === 'error') { setPlanMessage(outcome.message); return; }
    if (outcome.kind === 'start') {
      setPendingWallStart(outcome.point);
      setPlanMessage('Tap again to place the wall endpoint.');
      return;
    }
    if (apply(outcome.edit)) {
      setSelectedWallId(wallId);
      setPendingWallStart(null);
      setAddEnd('end');
      setPlanMessage('Wall added. Tap again to continue this open wall run.');
    }
  };

  const makeOpening = (kind: RoomOpening['kind']) => {
    if (!wall || !geometry) return;
    const widthMm = Math.min(kind === 'window' ? 1200 : 870, geometry.lengthMm);
    const opening: RoomOpening = {
      id: crypto.randomUUID(), wallId: wall.id, kind,
      offsetMm: round((geometry.lengthMm - widthMm) / 2), widthMm,
      ...(kind !== 'walkway' ? { heightMm: kind === 'window' ? 1200 : 2040 } : {}),
      ...(kind === 'window' ? { sillHeightMm: 900 } : {}),
      ...(kind === 'door' ? { swing: 'in-left' as const } : {}),
    };
    apply({ type: 'upsert-opening', opening });
    setSelectedOpeningId(opening.id);
  };
  const changeOpening = (patch: Partial<RoomOpening>) => {
    if (selectedOpening) apply({ type: 'upsert-opening', opening: { ...selectedOpening, ...patch } });
  };
  const addService = (kind: RoomService['kind']) => {
    if (!wall || !geometry) return;
    const service: RoomService = { id: crypto.randomUUID(), kind, placement: { type: 'wall', wallId: wall.id, offsetMm: round(geometry.lengthMm / 2) }, heightMm: kind === 'hood-duct' ? 2100 : kind === 'gpo' ? 300 : 500 };
    apply({ type: 'upsert-service', service });
    setSelectedServiceId(service.id);
    setSelectedOpeningId(null);
  };
  const changeService = (patch: Partial<RoomService>) => {
    if (selectedService) apply({ type: 'upsert-service', service: { ...selectedService, ...patch } });
  };
  const changeFreeServicePlacement = (patch: Partial<Extract<RoomPlacement, { type: 'free' }>>) => {
    if (selectedService?.placement.type !== 'free') return;
    changeService({ placement: { ...selectedService.placement, ...patch } });
  };
  const addExistingObject = () => {
    if (!wall || !geometry) return;
    const widthMm = Math.min(600, geometry.lengthMm);
    const object: RoomObject = { id: crypto.randomUUID(), layer: 'existing', kind: 'cabinet', placement: { type: 'wall', wallId: wall.id, offsetMm: round((geometry.lengthMm - widthMm) / 2) }, widthMm, depthMm: 600, heightMm: 900, existingAction: 'keep', sizeLock: 'none' };
    apply({ type: 'upsert-object', object });
    setSelectedObjectId(object.id);
    setSelectedOpeningId(null);
    setSelectedServiceId(null);
  };
  const changeObject = (patch: Partial<RoomObject>) => {
    return selectedObject
      ? apply({ type: 'upsert-object', object: { ...selectedObject, ...patch } })
      : false;
  };
  const changeFreeObjectPlacement = (patch: Partial<Extract<RoomPlacement, { type: 'free' }>>) => {
    if (selectedObject?.placement.type !== 'free') return;
    changeObject({ placement: { ...selectedObject.placement, ...patch } });
  };
  const moveObjectToWall = (wallId: string) => {
    if (selectedObject?.placement.type !== 'wall') return;
    const previousWallId = selectedObject.placement.wallId;
    if (wallId === previousWallId) return;
    const destination = wallGeometry(document, wallId);
    if (!destination || destination.lengthMm < selectedObject.widthMm) return;
    const offsetMm = Math.min(selectedObject.placement.offsetMm, destination.lengthMm - selectedObject.widthMm);
    const applied = changeObject({
      placement: { ...selectedObject.placement, wallId, offsetMm },
      placementProvenance: {
        source: 'user-correction', previousWallId, correctedAt: new Date().toISOString(),
        note: `User reassigned ${selectedObject.kind} from wall ${previousWallId} to wall ${wallId} in the room editor.`,
      },
    });
    if (applied) setSelectedWallId(wallId);
  };
  const addWall = () => {
    const wallId = crypto.randomUUID();
    const edit: RoomEdit = document.walls.length && addEnd !== 'separate'
      ? { type: 'add-wall', wallId, chainId: chain?.id, end: addEnd, lengthMm: newLength, angleDeg: newAngle }
      : { type: 'add-wall', wallId, start: separateStart, lengthMm: newLength, angleDeg: newAngle };
    if (apply(edit)) setSelectedWallId(wallId);
  };
  const closeChain = () => { if (chain) apply({ type: 'close-chain', chainId: chain.id }); };
  const confirmBoundary = () => {
    if (!chain?.closed) return;
    const ordered = chain.wallIds.map(id => document.walls.find(candidate => candidate.id === id)?.startCornerId).filter((id): id is string => Boolean(id));
    apply({ type: 'set-floor-boundary', cornerIds: ordered });
  };

  const selectedWallLabel = wall ? `Wall ${document.walls.indexOf(wall) + 1}` : 'No wall selected';
  const selectedWallAppearance = wallEvidenceAppearance(wall
    ? wallGeometrySource(wall, Boolean(document.capture)) : undefined);
  return <section className={cn('room-document-editor min-w-0 w-full', className)} aria-label="Editable room plan" onKeyDown={event => {
    if (event.key === 'Escape' && planMode !== 'select') { setPlanMode('select'); setPendingWallStart(null); setPlanMessage(''); }
    if ((event.ctrlKey || event.metaKey) && !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName)) {
      if (event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if (event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    }
  }}>
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
      <div><h4 className="font-semibold text-trade-navy">Room walls</h4><p className="text-xs text-trade-muted">Select a wall or opening to edit it. Dimensions are millimetres.</p></div>
      <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={undo} disabled={!past.length}>Undo</Button><Button type="button" variant="outline" size="sm" onClick={redo} disabled={!future.length}>Redo</Button></div>
    </div>
    <div className="room-document-editor__body">
      <div className="min-w-0 space-y-3">
        {/* A scanned room arrives with its walls; drawing and floor tools are
            folded away so the wall lengths and inside faces come first. */}
        <details open={!document.capture} className="space-y-2"><summary className="cursor-pointer text-sm font-medium text-trade-navy">More wall tools</summary>
        <div className="flex flex-wrap gap-2" aria-label="Plan drawing tools">
          <Button type="button" size="sm" variant={planMode === 'draw-walls' ? 'default' : 'outline'} aria-pressed={planMode === 'draw-walls'}
            onClick={() => choosePlanMode('draw-walls')}>Draw walls on plan</Button>
          <Button type="button" size="sm" variant={planMode === 'floor-drain' ? 'default' : 'outline'} aria-pressed={planMode === 'floor-drain'}
            onClick={() => choosePlanMode('floor-drain')}>Place floor drain</Button>
          <Button type="button" size="sm" variant={planMode === 'floor-gpo' ? 'default' : 'outline'} aria-pressed={planMode === 'floor-gpo'}
            onClick={() => choosePlanMode('floor-gpo')}>Place floor power point</Button>
        </div>
        </details>
        {planMode !== 'select' && <p className="text-xs text-trade-navy" role="status">{planMessage || (planMode === 'draw-walls'
          ? !document.walls.length || addEnd === 'separate' ? 'Tap a start point, then an endpoint. Each later tap extends the open wall run.' : 'Tap the next endpoint to extend the selected open wall run.'
          : 'Tap the floor plan where this service is located. Press Escape to cancel.')}</p>}
        <div className="relative max-w-[480px]">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={cn('block aspect-square h-auto w-full rounded-lg border border-trade-border bg-slate-50 touch-none', planMode !== 'select' && 'cursor-crosshair')} aria-label="Room floor plan">
          <defs>{evidenceSources.map(source => {
            const appearance = wallEvidenceAppearance(source);
            return <marker key={source} id={`room-wall-arrow-${source}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M1 1 L7 4 L1 7" fill="none" stroke={appearance.planColor} strokeWidth="1.5" />
            </marker>;
          })}</defs>
          <rect x="0" y="0" width={SIZE} height={SIZE} fill="transparent" onClick={clickPlan} aria-hidden="true" />
          {document.floorBoundary && <polygon points={document.floorBoundary.cornerIds.map(id => byId(id)).filter((p): p is NonNullable<typeof p> => Boolean(p)).map(p => `${px(p.xMm)},${py(p.zMm)}`).join(' ')} fill="#d1fae5" fillOpacity="0.55" stroke="none" pointerEvents="none" />}
          {pendingWallStart && <circle cx={px(pendingWallStart.xMm)} cy={py(pendingWallStart.zMm)} r="6" fill="#0f766e" stroke="#fff" strokeWidth="2" pointerEvents="none" />}
          {document.walls.map((item, index) => {
            const a = byId(item.startCornerId), b = byId(item.endCornerId);
            if (!a || !b) return null;
            const selected = item.id === wall?.id;
            const source = wallGeometrySource(item, Boolean(document.capture));
            const lengthMeasured = item.lengthEvidence?.source === 'measured';
            const shownLengthMm = lengthMeasured ? item.lengthEvidence!.valueMm
              : Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm);
            const appearance = wallEvidenceAppearance(source);
            const mx = (px(a.xMm) + px(b.xMm)) / 2, my = (py(a.zMm) + py(b.zMm)) / 2;
            return <g key={item.id} role="button" tabIndex={0}
              aria-label={`Select wall ${index + 1}, ${appearance.note}`} aria-pressed={selected}
              onClick={() => { setSelectedWallId(item.id); setSelectedOpeningId(null); setSelectedServiceId(null); setSelectedObjectId(null); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedWallId(item.id); setSelectedOpeningId(null); setSelectedServiceId(null); setSelectedObjectId(null); } }} className="cursor-pointer">
              <title>{appearance.note}</title>
              <line x1={px(a.xMm)} y1={py(a.zMm)} x2={px(b.xMm)} y2={py(b.zMm)} stroke="transparent" strokeWidth="24" />
              <line x1={px(a.xMm)} y1={py(a.zMm)} x2={px(b.xMm)} y2={py(b.zMm)} stroke={appearance.planColor}
                strokeWidth={selected ? 5 : 3} strokeDasharray={appearance.planDasharray} strokeLinecap="round"
                markerEnd={selected ? `url(#room-wall-arrow-${source})` : undefined} />
              <circle cx={px(a.xMm)} cy={py(a.zMm)} r="4" fill="#fff" stroke={appearance.planColor} strokeWidth="2" />
              <text x={mx} y={my - 9} textAnchor="middle" paintOrder="stroke" stroke="#f8fafc" strokeWidth="5"
                fill={appearance.planColor} fontSize="12" fontWeight="600">
                {index + 1} · {lengthMeasured ? '' : '~'}{pretty(shownLengthMm)} mm
              </text>
            </g>;
          })}
          {document.corners.map(corner => {
            const point = byId(corner.id)!;
            return <circle key={corner.id} cx={px(point.xMm)} cy={py(point.zMm)} r="8" fill="#fff" stroke="#047857" strokeWidth="2"
              role="button" tabIndex={0} aria-label="Drag room corner" className="cursor-move"
              onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setDragCorner({ ...corner }); }}
              onPointerMove={event => { if (!dragCorner || dragCorner.id !== corner.id) return; const next = dragPoint(event); if (next) setDragCorner({ id: corner.id, ...next }); }}
              onPointerUp={event => { if (!dragCorner || dragCorner.id !== corner.id) return; const next = dragPoint(event); setDragCorner(null); if (next && (next.xMm !== corner.xMm || next.zMm !== corner.zMm)) apply({ type: 'move-corner', cornerId: corner.id, ...next }); }}
              onPointerCancel={() => setDragCorner(null)} />;
          })}
          {showOpenings && document.openings.map(opening => {
            const g = wallGeometry(document, opening.wallId);
            if (!g) return null;
            const t0 = opening.offsetMm / g.lengthMm, t1 = (opening.offsetMm + opening.widthMm) / g.lengthMm;
            const x1 = px(g.start.xMm + (g.end.xMm - g.start.xMm) * t0), y1 = py(g.start.zMm + (g.end.zMm - g.start.zMm) * t0);
            const x2 = px(g.start.xMm + (g.end.xMm - g.start.xMm) * t1), y2 = py(g.start.zMm + (g.end.zMm - g.start.zMm) * t1);
            return <g key={opening.id} role="button" tabIndex={0} aria-label={`Edit ${opening.kind}`} aria-pressed={selectedOpeningId === opening.id}
              onClick={() => { setSelectedOpeningId(opening.id); setSelectedServiceId(null); setSelectedObjectId(null); setSelectedWallId(opening.wallId); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedOpeningId(opening.id); setSelectedServiceId(null); setSelectedObjectId(null); setSelectedWallId(opening.wallId); } }} className="cursor-pointer">
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="24" />
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={opening.kind === 'window' ? '#0284c7' : '#d97706'} strokeWidth="9" strokeDasharray={opening.kind === 'window' ? undefined : '8 3'} />
            </g>;
          })}
          {showObjects && document.objects.map(object => {
            const pose = objectPose(document, object);
            if (!pose) return null;
            const corners = footprintCorners(pose, object.widthMm, object.depthMm);
            return <g key={object.id} role="button" tabIndex={0} aria-label={`Edit ${object.layer} ${object.kind}`} aria-pressed={selectedObjectId === object.id}
              onClick={() => { setSelectedObjectId(object.id); setSelectedOpeningId(null); setSelectedServiceId(null); if (object.placement.type === 'wall') setSelectedWallId(object.placement.wallId); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedObjectId(object.id); setSelectedOpeningId(null); setSelectedServiceId(null); if (object.placement.type === 'wall') setSelectedWallId(object.placement.wallId); } }} className="cursor-pointer">
              <polygon points={corners.map(point => `${px(point.xMm)},${py(point.zMm)}`).join(' ')} fill={object.layer === 'existing' ? '#a78bfa' : '#14b8a6'} fillOpacity="0.42" stroke={selectedObjectId === object.id ? '#0f172a' : '#64748b'} strokeWidth="2" />
              <text x={px(pose.xMm)} y={py(pose.zMm)} textAnchor="middle" fontSize="10" fill="#0f172a">{object.kind}</text>
            </g>;
          })}
          {showServices && document.services.map(service => {
            let xMm: number, zMm: number;
            if (service.placement.type === 'free') {
              xMm = service.placement.xMm; zMm = service.placement.zMm;
            } else {
              const g = wallGeometry(document, service.placement.wallId);
              if (!g) return null;
              const t = service.placement.offsetMm / g.lengthMm;
              xMm = g.start.xMm + (g.end.xMm - g.start.xMm) * t;
              zMm = g.start.zMm + (g.end.zMm - g.start.zMm) * t;
            }
            return <g key={service.id} role="button" tabIndex={0} aria-label={`Edit ${service.kind}`} aria-pressed={selectedServiceId === service.id}
              onClick={() => { setSelectedServiceId(service.id); setSelectedOpeningId(null); setSelectedObjectId(null); if (service.placement.type === 'wall') setSelectedWallId(service.placement.wallId); }}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedServiceId(service.id); setSelectedOpeningId(null); setSelectedObjectId(null); if (service.placement.type === 'wall') setSelectedWallId(service.placement.wallId); } }}>
              <circle cx={px(xMm)} cy={py(zMm)} r="10" fill="transparent" />
              <circle cx={px(xMm)} cy={py(zMm)} r="5" fill="#e11d48" />
            </g>;
          })}
        </svg>
        {selectedJoinId && cornerTurn !== undefined && byId(selectedJoinId) && <div
          className="absolute z-10 w-24 rounded-md border border-emerald-700 bg-white/95 p-2 shadow-sm"
          style={{ left: `${Math.max(2, Math.min(65, px(byId(selectedJoinId)!.xMm) / SIZE * 100))}%`,
            top: `${Math.max(2, Math.min(72, py(byId(selectedJoinId)!.zMm) / SIZE * 100))}%` }}>
          <NumberField id="plan-corner-turn" label="Turn (°)" value={cornerTurn} min={-180} max={180}
            onCommit={turn => apply({ type: 'set-wall-angle', wallId: wall!.id, angleDeg: normaliseAngle(previousGeometry!.angleDeg + turn) })} />
        </div>}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-700" aria-label="Wall outline evidence legend">
          {evidenceSources.map(source => {
            const appearance = wallEvidenceAppearance(source);
            return <span key={source} className="inline-flex items-center gap-1">
              <svg width="24" height="8" aria-hidden="true"><line x1="1" y1="4" x2="23" y2="4" stroke={appearance.planColor}
                strokeWidth="3" strokeDasharray={appearance.planDasharray} /></svg>{appearance.label}
            </span>;
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <label><input type="checkbox" checked={showOpenings} onChange={event => setShowOpenings(event.target.checked)} /> Openings</label>
          <label><input type="checkbox" checked={showObjects} onChange={event => setShowObjects(event.target.checked)} /> Existing / proposed</label>
          <label><input type="checkbox" checked={showServices} onChange={event => setShowServices(event.target.checked)} /> Services</label>
        </div>
        {!!document.pendingPhotoFeatures?.length && <section className="rounded-lg border border-amber-300 bg-amber-50 p-3" aria-label="Photo observations needing review">
          <h5 className="font-semibold text-amber-950">Seen in photos · needs placement/size</h5>
          <p className="mt-1 text-xs text-amber-900">These are observations only. They are not placed doors, windows, services or objects, and do not affect cabinet clearances.</p>
          <ul className="mt-2 space-y-2 text-sm">
            {document.pendingPhotoFeatures.map(feature => {
              const wallIndex = feature.wallId ? document.walls.findIndex(item => item.id === feature.wallId) : -1;
              const wallLabel = wallIndex >= 0 ? `Wall ${wallIndex + 1} · ${feature.wallId}`
                : feature.sourceWallId ? `Source wall ${feature.sourceWallId} · not matched to this plan`
                  : 'Wall not identified';
              return <li key={feature.id} className="rounded border border-amber-200 bg-white p-2">
                <span className="font-medium text-trade-navy">{feature.label}</span>
                <span className="block text-xs text-slate-600">{plainKind(feature.kind)} · {wallLabel}</span>
                <span className="block text-xs text-slate-600">{feature.evidenceIds.length ? feature.evidenceIds.map(plainEvidence).join(', ') : 'Seen in the scan photos'}</span>
              </li>;
            })}
          </ul>
        </section>}
        {!document.floorBoundary && <p className="text-xs text-amber-800">
          {document.chains.some(item => !item.closed)
            ? 'This wall survey is open. Missing walls and the floor area remain unconfirmed.'
            : 'This outline is provisional. The floor area remains unconfirmed.'}
        </p>}
      </div>
      <div className="min-w-0 space-y-4">
        {wall && geometry && <div className="rounded-lg border border-trade-border p-3 space-y-3">
          <h5 className="font-semibold text-trade-navy">{selectedWallLabel}</h5>
          <div className="grid grid-cols-2 gap-2">
            <NumberField id="wall-length" label="Wall length (mm)" value={geometry.lengthMm} min={1} onCommit={lengthMm => apply({ type: 'set-wall-length', wallId: wall.id, lengthMm })} />
            <NumberField id="wall-angle" label="Direction (degrees)" value={geometry.angleDeg} min={-360} max={360} onCommit={angleDeg => apply({ type: 'set-wall-angle', wallId: wall.id, angleDeg })} />
            {cornerTurn !== undefined && <NumberField id="wall-corner" label="Turn from prior wall (degrees)" value={cornerTurn} min={-180} max={180} onCommit={turn => apply({ type: 'set-wall-angle', wallId: wall.id, angleDeg: normaliseAngle(previousGeometry!.angleDeg + turn) })} />}
            <NumberField id="wall-height" label="Wall height (mm)" value={wall.height?.valueMm} min={1} onCommit={heightMm => apply({ type: 'set-wall-height', wallId: wall.id, heightMm })} />
          </div>
          <div className="space-y-1"><Label htmlFor="wall-interior-side" className="text-xs">Which side faces into the room?</Label>
            <select id="wall-interior-side" className="w-full border rounded px-2 py-2 text-sm" value={wall.interiorSide ?? 'unknown'}
              onChange={event => apply({ type: 'set-wall-interior-side', wallId: wall.id, side: event.target.value as 'left' | 'right' | 'unknown' })}>
              <option value="unknown">Needs review</option><option value="left">Left of wall direction</option><option value="right">Right of wall direction</option>
            </select>
            <p className="text-xs text-trade-muted">Cabinet suggestions need the room-facing side. Check the photo before choosing.</p>
          </div>
          <p className="text-xs font-medium" style={{ color: selectedWallAppearance.planColor }}>
            Wall outline: {selectedWallAppearance.note}
            {wall.geometryEvidence?.uncertaintyMm !== undefined ? ` · ±${wall.geometryEvidence.uncertaintyMm} mm` : ''}
          </p>
          <p className="text-xs text-slate-600">Length: {wallEvidenceAppearance(wall.lengthEvidence?.source).label}
            {wall.lengthEvidence?.uncertaintyMm !== undefined ? ` · ±${wall.lengthEvidence.uncertaintyMm} mm` : ''}</p>
          {wall.geometryEvidence?.reason && <p className="text-xs text-slate-600">{wall.geometryEvidence.reason}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => apply({ type: 'set-wall-length', wallId: wall.id, lengthMm: geometry.lengthMm, measurement: { valueMm: geometry.lengthMm, source: 'measured' } })}>Mark length site measured</Button>
            {wall.lengthEvidence?.source === 'measured' && <Button type="button" size="sm" variant="outline" onClick={() => apply({ type: 'set-wall-length', wallId: wall.id, lengthMm: geometry.lengthMm })}>Clear measured status</Button>}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <NumberField id="wall-split-offset" label="Split from wall start (mm)" value={splitOffset}
              min={1} max={Math.max(1, geometry.lengthMm - 1)}
              onCommit={offsetMm => setSplitOffsets(previous => ({ ...previous, [wall.id]: round(offsetMm) }))} />
            <Button type="button" size="sm" variant="outline" disabled={geometry.lengthMm < 2}
              onClick={() => apply({ type: 'split-wall', wallId: wall.id, offsetMm: splitOffset })}>Split wall</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => apply({ type: 'delete-wall', wallId: wall.id })}>Delete wall</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => makeOpening('door')}>Add door</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => makeOpening('window')}>Add window</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => makeOpening('walkway')}>Add opening</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['water-supply', 'drain', 'gpo', 'gas', 'hood-duct', 'light', 'fan'] as const).map(kind =>
              <Button key={kind} type="button" size="sm" variant="outline" onClick={() => addService(kind)}>+ {plainKind(kind)}</Button>)}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addExistingObject}>Add existing item</Button>
        </div>}
        {selectedOpening && <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-3">
          <h5 className="font-semibold text-trade-navy">{selectedOpening.kind} on {selectedWallLabel}</h5>
          <div className="grid grid-cols-2 gap-2">
            <NumberField id="opening-offset" label="From wall start (mm)" value={selectedOpening.offsetMm} min={0} onCommit={offsetMm => changeOpening({ offsetMm })} />
            <NumberField id="opening-width" label="Width (mm)" value={selectedOpening.widthMm} min={1} onCommit={widthMm => changeOpening({ widthMm })} />
            <NumberField id="opening-height" label="Height (mm)" value={selectedOpening.heightMm} min={1} onCommit={heightMm => changeOpening({ heightMm })} />
            <NumberField id="opening-sill" label="Sill above floor (mm)" value={selectedOpening.sillHeightMm} min={0} onCommit={sillHeightMm => changeOpening({ sillHeightMm })} />
            <NumberField id="opening-reveal" label="Reveal depth (mm)" value={selectedOpening.revealMm} min={0} onCommit={revealMm => changeOpening({ revealMm })} />
          </div>
          {selectedOpening.kind === 'door' && <div className="space-y-1"><Label htmlFor="opening-swing" className="text-xs">Door swing</Label><select id="opening-swing" className="w-full border rounded px-2 py-2 text-sm" value={selectedOpening.swing ?? 'in-left'} onChange={event => changeOpening({ swing: event.target.value as RoomOpening['swing'] })}><option value="in-left">In, hinge left</option><option value="in-right">In, hinge right</option><option value="out">Out</option><option value="slider">Sliding</option></select></div>}
          {selectedOpening.kind === 'window' && <div className="space-y-1"><Label htmlFor="window-bench-relation" className="text-xs">Window and benchtop</Label><select id="window-bench-relation" className="w-full border rounded px-2 py-2 text-sm" value={selectedOpening.benchtopRelationship ?? 'unknown'} onChange={event => changeOpening({ benchtopRelationship: event.target.value as RoomOpening['benchtopRelationship'] })}><option value="unknown">To check on site</option><option value="above">Benchtop below window</option><option value="behind">Benchtop runs behind reveal</option><option value="intersects">Benchtop crosses opening</option><option value="through-reveal">Benchtop runs into window reveal</option></select></div>}
          {selectedOpening.kind === 'window' && <div className="space-y-1"><Label htmlFor="window-bench-object" className="text-xs">Linked benchtop</Label><select id="window-bench-object" className="w-full border rounded px-2 py-2 text-sm" value={selectedOpening.benchtopObjectId ?? ''} onChange={event => changeOpening({ benchtopObjectId: event.target.value || undefined })}><option value="">Not linked</option>{document.objects.filter(object => /bench|counter/i.test(object.kind)).map(object => <option key={object.id} value={object.id}>{object.kind} · {object.id.slice(0, 8)}</option>)}</select></div>}
          <Button type="button" size="sm" variant="outline" onClick={() => { apply({ type: 'delete-opening', openingId: selectedOpening.id }); setSelectedOpeningId(null); }}>Remove opening</Button>
        </div>}
        {selectedService && <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-3">
          <h5 className="font-semibold text-trade-navy">{selectedService.kind}</h5>
          <div className="grid grid-cols-2 gap-2">
            {selectedService.placement.type === 'wall' && <NumberField id="service-offset" label="From wall start (mm)" value={selectedService.placement.offsetMm} min={0} onCommit={offsetMm => changeService({ placement: { type: 'wall', wallId: selectedService.placement.type === 'wall' ? selectedService.placement.wallId : wall?.id ?? '', offsetMm } })} />}
            {selectedService.placement.type === 'free' && <>
              <NumberField id="service-x" label="X on plan (mm)" value={selectedService.placement.xMm} onCommit={xMm => changeFreeServicePlacement({ xMm })} />
              <NumberField id="service-z" label="Z on plan (mm)" value={selectedService.placement.zMm} onCommit={zMm => changeFreeServicePlacement({ zMm })} />
            </>}
            <NumberField id="service-height" label="Height above floor (mm)" value={selectedService.heightMm} min={0} onCommit={heightMm => changeService({ heightMm })} />
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => { apply({ type: 'delete-service', serviceId: selectedService.id }); setSelectedServiceId(null); }}>Remove service</Button>
        </div>}
        {selectedObject && <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-3">
          <h5 className="font-semibold text-trade-navy">{selectedObject.layer} {selectedObject.kind}</h5>
          <p className="text-xs text-trade-muted">{selectedObject.catalogueId ? `Catalogue: ${selectedObject.catalogueId}` : 'No catalogue product linked'}</p>
          {selectedObject.placementProvenance && <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-950">
            Wall assignment corrected by the user{selectedObject.placementProvenance.previousWallId
              ? ` from ${selectedObject.placementProvenance.previousWallId}` : ''}.
            {' '}{selectedObject.placementProvenance.note}
          </p>}
          <div className="grid grid-cols-2 gap-2">
            <NumberField id="object-width" label="Width (mm)" value={selectedObject.widthMm} min={1} disabled={selectedObject.sizeLock === 'confirmed' || selectedObject.sizeLock === 'catalogue'} onCommit={widthMm => changeObject({ widthMm })} />
            <NumberField id="object-depth" label="Depth (mm)" value={selectedObject.depthMm} min={1} disabled={selectedObject.sizeLock === 'confirmed' || selectedObject.sizeLock === 'catalogue'} onCommit={depthMm => changeObject({ depthMm })} />
            <NumberField id="object-height" label="Height (mm)" value={selectedObject.heightMm} min={1} disabled={selectedObject.sizeLock === 'confirmed' || selectedObject.sizeLock === 'catalogue'} onCommit={heightMm => changeObject({ heightMm })} />
            {selectedObject.placement.type === 'wall' && <NumberField id="object-offset" label="From wall start (mm)" value={selectedObject.placement.offsetMm} min={0} onCommit={offsetMm => changeObject({ placement: { type: 'wall', wallId: selectedObject.placement.type === 'wall' ? selectedObject.placement.wallId : wall?.id ?? '', offsetMm } })} />}
            {selectedObject.placement.type === 'free' && <>
              <NumberField id="object-x" label="X on plan (mm)" value={selectedObject.placement.xMm} onCommit={xMm => changeFreeObjectPlacement({ xMm })} />
              <NumberField id="object-z" label="Z on plan (mm)" value={selectedObject.placement.zMm} onCommit={zMm => changeFreeObjectPlacement({ zMm })} />
              <NumberField id="object-rotation" label="Rotation (degrees)" value={selectedObject.placement.rotationDeg} onCommit={rotationDeg => changeFreeObjectPlacement({ rotationDeg })} />
            </>}
          </div>
          {selectedObject.placement.type === 'wall' && <div className="space-y-1">
            <Label htmlFor="object-wall" className="text-xs">Attached wall</Label>
            <select id="object-wall" className="w-full border rounded px-2 py-2 text-sm" value={selectedObject.placement.wallId}
              onChange={event => moveObjectToWall(event.target.value)}>
              {document.walls.filter(candidate => (wallGeometry(document, candidate.id)?.lengthMm ?? 0) >= selectedObject.widthMm)
                .map(candidate => <option key={candidate.id} value={candidate.id}>Wall {document.walls.indexOf(candidate) + 1}</option>)}
            </select>
          </div>}
          {selectedObject.layer === 'existing' && <div className="space-y-1"><Label htmlFor="existing-action" className="text-xs">Existing item</Label><select id="existing-action" className="w-full border rounded px-2 py-2 text-sm" value={selectedObject.existingAction ?? 'keep'} onChange={event => changeObject({ existingAction: event.target.value as RoomObject['existingAction'] })}><option value="keep">Keep</option><option value="remove">Remove</option><option value="relocate">Relocate</option></select></div>}
          <Button type="button" size="sm" variant="outline" onClick={() => { apply({ type: 'delete-object', objectId: selectedObject.id }); setSelectedObjectId(null); }}>Remove item from plan</Button>
        </div>}
        <details open={!document.capture} className="rounded-lg border border-trade-border p-3 space-y-3">
          <summary className="cursor-pointer font-semibold text-trade-navy">Add wall</summary>
          <div className="grid grid-cols-2 gap-2">
            <NumberField id="new-wall-length" label="Length (mm)" value={newLength} min={1} onCommit={setNewLength} />
            <NumberField id="new-wall-angle" label="Direction (degrees)" value={newAngle} min={-360} max={360} onCommit={setNewAngle} />
          </div>
          {document.walls.length > 0 && <div className="space-y-1"><Label htmlFor="add-end" className="text-xs">Wall connection</Label><select id="add-end" className="w-full border rounded px-2 py-2 text-sm" value={addEnd} onChange={event => setAddEnd(event.target.value as 'start' | 'end' | 'separate')}><option value="end">Join at chain end</option><option value="start">Join at chain start</option><option value="separate">Separate unconnected wall</option></select></div>}
          {(addEnd === 'separate' || !document.walls.length) && <div className="grid grid-cols-2 gap-2">
            <NumberField id="new-wall-start-x" label="Start X (mm)" value={separateStart.xMm} onCommit={setNewStartX} />
            <NumberField id="new-wall-start-z" label="Start Z (mm)" value={separateStart.zMm} onCommit={setNewStartZ} />
          </div>}
          <Button type="button" size="sm" onClick={addWall}>Add wall segment</Button>
          {chain && !chain.closed && chain.wallIds.length >= 2 && <Button type="button" size="sm" variant="outline" className="ml-2" onClick={closeChain}>Close outline</Button>}
          {chain?.closed && !document.floorBoundary && <Button type="button" size="sm" variant="outline" className="ml-2" onClick={confirmBoundary}>These walls are the whole room</Button>}
        </details>
      </div>
    </div>
    {issues.length > 0 && <div role="alert" className="mt-3 space-y-1">{issues.map((issue, index) => <p key={`${issue.code}-${index}`} className={issue.severity === 'error' ? 'text-sm text-red-700' : 'text-sm text-amber-700'}>{issue.message}</p>)}</div>}
  </section>;
}
