import { PlacedItem, RoomConfig, GlobalDimensions } from '../../types';
import { CabinetSnapPoint } from './types';
import { getRotatedBounds, getEffectiveDimensions } from './bounds';

export const CABINET_SNAP_THRESHOLD = 250; // mm - increased magnetic threshold for cabinet-to-cabinet snapping
export const CABINET_ALIGN_THRESHOLD = 100; // mm - threshold for aligning edges
export const BACK_ALIGN_THRESHOLD = 80; // mm - threshold for back-to-back alignment (same wall run)

/**
 * Check if two cabinets have similar rotation (same wall orientation)
 */
function hasSimilarRotation(rot1: number, rot2: number): boolean {
  const norm1 = ((rot1 % 360) + 360) % 360;
  const norm2 = ((rot2 % 360) + 360) % 360;
  return norm1 === norm2;
}

/**
 * Find all potential snap points from nearby cabinets
 * Prioritizes flush side-by-side placement with back alignment
 */
export function findCabinetSnapPoints(
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  threshold: number = CABINET_SNAP_THRESHOLD
): CabinetSnapPoint[] {
  const snapPoints: CabinetSnapPoint[] = [];
  const draggedBounds = getRotatedBounds(draggedItem);
  const draggedDims = getEffectiveDimensions(draggedItem);
  const draggedRot = ((draggedItem.rotation % 360) + 360) % 360;

  for (const other of allItems) {
    if (other.instanceId === draggedItem.instanceId) continue;
    if (other.itemType !== 'Cabinet' && other.itemType !== 'Appliance') continue;

    const otherBounds = getRotatedBounds(other);
    const otherDims = getEffectiveDimensions(other);
    const otherRot = ((other.rotation % 360) + 360) % 360;
    const sameOrientation = hasSimilarRotation(draggedItem.rotation, other.rotation);

    // === SIDE-BY-SIDE SNAPPING (most common for cabinet runs) ===
    
    // Calculate center-to-center and edge-to-edge distances
    const horizontalCenterDist = Math.abs(draggedItem.x - other.x);
    const verticalCenterDist = Math.abs(draggedItem.z - other.z);

    // Right edge of dragged → left edge of other (dragged is to the left)
    // Distance from right edge of dragged to left edge of other
    const gapRightToLeft = otherBounds.left - draggedBounds.right;
    const distRightToLeft = Math.abs(gapRightToLeft);
    
    // Only snap if edges are close or overlapping slightly
    if (distRightToLeft < threshold && gapRightToLeft > -draggedDims.width * 0.5) {
      // Check Z alignment (back edges aligned for wall runs)
      const backAligned = Math.abs(draggedBounds.back - otherBounds.back) < BACK_ALIGN_THRESHOLD;
      const frontAligned = Math.abs(draggedBounds.front - otherBounds.front) < CABINET_ALIGN_THRESHOLD;
      const centerZAligned = Math.abs(draggedItem.z - other.z) < CABINET_ALIGN_THRESHOLD;
      
      let snapZ = draggedItem.z;
      // Prefer back alignment for same-orientation cabinets (wall runs)
      if (backAligned && sameOrientation) {
        // Align back edges: draggedBounds.back should equal otherBounds.back
        // draggedItem.z - draggedDims.depth/2 = otherBounds.back
        snapZ = otherBounds.back + draggedDims.depth / 2;
      } else if (frontAligned) {
        snapZ = otherBounds.front - draggedDims.depth / 2;
      } else if (centerZAligned) {
        snapZ = other.z;
      }

      const isAligned = backAligned || frontAligned || centerZAligned;
      
      // Snap X position: right edge of dragged flush with left edge of other
      // draggedBounds.right = otherBounds.left → draggedItem.x + draggedDims.width/2 = otherBounds.left
      const snapX = otherBounds.left - draggedDims.width / 2;
      
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: 'right',
        targetId: other.instanceId,
        distance: distRightToLeft,
        alignedZ: isAligned,
        alignedX: false,
        priority: sameOrientation && backAligned ? 5 : sameOrientation ? 4 : isAligned ? 3 : 2,
      } as CabinetSnapPoint & { priority: number });
    }

    // Left edge of dragged → right edge of other (dragged is to the right)
    const gapLeftToRight = draggedBounds.left - otherBounds.right;
    const distLeftToRight = Math.abs(gapLeftToRight);
    
    if (distLeftToRight < threshold && gapLeftToRight > -draggedDims.width * 0.5) {
      const backAligned = Math.abs(draggedBounds.back - otherBounds.back) < BACK_ALIGN_THRESHOLD;
      const frontAligned = Math.abs(draggedBounds.front - otherBounds.front) < CABINET_ALIGN_THRESHOLD;
      const centerZAligned = Math.abs(draggedItem.z - other.z) < CABINET_ALIGN_THRESHOLD;
      
      let snapZ = draggedItem.z;
      if (backAligned && sameOrientation) {
        snapZ = otherBounds.back + draggedDims.depth / 2;
      } else if (frontAligned) {
        snapZ = otherBounds.front - draggedDims.depth / 2;
      } else if (centerZAligned) {
        snapZ = other.z;
      }

      const isAligned = backAligned || frontAligned || centerZAligned;
      
      // Snap X position: left edge of dragged flush with right edge of other
      // draggedBounds.left = otherBounds.right → draggedItem.x - draggedDims.width/2 = otherBounds.right
      const snapX = otherBounds.right + draggedDims.width / 2;
      
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: 'left',
        targetId: other.instanceId,
        distance: distLeftToRight,
        alignedZ: isAligned,
        alignedX: false,
        priority: sameOrientation && backAligned ? 5 : sameOrientation ? 4 : isAligned ? 3 : 2,
      } as CabinetSnapPoint & { priority: number });
    }

    // === FRONT-TO-BACK SNAPPING (for island/peninsula layouts) ===

    // Front edge of dragged → back edge of other (dragged is behind)
    const gapFrontToBack = otherBounds.back - draggedBounds.front;
    const distFrontToBack = Math.abs(gapFrontToBack);
    
    if (distFrontToBack < threshold && gapFrontToBack > -draggedDims.depth * 0.5) {
      const leftAligned = Math.abs(draggedBounds.left - otherBounds.left) < CABINET_ALIGN_THRESHOLD;
      const rightAligned = Math.abs(draggedBounds.right - otherBounds.right) < CABINET_ALIGN_THRESHOLD;
      const centerXAligned = Math.abs(draggedItem.x - other.x) < CABINET_ALIGN_THRESHOLD;
      
      let snapX = draggedItem.x;
      if (leftAligned) {
        snapX = otherBounds.left + draggedDims.width / 2;
      } else if (rightAligned) {
        snapX = otherBounds.right - draggedDims.width / 2;
      } else if (centerXAligned) {
        snapX = other.x;
      }

      const isAligned = leftAligned || rightAligned || centerXAligned;
      
      // Snap Z position: front edge of dragged flush with back edge of other
      const snapZ = otherBounds.back - draggedDims.depth / 2;
      
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: 'front',
        targetId: other.instanceId,
        distance: distFrontToBack,
        alignedZ: false,
        alignedX: isAligned,
        priority: isAligned ? 3 : 2,
      } as CabinetSnapPoint & { priority: number });
    }

    // Back edge of dragged → front edge of other (dragged is in front)
    const gapBackToFront = draggedBounds.back - otherBounds.front;
    const distBackToFront = Math.abs(gapBackToFront);
    
    if (distBackToFront < threshold && gapBackToFront > -draggedDims.depth * 0.5) {
      const leftAligned = Math.abs(draggedBounds.left - otherBounds.left) < CABINET_ALIGN_THRESHOLD;
      const rightAligned = Math.abs(draggedBounds.right - otherBounds.right) < CABINET_ALIGN_THRESHOLD;
      const centerXAligned = Math.abs(draggedItem.x - other.x) < CABINET_ALIGN_THRESHOLD;
      
      let snapX = draggedItem.x;
      if (leftAligned) {
        snapX = otherBounds.left + draggedDims.width / 2;
      } else if (rightAligned) {
        snapX = otherBounds.right - draggedDims.width / 2;
      } else if (centerXAligned) {
        snapX = other.x;
      }

      const isAligned = leftAligned || rightAligned || centerXAligned;
      
      // Snap Z position: back edge of dragged flush with front edge of other
      const snapZ = otherBounds.front + draggedDims.depth / 2;
      
      snapPoints.push({
        x: snapX,
        z: snapZ,
        edge: 'back',
        targetId: other.instanceId,
        distance: distBackToFront,
        alignedZ: false,
        alignedX: isAligned,
        priority: isAligned ? 3 : 2,
      } as CabinetSnapPoint & { priority: number });
    }
  }

  // Sort by priority first (higher is better), then by distance (lower is better)
  return snapPoints.sort((a, b) => {
    const aPriority = (a as any).priority || 1;
    const bPriority = (b as any).priority || 1;
    if (aPriority !== bPriority) return bPriority - aPriority;
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

/**
 * Check if a target cabinet is wall-aligned and should influence rotation
 */
export function shouldInheritRotation(
  target: PlacedItem, 
  room: RoomConfig, 
  wallGap: number = 10
): boolean {
  const rot = ((target.rotation % 360) + 360) % 360;
  const depth = target.depth;
  const tolerance = 50; // 50mm tolerance
  
  // Check if target is wall-aligned (back against a wall)
  return (
    (rot === 0 && target.z <= depth / 2 + wallGap + tolerance) ||
    (rot === 90 && target.x >= room.width - depth / 2 - wallGap - tolerance) ||
    (rot === 270 && target.x <= depth / 2 + wallGap + tolerance) ||
    (rot === 180 && target.z >= room.depth - depth / 2 - wallGap - tolerance)
  );
}
