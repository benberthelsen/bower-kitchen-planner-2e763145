/** Preliminary wall-run suggestions for rooms with stable wall IDs. These do
 * not pass through the cardinal N/E/S/W KitchenSpec compiler. They reuse its
 * catalogue width solver and produce ordinary PlacedItems for the existing
 * cabinet renderer. Room-wide checks remain unresolved for open scans. */
import type { GlobalDimensions, Opening, PlacedItem } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import type { RoomDocumentV1, RoomObject, RoomPoint } from '@/lib/roomDocument';
import {
  confirmedFloorPolygon, footprintCorners, footprintInsideConfirmedFloor, footprintsIntersect,
  objectPose, placementPose, validateRoomDocument, wallGeometry,
} from '@/lib/roomDocument';
import { solveRun } from './solveRun';
import type { Run, SegmentRole, StyleSpec } from './types';
import type { Interval } from './geometry';

export interface RoomSuggestedItem {
  wallId: string;
  offsetMm: number;
  item: PlacedItem;
}

export interface RoomDocumentCandidate {
  candidateId: string;
  roomRevision: number;
  strategy: 'single-wall' | 'two-wall' | 'three-wall';
  wallIds: string[];
  items: RoomSuggestedItem[];
  /** A suggestion is preliminary until site dimensions and room-wide checks
   * have been reviewed. None of these messages are a priced design approval. */
  unresolved: string[];
  notes: string[];
  score: number;
}

export interface RoomDocumentCandidatePool {
  candidates: RoomDocumentCandidate[];
  rejected: { candidateId: string; reasons: string[] }[];
  capability: { supported: boolean; reasons: string[]; floorConfirmed: boolean };
  islandOption?: { items: PlacedItem[]; clearanceMm: number; baseCandidateId: string };
  islandReason?: string;
}

export interface GenerateRoomDocumentCandidatesInput {
  document: RoomDocumentV1;
  dimensions?: GlobalDimensions;
  style?: StyleSpec;
  allowedWallIds?: string[];
  maxCandidates?: number;
}

const SAFE_END_MM = 625; // base depth plus a modest scribe at an adjoining run
const MIN_RUN_MM = 600;
const DEFAULT_STYLE = { finishId: 'do-designer-white', handleId: 'handle-bar-ss' };
const isTall = (role: SegmentRole) => role === 'pantry' || role === 'oven-tower' || role === 'fridge-gap';
const verticalOverlap = (a: { bottom: number; top: number }, b: { bottom: number; top: number }) => a.bottom < b.top && b.bottom < a.top;

function planFootprint(item: PlacedItem): RoomPoint[] {
  return footprintCorners({ xMm: item.x, zMm: item.z, rotationDeg: item.rotation }, item.width, item.depth);
}

function islandFor(document: RoomDocumentV1, base: RoomDocumentCandidate, occupied: ReturnType<typeof occupiedFootprints>,
  dims: GlobalDimensions, style?: StyleSpec): RoomDocumentCandidatePool['islandOption'] | null {
  const floor = confirmedFloorPolygon(document);
  if (!floor) return null;
  const minX = Math.min(...floor.map(point => point.xMm)), maxX = Math.max(...floor.map(point => point.xMm));
  const minZ = Math.min(...floor.map(point => point.zMm)), maxZ = Math.max(...floor.map(point => point.zMm));
  const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
  const candidates: { x: number; z: number }[] = [];
  for (let x = Math.ceil(minX / 100) * 100; x <= maxX; x += 100)
    for (let z = Math.ceil(minZ / 100) * 100; z <= maxZ; z += 100) candidates.push({ x, z });
  candidates.sort((a, b) => Math.hypot(a.x - midX, a.z - midZ) - Math.hypot(b.x - midX, b.z - midZ)
    || a.x - b.x || a.z - b.z);
  const clearanceMm = 900;
  const obstacles = [
    ...occupied.filter(object => verticalOverlap(object, { bottom: 0, top: dims.baseHeight })).map(object => object.footprint),
    ...base.items.filter(({ item }) => item.y < dims.baseHeight).map(({ item }) => planFootprint(item)),
  ];
  for (const centre of candidates) {
    // The expanded footprint must remain in the real polygon, including any
    // concave recess. It also enforces 900mm circulation from every wall.
    const clearEnvelope = footprintCorners({ xMm: centre.x, zMm: centre.z, rotationDeg: 0 }, 1200 + clearanceMm * 2, 600 + clearanceMm * 2);
    if (footprintInsideConfirmedFloor(document, clearEnvelope).status !== 'inside') continue;
    if (obstacles.some(footprint => footprintsIntersect(clearEnvelope, footprint))) continue;
    const items = [-300, 300].map((dx, index): PlacedItem => ({
      instanceId: `${base.candidateId}:island:${index + 1}`,
      cabinetNumber: `I${index + 1}`,
      definitionId: 'base_2_door', itemType: 'Cabinet', layoutRole: 'island-storage',
      x: centre.x + dx, y: 0, z: centre.z, rotation: 0,
      width: 600, depth: 600, height: dims.baseHeight,
      finishedBack: true, benchtopFrontOverhang: 25, benchtopBackOverhang: 25,
      finishColor: style?.finishId ?? DEFAULT_STYLE.finishId,
      handleType: style?.handleId ?? DEFAULT_STYLE.handleId,
    }));
    return { items, clearanceMm, baseCandidateId: base.candidateId };
  }
  return null;
}

