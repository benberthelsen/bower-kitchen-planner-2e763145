export interface BenchtopCutoutSegment {
  width: number;
  depth: number;
  x: number;
  z: number;
}

/**
 * Split a rectangular slab into four pieces around a real opening.
 *
 * The small retained edge protects the renderer from invalid/zero geometry
 * when supplier dimensions are wider than the cabinet that hosts the sink.
 */
export function rectangularCutoutSegments(
  totalWidth: number,
  totalDepth: number,
  requestedCutoutWidth: number,
  requestedCutoutDepth: number,
  requestedCenterX = 0,
  requestedCenterZ = 0,
): BenchtopCutoutSegment[] {
  const minimumEdge = 0.015;
  const cutoutWidth = Math.min(
    Math.max(requestedCutoutWidth, 0.05),
    Math.max(0.05, totalWidth - minimumEdge * 2),
  );
  const cutoutDepth = Math.min(
    Math.max(requestedCutoutDepth, 0.05),
    Math.max(0.05, totalDepth - minimumEdge * 2),
  );

  const halfWidth = totalWidth / 2;
  const halfDepth = totalDepth / 2;
  const centerX = Math.min(
    halfWidth - minimumEdge - cutoutWidth / 2,
    Math.max(-halfWidth + minimumEdge + cutoutWidth / 2, requestedCenterX),
  );
  const centerZ = Math.min(
    halfDepth - minimumEdge - cutoutDepth / 2,
    Math.max(-halfDepth + minimumEdge + cutoutDepth / 2, requestedCenterZ),
  );

  const leftEdge = -halfWidth;
  const rightEdge = halfWidth;
  const backEdge = -halfDepth;
  const frontEdge = halfDepth;
  const cutoutLeft = centerX - cutoutWidth / 2;
  const cutoutRight = centerX + cutoutWidth / 2;
  const cutoutBack = centerZ - cutoutDepth / 2;
  const cutoutFront = centerZ + cutoutDepth / 2;

  return [
    {
      width: totalWidth,
      depth: cutoutBack - backEdge,
      x: 0,
      z: (backEdge + cutoutBack) / 2,
    },
    {
      width: totalWidth,
      depth: frontEdge - cutoutFront,
      x: 0,
      z: (cutoutFront + frontEdge) / 2,
    },
    {
      width: cutoutLeft - leftEdge,
      depth: cutoutDepth,
      x: (leftEdge + cutoutLeft) / 2,
      z: centerZ,
    },
    {
      width: rightEdge - cutoutRight,
      depth: cutoutDepth,
      x: (cutoutRight + rightEdge) / 2,
      z: centerZ,
    },
  ].filter(segment => segment.width > 0.001 && segment.depth > 0.001);
}
