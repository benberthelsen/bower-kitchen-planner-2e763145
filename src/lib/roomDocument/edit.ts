import { wallGeometry } from './geometry';
import { polygonSelfIntersects, validateRoomDocument } from './validate';
import type { DimensionValue, RoomCorner, RoomDocumentV1, RoomEdit, RoomEditResult, RoomIssue, RoomPoint, RoomWall, RoomWallChain } from './types';

const clone = <T>(value: T): T => structuredClone(value);
const freshId = (prefix: string): string => `${prefix}-${crypto.randomUUID()}`;
const error = (message: string, subjectId?: string): RoomIssue => ({ code: 'edit-rejected', message, severity: 'error', subjectId });

export function createRoomDocument(id: string, name?: string): RoomDocumentV1 {
  return { version: 1, id, revision: 0, name, corners: [], walls: [], chains: [], openings: [], services: [], objects: [] };
}

function chainForWall(doc: RoomDocumentV1, wallId: string): { chain: RoomWallChain; index: number } | null {
  const chain = doc.chains.find(item => item.wallIds.includes(wallId));
  return chain ? { chain, index: chain.wallIds.indexOf(wallId) } : null;
}

function pointFor(doc: RoomDocumentV1, cornerId: string): RoomCorner | null {
  return doc.corners.find(corner => corner.id === cornerId) ?? null;
}

function wallFor(doc: RoomDocumentV1, wallId: string): RoomWall | null {
  return doc.walls.find(wall => wall.id === wallId) ?? null;
}

function movedMeasuredWall(before: RoomDocumentV1, after: RoomDocumentV1, exemptWallId?: string): string | null {
  for (const wall of before.walls) {
    if (wall.id === exemptWallId || wall.lengthEvidence?.source !== 'measured') continue;
    const former = wallGeometry(before, wall.id), current = wallGeometry(after, wall.id);
    if (former && current && Math.abs(former.lengthMm - current.lengthMm) > 1) return wall.id;
  }
  return null;
}

function updateWallLength(doc: RoomDocumentV1, wallId: string, lengthMm: number, measurement?: DimensionValue): string | null {
  const wall = wallFor(doc, wallId), geometry = wallGeometry(doc, wallId), located = chainForWall(doc, wallId);
  if (!wall || !geometry || !located) return 'Choose a valid wall.';
  if (!Number.isFinite(lengthMm) || lengthMm <= 0) return 'Wall length must be positive.';
  const endpoint = pointFor(doc, wall.endCornerId)!;
  const dx = geometry.tangent.xMm * (lengthMm - geometry.lengthMm);
  const dz = geometry.tangent.zMm * (lengthMm - geometry.lengthMm);
  const affected = new Set<string>([endpoint.id]);
  if (!located.chain.closed) {
    // Shift the rest of an open chain as one group. Subsequent wall lengths and
    // angles remain unchanged, including any measured downstream segments.
    for (const id of located.chain.wallIds.slice(located.index + 1)) {
      const later = wallFor(doc, id)!;
      affected.add(later.endCornerId);
    }
  }
  for (const corner of doc.corners) if (affected.has(corner.id)) { corner.xMm += dx; corner.zMm += dz; }
  wall.lengthEvidence = measurement ? { ...clone(measurement), valueMm: lengthMm } : { valueMm: lengthMm, source: 'unknown' };
  return null;
}

function updateWallAngle(doc: RoomDocumentV1, wallId: string, angleDeg: number): string | null {
  const wall = wallFor(doc, wallId), geometry = wallGeometry(doc, wallId), located = chainForWall(doc, wallId);
  if (!wall || !geometry || !located) return 'Choose a valid wall.';
  if (!Number.isFinite(angleDeg)) return 'Wall angle must be a finite number of degrees.';
  const delta = (angleDeg - geometry.angleDeg) * Math.PI / 180;
  const affected = new Set<string>([wall.endCornerId]);
  if (!located.chain.closed) {
    for (const id of located.chain.wallIds.slice(located.index + 1)) affected.add(wallFor(doc, id)!.endCornerId);
  }
  for (const corner of doc.corners) if (affected.has(corner.id)) {
    const x = corner.xMm - geometry.start.xMm, z = corner.zMm - geometry.start.zMm;
    corner.xMm = geometry.start.xMm + x * Math.cos(delta) - z * Math.sin(delta);
    corner.zMm = geometry.start.zMm + x * Math.sin(delta) + z * Math.cos(delta);
  }
  return null;
}

