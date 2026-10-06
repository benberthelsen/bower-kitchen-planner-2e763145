/** Keep scanner drafts in the planner's wall model without inventing a room
 * boundary. The original RoomCaptureDraft remains attached to the handoff for
 * authorized evidence retrieval and later reprocessing. */
import type { RoomDocumentV1, RoomCorner, RoomWall, RoomWallChain, RoomOpening, RoomService, RoomObject, DimensionSource } from '../roomDocument/types';
import { createRoomDocument } from '../roomDocument';
import type { RoomCaptureDraftV1, RoomScanV1 } from './contract';

type DraftGeometry = NonNullable<RoomCaptureDraftV1['partialGeometry']>;
type DraftChain = NonNullable<DraftGeometry['wallChains']>[number];

function captureIdOf(draft: RoomCaptureDraftV1, fallback: string): string {
  const state = draft.adapterState;
  if (state && typeof state === 'object' && !Array.isArray(state) && typeof state.captureId === 'string') return state.captureId;
  return fallback;
}

function sourceRevisionOf(draft: RoomCaptureDraftV1): string | undefined {
  const state = draft.adapterState;
  if (state && typeof state === 'object' && !Array.isArray(state) && typeof state.sourceRevision === 'string'
    && state.sourceRevision.length <= 128) return state.sourceRevision;
  return undefined;
}

export function captureDraftIdentity(draft: RoomCaptureDraftV1): { captureId?: string; sourceRevision?: string } {
  const state = draft.adapterState;
  const sourceRevision = sourceRevisionOf(draft);
  return {
    ...(state && typeof state === 'object' && !Array.isArray(state) && typeof state.captureId === 'string'
      ? { captureId: state.captureId } : {}),
    ...(sourceRevision ? { sourceRevision } : {}),
  };
}

/** A new capability for the same saved scan is a reviewable revision, not a
 * replacement room. Unknown legacy revisions compare the draft snapshot. */
export function captureDraftRelation(
  current: RoomCaptureDraftV1 | undefined,
  incoming: RoomCaptureDraftV1,
  currentCaptureId?: string,
): 'new-capture' | 'same-revision' | 'changed-revision' {
  const next = captureDraftIdentity(incoming);
  const previous = current ? captureDraftIdentity(current) : {};
  const linkedId = currentCaptureId ?? previous.captureId;
  if (!next.captureId || next.captureId !== linkedId) return 'new-capture';
  if (next.sourceRevision && previous.sourceRevision && next.sourceRevision === previous.sourceRevision) return 'same-revision';
  if (current && JSON.stringify(current) === JSON.stringify(incoming)) return 'same-revision';
  return 'changed-revision';
}

function legacyChain(geometry: DraftGeometry): DraftChain[] {
  const points = geometry.cornersMm;
  if (!points || points.length < 2) return [];
  const closed = geometry.closureComplete === true;
  return [{
    id: 'capture-chain-1',
    cornersMm: points.map((point, index) => ({ id: `capture-corner-${index + 1}`, x: point.x, z: point.z })),
    wallIds: Array.from({ length: closed ? points.length : points.length - 1 }, (_, index) => `capture-wall-${index + 1}`),
    closed,
    provenance: 'unknown',
  }];
}

function sourceOf(chain: DraftChain): DimensionSource {
  // A scanner's metre coordinates are observations, not tape-confirmed sizes.
  return chain.provenance ?? 'unknown';
}

/** Converts both new explicit chains and legacy V1 corners. A closed *draft*
 * chain remains unconfirmed; only a separate user action can establish the
 * floorBoundary used by whole-room design. */
