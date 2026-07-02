/**
 * Corner (pie-cut / L) cabinets: catalog products ship with depth == width
 * (900 x 900 footprint), but the ARM/return carcase depth should default to
 * the standard base depth (575). When stored depth equals the width the value
 * is the footprint, not a chosen arm depth — fall back to the standard.
 */
export const STANDARD_CORNER_ARM_DEPTH = 575;

export function defaultCornerArmDepth(widthMm: number, storedDepthMm: number | undefined): number {
  if (!storedDepthMm || storedDepthMm === widthMm) return STANDARD_CORNER_ARM_DEPTH;
  return storedDepthMm;
}
