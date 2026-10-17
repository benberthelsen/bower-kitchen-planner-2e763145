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
 * is designed. The planner's rectangle and L-shape fit always judges the
 * scanned outline first, so a room that is not square keeps the fit's warning
 * and lower confidence instead of being squared off silently. Only a
 * four-corner room the fit accepts as a clean rectangle (no warning) takes the
 * customer's tape lengths exactly, so the Room step shows the numbers they
 * typed. A photo walk the fit refuses keeps its photos for Bower while the
 * customer types the room sizes; a corner scan the fit refuses stays a capture
 * draft. */
import type { RoomCaptureDraftV1, RoomScanV1 } from './contract';
import { parseRoomScan } from './contract';
import { buildScanFromCapture, MAX_CEILING_MM, MIN_CEILING_MM, RECT_REJECT_MM, RECT_WARN_MM, type XrCorner } from './webxrFit';

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

/** How far a four-corner outline is from a rectangle, in millimetres: the
 *  largest mismatch between opposite walls or between the diagonals. A
 *  rectangle has both pairs equal; a trapezoid or a skewed room does not.
 *  (The rectangle fit's own check measures each corner against the nearest
 *  fitted edge, which a trapezoid passes.) */
type PointMm = { x?: number; z?: number };
function rectangleMismatchMm(mm: readonly PointMm[]): number {
  const d = (a: PointMm, b: PointMm) => Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.z ?? 0) - (a.z ?? 0));
  const side = [0, 1, 2, 3].map((i) => d(mm[i], mm[(i + 1) % 4]));
  return Math.max(Math.abs(side[0] - side[2]), Math.abs(side[1] - side[3]), Math.abs(d(mm[0], mm[2]) - d(mm[1], mm[3])));
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

  const ceiling = stateOf(draft).arCeiling;
  const heightMm = typeof ceiling?.heightMm === 'number' && Number.isInteger(ceiling.heightMm)
    && ceiling.heightMm >= MIN_CEILING_MM && ceiling.heightMm <= MAX_CEILING_MM ? ceiling.heightMm : undefined;
  const heightSource = ceiling?.source === 'ceiling-hit' ? 'surface' as const : 'wall-edge' as const;
  const extras = heightMm ? { heightMm, heightSource } : {};

  // The fit judges the outline as scanned (tape lengths already applied on the
  // floor-plan step). Its warnings and confidence are what tell the customer
  // and staff that a room was simplified.
  const scanned = buildScanFromCapture(mm.map((c) => ({ x: c.x / 1000, z: c.z / 1000 })), extras, draft.capturedAt);
  if (!scanned.ok || mm.length !== 4 || scanned.scan.room.shape !== 'Rectangle') return scanned;

  // Not a rectangle: keep the approximate fit, say so on the Room step and
  // lower the confidence, as the fit does for other simplified outlines.
  const mismatch = rectangleMismatchMm(mm);
  if (mismatch > RECT_WARN_MM) {
    const off = Math.round(mismatch), heavy = mismatch > RECT_REJECT_MM;
    const warning = heavy
      ? `this room is not rectangular — its walls differ by up to ${off}mm from a rectangle, so the outline below is approximate. Check every dimension before ordering.`
      : `room shape simplified — its walls differ by up to ${off}mm from a rectangle`;
    const parsed = parseRoomScan({
      ...scanned.scan,
      confidence: { ...scanned.scan.confidence, overall: Math.min(scanned.scan.confidence.overall, heavy ? 0.3 : 0.5) },
      normalizationWarnings: [...(scanned.scan.normalizationWarnings ?? []), warning],
    });
    if ('reason' in parsed) return { ok: false, reason: parsed.reason };
    return { ok: true, scan: parsed.scan, warnings: [...scanned.warnings, warning] };
  }
  if (scanned.warnings.length) return scanned;

  // A clean rectangle: opposite walls agree, so a tape length wins over the
  // scan estimate for its pair and the Room step shows what was typed.
  const measured = new Map((draft.partialGeometry?.wallMeasurements ?? []).map((m) => [m.wallId, m.millimetres]));
  const length = (i: number) => Math.hypot(mm[(i + 1) % 4].x - mm[i].x, mm[(i + 1) % 4].z - mm[i].z);
  const wall = (i: number) => measured.get(chain.wallIds[i]);
  const width = wall(0) ?? wall(2) ?? (length(0) + length(2)) / 2;
  const depth = wall(1) ?? wall(3) ?? (length(1) + length(3)) / 2;
  // Keep the customer's walking direction, so wall 1 stays the first wall.
  const turn = (mm[1].x - mm[0].x) * (mm[2].z - mm[1].z) - (mm[1].z - mm[0].z) * (mm[2].x - mm[1].x);
  const d = (turn >= 0 ? depth : -depth) / 1000, w = width / 1000;
  const rectangle: XrCorner[] = [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];
  const taped = buildScanFromCapture(rectangle, extras, draft.capturedAt);
  return taped.ok ? taped : scanned;
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
