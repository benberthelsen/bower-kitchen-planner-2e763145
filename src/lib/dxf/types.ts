// DXF Parser Types for Cabinet Data Extraction

export interface DXFPoint {
  x: number;
  y: number;
  z?: number;
}

export interface DXFLine {
  type: 'LINE';
  start: DXFPoint;
  end: DXFPoint;
  layer: string;
}

export interface DXFArc {
  type: 'ARC';
  center: DXFPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  layer: string;
}

export interface DXFCircle {
  type: 'CIRCLE';
  center: DXFPoint;
  radius: number;
  layer: string;
}

export interface DXFPolyline {
  type: 'POLYLINE' | 'LWPOLYLINE';
  vertices: DXFPoint[];
  closed: boolean;
  layer: string;
}

export interface DXFText {
  type: 'TEXT' | 'MTEXT';
  position: DXFPoint;
  text: string;
  height: number;
  rotation: number;
  layer: string;
}

export interface DXFInsert {
  type: 'INSERT';
  name: string;
  position: DXFPoint;
  scale: { x: number; y: number; z: number };
  rotation: number;
  layer: string;
}

export type DXFEntity = DXFLine | DXFArc | DXFCircle | DXFPolyline | DXFText | DXFInsert;

export interface DXFBlock {
  name: string;
  entities: DXFEntity[];
  basePoint: DXFPoint;
}

export interface DXFLayer {
  name: string;
  color: number;
  visible: boolean;
}

export interface ParsedDXF {
  header: {
    version?: string;
    measurement?: number; // 0 = Imperial, 1 = Metric
    extents?: { min: DXFPoint; max: DXFPoint };
  };
  layers: DXFLayer[];
  blocks: DXFBlock[];
  entities: DXFEntity[];
}

// Cabinet-specific extracted data
export interface ExtractedCabinetData {
  filename: string;
  name: string;
  category: 'Base' | 'Wall' | 'Tall' | 'Accessory';
  cabinetType: string;
  
  // Dimensions in mm
  width: number;
  height: number;
  depth: number;
  
  // Detected features
  doorCount: number;
  drawerCount: number;
  isCorner: boolean;
  isBlind: boolean;
  isSink: boolean;
  hasFalseFront: boolean;
  hasAdjustableShelves: boolean;
  
  // Geometry data for 3D rendering
  frontView?: {
    doors: Array<{ x: number; y: number; width: number; height: number }>;
    drawers: Array<{ x: number; y: number; width: number; height: number }>;
    handles: Array<{ x: number; y: number; type: 'bar' | 'knob' }>;
  };
  sideView?: {
    shelves: Array<{ y: number; depth: number }>;
    kickHeight?: number;
  };
  topView?: {
    sinkCutout?: { x: number; y: number; width: number; depth: number };
  };
  
  // Raw layers for advanced analysis
  layers: string[];
  entityCounts: Record<string, number>;
}

export interface DXFProcessingResult {
  success: boolean;
  cabinets: ExtractedCabinetData[];
  errors: string[];
  totalFiles: number;
  processedFiles: number;
}
