import { PlacedItem } from '../../types';
import { CabinetSnapPoint } from './types';
import { getRotatedBounds, getEffectiveDimensions } from './bounds';

export const CABINET_SNAP_THRESHOLD = 250; // mm - magnetic threshold for cabinet-to-cabinet snapping
export const CABINET_ALIGN_THRESHOLD = 100; // mm - threshold for aligning edges

/**
 * Find all potential snap points from nearby cabinets
 */
export function findCabinetSnapPoints(
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  threshold: number = CABINET_SNAP_THRESHOLD
): CabinetSnapPoint[] {
  const snapPoints: CabinetSnapPoint[] = [];
  const draggedBounds = getRotatedBounds(draggedItem);
  const draggedDims = getEffectiveDimensions(draggedItem);

  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    if (other.itemType !== 'Cabinet' && other.itemType !== 'Appliance') continue;

    const otherBounds = getRotatedBounds(other);
    const otherDims = getEffectiveDimensions(other);

    // Check all 4 edge combinations for snapping

    // Right edge of dragged → left edge of other (side-to-side)
    const distRightToLeft = Math.abs(draggedBounds.right - otherBounds.left);
    if (distRightToLeft < threshold) {
      const zAlignedBack = Math.abs(draggedBounds.back - otherBounds.back) < CABINET_ALIGN_THRESHOLD;
      const zAlignedFront = Math.abs(draggedBounds.front - otherBounds.front) < CABINET_ALIGN_THRESHOLD;
      
      let snapZ = draggedItem.z;
      if (zAlignedBack) snapZ = otherBounds.back + draggedDims.depth / 2;
      else if (zAlignedFront) snapZ = otherBounds.front - draggedDims.depth / 2;

      snapPoints.push({
        x: otherBounds.left - draggedDims.width / 2,
        z: snapZ,
        edge: 'right',
        targetId: other.instanceId,
        distance: distRightToLeft,
        alignedZ: zAlignedBack || zAlignedFront,
        alignedX: false,
      });
    }

    // Left edge of dragged → right edge of other
    const distLeftToRight = Math.abs(draggedBounds.left - otherBounds.right);
    if (distLeftToRight < threshold) {
      const zAlignedBack = Math.abs(draggedBounds.back - otherBounds.back) < CABINET_ALIGN_THRESHOLD;
      const zAlignedFront = Math.abs(draggedBounds.front - otherBounds.front) < CABINET_ALIGN_THRESHOLD;
      
      let snapZ = draggedItem.z;
      if (zAlignedBack) snapZ = otherBounds.back + draggedDims.depth / 2;
      else if (zAlignedFront) snapZ = otherBounds.front - draggedDims.depth / 2;

      snapPoints.push({
        x: otherBounds.right + draggedDims.width / 2,
        z: snapZ,
        edge: 'left',
        targetId: other.instanceId,
        distance: distLeftToRight,
        alignedZ: zAlignedBack || zAlignedFront,
        alignedX: false,
      });
    }

    // Front edge of dragged → back edge of other
    const distFrontToBack = Math.abs(draggedBounds.front - otherBounds.back);
    if (distFrontToBack < threshold) {
      const xAlignedLeft = Math.abs(draggedBounds.left - otherBounds.left) < CABINET_ALIGN_THRESHOLD;
      const xAlignedRight = Math.abs(draggedBounds.right - otherBounds.right) < CABINET_ALIGN_THRESHOLD;
      
      let snapX = draggedItem.x;
      if (xAlignedLeft) snapX = otherBounds.left + draggedDims.width / 2;
      else if (xAlignedRight) snapX = otherBounds.right - draggedDims.width / 2;

      snapPoints.push({
        x: snapX,
        z: otherBounds.back - draggedDims.depth / 2,
        edge: 'front',
        targetId: other.instanceId,
        distance: distFrontToBack,
        alignedZ: false,
        alignedX: xAlignedLeft || xAlignedRight,
      });
    }

    // Back edge of dragged → front edge of other
    const distBackToFront = Math.abs(draggedBounds.back - otherBounds.front);
    if (distBackToFront < threshold) {
      const xAlignedLeft = Math.abs(draggedBounds.left - otherBounds.left) < CABINET_ALIGN_THRESHOLD;
      const xAlignedRight = Math.abs(draggedBounds.right - otherBounds.right) < CABINET_ALIGN_THRESHOLD;
      
      let snapX = draggedItem.x;
      if (xAlignedLeft) snapX = otherBounds.left + draggedDims.width / 2;
      else if (xAlignedRight) snapX = otherBounds.right - draggedDims.width / 2;

      snapPoints.push({
        x: snapX,
        z: otherBounds.front + draggedDims.depth / 2,
        edge: 'back',
        targetId: other.instanceId,
        distance: distBackToFront,
        alignedZ: false,
        alignedX: xAlignedLeft || xAlignedRight,
      });
    }
  }

  // Sort by distance, but prefer aligned snaps
  return snapPoints.sort((a, b) => {
    // Prefer snaps that also align edges
    const aAligned = a.alignedZ || a.alignedX ? 1 : 0;
    const bAligned = b.alignedZ || b.alignedX ? 1 : 0;
    if (aAligned !== bAligned) return bAligned - aAligned;
    return a.distance - b.distance;
  });
}

/**
 * Find cabinets that are already snapped to the same wall
 * to inherit their alignment
 */
export function findWallRunCabinets(
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  wallId: 'back' | 'left' | 'right' | 'front'
): PlacedItem[] {
  const wallCabinets: PlacedItem[] = [];
  
  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    if (other.itemType !== 'Cabinet') continue;
    
    const rot = ((other.rotation % 360) + 360) % 360;
    
    // Check if this cabinet is aligned to the specified wall
    const isAligned = (
      (wallId === 'back' && rot === 0) ||
      (wallId === 'left' && rot === 270) ||
      (wallId === 'right' && rot === 90) ||
      (wallId === 'front' && rot === 180)
    );
    
    if (isAligned) {
      wallCabinets.push(other);
    }
  }
  
  return wallCabinets;
}
