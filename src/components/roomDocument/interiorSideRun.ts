import { applyRoomEdit, type RoomDocumentV1, type RoomEditResult } from '@/lib/roomDocument';

/** Set one wall's inside face and fill the rest of its wall run.
 *
 * Along a run of connected walls the room is on the same side of every wall,
 * whichever way the run turns, so one choice answers the whole run. Walls in
 * the run that already have a side are left as the person set them. Returns
 * the final document and the first edit's result (for issues), or null when
 * the edit does not apply. Kept outside the versioned room core. */
export function withRunInteriorSide(document: RoomDocumentV1, wallId: string,
  side: 'left' | 'right' | 'unknown'): { document: RoomDocumentV1; first: RoomEditResult } | null {
  const first = applyRoomEdit(document, { type: 'set-wall-interior-side', wallId, side });
  if (!first.applied) return null;
  let next = first.document;
  if (side === 'unknown') return { document: next, first };
  const run = next.chains.find(chain => chain.wallIds.includes(wallId));
  for (const id of run?.wallIds ?? []) {
    if (id === wallId) continue;
    const wall = next.walls.find(item => item.id === id);
    if (!wall || (wall.interiorSide ?? 'unknown') !== 'unknown') continue;
    const result = applyRoomEdit(next, { type: 'set-wall-interior-side', wallId: id, side });
    if (result.applied) next = result.document;
  }
  return { document: next, first };
}
