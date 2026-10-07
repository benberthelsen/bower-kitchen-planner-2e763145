import type { RoomDocumentV1 } from '@/lib/roomDocument';
import type { RoomConfig } from '@/pages/trade/components/RoomSetupWizard';

/** The short path is for a complete, photo-supported room with a site scale.
 * Open AR runs and AR corner drafts still need detailed room setup. */
export function consumerScannerRoomForFastPath(input: {
  userType: 'consumer' | 'trade';
  isNewJob: boolean;
  importingWizardRoom: boolean;
  initialConfig?: Partial<RoomConfig>;
}): RoomDocumentV1 | null {
  const { userType, isNewJob, importingWizardRoom, initialConfig } = input;
  const room = initialConfig?.roomDocument;
  if (userType !== 'consumer' || !isNewJob || importingWizardRoom
    || !room?.capture?.captureId || room.capture.source !== 'photo-review') return null;
  const chain = room.chains.length === 1 ? room.chains[0] : null;
  if (!chain?.closed || room.walls.length < 3 || chain.wallIds.length !== room.walls.length
    || new Set(chain.wallIds).size !== room.walls.length) return null;
  const wallsById = new Map(room.walls.map(wall => [wall.id, wall]));
  if (!chain.wallIds.every(id => wallsById.get(id)?.geometryEvidence?.evidenceIds?.some(
    evidenceId => evidenceId.startsWith('photo:')))) return null;
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
