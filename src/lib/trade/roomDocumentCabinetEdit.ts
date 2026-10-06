import type { ConfiguredCabinet } from '@/types/trade';
import type { RoomDocumentV1, RoomObject } from '@/lib/roomDocument/types';
import { objectPose } from '@/lib/roomDocument/geometry';

function projectionFor(document: RoomDocumentV1, cabinetId: string): RoomObject | undefined {
  return document.objects.find(object => object.layer === 'proposed'
    && (object.sourceCabinetId === cabinetId || object.id === cabinetId));
}

/** The plan editor's undo stack stores room documents, while TradeRoom owns the
 * full catalogue/material record. Keep a transaction-local copy only for a
 * projected cabinet removed from the plan, so undo can restore that exact
 * record rather than fabricating one from its lean RoomObject projection. */
export function syncCabinetProjectionMembership(previous: RoomDocumentV1, edited: RoomDocumentV1,
  cabinets: ConfiguredCabinet[], undoArchive: Map<string, ConfiguredCabinet>): {
    cabinets: ConfiguredCabinet[]; removedIds: string[]; restoredIds: string[];
  } {
  const currentIds = new Set(cabinets.map(cabinet => cabinet.instanceId));
  const removedIds = cabinets.filter(cabinet => projectionFor(previous, cabinet.instanceId)
    && !projectionFor(edited, cabinet.instanceId)).map(cabinet => cabinet.instanceId);
  for (const id of removedIds) {
    const cabinet = cabinets.find(item => item.instanceId === id)!;
    undoArchive.set(id, structuredClone(cabinet));
  }
  const restoredIds = [...undoArchive.keys()].filter(id => !currentIds.has(id)
    && !projectionFor(previous, id) && projectionFor(edited, id));
  return {
    cabinets: [...cabinets.filter(cabinet => !removedIds.includes(cabinet.instanceId)),
      ...restoredIds.map(id => structuredClone(undoArchive.get(id)!))],
    removedIds,
    restoredIds,
  };
}

/** A cabinet in the trade catalogue and its plan projection represent one
 * item. Apply an explicit plan-object edit to the catalogue item before the
 * projection is rebuilt, otherwise reconciliation restores the old pose. */
export function applyEditedCabinetProjection(previous: RoomDocumentV1, edited: RoomDocumentV1,
  cabinet: ConfiguredCabinet): { cabinet: ConfiguredCabinet; directlyEdited: boolean } {
  const before = projectionFor(previous, cabinet.instanceId);
  const after = projectionFor(edited, cabinet.instanceId);
  if (!after) return { cabinet, directlyEdited: false };

  const placementChanged = !before || JSON.stringify(before.placement) !== JSON.stringify(after.placement);
  const dimensionsChanged = !before || before.widthMm !== after.widthMm || before.depthMm !== after.depthMm
    || before.heightMm !== after.heightMm;
  if (!placementChanged && !dimensionsChanged) return { cabinet, directlyEdited: false };

  // A catalogue or site-confirmed size is not made editable by an imported
  // document patch. The room editor only exposes size fields for inferred items.
  const sizeEditable = after.sizeLock !== 'catalogue' && after.sizeLock !== 'confirmed';
  const dimensions = sizeEditable ? {
    ...cabinet.dimensions,
    width: before?.widthMm !== after.widthMm ? after.widthMm : cabinet.dimensions.width,
    depth: before?.depthMm !== after.depthMm ? after.depthMm : cabinet.dimensions.depth,
    height: before?.heightMm !== after.heightMm ? after.heightMm ?? cabinet.dimensions.height : cabinet.dimensions.height,
  } : cabinet.dimensions;
  // RoomObject.depthMm is the plan footprint for catalogue corner products;
  // ConfiguredCabinet.dimensions.depth may instead be the construction arm.
  const pose = objectPose(edited, { ...after,
    widthMm: sizeEditable ? after.widthMm : before?.widthMm ?? after.widthMm,
    depthMm: sizeEditable ? after.depthMm : before?.depthMm ?? after.depthMm });
  if (!pose) return { cabinet: { ...cabinet, geometryConflict: 'The edited cabinet has no valid supporting wall.' }, directlyEdited: true };

  return {
    directlyEdited: true,
    cabinet: {
      ...cabinet,
      dimensions,
      position: { x: pose.xMm, y: after.elevationMm ?? cabinet.position?.y ?? 0,
        z: pose.zMm, rotation: pose.rotationDeg },
      wallAttachment: after.placement.type === 'wall'
        ? { wallId: after.placement.wallId, offsetMm: after.placement.offsetMm,
            depthOffsetMm: after.placement.depthOffsetMm }
        : undefined,
      isPlaced: true,
    },
  };
}
