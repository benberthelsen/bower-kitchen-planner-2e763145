/** Rooms customers scan themselves. Two scanners hand the wizard a
 * RoomCaptureDraftV1:
 * - the corner scan copied into /scan/ (scanner:sync-customer) puts it in
 *   sessionStorage 'bower.pendingScan' with adapterState.access 'device-only':
 *   scanned on the phone, nothing uploaded, at least one wall measured with a
 *   tape;
 * - the photo walk at https://scan.bowercabinets.com hands it over through
 *   create-planner-handoff (/wizard?handoff=) with access 'customer-scanner'
 *   and reviewKind 'photo-walk'. Its photos stay with that scanner, under the
 *   capture's captureId, for Bower staff only.
 *
 * The homeowner wizard sizes, designs and prices a RoomScanV1, so a closed
 * outline of 4 to 8 corners becomes the same unconfirmed scan the planner's
 * own scan produced. The customer checks it on the Room step before anything
 * is designed. A four-corner room keeps the lengths the customer measured, so
 * the Room step shows the numbers they typed; other outlines use the planner's
 * rectangle and L-shape fit. A photo walk without such an outline keeps its
 * photos for Bower while the customer types the room sizes; a corner scan
 * without one stays a capture draft. */
import type { RoomCaptureDraftV1, RoomScanV1 } from './contract';
import { buildScanFromCapture, MAX_CEILING_MM, MIN_CEILING_MM, type XrCorner } from './webxrFit';

/** Wording the customer sees on the Room step when the photo walk could not
 * size the room. */
export const CUSTOMER_PHOTOS_SAVED = 'Your photos are saved for Bower. Type your room sizes below to get your price.';

type AdapterState = { access?: unknown; reviewKind?: unknown; arCeiling?: { heightMm?: unknown; source?: unknown } };
const stateOf = (draft: RoomCaptureDraftV1): AdapterState =>
  draft.adapterState && typeof draft.adapterState === 'object' && !Array.isArray(draft.adapterState)
    ? draft.adapterState as AdapterState : {};

/** A room from the public photo walk (scan.bowercabinets.com). */
export function isCustomerScannerDraft(draft: RoomCaptureDraftV1): boolean {
  return stateOf(draft).access === 'customer-scanner';
}

export function isCustomerCornerScan(draft: RoomCaptureDraftV1): boolean {
  const state = stateOf(draft);
  return (state.access === 'device-only' && state.reviewKind === 'corner-scan')
    || (state.access === 'customer-scanner' && state.reviewKind === 'photo-walk');
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

/** What the wizard does with a customer's room: 'scan' to check its sizes and
 * price it, 'type-sizes' for a photo walk the planner cannot size (the
 * customer types the room sizes and the draft stays with the enquiry for
 * Bower), or null for anything else, which keeps the capture-draft path. */
export function customerRoomOutcome(draft: RoomCaptureDraftV1):
  | { kind: 'scan'; scan: RoomScanV1 }
  | { kind: 'type-sizes' }
  | null {
  if (!isCustomerCornerScan(draft) && !isCustomerScannerDraft(draft)) return null;
  const result = roomScanFromCustomerCornerScan(draft);
  if (result.ok) return { kind: 'scan', scan: result.scan };
  return isCustomerScannerDraft(draft) ? { kind: 'type-sizes' } : null;
}
