import { PlacedItem, RoomConfig } from '../types';

export const CABINET_SNAP_THRESHOLD = 250; // mm - magnetic threshold for cabinet-to-cabinet snapping
export const WALL_SNAP_THRESHOLD = 150; // mm

export interface BoundingBox {
  left: number;
  right: number;
  front: number;
  back: number;
  centerX: number;
  centerZ: number;
}

export interface SnapResult {
  x: number;
  z: number;
  rotation: number;
  snappedTo: 'wall' | 'cabinet' | 'grid' | null;
  snapEdge?: 'left' | 'right' | 'front' | 'back';
  snappedItemId?: string;
}

/**
 * Calculate bounding box for an item considering its rotation
 */
export function getRotatedBounds(item: PlacedItem): BoundingBox {
  const rot = item.rotation % 360;
  // Swap width/depth for 90° and 270° rotations
  const isRotated90 = rot === 90 || rot === 270;
  const effectiveWidth = isRotated90 ? item.depth : item.width;
  const effectiveDepth = isRotated90 ? item.width : item.depth;

  return {
    left: item.x - effectiveWidth / 2,
    right: item.x + effectiveWidth / 2,
    front: item.z + effectiveDepth / 2,
    back: item.z - effectiveDepth / 2,
    centerX: item.x,
    centerZ: item.z,
  };
}

/**
 * Check if two items are colliding (overlapping)
 */
export function checkCollision(itemA: PlacedItem, itemB: PlacedItem, padding: number = 5): boolean {
  const boundsA = getRotatedBounds(itemA);
  const boundsB = getRotatedBounds(itemB);

  const overlapX = boundsA.right > boundsB.left + padding && boundsA.left < boundsB.right - padding;
  const overlapZ = boundsA.front > boundsB.back + padding && boundsA.back < boundsB.front - padding;

  return overlapX && overlapZ;
}

/**
 * Find all potential snap points from nearby cabinets
 */
export function findCabinetSnapPoints(
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  threshold: number = CABINET_SNAP_THRESHOLD
): { x: number; z: number; edge: 'left' | 'right' | 'front' | 'back'; targetId: string; distance: number }[] {
  const snapPoints: { x: number; z: number; edge: 'left' | 'right' | 'front' | 'back'; targetId: string; distance: number }[] = [];
  const draggedBounds = getRotatedBounds(draggedItem);

  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    if (other.itemType !== 'Cabinet' && other.itemType !== 'Appliance') continue;

    const otherBounds = getRotatedBounds(other);

    // Check right edge of dragged → left edge of other (side-to-side)
    const distRightToLeft = Math.abs(draggedBounds.right - otherBounds.left);
    if (distRightToLeft < threshold) {
      // Align Z if close
      const zAligned = Math.abs(draggedBounds.back - otherBounds.back) < threshold ? otherBounds.back + (draggedItem.depth / 2) : draggedItem.z;
      snapPoints.push({
        x: otherBounds.left - (draggedItem.width / 2),
        z: zAligned,
        edge: 'right',
        targetId: other.instanceId,
        distance: distRightToLeft,
      });
    }

    // Check left edge of dragged → right edge of other
    const distLeftToRight = Math.abs(draggedBounds.left - otherBounds.right);
    if (distLeftToRight < threshold) {
      const zAligned = Math.abs(draggedBounds.back - otherBounds.back) < threshold ? otherBounds.back + (draggedItem.depth / 2) : draggedItem.z;
      snapPoints.push({
        x: otherBounds.right + (draggedItem.width / 2),
        z: zAligned,
        edge: 'left',
        targetId: other.instanceId,
        distance: distLeftToRight,
      });
    }

    // Check front edge of dragged → back edge of other
    const distFrontToBack = Math.abs(draggedBounds.front - otherBounds.back);
    if (distFrontToBack < threshold) {
      const xAligned = Math.abs(draggedBounds.left - otherBounds.left) < threshold ? otherBounds.left + (draggedItem.width / 2) : draggedItem.x;
      snapPoints.push({
        x: xAligned,
        z: otherBounds.back - (draggedItem.depth / 2),
        edge: 'front',
        targetId: other.instanceId,
        distance: distFrontToBack,
      });
    }

    // Check back edge of dragged → front edge of other
    const distBackToFront = Math.abs(draggedBounds.back - otherBounds.front);
    if (distBackToFront < threshold) {
      const xAligned = Math.abs(draggedBounds.left - otherBounds.left) < threshold ? otherBounds.left + (draggedItem.width / 2) : draggedItem.x;
      snapPoints.push({
        x: xAligned,
        z: otherBounds.front + (draggedItem.depth / 2),
        edge: 'back',
        targetId: other.instanceId,
        distance: distBackToFront,
      });
    }
  }

  // Sort by distance (closest first)
  return snapPoints.sort((a, b) => a.distance - b.distance);
}

