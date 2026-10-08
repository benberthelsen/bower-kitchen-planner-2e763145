import { applyRoomEdit, type RoomDocumentV1, type RoomEditResult } from '@/lib/roomDocument';

/** Set one wall's inside face and the rest of its wall run.
 *
 * Along a run of connected walls the room is on the same side of every wall,
 * whichever way the run turns, so one choice answers the whole run: walls
 * that were undecided, or that had this wall's previous side (a correction of
 * the earlier choice), take the new side. Returns the final document and the
 * first edit's result; when that edit is refused, `applied` is false and its
 * issues say why. Kept outside the versioned room core. */
export function withRunInteriorSide(document: RoomDocumentV1, wallId: string,
  side: 'left' | 'right' | 'unknown'): { document: RoomDocumentV1; first: RoomEditResult; applied: boolean } {
  const previous = document.walls.find(item => item.id === wallId)?.interiorSide ?? 'unknown';
  const first = applyRoomEdit(document, { type: 'set-wall-interior-side', wallId, side });
  if (!first.applied) return { document, first, applied: false };
  let next = first.document;
  if (side === 'unknown') return { document: next, first, applied: true };
  const run = next.chains.find(chain => chain.wallIds.includes(wallId));
  for (const id of run?.wallIds ?? []) {
    if (id === wallId) continue;
    const wall = next.walls.find(item => item.id === id);
    const current = wall?.interiorSide ?? 'unknown';
    if (!wall || (current !== 'unknown' && current !== previous)) continue;
    const result = applyRoomEdit(next, { type: 'set-wall-interior-side', wallId: id, side });
    if (result.applied) next = result.document;
  }
  return { document: next, first, applied: true };
}
