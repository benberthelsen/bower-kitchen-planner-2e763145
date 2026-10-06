import { confirmedFloorPolygon, segmentIntersection, wallGeometry } from './geometry';
import type { RoomDocumentV1, RoomIssue, RoomPlacement, RoomPoint } from './types';

const issue = (code: string, message: string, severity: RoomIssue['severity'], subjectId?: string): RoomIssue =>
  ({ code, message, severity, subjectId });

function polygonArea(points: RoomPoint[]): number {
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    twiceArea += a.xMm * b.zMm - b.xMm * a.zMm;
  }
  return Math.abs(twiceArea) / 2;
}

export function polygonSelfIntersects(points: RoomPoint[], closed = true): boolean {
  const count = closed ? points.length : points.length - 1;
  for (let i = 0; i < count; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    for (let j = i + 2; j < count; j++) {
      if (closed && i === 0 && j === count - 1) continue;
      const c = points[j], d = points[(j + 1) % points.length];
      const hit = segmentIntersection(a, b, c, d);
      if (hit && hit.t > 1e-7 && hit.t < 1 - 1e-7 && hit.u > 1e-7 && hit.u < 1 - 1e-7) return true;
    }
  }
  return false;
}

/** Errors block a transaction. Warnings retain the edit and identify work to
 * review, such as an opening displaced beyond a shortened wall. */
