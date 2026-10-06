import type { RoomDocumentV1, RoomObject } from '@/lib/roomDocument/types';
import { validateRoomDocument } from '@/lib/roomDocument/validate';
import {
  generateRoomDocumentCandidates,
  type RoomDocumentCandidate,
} from '@/lib/layout/roomDocumentCandidates';
import type { StyleSpec } from '@/lib/layout/types';

export type ApplyRoomDocumentProposalResult =
  | { ok: true; document: RoomDocumentV1; count: number }
  | { ok: false; reason: string };

/** Apply one current, rule-checked wall idea without altering walls, evidence,
 * or the open/closed status of the source room. */
export function applyRoomDocumentProposal(
  document: RoomDocumentV1,
  candidate: RoomDocumentCandidate,
  style: StyleSpec,
): ApplyRoomDocumentProposalResult {
  if (candidate.roomRevision !== document.revision) {
    return { ok: false, reason: 'The room changed. Review a fresh wall-run idea.' };
  }
  const pool = generateRoomDocumentCandidates({ document, style, maxCandidates: 3 });
  if (!pool.capability.supported) {
    return { ok: false, reason: pool.capability.reasons[0] ?? 'Review the wall geometry before placing cabinets.' };
  }
  // Recompute from the current document rather than trusting a previously
  // displayed candidate's items or positions.
  const current = pool.candidates.find(item => item.candidateId === candidate.candidateId);
  if (!current || !current.items.length) {
    return { ok: false, reason: 'This idea no longer fits the room. Review a fresh option.' };
  }
  const usedIds = new Set([
    ...document.corners, ...document.walls, ...document.chains,
    ...document.openings, ...document.services, ...document.objects,
  ].map(item => item.id));
  const additions: RoomObject[] = current.items.map(({ wallId, offsetMm, item }) => ({
    id: item.instanceId,
    layer: 'proposed',
    kind: item.layoutRole ?? item.definitionId,
    placement: { type: 'wall', wallId, offsetMm },
    widthMm: item.width,
    depthMm: item.depth,
    heightMm: item.height,
    elevationMm: item.y,
    catalogueId: item.definitionId,
    sizeLock: 'catalogue',
  }));
  if (additions.some(item => usedIds.has(item.id))
    || new Set(additions.map(item => item.id)).size !== additions.length) {
    return { ok: false, reason: 'This idea overlaps an existing room record. Review a fresh option.' };
  }
  const updated: RoomDocumentV1 = {
    ...document,
    revision: document.revision + 1,
    objects: [...document.objects, ...additions],
  };
  const error = validateRoomDocument(updated).find(issue => issue.severity === 'error');
  return error
    ? { ok: false, reason: error.message }
    : { ok: true, document: updated, count: additions.length };
}