function occupiedFootprints(document: RoomDocumentV1): { id: string; footprint: RoomPoint[]; bottom: number; top: number }[] {
  return document.objects.filter(object => object.layer !== 'existing' || object.existingAction !== 'remove')
    .map((object: RoomObject) => {
      const pose = objectPose(document, object);
      const bottom = object.elevationMm ?? 0;
      return pose ? { id: object.id, footprint: footprintCorners(pose, object.widthMm, object.depthMm), bottom, top: bottom + (object.heightMm ?? 900) } : null;
    }).filter((entry): entry is { id: string; footprint: RoomPoint[]; bottom: number; top: number } => Boolean(entry));
}

function wallOpenings(document: RoomDocumentV1, wallId: string): Opening[] {
  return document.openings.filter(opening => opening.wallId === wallId).map(opening => ({
    id: opening.id, wall: 'N', type: opening.kind, offsetMm: opening.offsetMm,
    widthMm: opening.widthMm, heightMm: opening.heightMm, sillHeightMm: opening.sillHeightMm,
  }));
}

function attachedBlocked(document: RoomDocumentV1, wallId: string, dims: GlobalDimensions): Interval[] {
  return document.objects.filter(object => object.placement.type === 'wall'
    && object.placement.wallId === wallId && (object.layer !== 'existing' || object.existingAction !== 'remove')
    && verticalOverlap({ bottom: object.elevationMm ?? 0, top: (object.elevationMm ?? 0) + (object.heightMm ?? 900) }, { bottom: 0, top: dims.baseHeight }))
    .map(object => ({ start: object.placement.type === 'wall' ? object.placement.offsetMm - 25 : 0,
      end: object.placement.type === 'wall' ? object.placement.offsetMm + object.widthMm + 25 : 0 }));
}

function adjacentEnd(a: { startCornerId: string; endCornerId: string }, b: { startCornerId: string; endCornerId: string }):
  { a: 'start' | 'end'; b: 'start' | 'end' } | null {
  if (a.endCornerId === b.startCornerId) return { a: 'end', b: 'start' };
  if (a.startCornerId === b.endCornerId) return { a: 'start', b: 'end' };
  if (a.startCornerId === b.startCornerId) return { a: 'start', b: 'start' };
  if (a.endCornerId === b.endCornerId) return { a: 'end', b: 'end' };
  return null;
}

function endReserve(lengthMm: number, end: 'start' | 'end'): Interval {
  return end === 'start' ? { start: 0, end: Math.min(SAFE_END_MM, lengthMm) }
    : { start: Math.max(0, lengthMm - SAFE_END_MM), end: lengthMm };
}

function wallGroups(document: RoomDocumentV1, allowed?: Set<string>): string[][] {
  const groups: string[][] = [];
  const add = (ids: string[]) => {
    if (ids.every(id => !allowed || allowed.has(id)) && !groups.some(group => group.join('|') === ids.join('|'))) groups.push(ids);
  };
  for (const chain of document.chains) {
    const ids = chain.wallIds.filter(id => (wallGeometry(document, id)?.lengthMm ?? 0) >= MIN_RUN_MM
      && ['left', 'right'].includes(document.walls.find(wall => wall.id === id)?.interiorSide ?? 'unknown'));
    for (const id of ids) add([id]);
    for (let size = 2; size <= 3; size++) {
      for (let index = 0; index <= ids.length - size; index++) {
        const group = ids.slice(index, index + size);
        if (group.every((id, part) => part === 0 || adjacentEnd(document.walls.find(w => w.id === group[part - 1])!, document.walls.find(w => w.id === id)!) !== null)) add(group);
      }
    }
  }
  return groups;
}

