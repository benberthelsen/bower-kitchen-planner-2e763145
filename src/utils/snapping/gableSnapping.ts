/**
 * Gable-edge snapping utilities for Microvellum-style cabinet alignment
 * Enables cabinets to snap gable-to-gable (outer edge to outer edge)
 */

import { PlacedItem } from '@/types';
import { CONSTRUCTION_STANDARDS } from '@/types/cabinetConfig';

export interface GableEdges {
  leftOuter: number;   // X position of left gable outer face
  leftInner: number;   // X position of left gable inner face
  rightOuter: number;  // X position of right gable outer face
  rightInner: number;  // X position of right gable inner face
}

export interface GableSnapPoint {
  targetItem: PlacedItem;
  snapX: number;
  snapZ: number;
  edge: 'left-to-right' | 'right-to-left';
  distance: number;
}

/**
 * Calculate gable edge positions for a cabinet
 * Takes into account rotation for proper world-space positions
 */
export function getGableEdges(
  item: PlacedItem,
  gableThickness: number = CONSTRUCTION_STANDARDS.gableThickness
): GableEdges {
  const halfWidth = item.width / 2;
  const thicknessM = gableThickness; // Already in mm
  
  // For rotation 0 (facing +Z), left is -X, right is +X
  // These are relative to item center
  return {
    leftOuter: item.x - halfWidth,
    leftInner: item.x - halfWidth + thicknessM,
    rightOuter: item.x + halfWidth,
    rightInner: item.x + halfWidth - thicknessM,
  };
}

/**
 * Check if two rotations are aligned (same wall direction)
 */
function rotationsAligned(rot1: number, rot2: number, tolerance: number = 0.1): boolean {
  const normalizedDiff = Math.abs(((rot1 - rot2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2));
  return normalizedDiff < tolerance || Math.abs(normalizedDiff - Math.PI * 2) < tolerance;
}

/**
 * Find gable-to-gable snap points for a dragged cabinet
 * Snaps outer gable edges to create flush cabinet runs
 */
export function findGableSnapPoints(
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  gableThickness: number = CONSTRUCTION_STANDARDS.gableThickness,
  threshold: number = 30 // mm snap threshold
): GableSnapPoint[] {
  const snapPoints: GableSnapPoint[] = [];
  const draggedEdges = getGableEdges(draggedItem, gableThickness);
  
  for (const target of allItems) {
    // Skip self and non-cabinets
    if (target.instanceId === draggedItem.instanceId) continue;
    if (target.itemType !== 'Cabinet') continue;
    
    // Only snap cabinets with similar rotation (same wall run)
    if (!rotationsAligned(draggedItem.rotation, target.rotation)) continue;
    
    // Check Z alignment (must be on same line, within depth tolerance)
    const zDiff = Math.abs(draggedItem.z - target.z);
    if (zDiff > Math.max(draggedItem.depth, target.depth) / 2 + 50) continue;
    
    const targetEdges = getGableEdges(target, gableThickness);
    
    // Left gable of dragged → Right gable of target (dragged is to the right)
    const leftToRightDist = Math.abs(draggedEdges.leftOuter - targetEdges.rightOuter);
    if (leftToRightDist < threshold) {
      snapPoints.push({
        targetItem: target,
        snapX: targetEdges.rightOuter + draggedItem.width / 2,
        snapZ: target.z, // Align Z as well
        edge: 'left-to-right',
        distance: leftToRightDist,
      });
    }
    
    // Right gable of dragged → Left gable of target (dragged is to the left)
    const rightToLeftDist = Math.abs(draggedEdges.rightOuter - targetEdges.leftOuter);
    if (rightToLeftDist < threshold) {
      snapPoints.push({
        targetItem: target,
        snapX: targetEdges.leftOuter - draggedItem.width / 2,
        snapZ: target.z,
        edge: 'right-to-left',
        distance: rightToLeftDist,
      });
    }
  }
  
  // Sort by distance (closest first)
  return snapPoints.sort((a, b) => a.distance - b.distance);
}

/**
 * Get the best gable snap for a cabinet
 * Returns the snap position and target, or null if no snap
 */
export function getBestGableSnap(
  draggedItem: PlacedItem,
  allItems: PlacedItem[],
  gableThickness?: number,
  threshold?: number
): { x: number; z: number; target: PlacedItem } | null {
  const snaps = findGableSnapPoints(draggedItem, allItems, gableThickness, threshold);
  
  if (snaps.length === 0) return null;
  
  const best = snaps[0];
  return {
    x: best.snapX,
    z: best.snapZ,
    target: best.targetItem,
  };
}

/**
 * Calculate handle position using 32mm system
 * Handles are positioned based on cabinet category and 32mm grid
 */
export function calculateHandlePosition(
  doorHeight: number,
  doorWidth: number,
  category: 'Base' | 'Wall' | 'Tall',
  hingeLeft: boolean,
  handleLength: number = 128,
  handleDrillPattern: number = 32
): { x: number; y: number } {
  const handleInset = CONSTRUCTION_STANDARDS.handleInset; // 40mm from edge
  
  // X position: opposite side of hinge
  const x = hingeLeft 
    ? doorWidth / 2 - handleInset 
    : -doorWidth / 2 + handleInset;
  
  // Y position: depends on cabinet type
  // Base/Tall: handles near top (easier reach)
  // Wall: handles near bottom (easier reach from below)
  let y: number;
  
  if (category === 'Wall') {
    // Wall cabinets: handle near bottom, snap to 32mm grid
    const rawY = -doorHeight / 2 + handleInset;
    y = Math.round(rawY / handleDrillPattern) * handleDrillPattern;
  } else {
    // Base/Tall: handle near top, snap to 32mm grid
    const rawY = doorHeight / 2 - handleInset;
    y = Math.round(rawY / handleDrillPattern) * handleDrillPattern;
  }
  
  return { x, y };
}
