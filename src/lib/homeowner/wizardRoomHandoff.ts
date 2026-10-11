import type { RoomDocumentV1 } from '@/lib/roomDocument/types';
import { derivedLegacyBounds } from '@/lib/roomDocument/geometry';
import { validateRoomDocument } from '@/lib/roomDocument/validate';

/** Read only the room fields needed by the authenticated trade room setup.
 * The full homeowner wizard remains a tab draft until the trade job is saved. */
export interface WizardRoomHandoff {
  document: RoomDocumentV1;
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  handoffId?: string;
}

const STATE_KEY = 'bower.wizard.state.v5';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function readWizardRoomHandoff(storage: Pick<Storage, 'getItem'>,
  expectedHandoffId?: string | null, now = Date.now()): WizardRoomHandoff | null {
  try {
    const raw = storage.getItem(STATE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as {
      v?: number; savedAt?: number;
      state?: { roomDocument?: RoomDocumentV1; useManualRoomInstead?: boolean;
        roomHeight?: number; handoffContext?: { handoffId?: string } };
    };
    if (saved.v !== 5 || typeof saved.savedAt !== 'number'
      || saved.savedAt > now || now - saved.savedAt > MAX_AGE_MS
      || !saved.state?.roomDocument || saved.state.useManualRoomInstead) return null;
    const document = saved.state.roomDocument;
    if (!Array.isArray(document.walls) || !Array.isArray(document.corners)
      || !Array.isArray(document.chains) || !Array.isArray(document.objects)
      || !Array.isArray(document.openings) || !Array.isArray(document.services)
      || !document.walls.length || validateRoomDocument(document).some(issue => issue.severity === 'error')) return null;
    const handoffId = saved.state.handoffContext?.handoffId;
    if (expectedHandoffId && handoffId !== expectedHandoffId) return null;
    const bounds = derivedLegacyBounds(document);
    return {
      document,
      name: document.name?.trim() || 'Kitchen',
      // Compatibility values only. An open wall chain is still not a floor.
      widthMm: Math.max(1, Math.round(bounds?.widthMm || 1)),
      depthMm: Math.max(1, Math.round(bounds?.depthMm || 1)),
      heightMm: Number.isFinite(saved.state.roomHeight) && (saved.state.roomHeight ?? 0) > 0
        ? Math.round(saved.state.roomHeight!) : 2700,
      ...(handoffId ? { handoffId } : {}),
    };
  } catch { return null; }
}
