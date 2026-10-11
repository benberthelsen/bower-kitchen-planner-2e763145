/** Keep scanner drafts in the planner's wall model without inventing a room
 * boundary. The original RoomCaptureDraft remains attached to the handoff for
 * authorized evidence retrieval and later reprocessing. */
import type { RoomDocumentV1, RoomCorner, RoomWall, RoomWallChain, RoomOpening, RoomService, RoomObject, PendingPhotoFeature, DimensionSource } from '../roomDocument/types';
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
  // A chain-wide claim cannot establish which individual lengths were checked.
  // Only wallMeasurements can promote a wall length to site-measured.
  return chain.provenance === 'measured' ? 'unknown' : chain.provenance ?? 'unknown';
}

/** Adapter state is untrusted JSON from the scanner. Keep an explicit,
 * bounded evidence-only copy rather than inventing opening/object geometry. */
function pendingPhotoFeaturesFromState(state: unknown, knownWallIds: Set<string>, placedIds: Set<string>): PendingPhotoFeature[] {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return [];
  const records = (state as Record<string, unknown>).unresolvedPhotoFeatures;
  if (!Array.isArray(records)) return [];
  const result: PendingPhotoFeature[] = [], seen = new Set<string>();
  const text = (value: unknown, max: number) => typeof value === 'string' && value.trim().length > 0
    && value.length <= max ? value.trim() : undefined;
  for (const raw of records.slice(0, 128)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = text(item.id, 64), kind = text(item.kind, 80);
    if (!id || !kind || item.needsCheck !== true || item.layer !== 'existing'
      || seen.has(id) || placedIds.has(id)) continue;
    const label = text(item.label, 160) ?? kind.replace(/[-_]/g, ' ');
    const sourceWallId = text(item.wallId, 64);
    const photoIds = Array.isArray(item.photoIds) ? item.photoIds : item.photoId ? [item.photoId] : [];
    const evidenceIds = [...new Set(photoIds.slice(0, 32).flatMap(value => {
      const photoId = text(value, 64);
      return photoId && /^[A-Za-z0-9_-]+$/.test(photoId) ? [`photo:${photoId}`] : [];
    }))];
    const hint = item.placement;
    result.push({ id, kind, label, status: 'needs-placement-and-size', evidenceIds,
      ...(sourceWallId ? { sourceWallId, ...(knownWallIds.has(sourceWallId) ? { wallId: sourceWallId } : {}) } : {}),
      ...(hint === 'wall' || hint === 'floor' || hint === 'unlocated' ? { placementHint: hint } : {}),
    });
    seen.add(id);
  }
  return result;
}

/** Which side of each wall faces into the room, from the drawn chain alone.
 * A closed outline's winding decides it exactly: with a positive signed area
 * in plan (x, z) the room is on the left of each wall's direction, which is
 * what the planner's geometry treats as 'left'. An open run cannot be decided
 * from its shape: a run around a chimney breast or pier turns the same way as
 * an L scanned from inside, with the room on the other side. It stays
 * 'unknown'; one choice in the editor sets the whole run, because the room is
 * on the same side of every wall along a run. */
