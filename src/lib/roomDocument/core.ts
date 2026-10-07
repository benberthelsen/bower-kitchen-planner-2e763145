/** Portable, planner-owned room geometry release. Keep trade persistence,
 * catalogue reconciliation and React editor code out of this entry point so
 * scanner and planner can validate the same millimetre document. */
export type {
  RoomPoint, DimensionSource, DimensionValue, WallGeometryEvidence, RoomCorner, RoomWall, RoomWallChain,
  ConfirmedFloorBoundary, RoomOpening, RoomPlacement, RoomService, RoomObject, PendingPhotoFeature,
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
