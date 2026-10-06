export type {
  RoomPoint, DimensionSource, DimensionValue, RoomCorner, RoomWall, RoomWallChain,
  ConfirmedFloorBoundary, RoomOpening, RoomPlacement, RoomService, RoomObject,
  RoomDocumentV1, RoomEdit, RoomIssue, RoomEditResult,
} from './types';
export {
  wallGeometry, projectToWall, placementPose, objectPose, footprintCorners,
  pointInPolygon, segmentIntersection, confirmedFloorPolygon,
  footprintInsidePolygon, footprintInsideConfirmedFloor, footprintsIntersect,
  derivedLegacyBounds,
} from './geometry';
export { validateRoomDocument, polygonSelfIntersects } from './validate';
export { createRoomDocument, applyRoomEdit, undoRoomEdit } from './edit';
export { migrateTradeRoom } from './migrate';
export { reconcileTradeRoomCabinets, cabinetFootprintDepthMm } from './reconcile';
export { RoomRevisionConflictError, mergeRoomWrite, mergeCabinetWrite, selectRoomsForWrite } from './persistence';
export type { CabinetWrite } from './persistence';
