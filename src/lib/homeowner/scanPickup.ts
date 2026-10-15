import type { RoomScanV1 } from '@/lib/roomScan/contract';

/** The wizard state for a newly picked-up room scan (the planner's own scan, a
 * customer corner scan or a website hand-over). A new scan replaces the whole
 * room: an earlier capture draft, its wall document, a pending capture update
 * and the manual-size override are all cleared, so the previous room's walls
 * cannot stay active behind the new sizes. */
export function wizardPatchForScan(scan: RoomScanV1) {
  return {
    step: 1 as const,
    design: null,
    incomingScan: scan,
    incomingCaptureDraft: undefined,
    roomDocument: undefined,
    pendingCaptureUpdate: undefined,
    useManualRoomInstead: false,
    roomWidth: scan.room.width,
    roomDepth: scan.room.depth,
    // The scan is authoritative for the full geometry: height (measured or
    // defaulted by the scanner) and shape/cutouts (L-scans land as L).
    roomHeight: scan.room.height,
    roomGeometryShape: scan.room.shape,
    roomCutoutWidth: scan.room.cutoutWidth,
    roomCutoutDepth: scan.room.cutoutDepth,
  };
}
