import { PlacedItem, RoomConfig, GlobalDimensions } from '../../types';
import { WallInfo, CornerInfo } from './types';
import { getEffectiveDimensions } from './bounds';

export const WALL_SNAP_THRESHOLD = 200; // mm - distance to trigger wall snap
export const WALL_RELEASE_THRESHOLD = 350; // mm - hysteresis to release from wall
export const CORNER_SNAP_THRESHOLD = 300; // mm - distance to trigger corner snap

/**
 * Calculate distance to each wall and determine snap info
 */
export function getWallDistances(
  x: number,
  z: number,
  item: PlacedItem,
  room: RoomConfig,
  globalDimensions: GlobalDimensions
): WallInfo[] {
  const { width, depth } = getEffectiveDimensions(item);
  const wallGap = globalDimensions.wallGap;

  // Calculate effective depth based on what rotation we'd snap to
  const itemDepth = item.depth; // Raw depth (before rotation swap)

  const walls: WallInfo[] = [
    {
      id: 'back',
      distance: z,
      rotation: 0,
      snapPosition: { x, z: itemDepth / 2 + wallGap },
    },
    {
      id: 'left',
      distance: x,
      rotation: 270,
      snapPosition: { x: itemDepth / 2 + wallGap, z },
    },
    {
      id: 'right',
      distance: room.width - x,
      rotation: 90,
      snapPosition: { x: room.width - itemDepth / 2 - wallGap, z },
    },
    {
      id: 'front',
      distance: room.depth - z,
      rotation: 180,
      snapPosition: { x, z: room.depth - itemDepth / 2 - wallGap },
    },
  ];

  return walls.sort((a, b) => a.distance - b.distance);
}

/**
 * Check if item is near a corner (intersection of two walls)
 */
export function detectCorner(
  x: number,
  z: number,
  item: PlacedItem,
  room: RoomConfig,
  globalDimensions: GlobalDimensions
): CornerInfo | null {
  const walls = getWallDistances(x, z, item, room, globalDimensions);
  const nearWalls = walls.filter(w => w.distance < CORNER_SNAP_THRESHOLD);

  // Need exactly 2 perpendicular walls for a corner
  if (nearWalls.length < 2) return null;

  const wall1 = nearWalls[0];
  const wall2 = nearWalls[1];

  // Check if walls are perpendicular
  const isPerpendicular =
    (wall1.id === 'back' || wall1.id === 'front') !== (wall2.id === 'back' || wall2.id === 'front');

  if (!isPerpendicular) return null;

  const wallGap = globalDimensions.wallGap;
  const itemDepth = item.depth;
  const itemWidth = item.width;

  // Determine corner position and rotation
  let cornerX: number;
  let cornerZ: number;
  let rotation: number;

  // Back-left corner
  if ((wall1.id === 'back' && wall2.id === 'left') || (wall1.id === 'left' && wall2.id === 'back')) {
    cornerX = itemWidth / 2 + wallGap;
    cornerZ = itemDepth / 2 + wallGap;
    rotation = 0;
  }
  // Back-right corner
  else if ((wall1.id === 'back' && wall2.id === 'right') || (wall1.id === 'right' && wall2.id === 'back')) {
    cornerX = room.width - itemWidth / 2 - wallGap;
    cornerZ = itemDepth / 2 + wallGap;
    rotation = 0;
  }
  // Front-left corner
  else if ((wall1.id === 'front' && wall2.id === 'left') || (wall1.id === 'left' && wall2.id === 'front')) {
    cornerX = itemWidth / 2 + wallGap;
    cornerZ = room.depth - itemDepth / 2 - wallGap;
    rotation = 180;
  }
  // Front-right corner
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
