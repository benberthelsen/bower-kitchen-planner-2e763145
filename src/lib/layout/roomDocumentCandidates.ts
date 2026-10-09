/** Wall-run suggestions for rooms with stable wall IDs. These do not pass
 * through the cardinal N/E/S/W KitchenSpec compiler. They reuse its catalogue
 * width solver and produce ordinary PlacedItems for the existing cabinet
 * renderer. Room-wide checks remain unresolved for open scans. */
import type { GlobalDimensions, Opening, PlacedItem } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import type { RoomDocumentV1, RoomObject, RoomPoint } from '@/lib/roomDocument';
import {
  confirmedFloorPolygon, footprintCorners, footprintInsideConfirmedFloor, footprintsIntersect,
  objectPose, placementPose, validateRoomDocument, wallGeometry,
} from '@/lib/roomDocument';
import { solveRun } from './solveRun';
import type { Run, SegmentRole, StyleSpec } from './types';
import { baseBlockedIntervals, usableIntervals, type Interval } from './geometry';

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
  /** Required work zones that could not be placed. Never substitute a cabinet
   * in an imaginary closing wall or silently drop a required appliance. */
  unplaced: { candidateId: string; wallId: string; role: SegmentRole; reason: string }[];
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

const CORNER_SCRIBE_MM = 50;
const GEOMETRY_EPS_MM = 0.01; // floating-point seams are not physical overlaps
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
  // A 25 mm top on each side can reduce a body-to-body gap by 50 mm. Use the
  // larger envelope for both walls and fittings so the advertised clearance
  // remains at least 900 mm at the visible benchtop edge.
  const benchtopAllowanceMm = 50;
  const obstacles = [
    ...occupied.filter(object => verticalOverlap(object, { bottom: 0, top: dims.baseHeight })).map(object => object.footprint),
    ...base.items.filter(({ item }) => item.y < dims.baseHeight).map(({ item }) => planFootprint(item)),
  ];
  for (const centre of candidates) {
    // The expanded footprint must remain in the real polygon, including any
    // concave recess. It also enforces 900mm circulation from every wall.
    const clearEnvelope = footprintCorners({ xMm: centre.x, zMm: centre.z, rotationDeg: 0 },
      1200 + (clearanceMm + benchtopAllowanceMm) * 2, 600 + (clearanceMm + benchtopAllowanceMm) * 2);
    if (footprintInsideConfirmedFloor(document, clearEnvelope).status !== 'inside') continue;
    if (obstacles.some(footprint => footprintsIntersect(clearEnvelope, footprint, GEOMETRY_EPS_MM))) continue;
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

/** Reserve only the span actually occupied in this wall's cabinet corridor.
 * This also handles a freestanding island, a fridge on an angled return, or a
 * cabinet attached to a different wall, rather than rejecting the entire run
 * after it has already been compiled. */
function occupiedBlocked(document: RoomDocumentV1, wallId: string, dims: GlobalDimensions,
  occupied: ReturnType<typeof occupiedFootprints>): Interval[] {
  const wall = wallGeometry(document, wallId);
  if (!wall) return [];
  const depth = Math.max(dims.baseDepth, dims.tallDepth);
  const project = (point: RoomPoint, axis: RoomPoint) => (point.xMm - wall.start.xMm) * axis.xMm
    + (point.zMm - wall.start.zMm) * axis.zMm;
  return occupied.filter(object => verticalOverlap(object, { bottom: 0, top: dims.baseHeight }))
    .flatMap(object => {
      const inward = object.footprint.map(point => project(point, wall.inwardNormal));
      if (Math.max(...inward) < -25 || Math.min(...inward) > depth + 25) return [];
      const along = object.footprint.map(point => project(point, wall.tangent));
      return [{ start: Math.min(...along) - 25, end: Math.max(...along) + 25 }];
    });
}

function adjacentEnd(a: { startCornerId: string; endCornerId: string }, b: { startCornerId: string; endCornerId: string }):
  { a: 'start' | 'end'; b: 'start' | 'end' } | null {
  if (a.endCornerId === b.startCornerId) return { a: 'end', b: 'start' };
  if (a.startCornerId === b.endCornerId) return { a: 'start', b: 'end' };
  if (a.startCornerId === b.startCornerId) return { a: 'start', b: 'start' };
  if (a.endCornerId === b.endCornerId) return { a: 'end', b: 'end' };
  return null;
}

function endReserve(lengthMm: number, end: 'start' | 'end', reserveMm: number): Interval {
  return end === 'start' ? { start: 0, end: Math.min(reserveMm, lengthMm) }
    : { start: Math.max(0, lengthMm - reserveMm), end: lengthMm };
}

/** Reserve just enough of both joining ends that full-depth cabinet strips
 * cease overlapping. Shrinking both strips from their shared corner is
 * monotonic, so the integer binary search is repeatable for any wall angle,
 * including concave joins where the strips may already be disjoint. */
function cornerReserveMm(a: NonNullable<ReturnType<typeof wallGeometry>>, aEnd: 'start' | 'end',
  b: NonNullable<ReturnType<typeof wallGeometry>>, bEnd: 'start' | 'end', dims: GlobalDimensions): number {
  const depth = Math.max(dims.baseDepth, dims.tallDepth);
  const strip = (wall: typeof a, end: 'start' | 'end', reserveMm: number): RoomPoint[] => {
    const width = wall.lengthMm - reserveMm;
    if (width <= 0) return [];
    const offset = end === 'start' ? reserveMm : 0;
    const centre = offset + width / 2;
    return footprintCorners({
      xMm: wall.start.xMm + wall.tangent.xMm * centre + wall.inwardNormal.xMm * depth / 2,
      zMm: wall.start.zMm + wall.tangent.zMm * centre + wall.inwardNormal.zMm * depth / 2,
      rotationDeg: wall.rotationDeg,
    }, width, depth);
  };
  const intersects = (reserveMm: number) => footprintsIntersect(strip(a, aEnd, reserveMm), strip(b, bEnd, reserveMm), GEOMETRY_EPS_MM);
  if (!intersects(0)) return 0;
  let low = 0, high = Math.ceil(Math.min(a.lengthMm, b.lengthMm));
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (intersects(middle)) low = middle + 1;
    else high = middle;
  }
  return low + CORNER_SCRIBE_MM;
}

