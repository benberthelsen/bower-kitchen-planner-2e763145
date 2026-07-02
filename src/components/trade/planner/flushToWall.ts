import type { ConfiguredCabinet, TradeRoom } from '@/types/trade';

export type FlushWallId = 'back' | 'left' | 'right' | 'front';

const DEFAULT_TOLERANCE_MM = 20;

function getEffectiveFootprint(cabinet: ConfiguredCabinet): { width: number; depth: number } {
  const rotation = ((cabinet.position?.rotation ?? 0) % 360 + 360) % 360;
  const quarterTurns = Math.round(rotation / 90) % 4;

  return quarterTurns % 2 === 0
    ? { width: cabinet.dimensions.width, depth: cabinet.dimensions.depth }
    : { width: cabinet.dimensions.depth, depth: cabinet.dimensions.width };
}

export function getFlushWall(
  cabinet: ConfiguredCabinet,
  room: Pick<TradeRoom, 'config' | 'dimensions'>,
  toleranceMm = DEFAULT_TOLERANCE_MM,
): FlushWallId | null {
  if (!cabinet.position || !cabinet.isPlaced) return null;

  const { width, depth } = getEffectiveFootprint(cabinet);
  const wallGap = room.dimensions.wallGap ?? 0;

  const leftEdge = cabinet.position.x - width / 2;
  const rightEdge = cabinet.position.x + width / 2;
  const backEdge = cabinet.position.z - depth / 2;
  const frontEdge = cabinet.position.z + depth / 2;

  const targetBack = wallGap;
  const targetLeft = wallGap;
  const targetRight = room.config.width - wallGap;
  const targetFront = room.config.depth - wallGap;

  const distances: Array<{ wall: FlushWallId; delta: number }> = [
    { wall: 'back', delta: Math.abs(backEdge - targetBack) },
    { wall: 'left', delta: Math.abs(leftEdge - targetLeft) },
    { wall: 'right', delta: Math.abs(rightEdge - targetRight) },
    { wall: 'front', delta: Math.abs(frontEdge - targetFront) },
  ];

  const nearest = distances.sort((a, b) => a.delta - b.delta)[0];
  return nearest.delta <= toleranceMm ? nearest.wall : null;
}
