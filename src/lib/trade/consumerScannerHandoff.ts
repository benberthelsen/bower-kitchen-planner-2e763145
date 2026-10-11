import type { RoomDocumentV1 } from '@/lib/roomDocument';
import type { RoomConfig } from '@/pages/trade/components/RoomSetupWizard';

/** The short path ("Your room is ready to design") is for any scanned room
 * that arrives with walls and at least one site-measured length, whoever is
 * signed in and whichever scan made it: photo rooms, AR corner scans and open
 * AR wall runs alike. The detailed six-step setup stays one tap away. An open
 * run stays open; nothing here invents a closing wall or a floor. */
export function consumerScannerRoomForFastPath(input: {
  userType?: 'consumer' | 'trade';
  isNewJob: boolean;
  importingWizardRoom: boolean;
  initialConfig?: Partial<RoomConfig>;
}): RoomDocumentV1 | null {
  const { isNewJob, importingWizardRoom, initialConfig } = input;
  const room = initialConfig?.roomDocument;
  if (!isNewJob || importingWizardRoom || !room?.capture?.captureId || !room.walls.length || !room.chains.length) return null;
  // Every wall must belong to exactly one chain, so the editor can show them all.
  const chained = room.chains.flatMap(chain => chain.wallIds);
  if (chained.length !== room.walls.length || new Set(chained).size !== room.walls.length
    || !room.walls.every(wall => chained.includes(wall.id))) return null;
  if (!room.walls.some(wall => wall.lengthEvidence?.source === 'measured'
    && Number.isFinite(wall.lengthEvidence.valueMm) && wall.lengthEvidence.valueMm > 0)) return null;
  return room;
}

/** Retain the reviewed wall document while applying the same defaults as the
 * detailed setup wizard. Cabinets then use the ordinary saved-room editor. */
export function consumerScannerRoomConfig(
  defaults: RoomConfig,
  initialConfig: Partial<RoomConfig>,
  document: RoomDocumentV1,
): RoomConfig {
  return { ...defaults, ...initialConfig, shape: 'custom', roomDocument: document };
}
