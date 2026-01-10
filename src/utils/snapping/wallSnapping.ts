import { PlacedItem, RoomConfig, GlobalDimensions } from '../../types';
import { WallInfo, CornerInfo } from './types';
import { getEffectiveDimensions } from './bounds';

export const WALL_SNAP_THRESHOLD = 200; // mm - distance from cabinet edge to wall to trigger snap
export const WALL_RELEASE_THRESHOLD = 350; // mm - hysteresis to release from wall
export const CORNER_SNAP_THRESHOLD = 300; // mm - distance from cabinet edge to trigger corner snap

/**
 * Calculate distance from cabinet edge to each wall and determine snap info
 * Distance is measured from the nearest edge of the cabinet to the wall surface
 */
export function getWallDistances(
  x: number,
  z: number,
  item: PlacedItem,
  room: RoomConfig,
  globalDimensions: GlobalDimensions
): WallInfo[] {
  // Get current effective dimensions based on item's current rotation
  const { width: effectiveWidth, depth: effectiveDepth } = getEffectiveDimensions(item);
  const wallGap = globalDimensions.wallGap;

  // Raw item depth - this is what faces the wall after snapping
  const itemDepth = item.depth;

  // Calculate edge-to-wall distances using current rotated dimensions
  // Back wall: distance from cabinet's back edge (z - effectiveDepth/2) to wall at z=0
  const backEdgeDistance = z - effectiveDepth / 2;
  
  // Left wall: distance from cabinet's left edge (x - effectiveWidth/2) to wall at x=0
  const leftEdgeDistance = x - effectiveWidth / 2;
  
  // Right wall: distance from cabinet's right edge (x + effectiveWidth/2) to wall at x=room.width
  const rightEdgeDistance = room.width - (x + effectiveWidth / 2);
  
  // Front wall: distance from cabinet's front edge (z + effectiveDepth/2) to wall at z=room.depth
  const frontEdgeDistance = room.depth - (z + effectiveDepth / 2);

  const walls: WallInfo[] = [
    {
      id: 'back',
      distance: Math.abs(backEdgeDistance),
      rotation: 0,
      // After snapping to back wall with rotation 0, depth faces wall
      snapPosition: { x, z: itemDepth / 2 + wallGap },
    },
    {
      id: 'left',
      distance: Math.abs(leftEdgeDistance),
      rotation: 270,
      // After snapping to left wall with rotation 270, depth faces wall
      snapPosition: { x: itemDepth / 2 + wallGap, z },
    },
    {
      id: 'right',
      distance: Math.abs(rightEdgeDistance),
      rotation: 90,
      // After snapping to right wall with rotation 90, depth faces wall
      snapPosition: { x: room.width - itemDepth / 2 - wallGap, z },
    },
    {
      id: 'front',
      distance: Math.abs(frontEdgeDistance),
      rotation: 180,
      // After snapping to front wall with rotation 180, depth faces wall
      snapPosition: { x, z: room.depth - itemDepth / 2 - wallGap },
    },
  ];

  return walls.sort((a, b) => a.distance - b.distance);
}

/**
 * Check if item is near a corner (intersection of two walls)
 * Uses edge-based distance calculation for accurate corner detection
 */
export function detectCorner(
  x: number,
  z: number,
  item: PlacedItem,
  room: RoomConfig,
  globalDimensions: GlobalDimensions
): CornerInfo | null {
  // Get edge-based wall distances
  const walls = getWallDistances(x, z, item, room, globalDimensions);
  const nearWalls = walls.filter(w => w.distance < CORNER_SNAP_THRESHOLD);

  // Need at least 2 walls nearby for a corner
  if (nearWalls.length < 2) return null;

  const wall1 = nearWalls[0];
  const wall2 = nearWalls[1];

  // Check if walls are perpendicular (one horizontal, one vertical)
  const isWall1Horizontal = wall1.id === 'back' || wall1.id === 'front';
  const isWall2Horizontal = wall2.id === 'back' || wall2.id === 'front';
  const isPerpendicular = isWall1Horizontal !== isWall2Horizontal;

  if (!isPerpendicular) return null;

  const wallGap = globalDimensions.wallGap;
  const itemDepth = item.depth;
  const itemWidth = item.width;

  // Determine corner position and rotation based on which walls meet
  let cornerX: number;
  let cornerZ: number;
  let rotation: number;

  // Back-left corner: cabinet faces into room (rotation 0)
  if ((wall1.id === 'back' && wall2.id === 'left') || (wall1.id === 'left' && wall2.id === 'back')) {
    cornerX = itemWidth / 2 + wallGap;
    cornerZ = itemDepth / 2 + wallGap;
    rotation = 0;
  }
  // Back-right corner: cabinet faces into room (rotation 0)
  else if ((wall1.id === 'back' && wall2.id === 'right') || (wall1.id === 'right' && wall2.id === 'back')) {
    cornerX = room.width - itemWidth / 2 - wallGap;
    cornerZ = itemDepth / 2 + wallGap;
    rotation = 0;
  }
  // Front-left corner: cabinet faces back wall (rotation 180)
  else if ((wall1.id === 'front' && wall2.id === 'left') || (wall1.id === 'left' && wall2.id === 'front')) {
    cornerX = itemWidth / 2 + wallGap;
    cornerZ = room.depth - itemDepth / 2 - wallGap;
    rotation = 180;
  }
  // Front-right corner: cabinet faces back wall (rotation 180)
  else {
    cornerX = room.width - itemWidth / 2 - wallGap;
    cornerZ = room.depth - itemDepth / 2 - wallGap;
    rotation = 180;
  }

  return {
    walls: [wall1, wall2],
    position: { x: cornerX, z: cornerZ },
    rotation,
  };
}

