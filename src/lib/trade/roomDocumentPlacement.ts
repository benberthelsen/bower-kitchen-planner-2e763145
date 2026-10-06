import type { RoomDocumentV1, RoomPoint } from '@/lib/roomDocument/types';
import {
  footprintCorners, footprintInsideConfirmedFloor, footprintsIntersect,
  objectPose, placementPose, projectToWall, wallGeometry,
} from '@/lib/roomDocument/geometry';

export interface RoomPlacementObstacle {
  id: string;
  xMm: number;
  zMm: number;
  rotationDeg: number;
  widthMm: number;
  depthMm: number;
  category: 'Base' | 'Wall' | 'Tall' | 'Appliance';
  elevationMm?: number;
  heightMm?: number;
}

export interface RoomPlacementRequest {
  document: RoomDocumentV1;
  widthMm: number;
  depthMm: number;
  category: RoomPlacementObstacle['category'];
  elevationMm?: number;
  heightMm?: number;
  obstacles: RoomPlacementObstacle[];
  preferredPoint?: RoomPoint;
  excludeId?: string;
  clearanceMm?: number;
}

export type RoomPlacementChoice =
  | { status: 'placed'; xMm: number; zMm: number; rotationDeg: number; wallId?: string; offsetMm?: number }
  | { status: 'unplaced'; reason: string };

function sameLevel(a: RoomPlacementObstacle['category'], b: RoomPlacementObstacle['category']): boolean {
  // Tall units occupy both the base and wall-cabinet height bands. Treat the
  // pair symmetrically so drag order cannot change the collision result.
  return a === 'Tall' || b === 'Tall' || (a === 'Wall') === (b === 'Wall');
}

function overlapsVertically(req: RoomPlacementRequest, obstacle: RoomPlacementObstacle): boolean {
  if (req.heightMm !== undefined && obstacle.heightMm !== undefined) {
    const firstBottom = req.elevationMm ?? 0;
    const secondBottom = obstacle.elevationMm ?? 0;
    return firstBottom < secondBottom + obstacle.heightMm
      && secondBottom < firstBottom + req.heightMm;
  }
  return sameLevel(req.category, obstacle.category);
}

function validCandidate(req: RoomPlacementRequest, pose: { xMm: number; zMm: number; rotationDeg: number }): boolean {
  const footprint = footprintCorners(pose, req.widthMm, req.depthMm);
  if (footprintInsideConfirmedFloor(req.document, footprint).status === 'outside') return false;
  const savedObstacles: RoomPlacementObstacle[] = req.document.objects
    .filter(object => object.existingAction !== 'remove'
      && (!req.excludeId || (object.id !== req.excludeId && object.sourceCabinetId !== req.excludeId)))
    .flatMap(object => {
      const objectPosition = objectPose(req.document, object);
      if (!objectPosition) return [];
      const category = object.heightMm && object.heightMm > 1650 ? 'Tall'
        : object.kind.includes('overhead') ? 'Wall' : 'Base';
      return [{ id: object.id, ...objectPosition,
        widthMm: object.widthMm, depthMm: object.depthMm,
        elevationMm: object.elevationMm, heightMm: object.heightMm,
        category: category as RoomPlacementObstacle['category'] }];
    });
  return ![...savedObstacles, ...req.obstacles].some(obstacle => obstacle.id !== req.excludeId
    && overlapsVertically(req, obstacle)
    && footprintsIntersect(
      footprint,
      footprintCorners({ xMm: obstacle.xMm, zMm: obstacle.zMm, rotationDeg: obstacle.rotationDeg },
        obstacle.widthMm, obstacle.depthMm),
      -(req.clearanceMm ?? 5),
    ));
}

function blockedByOpening(req: RoomPlacementRequest, wallId: string, offsetMm: number): boolean {
  const endMm = offsetMm + req.widthMm;
  const margin = req.clearanceMm ?? 5;
  return req.document.openings.some(opening => opening.wallId === wallId
    && (opening.kind !== 'window' || req.category === 'Wall' || req.category === 'Tall')
    && offsetMm < opening.offsetMm + opening.widthMm + margin
    && endMm > opening.offsetMm - margin);
}

