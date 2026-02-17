import { PlacedItem, RoomConfig, GlobalDimensions } from '../../types';
import { SnapResult, SnapContext, GableSnapResult } from './types';
import { getRotatedBounds, getEffectiveDimensions, checkCollision } from './bounds';
import { findWallSnap, detectCorner, WALL_SNAP_THRESHOLD, getWallSurfaces, shouldMaintainWallAlignment } from './wallSnapping';
import { findCabinetSnapPoints, CABINET_SNAP_THRESHOLD } from './cabinetSnapping';
import { findGableSnapPoints, getBestGableSnap, calculateHandlePosition, getGableEdges } from './gableSnapping';
import { CONSTRUCTION_STANDARDS } from '@/types/cabinetConfig';

// Re-export for backwards compatibility
export { checkCollision, getRotatedBounds } from './bounds';
export { CABINET_SNAP_THRESHOLD } from './cabinetSnapping';
export { WALL_SNAP_THRESHOLD, getWallSurfaces, findNearestWallSurface } from './wallSnapping';
export { 
  findGableSnapPoints, 
  getBestGableSnap, 
  calculateHandlePosition, 
  getGableEdges,
  calculateCornerPosition,
  getEffectiveFillerWidth,
  getEffectiveStileWidth
} from './gableSnapping';
export type { SnapResult, BoundingBox, GableSnapResult, CornerCabinetConfig } from './types';
export type { CornerSnapConfig, GableEdges, GableSnapPoint } from './gableSnapping';

// Gable snap threshold - tighter than bounding box snap for precision
export const GABLE_SNAP_THRESHOLD = 50; // mm

