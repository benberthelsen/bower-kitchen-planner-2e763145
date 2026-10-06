import { DEFAULT_GLOBAL_DIMENSIONS } from '@/constants';
import { createRoomDocument, derivedLegacyBounds, migrateTradeRoom, type RoomDocumentV1 } from '@/lib/roomDocument';
import type { RoomConfig as WizardRoomConfig } from '@/pages/trade/components/RoomSetupWizard';
import type { GlobalDimensions, RoomConfig as LegacyRoomConfig } from '@/types';
import type { TradeRoom } from '@/types/trade';

/** Converting a saved legacy room to editable walls must bring its openings,
 * services, catalogue cabinets and IDs along, rather than starting a blank plan. */
export function documentForCustomSetup(config: WizardRoomConfig, legacyRoom?: TradeRoom): RoomDocumentV1 {
  if (config.roomDocument) return config.roomDocument;
  if (!legacyRoom || legacyRoom.roomDocument) return createRoomDocument(crypto.randomUUID(), config.name || 'Room');
  return migrateTradeRoom({
    ...legacyRoom,
    name: config.name || legacyRoom.name,
    config: {
      ...legacyRoom.config,
      width: config.roomWidth,
      depth: config.roomDepth,
      height: config.roomHeight,
      cutoutWidth: config.cutoutWidth ?? 0,
      cutoutDepth: config.cutoutDepth ?? 0,
      openings: config.openings,
      services: config.services,
    },
  });
}

/** Keep the newer wizard's layout and supply choices beside the legacy room
 * config, whose shape field only understands Rectangle and LShape. */
export function roomSetupExtras(config: WizardRoomConfig, previous?: TradeRoom['setupExtras']): TradeRoom['setupExtras'] {
  return {
    ...previous,
    upperTopMarginMm: config.upperTopMargin,
    upperBottomMarginMm: config.upperBottomMargin,
    baseTopMarginMm: config.baseTopMargin,
    layoutPreset: config.shape,
    islandWidthMm: config.islandWidth,
    islandDepthMm: config.islandDepth,
    peninsulaLengthMm: config.peninsulaLength,
    peninsulaWidthMm: config.peninsulaWidth,
    leftWingDepthMm: config.leftWingDepth,
    rightWingDepthMm: config.rightWingDepth,
    corridorWidthMm: config.corridorWidth,
    supplyMethod: config.supplyMethod,
  };
}

export function roomDimensions(config: WizardRoomConfig, base: GlobalDimensions = DEFAULT_GLOBAL_DIMENSIONS): GlobalDimensions {
  return {
    ...base,
    toeKickHeight: config.toeKickHeight,
    shelfSetback: config.shelfSetback,
    baseHeight: config.baseHeight,
    baseDepth: config.baseDepth,
    wallHeight: config.wallHeight,
    wallDepth: config.wallDepth,
    tallHeight: config.tallHeight,
    tallDepth: config.tallDepth,
    wallMountHeight: config.wallMountHeight,
    doorGap: config.doorGap,
    drawerGap: config.drawerGap,
    leftGap: config.leftGap,
    rightGap: config.rightGap,
    topMargin: config.upperTopMargin,
    bottomMargin: config.upperBottomMargin,
  };
}

export function legacyRoomConfig(config: WizardRoomConfig): LegacyRoomConfig {
  const bounds = config.roomDocument ? derivedLegacyBounds(config.roomDocument) : null;
  return {
    width: bounds?.widthMm || config.roomWidth,
    depth: bounds?.depthMm || config.roomDepth,
    height: config.roomHeight,
    shape: config.shape === 'l-shaped' ? 'LShape' : 'Rectangle',
    cutoutWidth: config.cutoutWidth ?? 0,
    cutoutDepth: config.cutoutDepth ?? 0,
    openings: config.openings ?? [],
    services: config.services ?? [],
  };
}

/** The wizard edit path is a true round trip, including values that the
 * legacy rectangular planner cannot represent directly. */
export function toRoomConfig(room: TradeRoom): WizardRoomConfig {
  const bounds = room.roomDocument ? derivedLegacyBounds(room.roomDocument) : null;
  return {
    name: room.name,
    description: room.description,
    shape: room.roomDocument ? 'custom' : room.setupExtras?.layoutPreset ?? room.shape,
    roomWidth: bounds?.widthMm || room.config.width,
    roomDepth: bounds?.depthMm || room.config.depth,
    roomHeight: room.config.height,
    cutoutWidth: room.config.cutoutWidth,
    cutoutDepth: room.config.cutoutDepth,
    islandWidth: room.setupExtras?.islandWidthMm,
    islandDepth: room.setupExtras?.islandDepthMm,
    peninsulaLength: room.setupExtras?.peninsulaLengthMm,
    peninsulaWidth: room.setupExtras?.peninsulaWidthMm,
    leftWingDepth: room.setupExtras?.leftWingDepthMm,
    rightWingDepth: room.setupExtras?.rightWingDepthMm,
    corridorWidth: room.setupExtras?.corridorWidthMm,
    openings: room.config.openings ?? [],
    services: room.config.services ?? [],
    exteriorMaterial: room.materialDefaults.exteriorFinish,
    exteriorEdge: room.materialDefaults.edgeBanding,
    doorStyle: room.materialDefaults.doorStyle,
    carcaseMaterial: room.materialDefaults.carcaseFinish,
    carcaseEdge: room.materialDefaults.carcaseEdge ?? room.materialDefaults.edgeBanding,
    hingeStyle: room.hardwareDefaults.hingeType,
    drawerStyle: room.hardwareDefaults.drawerType,
    supplyHardware: room.hardwareDefaults.supplyHardware,
    supplyMethod: room.setupExtras?.supplyMethod ?? 'assembled',
    adjustableLegs: room.hardwareDefaults.adjustableLegs,
    toeKickHeight: room.dimensions.toeKickHeight,
    shelfSetback: room.dimensions.shelfSetback,
    baseHeight: room.dimensions.baseHeight,
    baseDepth: room.dimensions.baseDepth,
    wallHeight: room.dimensions.wallHeight,
    wallDepth: room.dimensions.wallDepth,
    tallHeight: room.dimensions.tallHeight,
    tallDepth: room.dimensions.tallDepth,
    wallMountHeight: room.dimensions.wallMountHeight ?? 1350,
    doorGap: room.dimensions.doorGap,
    drawerGap: room.dimensions.drawerGap,
    leftGap: room.dimensions.leftGap,
    rightGap: room.dimensions.rightGap,
    upperTopMargin: room.setupExtras?.upperTopMarginMm ?? room.dimensions.topMargin,
    upperBottomMargin: room.setupExtras?.upperBottomMarginMm ?? room.dimensions.bottomMargin,
    baseTopMargin: room.setupExtras?.baseTopMarginMm ?? room.dimensions.topMargin,
    roomDocument: room.roomDocument,
  };
}