export function roomDocumentFromCaptureDraft(draft: RoomCaptureDraftV1, documentId: string): RoomDocumentV1 {
  const document = createRoomDocument(documentId);
  const sourceRevision = sourceRevisionOf(draft);
  document.capture = { captureId: captureIdOf(draft, documentId), source: draft.source,
    ...(sourceRevision ? { sourceRevision } : {}) };
  const geometry = draft.partialGeometry;
  const chains = geometry?.wallChains?.length ? geometry.wallChains : geometry ? legacyChain(geometry) : [];
  const measured = new Map(geometry?.wallMeasurements?.map(entry => [entry.wallId, entry.millimetres]));
  const cornerById = new Map<string, RoomCorner>();
  const usedWallIds = new Set<string>();
  for (const chain of chains) {
    const corners: RoomCorner[] = chain.cornersMm.map(corner => ({ id: corner.id, xMm: corner.x, zMm: corner.z }));
    for (const corner of corners) {
      const previous = cornerById.get(corner.id);
      if (previous && (previous.xMm !== corner.xMm || previous.zMm !== corner.zMm))
        throw new Error(`Capture corner ${corner.id} has conflicting positions.`);
      cornerById.set(corner.id, corner);
    }
    const expected = chain.closed ? corners.length : corners.length - 1;
    if (chain.wallIds.length !== expected) throw new Error(`Capture chain ${chain.id} has inconsistent wall IDs.`);
    const walls: RoomWall[] = chain.wallIds.map((wallId, index) => {
      if (usedWallIds.has(wallId)) throw new Error(`Capture wall ${wallId} appears twice.`);
      usedWallIds.add(wallId);
      const a = corners[index], b = corners[(index + 1) % corners.length];
      return {
        id: wallId,
        startCornerId: a.id,
        endCornerId: b.id,
        interiorSide: 'unknown',
        lengthEvidence: measured.has(wallId)
          ? { valueMm: measured.get(wallId)!, source: 'measured' }
          : { valueMm: Math.round(Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm)), source: sourceOf(chain) },
        ...(draft.dimensions?.heightMm ? { height: { valueMm: draft.dimensions.heightMm, source: 'unknown' as const } } : {}),
      };
    });
    const wallChain: RoomWallChain = { id: chain.id, wallIds: walls.map(w => w.id), closed: chain.closed };
    document.walls.push(...walls);
    document.chains.push(wallChain);
  }
  document.corners = [...cornerById.values()];
  const wallIds = new Set(document.walls.map(wall => wall.id));
  for (const feature of geometry?.featureCandidates ?? []) {
    const placedOnWall = feature.placement === 'wall' && !!feature.wallId && wallIds.has(feature.wallId) && feature.offsetMm !== undefined;
    const free = feature.xMm !== undefined && feature.zMm !== undefined;
    if (!placedOnWall && !free) continue; // Full candidate remains in the private source draft.
    const placement = placedOnWall
      ? { type: 'wall' as const, wallId: feature.wallId!, offsetMm: feature.offsetMm! }
      : { type: 'free' as const, xMm: feature.xMm!, zMm: feature.zMm!, rotationDeg: feature.rotationDeg ?? 0 };
    const dimensionEvidence = { width: { valueMm: feature.widthMm, source: 'inferred' as const } };
    if (placedOnWall && ['door', 'window', 'walkway'].includes(feature.kind)) {
      const opening: RoomOpening = {
        id: feature.id, wallId: feature.wallId!, kind: feature.kind as RoomOpening['kind'],
        offsetMm: feature.offsetMm!, widthMm: feature.widthMm,
        ...(feature.heightMm ? { heightMm: feature.heightMm } : {}),
        ...(feature.kind === 'window' && feature.elevationMm !== undefined ? { sillHeightMm: feature.elevationMm } : {}),
        dimensionEvidence,
      };
      document.openings.push(opening);
    } else if (['water-supply', 'drain', 'gpo', 'gas', 'hood-duct', 'light', 'fan'].includes(feature.kind)) {
      const service: RoomService = { id: feature.id, kind: feature.kind as RoomService['kind'], placement,
        ...(feature.elevationMm !== undefined ? { heightMm: feature.elevationMm } : {}), dimensionEvidence };
      document.services.push(service);
    } else {
      const object: RoomObject = { id: feature.id, layer: 'existing', kind: feature.kind, placement,
        widthMm: feature.widthMm, depthMm: feature.depthMm,
        ...(feature.heightMm ? { heightMm: feature.heightMm } : {}), sizeLock: 'none', dimensionEvidence };
      if (feature.elevationMm !== undefined) object.elevationMm = feature.elevationMm;
      document.objects.push(object);
    }
  }
  return document;
}

export interface CaptureUpdatePreview {
  document: RoomDocumentV1;
  added: { walls: number; openings: number; services: number; objects: number };
  changedExisting: number;
  cornerConflicts: number;
}

/** A later scan is additive evidence only. Stable IDs let new fragments join
 * the plan, while all previously edited positions, measurements, fittings and
 * the confirmed floor boundary remain authoritative until changed by a user.
 * Every new wall is an open segment; a scan cannot silently close the room. */