function normalizeToRightAngle(rotation: number): number {
  const normalized = ((rotation % 360) + 360) % 360;
  const snapped = Math.round(normalized / 90) * 90;
  return snapped === 360 ? 0 : snapped;
}

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
    wallGap: 10,
    // Construction parameters
    boardThickness: 18,
    backPanelSetback: 16,
    topReveal: 3,
    sideReveal: 2,
    handleDrillSpacing: 32,
  };

  // Start with grid-snapped position
  let x = Math.round(rawX / gridSnap) * gridSnap;
  let z = Math.round(rawZ / gridSnap) * gridSnap;
  let rotation = normalizeToRightAngle(draggedItem.rotation);
  let snappedTo: SnapResult['snappedTo'] = 'grid';
  let snapEdge: SnapResult['snapEdge'] = undefined;
  let snappedItemId: string | undefined = undefined;
  let wallId: SnapResult['wallId'] = undefined;

  const wallGap = dims.wallGap;
  // The cabinet's raw depth (back-to-front dimension before rotation)
  const itemDepth = draggedItem.depth;

  // 1. Check for corner snap (highest priority for corner cabinets)
  const corner = detectCorner(rawX, rawZ, draggedItem, room, dims);
  if (corner) {
    x = corner.position.x;
    z = corner.position.z;
    rotation = corner.rotation;
    snappedTo = 'corner';
    rotation = normalizeToRightAngle(rotation);

  return { x, z, rotation, snappedTo, snapEdge, snappedItemId, wallId };
  }

  // 2. Check wall snapping
  const maintainWallAlignment = shouldMaintainWallAlignment(draggedItem, room);
  const wallSnap = findWallSnap(rawX, rawZ, draggedItem, room, dims, maintainWallAlignment);
  if (wallSnap?.snapped) {
    const wall = wallSnap.wall;
    wallId = wall.id;
    rotation = wall.rotation;
    snappedTo = 'wall';

    // After wall snap, the cabinet rotates so its DEPTH faces the wall
    // For all walls, after rotation the cabinet's original depth dimension faces the wall
    // Calculate position using the cabinet's depth (which will face the wall after rotation)
    const postSnapDepth = itemDepth; // Depth always faces the wall after snap rotation

    switch (wall.id) {
      case 'back':
        // rotation = 0: depth faces back wall (z = 0)
        z = postSnapDepth / 2 + wallGap;
        snapEdge = 'back';
        break;
      case 'left':
        // rotation = 270: depth faces left wall (x = 0)
        x = postSnapDepth / 2 + wallGap;
        snapEdge = 'left';
        break;
      case 'right':
        // rotation = 90: depth faces right wall (x = room.width)
        x = room.width - postSnapDepth / 2 - wallGap;
        snapEdge = 'right';
        break;
      case 'front':
        // rotation = 180: depth faces front wall (z = room.depth)
        z = room.depth - postSnapDepth / 2 - wallGap;
        snapEdge = 'front';
        break;
    }

    // When snapped to wall, allow smooth sliding along the wall
    // For horizontal walls (back/front), X slides freely
    // For vertical walls (left/right), Z slides freely
    if (wall.id === 'back' || wall.id === 'front') {
      x = Math.round(rawX / gridSnap) * gridSnap;
    } else {
      z = Math.round(rawZ / gridSnap) * gridSnap;
    }
  }

  // 3. Check gable-to-gable snapping (Microvellum-style precision)
  // This takes priority over bounding-box cabinet snapping for flush runs
  const effectiveRotation = snappedTo === 'wall' ? rotation : draggedItem.rotation;
  const tempItem: PlacedItem = { ...draggedItem, x, z, rotation: effectiveRotation };
  
  const gableThickness = dims.boardThickness ?? CONSTRUCTION_STANDARDS.gableThickness;
  const gableSnaps = findGableSnapPoints(tempItem, allItems, gableThickness, GABLE_SNAP_THRESHOLD);
  
  let usedGableSnap = false;
  if (gableSnaps.length > 0) {
    const bestGable = gableSnaps[0];
    
    // If wall-snapped, only apply gable snap along the wall axis
    if (snappedTo === 'wall') {
      if (wallId === 'back' || wallId === 'front') {
        x = bestGable.snapX;
        z = bestGable.snapZ;
        snappedItemId = bestGable.targetItem.instanceId;
        snapEdge = bestGable.edge === 'left-to-right' ? 'left' : 'right';
        usedGableSnap = true;
      }
    } else {
      // Not wall-snapped, apply full gable snap
      x = bestGable.snapX;
      z = bestGable.snapZ;
      snappedTo = 'cabinet';
      snapEdge = bestGable.edge === 'left-to-right' ? 'left' : 'right';
      snappedItemId = bestGable.targetItem.instanceId;
      rotation = bestGable.targetItem.rotation;
      usedGableSnap = true;
    }
  }

  // 4. Fall back to bounding-box cabinet snapping if no gable snap
  if (!usedGableSnap) {
    const dynamicSnapThreshold = Math.max(CABINET_SNAP_THRESHOLD, Math.round(Math.min(draggedItem.width, draggedItem.depth) * 0.45));
    const cabinetSnapPoints = findCabinetSnapPoints(tempItem, allItems, dynamicSnapThreshold);

    if (cabinetSnapPoints.length > 0) {
      const best = cabinetSnapPoints[0];
      
      // If wall-snapped, only apply cabinet snap along the wall axis
      if (snappedTo === 'wall') {
        // For horizontal walls (back/front), we can snap X to cabinets
        if ((wallId === 'back' || wallId === 'front') && (best.edge === 'left' || best.edge === 'right')) {
          x = best.x;
          snappedItemId = best.targetId;
          snapEdge = best.edge;
          // Also inherit Z alignment if available (back alignment within wall run)
          if (best.alignedZ) {
            z = best.z;
          }
        }
        // For vertical walls (left/right), we can snap Z to cabinets
        else if ((wallId === 'left' || wallId === 'right') && (best.edge === 'front' || best.edge === 'back')) {
          z = best.z;
          snappedItemId = best.targetId;
          snapEdge = best.edge;
          // Also inherit X alignment if available
          if (best.alignedX) {
            x = best.x;
          }
        }
      } else {
        // Not wall-snapped, apply full cabinet snap
        x = best.x;
        z = best.z;
        snappedTo = 'cabinet';
        snapEdge = best.edge;
        snappedItemId = best.targetId;
        
        // Inherit orientation from target cabinet for cleaner product-to-product runs
        const targetCabinet = allItems.find(item => item.instanceId === best.targetId);
        if (targetCabinet) {
          if (isWallAligned(targetCabinet, room, dims) || best.edge === 'left' || best.edge === 'right') {
            rotation = normalizeToRightAngle(targetCabinet.rotation);
          }
        }
      }
    }
  }

  // 5. Clamp to room bounds using POST-SNAP rotation
  const effDims = getEffectiveDimensions({ ...draggedItem, rotation });
  const effectiveWidth = effDims.width;
  const effectiveDepth = effDims.depth;

  x = Math.max(effectiveWidth / 2 + wallGap, Math.min(room.width - effectiveWidth / 2 - wallGap, x));
  z = Math.max(effectiveDepth / 2 + wallGap, Math.min(room.depth - effectiveDepth / 2 - wallGap, z));

  // 6. Collision resolution - push away from overlapping items
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

  rotation = normalizeToRightAngle(rotation);

  return { x, z, rotation, snappedTo, snapEdge, snappedItemId, wallId };
}

/**
 * Check if a cabinet is aligned to a wall (back touching a wall)
 */
function isWallAligned(item: PlacedItem, room: RoomConfig, dims: GlobalDimensions): boolean {
  const rot = ((item.rotation % 360) + 360) % 360;
  const depth = item.depth;
  const tolerance = 50; // 50mm tolerance

  return (
    (rot === 0 && item.z <= depth / 2 + dims.wallGap + tolerance) ||
    (rot === 90 && item.x >= room.width - depth / 2 - dims.wallGap - tolerance) ||
    (rot === 270 && item.x <= depth / 2 + dims.wallGap + tolerance) ||
    (rot === 180 && item.z >= room.depth - depth / 2 - dims.wallGap - tolerance)
  );
}