/** One finite-wall search for click-to-add and drag snapping. It never makes a
 * cabinet fit by placing it on an imagined bounding-box edge. */
export function findRoomWallPlacement(req: RoomPlacementRequest): RoomPlacementChoice {
  if (!(req.widthMm > 0 && req.depthMm > 0)) return { status: 'unplaced', reason: 'Cabinet dimensions are missing.' };
  const gap = 10;
  const candidates: Array<{ score: number; pose: { xMm: number; zMm: number; rotationDeg: number }; wallId: string; offsetMm: number }> = [];
  for (const wall of req.document.walls) {
    if (!wall.interiorSide || wall.interiorSide === 'unknown') continue;
    const geometry = wallGeometry(req.document, wall.id);
    if (!geometry || geometry.lengthMm < req.widthMm + gap * 2) continue;
    const offsets = new Set<number>([gap, Math.max(gap, geometry.lengthMm - req.widthMm - gap)]);
    for (let offset = gap; offset <= geometry.lengthMm - req.widthMm - gap; offset += 25) offsets.add(offset);
    if (req.preferredPoint) {
      const projection = projectToWall(req.document, wall.id, req.preferredPoint);
      if (projection) offsets.add(Math.max(gap, Math.min(geometry.lengthMm - req.widthMm - gap,
        projection.offsetMm - req.widthMm / 2)));
    }
    for (const offsetMm of offsets) {
      if (blockedByOpening(req, wall.id, offsetMm)) continue;
      const pose = placementPose(req.document, { type: 'wall', wallId: wall.id, offsetMm, depthOffsetMm: gap }, req.widthMm, req.depthMm);
      if (!pose || !validCandidate(req, pose)) continue;
      const score = req.preferredPoint
        ? Math.hypot(pose.xMm - req.preferredPoint.xMm, pose.zMm - req.preferredPoint.zMm)
        : candidates.length + req.document.walls.indexOf(wall) * 1e6 + offsetMm;
      candidates.push({ score, pose, wallId: wall.id, offsetMm });
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.wallId.localeCompare(b.wallId) || a.offsetMm - b.offsetMm);
  const best = candidates[0];
  return best
    ? { status: 'placed', xMm: best.pose.xMm, zMm: best.pose.zMm, rotationDeg: best.pose.rotationDeg, wallId: best.wallId, offsetMm: best.offsetMm }
    : { status: 'unplaced', reason: 'No measured wall has enough clear space for this item.' };
}

/** Keep arbitrary rotations for freestanding items when the floor is known. */
export function placeWithinRoomDocument(req: RoomPlacementRequest & { point: RoomPoint; rotationDeg: number }): RoomPlacementChoice {
  const pose = { xMm: req.point.xMm, zMm: req.point.zMm, rotationDeg: req.rotationDeg };
  if (footprintInsideConfirmedFloor(req.document, footprintCorners(pose, req.widthMm, req.depthMm)).status !== 'inside') {
    return { status: 'unplaced', reason: 'Confirm the floor boundary before placing a freestanding item.' };
  }
  return validCandidate(req, pose)
    ? { status: 'placed', ...pose }
    : { status: 'unplaced', reason: 'This item overlaps an existing item.' };
}

export function snapRoomDocumentPlacement(req: RoomPlacementRequest & { point: RoomPoint; rotationDeg: number }): RoomPlacementChoice {
  const nearest = req.document.walls
    .map(wall => ({ wall, projection: projectToWall(req.document, wall.id, req.point) }))
    .filter(pair => pair.projection && pair.wall.interiorSide && pair.wall.interiorSide !== 'unknown')
    .sort((a, b) => a.projection!.distanceMm - b.projection!.distanceMm)[0];
  if (nearest && nearest.projection!.distanceMm <= req.depthMm / 2 + 350) {
    return findRoomWallPlacement({ ...req, preferredPoint: req.point });
  }
  return placeWithinRoomDocument(req);
}
