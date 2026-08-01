export type CabinetRunWall = 'back' | 'left' | 'right' | 'front';

export interface CabinetRunItem {
  instanceId: string;
  cabinetNumber?: string;
  productName?: string;
  category?: string;
  isPlaced?: boolean;
  dimensions: { width: number; depth: number };
  position?: { x: number; z: number; rotation: number; y?: number };
}

export interface CabinetRunRoom {
  config: { width: number; depth: number };
  dimensions?: { wallGap?: number };
}

export interface CabinetRunGap {
  gapMm: number;
  neighbourId: string | null;
  neighbourLabel: string;
}

export interface CabinetRunSpacing {
  wall: CabinetRunWall;
  axis: 'x' | 'z';
  before: CabinetRunGap;
  after: CabinetRunGap;
}

const normalRotation = (rotation: number) => {
  const normalized = ((rotation % 360) + 360) % 360;
  return (Math.round(normalized / 90) * 90) % 360;
};

const wallForRotation = (rotation: number): CabinetRunWall => {
  switch (normalRotation(rotation)) {
    case 90: return 'right';
    case 180: return 'front';
    case 270: return 'left';
    default: return 'back';
  }
};

function distanceFromExpectedWall(item: CabinetRunItem, room: CabinetRunRoom): number {
  if (!item.position) return Number.POSITIVE_INFINITY;
  const gap = room.dimensions?.wallGap ?? 0;
  const wall = wallForRotation(item.position.rotation);
  const halfDepth = item.dimensions.depth / 2;
  switch (wall) {
    case 'back': return Math.abs(item.position.z - halfDepth - gap);
    case 'front': return Math.abs(item.position.z + halfDepth - (room.config.depth - gap));
    case 'left': return Math.abs(item.position.x - halfDepth - gap);
    case 'right': return Math.abs(item.position.x + halfDepth - (room.config.width - gap));
  }
}

const sameLevel = (a: CabinetRunItem, b: CabinetRunItem) =>
  (a.category === 'Wall') === (b.category === 'Wall');

const itemLabel = (item?: CabinetRunItem | null) =>
  item?.cabinetNumber || item?.productName || 'cabinet';

/**
 * Measure the clear space either side of a cabinet along its wall run.
 * Positions are cabinet centres and dimensions are millimetres.
 */
export function getCabinetRunSpacing(
  cabinet: CabinetRunItem,
  allCabinets: CabinetRunItem[],
  room: CabinetRunRoom,
  wallToleranceMm = 80,
): CabinetRunSpacing | null {
  if (!cabinet.position || cabinet.isPlaced === false) return null;
  if (distanceFromExpectedWall(cabinet, room) > wallToleranceMm) return null;

  const wall = wallForRotation(cabinet.position.rotation);
  const axis: 'x' | 'z' = wall === 'back' || wall === 'front' ? 'x' : 'z';
  const runLength = axis === 'x' ? room.config.width : room.config.depth;
  const wallGap = room.dimensions?.wallGap ?? 0;
  const centre = cabinet.position[axis];
  const start = centre - cabinet.dimensions.width / 2;
  const end = centre + cabinet.dimensions.width / 2;

  const neighbours = allCabinets.filter((other) =>
    other.instanceId !== cabinet.instanceId &&
    other.position &&
    other.isPlaced !== false &&
    sameLevel(cabinet, other) &&
    wallForRotation(other.position.rotation) === wall &&
    distanceFromExpectedWall(other, room) <= wallToleranceMm
  );

  let beforeEdge = wallGap;
  let beforeNeighbour: CabinetRunItem | null = null;
  let afterEdge = runLength - wallGap;
  let afterNeighbour: CabinetRunItem | null = null;

  for (const other of neighbours) {
    const otherCentre = other.position![axis];
    const otherStart = otherCentre - other.dimensions.width / 2;
    const otherEnd = otherCentre + other.dimensions.width / 2;

    if (otherEnd <= start + 0.5 && otherEnd > beforeEdge) {
      beforeEdge = otherEnd;
      beforeNeighbour = other;
    } else if (otherStart < start && otherEnd > start) {
      beforeEdge = start;
      beforeNeighbour = other;
    }

    if (otherStart >= end - 0.5 && otherStart < afterEdge) {
      afterEdge = otherStart;
      afterNeighbour = other;
    } else if (otherStart < end && otherEnd > end) {
      afterEdge = end;
      afterNeighbour = other;
    }
  }

  return {
    wall,
    axis,
    before: {
      gapMm: Math.max(0, Math.round(start - beforeEdge)),
      neighbourId: beforeNeighbour?.instanceId ?? null,
      neighbourLabel: beforeNeighbour ? itemLabel(beforeNeighbour) : 'wall end',
    },
    after: {
      gapMm: Math.max(0, Math.round(afterEdge - end)),
      neighbourId: afterNeighbour?.instanceId ?? null,
      neighbourLabel: afterNeighbour ? itemLabel(afterNeighbour) : 'wall end',
    },
  };
}

export function fillCabinetRunGap(
  cabinet: CabinetRunItem,
  spacing: CabinetRunSpacing,
  side: 'before' | 'after',
): { dimensions: CabinetRunItem['dimensions']; position: NonNullable<CabinetRunItem['position']> } | null {
  if (!cabinet.position) return null;
  const gap = spacing[side].gapMm;
  if (gap <= 0) return null;

  const shift = (side === 'before' ? -1 : 1) * gap / 2;
  return {
    dimensions: { ...cabinet.dimensions, width: cabinet.dimensions.width + gap },
    position: {
      ...cabinet.position,
      [spacing.axis]: cabinet.position[spacing.axis] + shift,
    },
  };
}

export function cabinetWidthGuidance(cabinet: Pick<CabinetRunItem, 'productName' | 'dimensions'> & { definitionId?: string }) {
  const identity = `${cabinet.definitionId ?? ''} ${cabinet.productName ?? ''}`.toLowerCase();
  const isPanel = /panel|filler|scribe|end[-_ ]?panel/.test(identity);
  const isCorner = /corner|pie[-_ ]?cut|blind|diagonal/.test(identity);
  const isSink = /sink/.test(identity);
  const isApplianceHousing = /oven|range.?hood|dishwasher|appliance opening/.test(identity);
  const minimumWidthMm = isPanel ? 16 : (isSink || isApplianceHousing ? 600 : 150);
  const recommendedMaximumWidthMm = isPanel || isCorner ? null : 900;
  return {
    minimumWidthMm,
    recommendedMaximumWidthMm,
    belowMinimum: cabinet.dimensions.width < minimumWidthMm,
    aboveRecommended: recommendedMaximumWidthMm !== null && cabinet.dimensions.width > recommendedMaximumWidthMm,
  };
}
