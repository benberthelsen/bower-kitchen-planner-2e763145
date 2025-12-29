import { PlacedItem, RoomConfig, GlobalDimensions } from '../../types';
import { SnapResult, SnapContext } from './types';
import { getRotatedBounds, getEffectiveDimensions, checkCollision } from './bounds';
import { findWallSnap, detectCorner, WALL_SNAP_THRESHOLD } from './wallSnapping';
import { findCabinetSnapPoints, CABINET_SNAP_THRESHOLD } from './cabinetSnapping';

// Re-export for backwards compatibility
export { checkCollision, getRotatedBounds } from './bounds';
export { CABINET_SNAP_THRESHOLD } from './cabinetSnapping';
export { WALL_SNAP_THRESHOLD } from './wallSnapping';
export type { SnapResult, BoundingBox } from './types';

/**
 * Main snapping calculation function
 * Priority: Corner > Wall > Cabinet > Grid
 */
export function calculateSnapPosition(
  rawX: number,
  rawZ: number,
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  room: RoomConfig,
  gridSnap: number = 50,
  globalDimensions?: GlobalDimensions
): SnapResult {
  // Use default dimensions if not provided (backwards compatibility)
  const dims: GlobalDimensions = globalDimensions ?? {
    toeKickHeight: 135,
    shelfSetback: 5,
    baseHeight: 730,
    baseDepth: 575,
    wallHeight: 720,
    wallDepth: 350,
    tallHeight: 2100,
    tallDepth: 580,
    benchtopThickness: 33,
    benchtopOverhang: 25,
    splashbackHeight: 600,
    doorGap: 2,
    drawerGap: 2,
    leftGap: 1.5,
    rightGap: 1.5,
    topMargin: 0,
    bottomMargin: 0,
    wallGap: 10, // 10mm gap between cabinet back and wall
  };

  // Start with grid-snapped position
  let x = Math.round(rawX / gridSnap) * gridSnap;
  let z = Math.round(rawZ / gridSnap) * gridSnap;
  let rotation = draggedItem.rotation;
  let snappedTo: SnapResult['snappedTo'] = 'grid';
  let snapEdge: SnapResult['snapEdge'] = undefined;
  let snappedItemId: string | undefined = undefined;
  let wallId: SnapResult['wallId'] = undefined;

  const wallGap = dims.wallGap;
  const itemDepth = draggedItem.depth;
  const itemWidth = draggedItem.width;

  // 1. Check for corner snap (highest priority for corner cabinets)
  const corner = detectCorner(rawX, rawZ, draggedItem, room, dims);
  if (corner) {
    x = corner.position.x;
    z = corner.position.z;
    rotation = corner.rotation;
    snappedTo = 'corner';
    return { x, z, rotation, snappedTo, snapEdge, snappedItemId, wallId };
  }

  // 2. Check wall snapping
  const wallSnap = findWallSnap(rawX, rawZ, draggedItem, room, dims);
  if (wallSnap?.snapped) {
    const wall = wallSnap.wall;
    wallId = wall.id;
    rotation = wall.rotation;
    snappedTo = 'wall';

    // Calculate snap position based on wall
    switch (wall.id) {
      case 'back':
        z = itemDepth / 2 + wallGap;
        snapEdge = 'back';
        break;
      case 'left':
        x = itemDepth / 2 + wallGap;
        snapEdge = 'left';
        break;
      case 'right':
        x = room.width - itemDepth / 2 - wallGap;
        snapEdge = 'right';
        break;
      case 'front':
        z = room.depth - itemDepth / 2 - wallGap;
        snapEdge = 'front';
        break;
    }

    // When snapped to wall, allow smooth sliding along the wall
    // X stays grid-snapped for horizontal walls, Z for vertical
    if (wall.id === 'back' || wall.id === 'front') {
      x = Math.round(rawX / gridSnap) * gridSnap;
    } else {
      z = Math.round(rawZ / gridSnap) * gridSnap;
    }
  }

  // 3. Check cabinet-to-cabinet snapping (if not wall-snapped, or enhance wall snap with cabinet alignment)
  const tempItem: PlacedItem = { ...draggedItem, x, z, rotation };
  const cabinetSnapPoints = findCabinetSnapPoints(tempItem, allItems, CABINET_SNAP_THRESHOLD);

  if (cabinetSnapPoints.length > 0) {
    const best = cabinetSnapPoints[0];
    
    // If wall-snapped, only apply cabinet snap if it's along the same axis
    if (snappedTo === 'wall') {
      // For horizontal walls (back/front), we can snap X to cabinets
      if ((wallId === 'back' || wallId === 'front') && (best.edge === 'left' || best.edge === 'right')) {
        x = best.x;
        snappedItemId = best.targetId;
        snapEdge = best.edge;
      }
      // For vertical walls (left/right), we can snap Z to cabinets
      else if ((wallId === 'left' || wallId === 'right') && (best.edge === 'front' || best.edge === 'back')) {
        z = best.z;
        snappedItemId = best.targetId;
        snapEdge = best.edge;
      }
    } else {
      // Not wall-snapped, apply full cabinet snap
      x = best.x;
      z = best.z;
      snappedTo = 'cabinet';
      snapEdge = best.edge;
      snappedItemId = best.targetId;
    }
  }

  // 4. Clamp to room bounds
  const effDims = getEffectiveDimensions({ ...draggedItem, rotation });
  const effectiveWidth = effDims.width;
  const effectiveDepth = effDims.depth;

  x = Math.max(effectiveWidth / 2 + wallGap, Math.min(room.width - effectiveWidth / 2 - wallGap, x));
  z = Math.max(effectiveDepth / 2 + wallGap, Math.min(room.depth - effectiveDepth / 2 - wallGap, z));

  // 5. Collision resolution - push away from overlapping items
  const testItem: PlacedItem = { ...draggedItem, x, z, rotation };
  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    if (checkCollision(testItem, other)) {
      const otherBounds = getRotatedBounds(other);
      const testBounds = getRotatedBounds(testItem);

      // Calculate overlap amounts
      const overlapLeft = testBounds.right - otherBounds.left;
      const overlapRight = otherBounds.right - testBounds.left;
      const overlapFront = testBounds.front - otherBounds.back;
      const overlapBack = otherBounds.front - testBounds.back;

      const minOverlap = Math.min(overlapLeft, overlapRight, overlapFront, overlapBack);
      const pushAmount = minOverlap + 10;

      if (minOverlap === overlapLeft) x -= pushAmount;
      else if (minOverlap === overlapRight) x += pushAmount;
      else if (minOverlap === overlapFront) z -= pushAmount;
      else if (minOverlap === overlapBack) z += pushAmount;

      // Keep the pushed result inside the room (including wallGap)
      testItem.x = x;
      testItem.z = z;
      const pushedDims = getEffectiveDimensions(testItem);
      x = Math.max(pushedDims.width / 2 + wallGap, Math.min(room.width - pushedDims.width / 2 - wallGap, x));
      z = Math.max(pushedDims.depth / 2 + wallGap, Math.min(room.depth - pushedDims.depth / 2 - wallGap, z));
      testItem.x = x;
      testItem.z = z;
    }
  }

  // Final bounds check after collision resolution (include wallGap so we never drift into/through walls)
  const finalEffDims = getEffectiveDimensions(testItem);
  x = Math.max(finalEffDims.width / 2 + wallGap, Math.min(room.width - finalEffDims.width / 2 - wallGap, x));
  z = Math.max(finalEffDims.depth / 2 + wallGap, Math.min(room.depth - finalEffDims.depth / 2 - wallGap, z));

  return { x, z, rotation, snappedTo, snapEdge, snappedItemId, wallId };
}