function wallGroups(document: RoomDocumentV1, allowed?: Set<string>): string[][] {
  const groups: string[][] = [];
  const seen = new Set<string>();
  const add = (ids: string[]) => {
    const key = [...ids].sort().join('|');
    if (!seen.has(key) && ids.every(id => !allowed || allowed.has(id))) { groups.push(ids); seen.add(key); }
  };
  for (const chain of document.chains) {
    const ids = chain.wallIds;
    for (let start = 0; start < ids.length; start++) {
      for (let size = 1; size <= Math.min(3, ids.length); size++) {
        if (!chain.closed && start + size > ids.length) break;
        const group = Array.from({ length: size }, (_, offset) => ids[(start + offset) % ids.length]);
        if (group.some(id => (wallGeometry(document, id)?.lengthMm ?? 0) < MIN_RUN_MM
          || !['left', 'right'].includes(document.walls.find(wall => wall.id === id)?.interiorSide ?? 'unknown'))) continue;
        add(group);
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
  style: StyleSpec | undefined, candidateId: string, runIndex: number,
  occupied: ReturnType<typeof occupiedFootprints>): { items: RoomSuggestedItem[]; notes: string[]; unplaced: RoomDocumentCandidatePool['unplaced'] } {
  const geometry = wallGeometry(document, wallId);
  if (!geometry) return { items: [], notes: [], unplaced: roles.map(role => ({ candidateId, wallId, role, reason: 'Wall geometry is invalid.' })) };
  const selectedWall = document.walls.find(wall => wall.id === wallId)!;
  const cornerReserves: Interval[] = [];
  for (const otherId of selectedWallIds) {
    if (otherId === wallId) continue;
    const other = document.walls.find(wall => wall.id === otherId)!;
    const join = adjacentEnd(selectedWall, other);
    const otherGeometry = wallGeometry(document, otherId);
    if (join && otherGeometry) cornerReserves.push(endReserve(geometry.lengthMm, join.a,
      cornerReserveMm(geometry, join.a, otherGeometry, join.b, dims)));
  }
  const run: Run = { wall: 'N', wallCabinets: false,
    segments: roles.map(role => ({ kind: 'cabinet' as const, role,
      ...(role === 'sink' ? { widthMm: 600 } : {}),
      ...(role === 'cooktop' ? { widthMm: 600 } : {}),
    })) };
  const blocked = [...cornerReserves, ...occupiedBlocked(document, wallId, dims, occupied)];
  const solved = solveRun(run, geometry.lengthMm, wallOpenings(document, wallId), blocked);
  const resolvedRoles = new Set(solved.resolved.flatMap(segment => segment.segment.kind === 'cabinet' ? [segment.segment.role] : []));
  const usable = usableIntervals(geometry.lengthMm, [...baseBlockedIntervals('N', wallOpenings(document, wallId)), ...blocked]);
  const largestSpan = Math.max(0, ...usable.map(interval => interval.end - interval.start));
  const unplaced = roles.filter(role => !resolvedRoles.has(role)).map(role => ({ candidateId, wallId, role,
    reason: `${role} needs a suitable cabinet span on wall ${wallId}; the largest clear span is ${Math.floor(largestSpan)} mm after openings, existing items and corner clearance.`,
  }));
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
  return { items, notes: solved.notes, unplaced };
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
  const pool: RoomDocumentCandidatePool = { candidates: [], rejected: [], unplaced: [], capability };
  if (!capability.supported) return pool;
  const dims = input.dimensions ?? DEFAULT_GLOBAL_DIMENSIONS;
  const occupied = occupiedFootprints(document);
  const allowed = input.allowedWallIds?.length ? new Set(input.allowedWallIds) : undefined;
  for (const wall of document.walls) {
    if (allowed && !allowed.has(wall.id)) continue;
    const reason = wall.interiorSide !== 'left' && wall.interiorSide !== 'right'
      ? 'Confirm which face of this wall points into the room before placing cabinets.'
      : (wallGeometry(document, wall.id)?.lengthMm ?? 0) < MIN_RUN_MM
        ? `This wall is shorter than the ${MIN_RUN_MM} mm minimum cabinet run.` : null;
    if (reason) pool.rejected.push({ candidateId: `wall:${wall.id}`, reasons: [reason] });
  }
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
      return solveWall(document, wallId, roles, wallIds, dims, input.style, candidateId, index, occupied);
    });
    const items = assembled.flatMap(result => result.items);
    const unplaced = assembled.flatMap(result => result.unplaced);
    const reasons = unplaced.map(item => item.reason);
    const footprints = items.map(({ item }) => planFootprint(item));
    for (let index = 0; index < items.length; index++) {
      const floor = footprintInsideConfirmedFloor(document, footprints[index]);
      if (floor.status === 'outside') reasons.push(`${items[index].item.instanceId} crosses the confirmed floor boundary.`);
      if (occupied.some(object => verticalOverlap({ bottom: items[index].item.y, top: items[index].item.y + items[index].item.height }, object)
        && footprintsIntersect(footprints[index], object.footprint, GEOMETRY_EPS_MM))) reasons.push(`${items[index].item.instanceId} collides with an existing or proposed item.`);
      for (let other = index + 1; other < items.length; other++) {
        if (footprintsIntersect(footprints[index], footprints[other], GEOMETRY_EPS_MM)) reasons.push('Proposed cabinet footprints overlap.');
      }
    }
    if (reasons.length) {
      pool.rejected.push({ candidateId, reasons: [...new Set(reasons)] });
      pool.unplaced.push(...unplaced);
      continue;
    }
    const unresolved = [
      'Work zones, services and joinery details require site review.',
      ...(!capability.floorConfirmed ? ['Room-wide circulation and floor clearance are unresolved until the floor boundary is confirmed.'] : []),
      ...(wallIds.length > 1 ? ['Adjoining wall runs need a site-checked corner filler or join; no angled corner cabinet is assumed.'] : []),
    ];
    pool.candidates.push({ candidateId, roomRevision: document.revision, strategy, wallIds, items,
      notes: assembled.flatMap(result => result.notes), unresolved,
      score: items.length * 10 + wallIds.length * 5 + Math.min(9, Math.floor(wallIds.reduce((total, id) => {
        const length = wallGeometry(document, id)?.lengthMm ?? 0;
        const blocked = [...baseBlockedIntervals('N', wallOpenings(document, id)), ...occupiedBlocked(document, id, dims, occupied)];
        return total + usableIntervals(length, blocked).reduce((sum, interval) => sum + interval.end - interval.start, 0);
      }, 0) / 1000)),
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