function addWall(doc: RoomDocumentV1, edit: Extract<RoomEdit, { type: 'add-wall' }>): string | null {
  if (!Number.isFinite(edit.lengthMm) || edit.lengthMm <= 0 || !Number.isFinite(edit.angleDeg)) return 'New wall length and angle must be valid.';
  const wallId = edit.wallId ?? freshId('wall'), cornerId = edit.cornerId ?? freshId('corner');
  if (doc.walls.some(w => w.id === wallId) || doc.corners.some(c => c.id === cornerId)) return 'Choose IDs that are not already used.';
  const angle = edit.angleDeg * Math.PI / 180;
  const vector: RoomPoint = { xMm: Math.cos(angle) * edit.lengthMm, zMm: Math.sin(angle) * edit.lengthMm };
  const chain = edit.chainId ? doc.chains.find(item => item.id === edit.chainId) : null;
  if (edit.chainId && !chain) return 'Choose an existing wall chain.';
  if (chain?.closed) return 'Open this closed outline before adding another end wall.';
  if (!chain) {
    const start = edit.start ?? { xMm: 0, zMm: 0 };
    if (![start.xMm, start.zMm].every(Number.isFinite)) return 'Start coordinates must be finite millimetres.';
    const startId = freshId('corner');
    doc.corners.push({ id: startId, ...start }, { id: cornerId, xMm: start.xMm + vector.xMm, zMm: start.zMm + vector.zMm });
    const newChainId = edit.chainId ?? freshId('chain');
    doc.walls.push({ id: wallId, startCornerId: startId, endCornerId: cornerId, interiorSide: 'unknown' });
    doc.chains.push({ id: newChainId, wallIds: [wallId], closed: false });
    return null;
  }
  const atStart = edit.end === 'start';
  const adjacent = wallFor(doc, atStart ? chain.wallIds[0] : chain.wallIds[chain.wallIds.length - 1])!;
  const anchor = pointFor(doc, atStart ? adjacent.startCornerId : adjacent.endCornerId)!;
  const point = atStart
    ? { xMm: anchor.xMm - vector.xMm, zMm: anchor.zMm - vector.zMm }
    : { xMm: anchor.xMm + vector.xMm, zMm: anchor.zMm + vector.zMm };
  doc.corners.push({ id: cornerId, ...point });
  const wall = atStart
    ? { id: wallId, startCornerId: cornerId, endCornerId: anchor.id, interiorSide: 'unknown' as const }
    : { id: wallId, startCornerId: anchor.id, endCornerId: cornerId, interiorSide: 'unknown' as const };
  doc.walls.push(wall);
  if (atStart) chain.wallIds.unshift(wallId); else chain.wallIds.push(wallId);
  return null;
}

