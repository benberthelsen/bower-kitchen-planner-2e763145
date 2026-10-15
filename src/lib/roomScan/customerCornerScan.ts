/** Rooms from the customer corner scanner (/scan/corners/ → /scan/plan/, built
 * from the room-scanner app and copied in by scanner:sync-customer). They
 * arrive in sessionStorage 'bower.pendingScan' as a RoomCaptureDraftV1 with
 * adapterState.access 'device-only': scanned on the customer's phone, nothing
 * uploaded, at least one wall measured with a tape.
 *
 * The homeowner wizard sizes, designs and prices a RoomScanV1, so a closed
 * outline of 4 to 8 corners becomes the same unconfirmed scan the planner's
 * own scan produced. The customer checks it on the Room step before anything
 * is designed. A four-corner room keeps the lengths the customer measured, so
 * the Room step shows the numbers they typed; other outlines use the planner's
 * rectangle and L-shape fit. Anything else stays a capture draft. */
import type { RoomCaptureDraftV1, RoomScanV1 } from './contract';
import { buildScanFromCapture, MAX_CEILING_MM, MIN_CEILING_MM, type XrCorner } from './webxrFit';

type AdapterState = { access?: unknown; reviewKind?: unknown; arCeiling?: { heightMm?: unknown; source?: unknown } };
const stateOf = (draft: RoomCaptureDraftV1): AdapterState =>
  draft.adapterState && typeof draft.adapterState === 'object' && !Array.isArray(draft.adapterState)
    ? draft.adapterState as AdapterState : {};

export function isCustomerCornerScan(draft: RoomCaptureDraftV1): boolean {
  const state = stateOf(draft);
  return state.access === 'device-only' && state.reviewKind === 'corner-scan';
}

export function roomScanFromCustomerCornerScan(draft: RoomCaptureDraftV1):
  | { ok: true; scan: RoomScanV1; warnings: string[] }
  | { ok: false; reason: string } {
  if (!isCustomerCornerScan(draft)) return { ok: false, reason: 'not a customer corner scan' };
  const chains = draft.partialGeometry?.wallChains ?? [];
  const chain = chains[0];
  if (chains.length !== 1 || !chain?.closed) return { ok: false, reason: 'the outline is not one closed room' };
  const mm = chain.cornersMm;
  if (mm.length < 4) return { ok: false, reason: 'fewer than four corners' };

  const measured = new Map((draft.partialGeometry?.wallMeasurements ?? []).map((m) => [m.wallId, m.millimetres]));
  const length = (i: number) => Math.hypot(mm[(i + 1) % mm.length].x - mm[i].x, mm[(i + 1) % mm.length].z - mm[i].z);
  const wall = (i: number) => measured.get(chain.wallIds[i]);
  let corners: XrCorner[];
  if (mm.length === 4) {
    // Opposite walls of a rectangle: a tape length wins over the scan estimate.
    const width = wall(0) ?? wall(2) ?? (length(0) + length(2)) / 2;
    const depth = wall(1) ?? wall(3) ?? (length(1) + length(3)) / 2;
    // Keep the customer's walking direction, so wall 1 stays the first wall.
    const turn = (mm[1].x - mm[0].x) * (mm[2].z - mm[1].z) - (mm[1].z - mm[0].z) * (mm[2].x - mm[1].x);
    const d = (turn >= 0 ? depth : -depth) / 1000, w = width / 1000;
    corners = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
  } else {
    corners = mm.map((c) => ({ x: c.x / 1000, z: c.z / 1000 }));
  }

  const ceiling = stateOf(draft).arCeiling;
  const heightMm = typeof ceiling?.heightMm === 'number' && Number.isInteger(ceiling.heightMm)
    && ceiling.heightMm >= MIN_CEILING_MM && ceiling.heightMm <= MAX_CEILING_MM ? ceiling.heightMm : undefined;
  const heightSource = ceiling?.source === 'ceiling-hit' ? 'surface' as const : 'wall-edge' as const;
  return buildScanFromCapture(corners, heightMm ? { heightMm, heightSource } : {}, draft.capturedAt);
}
