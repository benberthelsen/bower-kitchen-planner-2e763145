export interface RectangularBenchtopOverhangs {
  front?: number;
  back?: number;
  left?: number;
  right?: number;
}

/** Calculate a rectangular top's size and centre in local cabinet axes. */
export function rectangularBenchtopGeometry(
  width: number,
  depth: number,
  overhangs: RectangularBenchtopOverhangs,
) {
  const front = Math.max(0, overhangs.front ?? 0);
  const back = Math.max(0, overhangs.back ?? 0);
  const left = Math.max(0, overhangs.left ?? 0);
  const right = Math.max(0, overhangs.right ?? 0);

  return {
    totalWidth: width + left + right,
    totalDepth: depth + front + back,
    xOffset: (right - left) / 2,
    zOffset: (front - back) / 2,
  };
}

/**
 * Stable physical origin for the texture along a cabinet run. Adjacent
 * cabinets on every wall therefore sample the next part of the same supplier
 * sheet instead of restarting the photograph at each cabinet centre.
 *
 * The absolute room dimension is intentionally unnecessary on south/west
 * walls: their signed coordinates differ from the normal wall offset only by
 * one constant, so adjoining pieces remain continuous.
 */
export function benchtopTextureRunOffsetM(
  item: Pick<PlacedItem, 'x' | 'z' | 'width' | 'rotation'>,
): number {
  const halfWidthM = item.width / 2000;
  const rotation = ((item.rotation % 360) + 360) % 360;
  if (rotation === 0) return item.x / 1000 - halfWidthM;
  if (rotation === 90) return item.z / 1000 - halfWidthM;
  if (rotation === 180) return -item.x / 1000 - halfWidthM;
  return -item.z / 1000 - halfWidthM;
}
import type { PlacedItem } from '@/types';