function chainInteriorSide(corners: RoomCorner[], closed: boolean): 'left' | 'right' | 'unknown' {
  if (closed) {
    if (corners.length < 3) return 'unknown';
    let twiceArea = 0;
    corners.forEach((a, index) => {
      const b = corners[(index + 1) % corners.length];
      twiceArea += a.xMm * b.zMm - b.xMm * a.zMm;
    });
    return Math.abs(twiceArea) < 1 ? 'unknown' : twiceArea > 0 ? 'left' : 'right';
  }
  return 'unknown';
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
  const wallEvidence = new Map(geometry?.wallEvidence?.map(entry => [entry.wallId, entry]));
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
    const interiorSide = chainInteriorSide(corners, chain.closed);
    const walls: RoomWall[] = chain.wallIds.map((wallId, index) => {
      if (usedWallIds.has(wallId)) throw new Error(`Capture wall ${wallId} appears twice.`);
      usedWallIds.add(wallId);
      const a = corners[index], b = corners[(index + 1) % corners.length];
      const evidence = wallEvidence.get(wallId);
      const geometrySource = evidence?.source ?? sourceOf(chain);
      const lengthSource: DimensionSource = measured.has(wallId) ? 'measured'
        : geometrySource === 'measured' ? 'unknown' : geometrySource;
      return {
        id: wallId,
        startCornerId: a.id,
        endCornerId: b.id,
        interiorSide,
        geometryEvidence: {
          source: geometrySource,
          ...(evidence?.uncertaintyMm !== undefined ? { uncertaintyMm: evidence.uncertaintyMm } : {}),
          ...(evidence?.evidenceIds?.length ? { evidenceIds: evidence.evidenceIds } : {}),
          ...(evidence?.reason ? { reason: evidence.reason } : {}),
        },
        lengthEvidence: {
          valueMm: measured.get(wallId) ?? Math.round(Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm)),
          source: lengthSource,
        },
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
      if (placedOnWall && feature.placementProvenance)
        object.placementProvenance = {
          source: 'user-correction', note: feature.placementProvenance.note!,
          ...(feature.placementProvenance.correctedAt ? { correctedAt: feature.placementProvenance.correctedAt } : {}),
          ...(feature.placementProvenance.previousWallId ? { previousWallId: feature.placementProvenance.previousWallId } : {}),
        };
      document.objects.push(object);
    }
  }
  const physicalIds = new Set([...document.openings, ...document.services, ...document.objects].map(item => item.id));
  const pending = pendingPhotoFeaturesFromState(draft.adapterState, wallIds, physicalIds);
  if (pending.length) document.pendingPhotoFeatures = pending;
  return document;
}

export interface CaptureUpdatePreview {
  document: RoomDocumentV1;
  added: { walls: number; openings: number; services: number; objects: number };
  deferred: { walls: number; openings: number; services: number; objects: number };
  updatedWallEvidence: number;
  addedPhotoObservations: number;
  changedExisting: number;
  cornerConflicts: number;
  /** Walls in both rooms whose lengths differ; the saved room keeps its own. */
  lengthDifferences: Array<{ wallId: string; currentMm: number; scanMm: number; scanSource: DimensionSource }>;
}

/** A later interpretation can fill missing outline evidence on walls whose
 * corners are unchanged. New geometry needs verified frame registration,
 * which this handoff does not yet provide; keep it pending in the scanner.
 * Previously edited positions, measurements, fittings and floor stay put. */