/**
 * Find the nearest wall to snap to
 */
export function findWallSnap(
  x: number,
  z: number,
  item: PlacedItem,
  room: RoomConfig,
  globalDimensions: GlobalDimensions,
  currentlySnappedToWall: boolean = false
): { wall: WallInfo; snapped: boolean } | null {
  const walls = getWallDistances(x, z, item, room, globalDimensions);
  const threshold = currentlySnappedToWall ? WALL_RELEASE_THRESHOLD : WALL_SNAP_THRESHOLD;

  const nearestWall = walls[0];
  if (nearestWall.distance < threshold) {
    return { wall: nearestWall, snapped: true };
  }

  return null;
}

/**
 * Check if a cabinet should maintain its rotation when moving along a wall
 */
export function shouldMaintainWallAlignment(item: PlacedItem, room: RoomConfig): boolean {
  const rot = ((item.rotation % 360) + 360) % 360;
  const itemDepth = item.depth;

  // Check if currently aligned to a wall
  const isBackAligned = rot === 0 && item.z <= itemDepth / 2 + 50;
  const isLeftAligned = rot === 270 && item.x <= itemDepth / 2 + 50;
  const isRightAligned = rot === 90 && item.x >= room.width - itemDepth / 2 - 50;
  const isFrontAligned = rot === 180 && item.z >= room.depth - itemDepth / 2 - 50;

  return isBackAligned || isLeftAligned || isRightAligned || isFrontAligned;
}

/**
 * Wall surface definition for advanced snapping
 */
export interface WallSurface {
  id: 'back' | 'left' | 'right' | 'front';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  normal: { x: number; z: number }; // Inward-facing normal
  rotationForAlignment: number; // Rotation to face away from wall
}

/**
 * Get all wall surfaces from room geometry
 * Returns surfaces with their positions and inward-facing normals
 */
export function getWallSurfaces(room: RoomConfig): WallSurface[] {
  return [
    {
      id: 'back',
      startX: 0,
      startZ: 0,
      endX: room.width,
      endZ: 0,
      normal: { x: 0, z: 1 }, // Points into room
      rotationForAlignment: 0,
    },
    {
      id: 'left',
      startX: 0,
      startZ: 0,
      endX: 0,
      endZ: room.depth,
      normal: { x: 1, z: 0 }, // Points into room
      rotationForAlignment: 270,
    },
    {
      id: 'right',
      startX: room.width,
      startZ: 0,
      endX: room.width,
      endZ: room.depth,
      normal: { x: -1, z: 0 }, // Points into room
      rotationForAlignment: 90,
    },
    {
      id: 'front',
      startX: 0,
      startZ: room.depth,
      endX: room.width,
      endZ: room.depth,
      normal: { x: 0, z: -1 }, // Points into room
      rotationForAlignment: 180,
    },
  ];
}

/**
 * Find the nearest wall surface to a point
 */
export function findNearestWallSurface(
  x: number,
  z: number,
  room: RoomConfig
): { surface: WallSurface; distance: number } {
  const surfaces = getWallSurfaces(room);
  
  let nearest = surfaces[0];
  let minDist = Infinity;
  
  for (const surface of surfaces) {
    let distance: number;
    
    if (surface.id === 'back') {
      distance = z;
    } else if (surface.id === 'front') {
      distance = room.depth - z;
    } else if (surface.id === 'left') {
      distance = x;
    } else {
      distance = room.width - x;
    }
    
    if (distance < minDist) {
      minDist = distance;
      nearest = surface;
    }
  }
  
  return { surface: nearest, distance: minDist };
}