function preferredSinkWall(document: RoomDocumentV1, wallIds: string[]): string {
  const service = document.services.find(s => s.placement.type === 'wall'
    && (s.kind === 'water-supply' || s.kind === 'drain') && wallIds.includes(s.placement.wallId));
  if (service?.placement.type === 'wall') return service.placement.wallId;
  const window = document.openings.find(o => o.kind === 'window' && wallIds.includes(o.wallId));
  if (window) return window.wallId;
  return [...wallIds].sort((a, b) => (wallGeometry(document, b)?.lengthMm ?? 0)
    - (wallGeometry(document, a)?.lengthMm ?? 0) || a.localeCompare(b))[0];
}

function solveWall(document: RoomDocumentV1, wallId: string, roles: SegmentRole[], selectedWallIds: string[], dims: GlobalDimensions,
  style: StyleSpec | undefined, candidateId: string, runIndex: number): { items: RoomSuggestedItem[]; notes: string[]; missing: string[] } {
  const geometry = wallGeometry(document, wallId);
  if (!geometry) return { items: [], notes: [], missing: ['Wall geometry is invalid.'] };
  const selectedWall = document.walls.find(wall => wall.id === wallId)!;
  const cornerReserves: Interval[] = [];
  for (const otherId of selectedWallIds) {
    if (otherId === wallId) continue;
    const other = document.walls.find(wall => wall.id === otherId)!;
    const join = adjacentEnd(selectedWall, other);
    if (join) cornerReserves.push(endReserve(geometry.lengthMm, join.a));
  }
  const run: Run = { wall: 'N', wallCabinets: false,
    segments: roles.map(role => ({ kind: 'cabinet' as const, role,
      ...(role === 'sink' ? { widthMm: 600 } : {}),
      ...(role === 'cooktop' ? { widthMm: 600 } : {}),
    })) };
  const solved = solveRun(run, geometry.lengthMm, wallOpenings(document, wallId), [...cornerReserves, ...attachedBlocked(document, wallId, dims)]);
  const resolvedRoles = new Set(solved.resolved.flatMap(segment => segment.segment.kind === 'cabinet' ? [segment.segment.role] : []));
  const missing = roles.filter(role => !resolvedRoles.has(role)).map(role => `${role} could not fit on wall ${wallId}.`);
  const items: RoomSuggestedItem[] = solved.resolved.flatMap((segment, index) => {
    if (segment.segment.kind !== 'cabinet' || !segment.definitionId) return [];
    const role = segment.segment.role;
    const depth = isTall(role) ? dims.tallDepth : dims.baseDepth;
    const pose = placementPose(document, { type: 'wall', wallId, offsetMm: segment.startMm }, segment.widthMm, depth);
    if (!pose) return [];
    return [{ wallId, offsetMm: segment.startMm, item: {
      instanceId: `${candidateId}:${wallId}:${index}`,
      cabinetNumber: `C${String(index + 1).padStart(2, '0')}`,
      definitionId: segment.definitionId,
      itemType: role === 'dishwasher' || role === 'fridge-gap' ? 'Appliance' : 'Cabinet',
      x: pose.xMm, y: 0, z: pose.zMm, rotation: pose.rotationDeg,
      width: segment.widthMm, depth, height: isTall(role) ? dims.tallHeight : dims.baseHeight,
      layoutRole: role, layoutRunIndex: runIndex,
      finishColor: style?.finishId ?? DEFAULT_STYLE.finishId,
      handleType: style?.handleId ?? DEFAULT_STYLE.handleId,
    } }];
  });
  return { items, notes: solved.notes, missing };
}

export function roomDocumentCandidateCapability(document: RoomDocumentV1): RoomDocumentCandidatePool['capability'] {
  const errors = validateRoomDocument(document).filter(issue => issue.severity === 'error');
  const reasons = errors.map(issue => `${issue.code}: ${issue.message}`);
  if (document.version !== 1) reasons.push('Unsupported room document version.');
  if (!document.walls.length) reasons.push('Add at least one wall segment.');
  else if (!document.walls.some(wall => wall.interiorSide === 'left' || wall.interiorSide === 'right'))
    reasons.push('Confirm which side of a wall faces into the room before placing cabinets.');
  return { supported: reasons.length === 0, reasons, floorConfirmed: Boolean(document.floorBoundary?.confirmed) };
}

