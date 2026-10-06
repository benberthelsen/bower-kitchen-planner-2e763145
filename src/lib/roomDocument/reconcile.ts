import type { ConfiguredCabinet } from '@/types/trade';
import type { DimensionValue, RoomDocumentV1, RoomObject, RoomPlacement } from './types';

const legacyCabinetIds = (document: RoomDocumentV1): Set<string> => {
  const snapshot = document.legacySnapshot;
  if (!snapshot || typeof snapshot !== 'object' || !('cabinets' in snapshot) || !Array.isArray(snapshot.cabinets)) return new Set();
  return new Set(snapshot.cabinets.flatMap(item => item && typeof item === 'object' && typeof item.instanceId === 'string' ? [item.instanceId] : []));
};

/** L/pie-cut corners occupy a square plan footprint; their saved depth is the
 * arm depth used for construction. Blind and diagonal products keep depth. */
export function cabinetFootprintDepthMm(cabinet: Pick<ConfiguredCabinet, 'definitionId' | 'productName' | 'dimensions'>): number {
  const identity = `${cabinet.definitionId} ${cabinet.productName}`.toLowerCase();
  const pieCut = /pie[-_ ]?cut/.test(identity);
  const ordinaryCorner = /corner/.test(identity) && !/diagonal|blind|open|angle/.test(identity);
  return pieCut || ordinaryCorner ? cabinet.dimensions.width : cabinet.dimensions.depth;
}

function dimension(valueMm: number, previous?: DimensionValue, inferred = false): DimensionValue {
  if (previous?.valueMm === valueMm) return previous;
  return { valueMm, source: inferred ? 'inferred' : 'unknown' };
}

function asRoomObject(document: RoomDocumentV1, cabinet: ConfiguredCabinet, previous: RoomObject | undefined,
  defaultWallMountHeightMm: number): RoomObject {
  const attached = cabinet.wallAttachment && document.walls.some(wall => wall.id === cabinet.wallAttachment!.wallId);
  const placement: RoomPlacement = attached
    ? { type: 'wall', ...cabinet.wallAttachment! }
    : {
      type: 'free', xMm: cabinet.position!.x, zMm: cabinet.position!.z,
      rotationDeg: cabinet.position!.rotation,
    };
  const inferred = cabinet.dimensionStatus === 'inferred';
  const widthMm = cabinet.dimensions.width, depthMm = cabinetFootprintDepthMm(cabinet), heightMm = cabinet.dimensions.height;
  return {
    id: cabinet.instanceId,
    sourceCabinetId: cabinet.instanceId,
    layer: 'proposed',
    kind: cabinet.category === 'Appliance' ? 'appliance' : 'cabinet',
    placement,
    widthMm, depthMm, heightMm,
    elevationMm: cabinet.category === 'Wall'
      ? (cabinet.position!.y || defaultWallMountHeightMm)
      : (cabinet.position!.y ?? 0),
    catalogueId: cabinet.definitionId,
    sizeLock: inferred ? 'none' : 'confirmed',
    dimensionEvidence: {
      ...previous?.dimensionEvidence,
      widthMm: dimension(widthMm, previous?.dimensionEvidence?.widthMm, inferred),
      depthMm: dimension(depthMm, previous?.dimensionEvidence?.depthMm, inferred),
      heightMm: dimension(heightMm, previous?.dimensionEvidence?.heightMm, inferred),
    },
    evidenceIds: previous?.evidenceIds,
  };
}

/** TradeRoom.cabinets owns priced/catalogue products. This projects the latest
 * placed cabinets into RoomDocument's proposed layer for one geometry view;
 * surveyed fittings and other sketch objects are untouched. Removing or
 * resizing a cabinet updates its projection and advances the room revision,
 * invalidating suggestions built against the old arrangement. */
export function reconcileTradeRoomCabinets(
  document: RoomDocumentV1,
  cabinets: ConfiguredCabinet[],
  roomDefaults?: { wallMountHeight?: number },
): RoomDocumentV1 {
  const pastCabinetIds = legacyCabinetIds(document);
  const activeIds = new Set(cabinets.map(cabinet => cabinet.instanceId));
  const isCabinetProjection = (object: RoomObject) => object.layer === 'proposed'
    && (Boolean(object.sourceCabinetId) || activeIds.has(object.id) || pastCabinetIds.has(object.id));
  const existing = new Map(document.objects.filter(isCabinetProjection).map(object => [object.sourceCabinetId ?? object.id, object]));
  const retained = document.objects.filter(object => !isCabinetProjection(object));
  const projected = cabinets
    .filter(cabinet => cabinet.isPlaced && cabinet.position)
    .map(cabinet => asRoomObject(document, cabinet, existing.get(cabinet.instanceId), roomDefaults?.wallMountHeight ?? 1350));
  const nextObjects = [...retained, ...projected];
  return JSON.stringify(nextObjects) === JSON.stringify(document.objects)
    ? document
    : { ...document, objects: nextObjects, revision: document.revision + 1 };
}
