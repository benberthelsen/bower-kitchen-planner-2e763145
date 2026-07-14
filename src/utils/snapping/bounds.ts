import { PlacedItem } from '../../types';
import { BoundingBox } from './types';

/**
 * Calculate bounding box for an item considering its rotation
 */
export function getRotatedBounds(item: PlacedItem): BoundingBox {
  const rot = ((item.rotation % 360) + 360) % 360; // Normalize to 0-359
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
 * Get effective dimensions considering rotation
 */
export function getEffectiveDimensions(item: PlacedItem): { width: number; depth: number } {
  const rot = ((item.rotation % 360) + 360) % 360;
  const isRotated90 = rot === 90 || rot === 270;
  return {
    width: isRotated90 ? item.depth : item.width,
    depth: isRotated90 ? item.width : item.depth,
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
