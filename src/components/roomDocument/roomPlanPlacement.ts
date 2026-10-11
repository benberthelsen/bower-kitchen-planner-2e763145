import type { RoomDocumentV1, RoomEdit, RoomPoint } from '@/lib/roomDocument/core';

export type WallConnection = 'start' | 'end' | 'separate';

export type PlanWallClick =
  | { kind: 'start'; point: RoomPoint }
  | { kind: 'edit'; edit: Extract<RoomEdit, { type: 'add-wall' }> }
  | { kind: 'error'; message: string };

/** Convert two plan taps, or a tap after an open chain, into the same edit used
 * by the numeric wall controls. A scan's missing wall is never added implicitly. */
export function wallEditForPlanClick(
  document: RoomDocumentV1,
  selectedWallId: string | null,
  connection: WallConnection,
  point: RoomPoint,
  pendingStart: RoomPoint | null,
  wallId: string,
): PlanWallClick {
  const chain = document.chains.find(item => item.wallIds.includes(selectedWallId ?? ''));
  if (document.walls.length && connection !== 'separate' && (!chain || chain.closed)) {
    return { kind: 'error', message: 'Select an open wall run, or choose a separate wall in Add wall.' };
  }
  const separate = !document.walls.length || connection === 'separate';
  if (separate && !pendingStart) return { kind: 'start', point };
  const anchor = separate ? pendingStart : document.corners.find(corner => {
    const wall = document.walls.find(item => item.id === chain!.wallIds[connection === 'start' ? 0 : chain!.wallIds.length - 1]);
    return corner.id === (connection === 'start' ? wall?.startCornerId : wall?.endCornerId);
  });
  if (!anchor) return { kind: 'error', message: 'The selected wall endpoint could not be found.' };
  const dx = connection === 'start' && !separate ? anchor.xMm - point.xMm : point.xMm - anchor.xMm;
  const dz = connection === 'start' && !separate ? anchor.zMm - point.zMm : point.zMm - anchor.zMm;
  const lengthMm = Math.hypot(dx, dz);
  if (lengthMm < 50) return { kind: 'error', message: 'Tap at least 50 mm from the starting corner.' };
  return {
    kind: 'edit',
    edit: {
      type: 'add-wall', wallId, lengthMm, angleDeg: Math.atan2(dz, dx) * 180 / Math.PI,
      ...(separate ? { start: { xMm: anchor.xMm, zMm: anchor.zMm } } : { chainId: chain!.id, end: connection }),
    },
  };
}