function splitWall(doc: RoomDocumentV1, edit: Extract<RoomEdit, { type: 'split-wall' }>): string | null {
  const wall = wallFor(doc, edit.wallId), geometry = wallGeometry(doc, edit.wallId), located = chainForWall(doc, edit.wallId);
  if (!wall || !geometry || !located) return 'Choose a valid wall to split.';
  if (!Number.isFinite(edit.offsetMm) || edit.offsetMm <= 0 || edit.offsetMm >= geometry.lengthMm) return 'Split point must be inside the wall.';
  if (wall.lengthEvidence?.source === 'measured') {
    return 'This wall has a site-measured full length. Record the new segment lengths or clear that measurement before splitting it.';
  }
  const crossesSplit = (offsetMm: number, widthMm: number) =>
    offsetMm < edit.offsetMm - 0.5 && offsetMm + widthMm > edit.offsetMm + 0.5;
  if (doc.openings.some(opening => opening.wallId === wall.id
    && crossesSplit(opening.offsetMm, opening.widthMm))) {
    return 'An opening crosses the split point. Move or resize it before splitting this wall.';
  }
  if (doc.objects.some(object => object.placement.type === 'wall'
    && object.placement.wallId === wall.id
    && crossesSplit(object.placement.offsetMm, object.widthMm))) {
    return 'An attached item crosses the split point. Move or resize it before splitting this wall.';
  }
  const newWallId = edit.newWallId ?? freshId('wall'), newCornerId = edit.newCornerId ?? freshId('corner');
  if (doc.walls.some(w => w.id === newWallId) || doc.corners.some(c => c.id === newCornerId)) return 'Choose IDs that are not already used.';
  const formerEndId = wall.endCornerId;
  doc.corners.push({ id: newCornerId,
    xMm: geometry.start.xMm + geometry.tangent.xMm * edit.offsetMm,
    zMm: geometry.start.zMm + geometry.tangent.zMm * edit.offsetMm });
  const nextWall: RoomWall = { ...clone(wall), id: newWallId, startCornerId: newCornerId, endCornerId: formerEndId, lengthEvidence: undefined };
  wall.endCornerId = newCornerId;
  wall.lengthEvidence = undefined;
  doc.walls.push(nextWall);
  located.chain.wallIds.splice(located.index + 1, 0, newWallId);
  // Physical offsets and stable feature IDs survive a split.
  for (const opening of doc.openings) if (opening.wallId === wall.id && opening.offsetMm >= edit.offsetMm) {
    opening.wallId = newWallId; opening.offsetMm -= edit.offsetMm;
  }
  for (const feature of [...doc.services, ...doc.objects]) if (feature.placement.type === 'wall'
    && feature.placement.wallId === wall.id && feature.placement.offsetMm >= edit.offsetMm) {
    feature.placement.wallId = newWallId; feature.placement.offsetMm -= edit.offsetMm;
  }
  const boundary = doc.floorBoundary?.cornerIds;
  if (boundary) {
    const index = boundary.findIndex((id, i) => id === wall.startCornerId && boundary[(i + 1) % boundary.length] === formerEndId);
    if (index >= 0) boundary.splice(index + 1, 0, newCornerId);
  }
  return null;
}

function deleteWall(doc: RoomDocumentV1, wallId: string): string | null {
  const located = chainForWall(doc, wallId), wall = wallFor(doc, wallId);
  if (!located || !wall) return 'Choose a valid wall to delete.';
  if (doc.openings.some(o => o.wallId === wallId) || [...doc.services, ...doc.objects].some(item => item.placement.type === 'wall' && item.placement.wallId === wallId)) {
    return 'Move or remove attached openings, services and objects before deleting this wall.';
  }
  if (doc.floorBoundary?.cornerIds.some((id, i, ids) => id === wall.startCornerId && ids[(i + 1) % ids.length] === wall.endCornerId)) {
    return 'Clear or revise the confirmed floor boundary before deleting this wall.';
  }
  doc.walls = doc.walls.filter(item => item.id !== wallId);
  const { chain, index } = located;
  if (chain.closed) {
    chain.wallIds = [...chain.wallIds.slice(index + 1), ...chain.wallIds.slice(0, index)];
    chain.closed = false;
  } else {
    const before = chain.wallIds.slice(0, index), after = chain.wallIds.slice(index + 1);
    if (before.length && after.length) {
      chain.wallIds = before;
      doc.chains.push({ id: freshId('chain'), wallIds: after, closed: false });
    } else if (before.length || after.length) chain.wallIds = before.length ? before : after;
    else doc.chains = doc.chains.filter(item => item.id !== chain.id);
  }
  const retained = new Set(doc.walls.flatMap(item => [item.startCornerId, item.endCornerId]));
  for (const id of doc.floorBoundary?.cornerIds ?? []) retained.add(id);
  doc.corners = doc.corners.filter(corner => retained.has(corner.id));
  return null;
}

function closeChain(doc: RoomDocumentV1, chainId: string, suppliedWallId?: string): string | null {
  const chain = doc.chains.find(item => item.id === chainId);
  if (!chain || chain.wallIds.length < 2 || chain.closed) return 'Choose an open chain with at least two walls.';
  const first = wallFor(doc, chain.wallIds[0])!, last = wallFor(doc, chain.wallIds[chain.wallIds.length - 1])!;
  if (last.endCornerId !== first.startCornerId) {
    const wallId = suppliedWallId ?? freshId('wall');
    if (doc.walls.some(item => item.id === wallId)) return 'Choose a new closing wall ID.';
    const a = pointFor(doc, last.endCornerId)!, b = pointFor(doc, first.startCornerId)!;
    if (Math.hypot(a.xMm - b.xMm, a.zMm - b.zMm) < 1) return 'Closing wall would have zero length.';
    doc.walls.push({ id: wallId, startCornerId: last.endCornerId, endCornerId: first.startCornerId, interiorSide: 'unknown' });
    chain.wallIds.push(wallId);
  }
  const polygon = chain.wallIds.map(id => pointFor(doc, wallFor(doc, id)!.startCornerId)!);
  if (polygonSelfIntersects(polygon)) return 'Closing this outline would cross another wall.';
  chain.closed = true;
  return null;
}

