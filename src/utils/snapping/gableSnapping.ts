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
 * Works with both radians and degrees
 */
function rotationsAligned(rot1: number, rot2: number, tolerance: number = 5): boolean {
  // Normalize to degrees if they look like radians
  const isRadians = Math.abs(rot1) <= Math.PI * 2 && Math.abs(rot2) <= Math.PI * 2;
  const r1 = isRadians ? (rot1 * 180 / Math.PI) : rot1;
  const r2 = isRadians ? (rot2 * 180 / Math.PI) : rot2;
  
  const norm1 = ((r1 % 360) + 360) % 360;
  const norm2 = ((r2 % 360) + 360) % 360;
  
  return Math.abs(norm1 - norm2) < tolerance;
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
  category: 'Base' | 'Wall' | 'Tall' | 'Accessory' | string,
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
  // Base/Tall/Accessory: handles near top (easier reach)
  // Wall: handles near bottom (easier reach from below)
  let y: number;
  
  if (category === 'Wall') {
    // Wall cabinets: handle near bottom, snap to 32mm grid
    const rawY = -doorHeight / 2 + handleInset;
    y = Math.round(rawY / handleDrillPattern) * handleDrillPattern;
  } else {
    // Base/Tall/Accessory: handle near top, snap to 32mm grid
    const rawY = doorHeight / 2 - handleInset;
    y = Math.round(rawY / handleDrillPattern) * handleDrillPattern;
  }
  
  return { x, y };
}

/**
 * Corner cabinet snap configuration
 * Used for positioning blind corner and L-shape cabinets
 */
export interface CornerSnapConfig {
  fillerWidth: number;      // Gap between blind panel and wall (50-150mm)
  stileWidth: number;       // Face frame stile width (38-50mm)
  blindPullDistance: number; // How far blind extends past face
  cornerType: 'blind-left' | 'blind-right' | 'l-shape' | 'diagonal';
}

/**
 * Calculate corner cabinet position with proper filler and overlap
 * Handles blind corners with configurable filler widths
 */
export function calculateCornerPosition(
  adjacentCabinetX: number,
  adjacentCabinetZ: number,
  adjacentWidth: number,
  adjacentDepth: number,
  cornerCabinetWidth: number,
  cornerCabinetDepth: number,
  config: CornerSnapConfig,
  wallId: 'back' | 'left' | 'right' | 'front'
): { x: number; z: number; rotation: number } {
  const { fillerWidth, blindPullDistance, cornerType } = config;
  
  // Calculate position based on corner type and wall
  let x: number;
  let z: number;
  let rotation: number;
  
  if (cornerType === 'blind-left' || cornerType === 'blind-right') {
    // Blind corner positioning
    // The blind extends past the adjacent cabinet by blindPullDistance
    // Plus the filler width gap from the wall
    
    if (wallId === 'back') {
      // Adjacent cabinet on back wall, corner goes to left or right wall
      if (cornerType === 'blind-left') {
        x = fillerWidth + cornerCabinetDepth / 2;
        z = adjacentCabinetZ;
        rotation = 270; // Face right
      } else {
        x = adjacentCabinetX + adjacentWidth / 2 - blindPullDistance + cornerCabinetWidth / 2;
        z = adjacentCabinetZ;
        rotation = 0;
      }
    } else if (wallId === 'left') {
      if (cornerType === 'blind-left') {
        x = adjacentCabinetX;
        z = fillerWidth + cornerCabinetDepth / 2;
        rotation = 0;
      } else {
        x = adjacentCabinetX;
        z = adjacentCabinetZ + adjacentDepth / 2 - blindPullDistance + cornerCabinetDepth / 2;
        rotation = 270;
      }
    } else {
      // Default positioning
      x = adjacentCabinetX;
      z = adjacentCabinetZ;
      rotation = 0;
    }
  } else if (cornerType === 'l-shape') {
    // L-shape corner: both arms extend from corner
    x = adjacentCabinetX - adjacentWidth / 2 + cornerCabinetWidth / 2;
    z = adjacentCabinetZ + adjacentDepth / 2 + cornerCabinetDepth / 2;
    rotation = 0;
  } else {
    // Diagonal corner
    x = adjacentCabinetX;
    z = adjacentCabinetZ;
    rotation = 45;
  }
  
  return { x, z, rotation };
}

/**
 * Get effective filler width considering cabinet overrides and global defaults
 */
export function getEffectiveFillerWidth(
  itemFillerWidth: number | undefined,
  globalFillerWidth: number | undefined
): number {
  return itemFillerWidth ?? globalFillerWidth ?? CONSTRUCTION_STANDARDS.defaultFillerWidth;
}

/**
 * Get effective stile width considering cabinet overrides and global defaults
 */
export function getEffectiveStileWidth(
  itemStileWidth: number | undefined,
  globalStileWidth: number | undefined
): number {
  return itemStileWidth ?? globalStileWidth ?? CONSTRUCTION_STANDARDS.defaultStileWidth;
}
