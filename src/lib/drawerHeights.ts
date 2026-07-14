/**
 * Shared drawer-front height logic (3D render + BOM pricing).
 *
 * Heights are "front" heights (the visible drawer face). The drawer BOX side
 * height is derived as face − 20mm (shop standard), clamped to a minimum.
 */

/** Microvellum-style drawer height distributions — larger drawers at bottom. */
export const DRAWER_HEIGHT_DISTRIBUTIONS: Record<number, number[]> = {
  1: [1.0],
  2: [0.40, 0.60],
  3: [0.25, 0.33, 0.42],
  4: [0.18, 0.24, 0.28, 0.30],
  5: [0.14, 0.18, 0.22, 0.22, 0.24],
};

/** Drawer box side height = drawer face − 20mm (min 60mm). Input/output in mm. */
export const DRAWER_BOX_FACE_OFFSET_MM = 20;
export const DRAWER_BOX_MIN_HEIGHT_MM = 60;

export function drawerBoxHeightFromFace(faceHeightMm: number): number {
  return Math.max(DRAWER_BOX_MIN_HEIGHT_MM, faceHeightMm - DRAWER_BOX_FACE_OFFSET_MM);
}

/**
 * Distribute drawer front heights over a total opening height.
 *
 * When `custom` is provided (one entry per drawer, top → bottom) the values
 * are treated as proportions and scaled to exactly fill `totalHeight`, so the
 * caller's unit (mm or metres) doesn't matter. Otherwise the standard
 * distribution for the drawer count is used.
 */
export function distributeDrawerHeights(
  count: number,
  totalHeight: number,
  custom?: number[] | null,
): number[] {
  if (count <= 0 || totalHeight <= 0) return [];
  if (custom && custom.length === count && custom.every((h) => Number.isFinite(h) && h > 0)) {
    const sum = custom.reduce((a, b) => a + b, 0);
    return custom.map((h) => (h / sum) * totalHeight);
  }
  const ratios = DRAWER_HEIGHT_DISTRIBUTIONS[count] ?? Array(count).fill(1 / count);
  return ratios.map((r) => r * totalHeight);
}
