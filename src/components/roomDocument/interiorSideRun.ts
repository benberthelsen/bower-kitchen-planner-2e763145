import { applyRoomEdit, type RoomDocumentV1, type RoomEditResult } from '@/lib/roomDocument';

/** Set one wall's inside face and the rest of its wall run.
 *
 * Along a run of connected walls the room is on the same side of every wall,
 * whichever way the run turns, so one choice answers the whole run: every
 * wall in the run takes the new side, which also corrects an earlier wrong
 * choice and never leaves a run with mixed sides. Returns the final document
 * and the first edit's result; when that edit is refused, `applied` is false
 * and its issues say why. Kept outside the versioned room core. */
export function withRunInteriorSide(document: RoomDocumentV1, wallId: string,
  side: 'left' | 'right' | 'unknown'): { document: RoomDocumentV1; first: RoomEditResult; applied: boolean } {
  const first = applyRoomEdit(document, { type: 'set-wall-interior-side', wallId, side });
  if (!first.applied) return { document, first, applied: false };
  let next = first.document;
  if (side === 'unknown') return { document: next, first, applied: true };
  const run = next.chains.find(chain => chain.wallIds.includes(wallId));
  for (const id of run?.wallIds ?? []) {
    if (id === wallId) continue;
    const wall = next.walls.find(item => item.id === id);
    if (!wall || wall.interiorSide === side) continue;
    const result = applyRoomEdit(next, { type: 'set-wall-interior-side', wallId: id, side });
    if (result.applied) next = result.document;
  }
  return { document: next, first, applied: true };
}