/** Generate repeatable wall-run options for any straight-segment plan. The
 * physical wall IDs, exact rotations and opened/closed state are retained. */
export function generateRoomDocumentCandidates(input: GenerateRoomDocumentCandidatesInput): RoomDocumentCandidatePool {
  const { document } = input;
  const capability = roomDocumentCandidateCapability(document);
  const pool: RoomDocumentCandidatePool = { candidates: [], rejected: [], capability };
  if (!capability.supported) return pool;
  const dims = input.dimensions ?? DEFAULT_GLOBAL_DIMENSIONS;
  const occupied = occupiedFootprints(document);
  const allowed = input.allowedWallIds?.length ? new Set(input.allowedWallIds) : undefined;
  for (const wall of document.walls) if ((wall.interiorSide !== 'left' && wall.interiorSide !== 'right')
    && (!allowed || allowed.has(wall.id))) pool.rejected.push({ candidateId: `wall:${wall.id}`, reasons: ['Confirm which face of this wall points into the room before placing cabinets.'] });
  const groups = wallGroups(document, allowed);
  for (const wallIds of groups) {
    const strategy = wallIds.length === 1 ? 'single-wall' : wallIds.length === 2 ? 'two-wall' : 'three-wall';
    const candidateId = `wall-run:${document.id}:${document.revision}:${wallIds.join('+')}`;
    const sinkWall = preferredSinkWall(document, wallIds);
    const cooktopWall = wallIds.find(id => id !== sinkWall) ?? sinkWall;
    const assembled = wallIds.map((wallId, index) => {
      const roles: SegmentRole[] = [];
      if (wallId === sinkWall) roles.push('sink');
      if (wallId === cooktopWall) roles.push('cooktop');
      if (roles.length === 0) roles.push('drawers');
      return solveWall(document, wallId, roles, wallIds, dims, input.style, candidateId, index);
    });
    const items = assembled.flatMap(result => result.items);
    const reasons = assembled.flatMap(result => result.missing);
    const footprints = items.map(({ item }) => planFootprint(item));
    for (let index = 0; index < items.length; index++) {
      const floor = footprintInsideConfirmedFloor(document, footprints[index]);
      if (floor.status === 'outside') reasons.push(`${items[index].item.instanceId} crosses the confirmed floor boundary.`);
      if (occupied.some(object => verticalOverlap({ bottom: items[index].item.y, top: items[index].item.y + items[index].item.height }, object)
        && footprintsIntersect(footprints[index], object.footprint))) reasons.push(`${items[index].item.instanceId} collides with an existing or proposed item.`);
      for (let other = index + 1; other < items.length; other++) {
        if (footprintsIntersect(footprints[index], footprints[other])) reasons.push('Proposed cabinet footprints overlap.');
      }
    }
    if (reasons.length) { pool.rejected.push({ candidateId, reasons: [...new Set(reasons)] }); continue; }
    const unresolved = [
      'Work zones, services and joinery details require site review.',
      ...(!capability.floorConfirmed ? ['Room-wide circulation and floor clearance are unresolved until the floor boundary is confirmed.'] : []),
      ...(wallIds.length > 1 ? ['Adjoining wall runs need a site-checked corner filler or join; no angled corner cabinet is assumed.'] : []),
    ];
    pool.candidates.push({ candidateId, roomRevision: document.revision, strategy, wallIds, items,
      notes: assembled.flatMap(result => result.notes), unresolved,
      score: items.length * 10 + wallIds.length * 5 + Math.min(9, Math.floor(wallIds.reduce((total, id) => total + (wallGeometry(document, id)?.lengthMm ?? 0), 0) / 1000)),
    });
  }
  pool.candidates.sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId));
  pool.candidates = pool.candidates.slice(0, input.maxCandidates ?? 3);
  if (!capability.floorConfirmed) pool.islandReason = 'A confirmed floor boundary is needed before testing an island and its circulation.';
  else if (!pool.candidates.length) pool.islandReason = 'A viable wall run is needed before combining it with an island.';
  else {
    pool.islandOption = islandFor(document, pool.candidates[0], occupied, dims, input.style) ?? undefined;
    if (!pool.islandOption) pool.islandReason = 'A 1200 × 600 mm island with 900 mm clear circulation does not fit the confirmed floor and current fittings.';
  }
  return pool;
}
