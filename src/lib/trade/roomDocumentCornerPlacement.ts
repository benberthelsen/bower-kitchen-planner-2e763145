import type { RoomDocumentV1, RoomPoint } from '@/lib/roomDocument/types';
import {
  footprintCorners, footprintInsideConfirmedFloor, footprintsIntersect,
  objectPose, placementPose, wallGeometry,
} from '@/lib/roomDocument/geometry';
import type { RoomPlacementObstacle } from './roomDocumentPlacement';

export interface RoomCornerPlacementRequest {
  document: RoomDocumentV1;
  /** The square plan footprint of the catalogue corner unit, not its arm depth. */
  footprintMm: number;
  category: RoomPlacementObstacle['category'];
  elevationMm?: number;
  heightMm?: number;
  obstacles?: RoomPlacementObstacle[];
  preferredPoint?: RoomPoint;
  excludeId?: string;
  /** A slight tolerance accommodates edited or scanned wall directions. */
  angleToleranceDeg?: number;
}

export type RoomCornerPlacementChoice =
  | { status: 'placed'; xMm: number; zMm: number; rotationDeg: number;
    wallAttachment: { wallId: string; offsetMm: number; depthOffsetMm: 0 };
    joinedWallId: string; cornerId: string; cornerReturnSide: 'Left' | 'Right';
    floorBoundaryConfirmed: boolean }
  | { status: 'unplaced'; reason: string };

const dot = (a: RoomPoint, b: RoomPoint) => a.xMm * b.xMm + a.zMm * b.zMm;
const awayFromCorner = (tangent: RoomPoint, atStart: boolean): RoomPoint => atStart
  ? tangent : { xMm: -tangent.xMm, zMm: -tangent.zMm };
const verticalOverlap = (aBottom: number, aHeight: number | undefined, bBottom: number, bHeight: number | undefined) =>
  aHeight === undefined || bHeight === undefined
    || (aBottom < bBottom + bHeight && bBottom < aBottom + aHeight);

function openingBlocks(req: RoomCornerPlacementRequest, wallId: string, startMm: number): boolean {
  const endMm = startMm + req.footprintMm;
  return req.document.openings.some(opening => {
    if (opening.wallId !== wallId || startMm >= opening.offsetMm + opening.widthMm || endMm <= opening.offsetMm) return false;
    if (opening.kind !== 'window') return true;
    return verticalOverlap(req.elevationMm ?? 0, req.heightMm,
      opening.sillHeightMm ?? 0, opening.heightMm);
  });
}

function objectBlocks(req: RoomCornerPlacementRequest, footprint: RoomPoint[]): boolean {
  const stored = req.document.objects.filter(object => (!req.excludeId
    || (object.id !== req.excludeId && object.sourceCabinetId !== req.excludeId))
    && (object.layer !== 'existing' || object.existingAction !== 'remove'))
    .map(object => ({ object, pose: objectPose(req.document, object) }));
  if (stored.some(({ object, pose }) => pose
    && verticalOverlap(req.elevationMm ?? 0, req.heightMm, object.elevationMm ?? 0, object.heightMm)
    && footprintsIntersect(footprint, footprintCorners(pose, object.widthMm, object.depthMm)))) return true;
  return (req.obstacles ?? []).some(obstacle => obstacle.id !== req.excludeId
    && verticalOverlap(req.elevationMm ?? 0, req.heightMm, obstacle.elevationMm ?? 0, obstacle.heightMm)
    && footprintsIntersect(footprint,
      footprintCorners({ xMm: obstacle.xMm, zMm: obstacle.zMm, rotationDeg: obstacle.rotationDeg }, obstacle.widthMm, obstacle.depthMm)));
}

/** A catalogue 90° corner only fits where both real wall faces bound the same
 * square. An angled or reflex join is left for separate straight runs/filler. */
export function findRoomDocumentCornerPlacement(req: RoomCornerPlacementRequest): RoomCornerPlacementChoice {
  if (!Number.isFinite(req.footprintMm) || req.footprintMm <= 0)
    return { status: 'unplaced', reason: 'A positive square corner footprint is required.' };
  const tolerance = Math.min(5, Math.max(0, req.angleToleranceDeg ?? 2));
  const cosine = Math.cos(tolerance * Math.PI / 180);
  const candidates: Extract<RoomCornerPlacementChoice, { status: 'placed' }>[] = [];
  for (const base of req.document.walls) {
    if (base.interiorSide !== 'left' && base.interiorSide !== 'right') continue;
    const a = wallGeometry(req.document, base.id);
    if (!a || a.lengthMm < req.footprintMm) continue;
    for (const joined of req.document.walls) {
      if (joined.id === base.id || (joined.interiorSide !== 'left' && joined.interiorSide !== 'right')) continue;
      const cornerId = [base.startCornerId, base.endCornerId].find(id =>
        id === joined.startCornerId || id === joined.endCornerId);
      if (!cornerId) continue;
      const b = wallGeometry(req.document, joined.id);
      if (!b || b.lengthMm < req.footprintMm) continue;
      const aAtStart = base.startCornerId === cornerId;
      const bAtStart = joined.startCornerId === cornerId;
      const aRay = awayFromCorner(a.tangent, aAtStart);
      const bRay = awayFromCorner(b.tangent, bAtStart);
      // Both inside-face normals must point into the quadrant between the
      // two wall rays; a 270° reflex corner fails this test even if perpendicular.
      if (dot(a.inwardNormal, bRay) < cosine || dot(b.inwardNormal, aRay) < cosine) continue;
      const offsetMm = aAtStart ? 0 : a.lengthMm - req.footprintMm;
      const joinedOffsetMm = bAtStart ? 0 : b.lengthMm - req.footprintMm;
      if (openingBlocks(req, base.id, offsetMm) || openingBlocks(req, joined.id, joinedOffsetMm)) continue;
      const pose = placementPose(req.document,
        { type: 'wall', wallId: base.id, offsetMm, depthOffsetMm: 0 }, req.footprintMm, req.footprintMm);
      if (!pose) continue;
      const footprint = footprintCorners(pose, req.footprintMm, req.footprintMm);
      if (footprintInsideConfirmedFloor(req.document, footprint).status === 'outside'
        || objectBlocks(req, footprint)) continue;
      candidates.push({ status: 'placed', ...pose,
        wallAttachment: { wallId: base.id, offsetMm, depthOffsetMm: 0 },
        joinedWallId: joined.id, cornerId,
        cornerReturnSide: aAtStart === (base.interiorSide === 'left') ? 'Left' : 'Right',
        floorBoundaryConfirmed: Boolean(req.document.floorBoundary?.confirmed),
      });
    }
  }
  candidates.sort((a, b) => {
    const aDistance = req.preferredPoint ? Math.hypot(a.xMm - req.preferredPoint.xMm, a.zMm - req.preferredPoint.zMm) : 0;
    const bDistance = req.preferredPoint ? Math.hypot(b.xMm - req.preferredPoint.xMm, b.zMm - req.preferredPoint.zMm) : 0;
    return aDistance - bDistance || a.wallAttachment.wallId.localeCompare(b.wallAttachment.wallId)
      || a.joinedWallId.localeCompare(b.joinedWallId);
  });
  return candidates[0] ?? { status: 'unplaced', reason: 'No clear 90° inside corner fits this catalogue footprint. Use separate straight runs and review the join or filler.' };
}