export function previewCaptureUpdate(current: RoomDocumentV1, incoming: RoomDocumentV1): CaptureUpdatePreview {
  if (!current.capture?.captureId || current.capture.captureId !== incoming.capture?.captureId)
    throw new Error('This scan belongs to a different room.');
  const cornersById = new Map(current.corners.map(corner => [corner.id, corner]));
  let cornerConflicts = 0;
  incoming.corners.forEach(corner => {
    const previous = cornersById.get(corner.id);
    if (previous && (previous.xMm !== corner.xMm || previous.zMm !== corner.zMm)) cornerConflicts += 1;
  });
  const wallIds = new Set(current.walls.map(wall => wall.id));
  const incomingWallsById = new Map(incoming.walls.map(wall => [wall.id, wall]));
  const incomingCornersById = new Map(incoming.corners.map(corner => [corner.id, corner]));
  let updatedWallEvidence = 0;
  const existingWalls = current.walls.map(wall => {
    const next = incomingWallsById.get(wall.id);
    if (!next || wall.startCornerId !== next.startCornerId || wall.endCornerId !== next.endCornerId) return wall;
    const start = cornersById.get(wall.startCornerId);
    const end = cornersById.get(wall.endCornerId);
    const nextStart = incomingCornersById.get(wall.startCornerId);
    const nextEnd = incomingCornersById.get(wall.endCornerId);
    if (!start || !end || !nextStart || !nextEnd
      || start.xMm !== nextStart.xMm || start.zMm !== nextStart.zMm
      || end.xMm !== nextEnd.xMm || end.zMm !== nextEnd.zMm) return wall;
    // Same wall in the same place: fill in what the saved room lacks, and
    // never overwrite what it already has (evidence, a side the person chose).
    const addEvidence = !!next.geometryEvidence && !wall.geometryEvidence;
    const addSide = (wall.interiorSide ?? 'unknown') === 'unknown'
      && (next.interiorSide === 'left' || next.interiorSide === 'right');
    if (!addEvidence && !addSide) return wall;
    updatedWallEvidence += 1;
    return { ...wall,
      ...(addEvidence ? { geometryEvidence: structuredClone(next.geometryEvidence!) } : {}),
      ...(addSide ? { interiorSide: next.interiorSide } : {}) };
  });
  const addById = <T extends { id: string }>(previous: T[], next: T[]): T[] => {
    const ids = new Set(previous.map(item => item.id));
    return next.filter(item => !ids.has(item.id));
  };
  const deferred = {
    walls: incoming.walls.filter(wall => !wallIds.has(wall.id)).length,
    openings: addById(current.openings, incoming.openings).length,
    services: addById(current.services, incoming.services).length,
    objects: addById(current.objects, incoming.objects).length,
  };
  const hasDeferredGeometry = Object.values(deferred).some(count => count > 0);
  const changedById = <T extends { id: string }>(previous: T[], next: T[]) => {
    const ids = new Map(previous.map(item => [item.id, item]));
    return next.filter(item => ids.has(item.id) && JSON.stringify(ids.get(item.id)) !== JSON.stringify(item)).length;
  };
  const changedExisting = changedById(existingWalls, incoming.walls)
    + changedById(current.openings, incoming.openings)
    + changedById(current.services, incoming.services)
    + changedById(current.objects, incoming.objects);
  // Evidence-only observations are safe to append; they cannot change room
  // geometry or cabinet clearances. Keep existing records and user edits.
  const knownPendingIds = new Set((current.pendingPhotoFeatures ?? []).map(item => item.id));
  const physicalIds = new Set([...current.openings, ...current.services, ...current.objects].map(item => item.id));
  const addedPending: PendingPhotoFeature[] = [];
  for (const item of incoming.pendingPhotoFeatures ?? []) {
    if (knownPendingIds.has(item.id) || physicalIds.has(item.id)) continue;
    // New walls are deferred until their coordinate frame is verified. Their
    // photo observations may appear in the review list, but are not attached
    // to a wall that does not exist in the saved room.
    if (item.wallId && !wallIds.has(item.wallId)) {
      const { wallId, ...unmatched } = item;
      addedPending.push({ ...unmatched, sourceWallId: item.sourceWallId ?? wallId });
    } else addedPending.push(structuredClone(item));
    knownPendingIds.add(item.id);
  }
  return {
    document: {
      ...current,
      revision: current.revision + 1,
      walls: existingWalls,
      ...(addedPending.length ? { pendingPhotoFeatures: [...(current.pendingPhotoFeatures ?? []), ...addedPending] } : {}),
      capture: { ...current.capture, sourceRevision: hasDeferredGeometry
        ? current.capture.sourceRevision : incoming.capture.sourceRevision ?? current.capture.sourceRevision },
    },
    added: { walls: 0, openings: 0, services: 0, objects: 0 },
    deferred,
    updatedWallEvidence,
    addedPhotoObservations: addedPending.length,
    changedExisting,
    cornerConflicts,
    lengthDifferences: current.walls.flatMap(wall => {
      const next = incomingWallsById.get(wall.id);
      const currentMm = wall.lengthEvidence?.valueMm, scanMm = next?.lengthEvidence?.valueMm;
      // An estimate from the scan's geometry never competes with a length;
      // only a wall the scan itself measured is offered.
      return currentMm !== undefined && scanMm !== undefined && next?.lengthEvidence?.source === 'measured'
        && Math.round(currentMm) !== Math.round(scanMm)
        ? [{ wallId: wall.id, currentMm: Math.round(currentMm), scanMm: Math.round(scanMm),
          scanSource: next!.lengthEvidence!.source }] : [];
    }),
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
