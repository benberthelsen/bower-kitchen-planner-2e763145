import type { WallId } from '@/types';

export type CabinetLayoutPreview = 'single-wall' | 'l-shape' | 'u-shape' | 'galley';

export interface CabinetPreviewWallRange {
  startMm: number;
  endMm: number;
}

export type CabinetPreviewWallRanges = Partial<Record<WallId, CabinetPreviewWallRange>>;

export interface ResolvedCabinetPreviewRun extends CabinetPreviewWallRange {
  wall: WallId;
}

const DEFAULT_LAYOUT_WALLS: Record<CabinetLayoutPreview, WallId[]> = {
  'single-wall': ['N'],
  'l-shape': ['N', 'W'],
  'u-shape': ['N', 'W', 'E'],
  galley: ['N', 'S'],
};

/**
 * Exact homeowner wall selections are authoritative. The generic layout is a
 * fallback for callers that have not selected physical walls.
 */
export function resolveCabinetPreviewWalls(
  cabinetLayout?: CabinetLayoutPreview,
  cabinetWalls?: readonly WallId[],
): WallId[] {
  if (cabinetWalls?.length) {
    return [...new Set(cabinetWalls)].filter(
      (wall): wall is WallId => wall === 'N' || wall === 'E' || wall === 'S' || wall === 'W',
    );
  }
  return cabinetLayout ? [...DEFAULT_LAYOUT_WALLS[cabinetLayout]] : [];
}

/**
 * Resolve the same measured start/end runs used by the layout engine. Wall
 * offsets follow the room contract: N/E increase clockwise from the back-left
 * corner, while S/W increase from the opposite corner as viewed from inside.
 */
export function resolveCabinetPreviewRuns(
  widthMm: number,
  depthMm: number,
  cabinetLayout?: CabinetLayoutPreview,
  cabinetWalls?: readonly WallId[],
  cabinetWallRanges?: CabinetPreviewWallRanges,
): ResolvedCabinetPreviewRun[] {
  return resolveCabinetPreviewWalls(cabinetLayout, cabinetWalls).flatMap(wall => {
    const wallLength = wall === 'N' || wall === 'S' ? widthMm : depthMm;
    const requested = cabinetWallRanges?.[wall];
    const startMm = Math.max(0, Math.min(wallLength, requested?.startMm ?? 0));
    const endMm = Math.max(startMm, Math.min(wallLength, requested?.endMm ?? wallLength));
    return endMm > startMm ? [{ wall, startMm, endMm }] : [];
  });
}