/**
 * Calculate the snap position for a dragged item
 */
export function calculateSnapPosition(
  rawX: number,
  rawZ: number,
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  room: RoomConfig,
  gridSnap: number = 50
): SnapResult {
  let x = Math.round(rawX / gridSnap) * gridSnap;
  let z = Math.round(rawZ / gridSnap) * gridSnap;
  let rotation = draggedItem.rotation;
  let snappedTo: SnapResult['snappedTo'] = 'grid';
  let snapEdge: SnapResult['snapEdge'] = undefined;
  let snappedItemId: string | undefined = undefined;

  const width = draggedItem.width;
  const depth = draggedItem.depth;

  // Check wall snapping first (highest priority)
  const dBack = z;
  const dLeft = x;
  const dRight = room.width - x;
  const dFront = room.depth - z;

  if (dBack < WALL_SNAP_THRESHOLD) {
    rotation = 0;
    z = depth / 2;
    snappedTo = 'wall';
    snapEdge = 'back';
  } else if (dLeft < WALL_SNAP_THRESHOLD) {
    rotation = 270;
    x = depth / 2;
    snappedTo = 'wall';
    snapEdge = 'left';
  } else if (dRight < WALL_SNAP_THRESHOLD) {
    rotation = 90;
    x = room.width - depth / 2;
    snappedTo = 'wall';
    snapEdge = 'right';
  } else if (dFront < WALL_SNAP_THRESHOLD) {
    rotation = 180;
    z = room.depth - depth / 2;
    snappedTo = 'wall';
    snapEdge = 'front';
  }

  // If not wall snapped, check cabinet-to-cabinet snapping
  if (snappedTo !== 'wall') {
    const tempItem: PlacedItem = { ...draggedItem, x, z, rotation };
    const snapPoints = findCabinetSnapPoints(tempItem, allItems, CABINET_SNAP_THRESHOLD);

    if (snapPoints.length > 0) {
      const best = snapPoints[0];
      x = best.x;
      z = best.z;
      snappedTo = 'cabinet';
      snapEdge = best.edge;
      snappedItemId = best.targetId;
    }
  }

  // Clamp to room bounds
  const isRotated90 = rotation === 90 || rotation === 270;
  const effectiveWidth = isRotated90 ? depth : width;
  const effectiveDepth = isRotated90 ? width : depth;

  x = Math.max(effectiveWidth / 2, Math.min(room.width - effectiveWidth / 2, x));
  z = Math.max(effectiveDepth / 2, Math.min(room.depth - effectiveDepth / 2, z));

  // Final collision check - prevent overlap
  const testItem: PlacedItem = { ...draggedItem, x, z, rotation };
  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    if (checkCollision(testItem, other)) {
      // Collision detected - try to push away slightly
      const otherBounds = getRotatedBounds(other);
      const testBounds = getRotatedBounds(testItem);

      // Determine push direction based on overlap
      const overlapLeft = testBounds.right - otherBounds.left;
      const overlapRight = otherBounds.right - testBounds.left;
      const overlapFront = testBounds.front - otherBounds.back;
      const overlapBack = otherBounds.front - testBounds.back;

      const minOverlap = Math.min(overlapLeft, overlapRight, overlapFront, overlapBack);

      if (minOverlap === overlapLeft) x -= overlapLeft + 10;
      else if (minOverlap === overlapRight) x += overlapRight + 10;
      else if (minOverlap === overlapFront) z -= overlapFront + 10;
      else if (minOverlap === overlapBack) z += overlapBack + 10;
    }
  }

  return { x, z, rotation, snappedTo, snapEdge, snappedItemId };
}