export function applyRoomEdit(doc: RoomDocumentV1, edit: RoomEdit): RoomEditResult {
  const previous = clone(doc), next = clone(doc);
  let failure: string | null = null;
  let subjectId: string | undefined;
  switch (edit.type) {
    case 'set-wall-length':
      subjectId = edit.wallId;
      failure = updateWallLength(next, edit.wallId, edit.lengthMm, edit.measurement);
      break;
    case 'set-wall-angle':
      subjectId = edit.wallId;
      failure = updateWallAngle(next, edit.wallId, edit.angleDeg);
      break;
    case 'set-wall-height': {
      subjectId = edit.wallId;
      const wall = wallFor(next, edit.wallId);
      if (!wall || !Number.isFinite(edit.heightMm) || edit.heightMm <= 0) failure = 'Choose a wall and a positive height.';
      else wall.height = edit.measurement ? { ...clone(edit.measurement), valueMm: edit.heightMm } : { valueMm: edit.heightMm, source: 'unknown' };
      break;
    }
    case 'set-wall-interior-side': {
      subjectId = edit.wallId;
      const wall = wallFor(next, edit.wallId);
      if (!wall) failure = 'Choose a wall to set its inside face.';
      else wall.interiorSide = edit.side;
      break;
    }
    case 'add-wall': failure = addWall(next, edit); break;
    case 'split-wall': subjectId = edit.wallId; failure = splitWall(next, edit); break;
    case 'delete-wall': subjectId = edit.wallId; failure = deleteWall(next, edit.wallId); break;
    case 'close-chain': subjectId = edit.chainId; failure = closeChain(next, edit.chainId, edit.wallId); break;
    case 'move-corner': {
      subjectId = edit.cornerId;
      const corner = pointFor(next, edit.cornerId);
      if (!corner || !Number.isFinite(edit.xMm) || !Number.isFinite(edit.zMm)) failure = 'Choose a corner and finite coordinates.';
      else { corner.xMm = edit.xMm; corner.zMm = edit.zMm; }
      break;
    }
    case 'set-floor-boundary': next.floorBoundary = { confirmed: true, cornerIds: [...edit.cornerIds], evidenceIds: edit.evidenceIds }; break;
    case 'clear-floor-boundary': delete next.floorBoundary; break;
    case 'upsert-opening': next.openings = [...next.openings.filter(item => item.id !== edit.opening.id), clone(edit.opening)]; break;
    case 'delete-opening': next.openings = next.openings.filter(item => item.id !== edit.openingId); break;
    case 'upsert-service': next.services = [...next.services.filter(item => item.id !== edit.service.id), clone(edit.service)]; break;
    case 'delete-service': next.services = next.services.filter(item => item.id !== edit.serviceId); break;
    case 'upsert-object': next.objects = [...next.objects.filter(item => item.id !== edit.object.id), clone(edit.object)]; break;
    case 'delete-object': next.objects = next.objects.filter(item => item.id !== edit.objectId); break;
  }
  if (!failure) {
    const exempt = edit.type === 'set-wall-length' || edit.type === 'split-wall' ? edit.wallId : undefined;
    const changedMeasured = movedMeasuredWall(previous, next, exempt);
    if (changedMeasured) failure = `Wall ${changedMeasured} has a confirmed measured length. Adjust or clear that constraint first.`;
  }
  if (failure) return { document: previous, previous, issues: [error(failure, subjectId)], applied: false };
  const issues = validateRoomDocument(next);
  if (issues.some(item => item.severity === 'error')) return { document: previous, previous, issues, applied: false };
  next.revision += 1;
  return { document: next, previous, issues, applied: true };
}

/** Undo is a new revision so persistence/concurrent-edit checks cannot mistake
 * the restored state for an earlier server version. */
export function undoRoomEdit(result: RoomEditResult): RoomDocumentV1 {
  if (!result.applied) return clone(result.previous);
  return { ...clone(result.previous), revision: result.document.revision + 1 };
}