export function previewCaptureUpdate(current: RoomDocumentV1, incoming: RoomDocumentV1): CaptureUpdatePreview {
  if (!current.capture?.captureId || current.capture.captureId !== incoming.capture?.captureId)
    throw new Error('This scan belongs to a different room.');
  const cornersById = new Map(current.corners.map(corner => [corner.id, corner]));
  let cornerConflicts = 0;
  const newCorners = incoming.corners.filter(corner => {
    const previous = cornersById.get(corner.id);
    if (previous && (previous.xMm !== corner.xMm || previous.zMm !== corner.zMm)) cornerConflicts += 1;
    return !previous;
  });
  const wallIds = new Set(current.walls.map(wall => wall.id));
  const newWalls = incoming.walls.filter(wall => !wallIds.has(wall.id));
  const knownCorners = new Set([...current.corners, ...newCorners].map(corner => corner.id));
  if (newWalls.some(wall => !knownCorners.has(wall.startCornerId) || !knownCorners.has(wall.endCornerId)))
    throw new Error('A new scan wall is missing a corner.');
  const addById = <T extends { id: string }>(previous: T[], next: T[]): T[] => {
    const ids = new Set(previous.map(item => item.id));
    return next.filter(item => !ids.has(item.id));
  };
  const allWallIds = new Set([...current.walls, ...newWalls].map(wall => wall.id));
  const newOpenings = addById(current.openings, incoming.openings).filter(opening => allWallIds.has(opening.wallId));
  const newServices = addById(current.services, incoming.services).filter(service =>
    service.placement.type === 'free' || allWallIds.has(service.placement.wallId));
  const newObjects = addById(current.objects, incoming.objects).filter(object =>
    object.placement.type === 'free' || allWallIds.has(object.placement.wallId));
  const changedById = <T extends { id: string }>(previous: T[], next: T[]) => {
    const ids = new Map(previous.map(item => [item.id, item]));
    return next.filter(item => ids.has(item.id) && JSON.stringify(ids.get(item.id)) !== JSON.stringify(item)).length;
  };
  const changedExisting = changedById(current.walls, incoming.walls)
    + changedById(current.openings, incoming.openings)
    + changedById(current.services, incoming.services)
    + changedById(current.objects, incoming.objects);
  const chainIds = new Set(current.chains.map(chain => chain.id));
  const newChains = newWalls.map(wall => {
    let id = `scan-segment-${wall.id}`;
    for (let suffix = 2; chainIds.has(id); suffix++) id = `scan-segment-${wall.id}-${suffix}`;
    chainIds.add(id);
    return { id, wallIds: [wall.id], closed: false };
  });
  return {
    document: {
      ...current,
      revision: current.revision + 1,
      corners: [...current.corners, ...newCorners],
      walls: [...current.walls, ...newWalls],
      chains: [...current.chains, ...newChains],
      openings: [...current.openings, ...newOpenings],
      services: [...current.services, ...newServices],
      objects: [...current.objects, ...newObjects],
      capture: { ...current.capture, sourceRevision: incoming.capture.sourceRevision ?? current.capture.sourceRevision },
    },
    added: { walls: newWalls.length, openings: newOpenings.length,
      services: newServices.length, objects: newObjects.length },
    changedExisting,
    cornerConflicts,
  };
}

export function captureDraftReadiness(draft: RoomCaptureDraftV1): { wallChains: number; walls: number; openChains: number; canDesignWholeRoom: false } {
  const geometry = draft.partialGeometry;
  const chains = geometry?.wallChains?.length ? geometry.wallChains : geometry ? legacyChain(geometry) : [];
  return { wallChains: chains.length, walls: chains.reduce((n, c) => n + c.wallIds.length, 0), openChains: chains.filter(c => !c.closed).length, canDesignWholeRoom: false };
}

/** One handoff capture representation is consumed at a time. A valid draft is
 * retained even if its nested wall IDs conflict and need manual repair. */
export function resolveRoomCapture(
  handoff: { roomScan?: RoomScanV1; roomCaptureDraft?: RoomCaptureDraftV1 },
  documentId: string,
): { kind: 'scan'; scan: RoomScanV1 } | { kind: 'draft'; draft: RoomCaptureDraftV1; document?: RoomDocumentV1 } | { kind: 'none' } {
  if (handoff.roomScan) return { kind: 'scan', scan: handoff.roomScan };
  if (!handoff.roomCaptureDraft) return { kind: 'none' };
  try { return { kind: 'draft', draft: handoff.roomCaptureDraft, document: roomDocumentFromCaptureDraft(handoff.roomCaptureDraft, documentId) }; }
  catch { return { kind: 'draft', draft: handoff.roomCaptureDraft }; }
}
