import type { PlacedItem } from '@/types';

export const SINK_RIM_WIDTH_M = 0.012;

/**
 * Resolve the actual hole beneath a selected sink. Manufacturer cut-out
 * measurements take priority; otherwise retain a realistic 12 mm flange
 * inside the product's overall dimensions.
 */
export function sinkOpeningDimensions(item: PlacedItem): {
  widthM: number;
  depthM: number;
} {
  const overallWidthM = Math.max(0.1, item.width / 1000);
  const overallDepthM = Math.max(0.1, item.depth / 1000);
  const maximumWidthM = Math.max(0.05, overallWidthM - SINK_RIM_WIDTH_M * 2);
  const maximumDepthM = Math.max(0.05, overallDepthM - SINK_RIM_WIDTH_M * 2);
  const supplierWidthM = (item.applianceSnapshot?.cutoutWidthMm ?? 0) / 1000;
  const supplierDepthM = (item.applianceSnapshot?.cutoutDepthMm ?? 0) / 1000;

  return {
    widthM: Math.min(maximumWidthM, Math.max(0.05, supplierWidthM || maximumWidthM)),
    depthM: Math.min(maximumDepthM, Math.max(0.05, supplierDepthM || maximumDepthM)),
  };
}
