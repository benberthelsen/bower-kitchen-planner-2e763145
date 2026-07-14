import { PlacedItem, RoomConfig, GlobalDimensions, CabinetType } from '../../types';

export interface BoundingBox {
  left: number;
  right: number;
  front: number;
  back: number;
  centerX: number;
  centerZ: number;
}

export interface SnapResult {
  x: number;
  z: number;
  rotation: number;
  snappedTo: 'wall' | 'cabinet' | 'corner' | 'grid' | null;
  snapEdge?: 'left' | 'right' | 'front' | 'back';
  snappedItemId?: string;
  wallId?: 'back' | 'left' | 'right' | 'front';
}

export interface SnapContext {
  room: RoomConfig;
  items: PlacedItem[];
  globalDimensions: GlobalDimensions;
  gridSnap: number;
}

export interface WallInfo {
  id: 'back' | 'left' | 'right' | 'front';
  distance: number;
  rotation: number;
  snapPosition: { x: number; z: number };
}

export interface CornerInfo {
  walls: [WallInfo, WallInfo];
  position: { x: number; z: number };
  rotation: number;
}

export interface CabinetSnapPoint {
  x: number;
  z: number;
  edge: 'left' | 'right' | 'front' | 'back';
  targetId: string;
  distance: number;
  alignedZ: boolean;
  alignedX: boolean;
}

export interface GableSnapResult {
  x: number;
  z: number;
  targetId: string;
  edge: 'left-to-right' | 'right-to-left';
  isGableSnap: true;
}

export interface CornerCabinetConfig {
  fillerWidth: number;      // Gap between blind panel and wall (50-150mm)
  stileWidth: number;       // Face frame stile width (38-50mm)
  blindPullDistance: number; // How far blind extends past face
}
