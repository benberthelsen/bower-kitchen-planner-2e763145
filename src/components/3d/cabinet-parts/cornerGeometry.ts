export type CornerReturnSide = 'Left' | 'Right';

export interface LShapeCornerGeometry {
  /** Mirror applied to the canonical left-return model. */
  mirrorX: 1 | -1;
  /** Inner vertical door plane in cabinet-local X coordinates. */
  sideDoorPlaneX: number;
  /** Inner horizontal door plane in cabinet-local Z coordinates. */
  backDoorPlaneZ: number;
  /** Visible bi-fold leaf across the back-wall arm. */
  backDoorWidth: number;
  /** Visible bi-fold leaf across the adjoining-wall arm. */
  sideDoorWidth: number;
}

export interface DiagonalCornerGeometry {
  notchX: number;
  notchZ: number;
  leftArmWidth: number;
  backArmDepth: number;
  leftArmFrontDepth: number;
  frontWidth: number;
  frontCenterX: number;
  frontCenterZ: number;
  frontYaw: number;
}

/**
 * Geometry for a genuine diagonal upper/base corner. The two cabinet arms use
 * the nominated adjoining-cabinet depths; a diagonal front then bridges the
 * remaining room-facing notch instead of drawing a rectangular base box at
 * wall-cabinet height.
 */
export function diagonalCornerGeometry(
  width: number,
  depth: number,
  leftArmDepth: number,
  rightArmDepth: number,
): DiagonalCornerGeometry {
  const safeLeftDepth = Math.min(Math.max(0.05, leftArmDepth), width - 0.05);
  const safeRightDepth = Math.min(Math.max(0.05, rightArmDepth), depth - 0.05);
  const notchX = -width / 2 + safeLeftDepth;
  const notchZ = -depth / 2 + safeRightDepth;
  return {
    notchX,
    notchZ,
    leftArmWidth: safeLeftDepth,
    backArmDepth: safeRightDepth,
    leftArmFrontDepth: depth - safeRightDepth,
    frontWidth: Math.hypot(width - safeLeftDepth, depth - safeRightDepth),
    frontCenterX: (notchX + width / 2) / 2,
    frontCenterZ: (notchZ + depth / 2) / 2,
    frontYaw: Math.PI / 4,
  };
}

/**
 * Resolve the visible join of a square pie-cut cabinet.
 *
 * The existing meshes are authored as a left-return cabinet. Right-hand room
 * corners mirror that complete model so the return face stays in the same
 * plane as the adjoining standard-depth cabinets.
 */
export function lShapeCornerGeometry(
  width: number,
  depth: number,
  sideArmDepth: number,
  backArmDepth: number,
  returnSide: CornerReturnSide = 'Left',
): LShapeCornerGeometry {
  const safeSideArmDepth = Math.min(Math.max(0.05, sideArmDepth), width - 0.05);
  const safeBackArmDepth = Math.min(Math.max(0.05, backArmDepth), depth - 0.05);
  const canonicalSideDoorPlaneX = -width / 2 + safeSideArmDepth;
  const backDoorPlaneZ = -depth / 2 + safeBackArmDepth;
  const mirrorX: 1 | -1 = returnSide === 'Right' ? -1 : 1;

  return {
    mirrorX,
    sideDoorPlaneX: canonicalSideDoorPlaneX * mirrorX,
    backDoorPlaneZ,
    backDoorWidth: width - safeSideArmDepth,
    sideDoorWidth: depth - safeBackArmDepth,
  };
}