export function validateRoomDocument(doc: RoomDocumentV1): RoomIssue[] {
  const issues: RoomIssue[] = [];
  if (doc.version !== 1) issues.push(issue('unsupported-version', 'This room document version is not supported.', 'error'));
  if (!doc.id) issues.push(issue('missing-room-id', 'Room document needs a stable ID.', 'error'));
  if (!Number.isInteger(doc.revision) || doc.revision < 0) issues.push(issue('invalid-revision', 'Room revision must be a nonnegative integer.', 'error'));
  const seen = new Set<string>();
  for (const [kind, records] of [
    ['corner', doc.corners], ['wall', doc.walls], ['chain', doc.chains],
    ['opening', doc.openings], ['service', doc.services], ['object', doc.objects],
  ] as const) {
    for (const record of records) {
      if (!record.id || seen.has(record.id)) issues.push(issue('duplicate-id', `${kind} ID ${record.id || '(empty)'} must be unique across the room.`, 'error', record.id));
      seen.add(record.id);
    }
  }
  const corners = new Map(doc.corners.map(c => [c.id, c]));
  const walls = new Map(doc.walls.map(w => [w.id, w]));
  for (const corner of doc.corners) {
    if (!Number.isFinite(corner.xMm) || !Number.isFinite(corner.zMm)) issues.push(issue('invalid-corner', 'Corner coordinates must be finite millimetres.', 'error', corner.id));
  }
  for (const wall of doc.walls) {
    if (!corners.has(wall.startCornerId) || !corners.has(wall.endCornerId)) issues.push(issue('missing-corner', 'Wall has a missing corner.', 'error', wall.id));
    else if (!wallGeometry(doc, wall.id)) issues.push(issue('zero-wall', 'Wall length must be greater than zero.', 'error', wall.id));
    if (wall.height && (!Number.isFinite(wall.height.valueMm) || wall.height.valueMm <= 0)) issues.push(issue('invalid-height', 'Wall height must be positive.', 'error', wall.id));
  }
  const assignedWalls = new Set<string>();
  for (const chain of doc.chains) {
    if (!chain.wallIds.length) issues.push(issue('empty-chain', 'A wall chain must contain a wall.', 'error', chain.id));
    for (let i = 0; i < chain.wallIds.length; i++) {
      const wall = walls.get(chain.wallIds[i]);
      if (!wall) { issues.push(issue('missing-wall', 'Wall chain refers to a missing wall.', 'error', chain.id)); continue; }
      if (assignedWalls.has(wall.id)) issues.push(issue('wall-in-multiple-chains', 'A wall belongs to more than one chain.', 'error', wall.id));
      assignedWalls.add(wall.id);
      const next = walls.get(chain.wallIds[(i + 1) % chain.wallIds.length]);
      if (next && (i < chain.wallIds.length - 1 || chain.closed) && wall.endCornerId !== next.startCornerId) {
        issues.push(issue('disconnected-chain', 'Wall chain corners do not meet in order.', 'error', chain.id));
      }
    }
    if (chain.closed && chain.wallIds.length < 3) issues.push(issue('short-closed-chain', 'A closed outline needs at least three wall segments.', 'error', chain.id));
    if (chain.wallIds.length >= 3 && chain.wallIds.every(id => walls.has(id))) {
      const points = chain.wallIds.map(id => corners.get(walls.get(id)!.startCornerId));
      const tail = corners.get(walls.get(chain.wallIds[chain.wallIds.length - 1])!.endCornerId);
      if (points.every(point => point) && tail) {
        const path = chain.closed ? points as RoomPoint[] : [...points as RoomPoint[], tail];
        if (polygonSelfIntersects(path, chain.closed)) issues.push(issue('crossed-wall-chain', 'Wall chain crosses itself; correct the corners.', 'error', chain.id));
      }
    }
  }
  for (const wall of doc.walls) if (!assignedWalls.has(wall.id)) issues.push(issue('unassigned-wall', 'Wall is not in a chain.', 'error', wall.id));
  if (doc.floorBoundary) {
    const ids = doc.floorBoundary.cornerIds;
    if (ids.length < 3 || new Set(ids).size !== ids.length || ids.some(id => !corners.has(id))) {
      issues.push(issue('invalid-floor-boundary', 'Confirmed floor boundary needs at least three distinct known corners.', 'error'));
    } else {
      const polygon = confirmedFloorPolygon(doc)!;
      if (polygonArea(polygon) < 1) issues.push(issue('zero-floor-area', 'Confirmed floor has no usable area.', 'error'));
      if (polygonSelfIntersects(polygon)) issues.push(issue('crossed-floor-boundary', 'Confirmed floor boundary crosses itself.', 'error'));
    }
  }
  const checkPlacement = (placement: RoomPlacement, widthMm: number, id: string) => {
    if (placement.type === 'free') {
      if (![placement.xMm, placement.zMm, placement.rotationDeg].every(Number.isFinite)) issues.push(issue('invalid-pose', 'Free object coordinates and angle must be finite.', 'error', id));
      return;
    }
    const wall = wallGeometry(doc, placement.wallId);
    if (!wall) { issues.push(issue('missing-anchor-wall', 'Attached feature has no valid wall.', 'error', id)); return; }
    if (!Number.isFinite(placement.offsetMm) || placement.offsetMm < -0.001 || placement.offsetMm + widthMm > wall.lengthMm + 0.001) {
      issues.push(issue('attachment-outside-wall', 'Attached feature exceeds its wall; move it or check the wall length.', 'warning', id));
    }
  };
  for (const opening of doc.openings) {
    if (!Number.isFinite(opening.widthMm) || opening.widthMm <= 0) issues.push(issue('invalid-opening-width', 'Opening width must be positive.', 'error', opening.id));
    checkPlacement({ type: 'wall', wallId: opening.wallId, offsetMm: opening.offsetMm }, opening.widthMm, opening.id);
    if (opening.benchtopObjectId && !doc.objects.some(object => object.id === opening.benchtopObjectId)) {
      issues.push(issue('missing-benchtop-link', 'Window refers to a missing benchtop object.', 'warning', opening.id));
    }
  }
  for (const service of doc.services) checkPlacement(service.placement, 0, service.id);
  for (const object of doc.objects) {
    if (![object.widthMm, object.depthMm].every(n => Number.isFinite(n) && n > 0)) issues.push(issue('invalid-object-size', 'Object width and depth must be positive.', 'error', object.id));
    if (object.heightMm !== undefined && (!Number.isFinite(object.heightMm) || object.heightMm <= 0)) issues.push(issue('invalid-object-height', 'Object height must be positive.', 'error', object.id));
    if (object.elevationMm !== undefined && (!Number.isFinite(object.elevationMm) || object.elevationMm < 0)) issues.push(issue('invalid-object-elevation', 'Object elevation must be zero or higher.', 'error', object.id));
    checkPlacement(object.placement, object.widthMm, object.id);
    if (object.layer === 'existing' && !object.existingAction) issues.push(issue('existing-action-unset', 'Choose keep, remove or relocate for this existing object.', 'warning', object.id));
  }
  return issues;
}
