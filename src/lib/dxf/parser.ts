import DxfParser from 'dxf-parser';
import JSZip from 'jszip';
import { 
  ParsedDXF, 
  ExtractedCabinetData, 
  DXFEntity, 
  DXFProcessingResult,
  DXFPoint 
} from './types';

/**
 * Parse DXF content string into structured data
 */
export function parseDXFContent(content: string): ParsedDXF | null {
  try {
    const parser = new DxfParser();
    const dxf = parser.parseSync(content);
    
    if (!dxf) return null;

    // Helper to safely extract point values
    const getPointValue = (val: any): { x: number; y: number; z: number } | undefined => {
      if (!val) return undefined;
      if (typeof val === 'object' && 'x' in val) {
        return { x: val.x || 0, y: val.y || 0, z: val.z || 0 };
      }
      return undefined;
    };

    const extMin = getPointValue(dxf.header?.$EXTMIN);
    const extMax = getPointValue(dxf.header?.$EXTMAX);

    // Extract header info
    const header: ParsedDXF['header'] = {
      version: typeof dxf.header?.$ACADVER === 'string' ? dxf.header.$ACADVER : undefined,
      measurement: typeof dxf.header?.$MEASUREMENT === 'number' ? dxf.header.$MEASUREMENT : undefined,
      extents: extMin && extMax ? { min: extMin, max: extMax } : undefined
    };

    // Extract layers
    const layers = Object.entries(dxf.tables?.layer?.layers || {}).map(([name, layer]: [string, any]) => ({
      name,
      color: layer.color || 7,
      visible: !layer.frozen && !layer.off
    }));

    // Extract blocks
    const blocks = Object.entries(dxf.blocks || {}).map(([name, block]: [string, any]) => ({
      name,
      entities: (block.entities || []).map(mapEntity),
      basePoint: block.position || { x: 0, y: 0, z: 0 }
    }));

    // Extract entities
    const entities = (dxf.entities || []).map(mapEntity);

    return { header, layers, blocks, entities };
  } catch (error) {
    console.error('DXF parsing error:', error);
    return null;
  }
}

/**
 * Map raw DXF entity to our typed structure
 */
function mapEntity(entity: any): DXFEntity {
  const layer = entity.layer || '0';
  
  switch (entity.type) {
    case 'LINE':
      return {
        type: 'LINE',
        start: { x: entity.vertices?.[0]?.x || 0, y: entity.vertices?.[0]?.y || 0 },
        end: { x: entity.vertices?.[1]?.x || 0, y: entity.vertices?.[1]?.y || 0 },
        layer
      };
    
    case 'ARC':
      return {
        type: 'ARC',
        center: { x: entity.center?.x || 0, y: entity.center?.y || 0 },
        radius: entity.radius || 0,
        startAngle: entity.startAngle || 0,
        endAngle: entity.endAngle || 0,
        layer
      };
    
    case 'CIRCLE':
      return {
        type: 'CIRCLE',
        center: { x: entity.center?.x || 0, y: entity.center?.y || 0 },
        radius: entity.radius || 0,
        layer
      };
    
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return {
        type: entity.type,
        vertices: (entity.vertices || []).map((v: any) => ({ x: v.x || 0, y: v.y || 0 })),
        closed: entity.shape || false,
        layer
      };
    
    case 'TEXT':
    case 'MTEXT':
      return {
        type: entity.type,
        position: { x: entity.startPoint?.x || 0, y: entity.startPoint?.y || 0 },
        text: entity.text || '',
        height: entity.textHeight || 2.5,
        rotation: entity.rotation || 0,
        layer
      };
    
    case 'INSERT':
      return {
        type: 'INSERT',
        name: entity.name || '',
        position: { x: entity.position?.x || 0, y: entity.position?.y || 0 },
        scale: { 
          x: entity.xScale || 1, 
          y: entity.yScale || 1, 
          z: entity.zScale || 1 
        },
        rotation: entity.rotation || 0,
        layer
      };
    
    default:
      return {
        type: 'LINE',
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        layer
      };
  }
}

/**
 * Extract cabinet data from a single block definition
 */
function extractCabinetFromBlock(
  block: { name: string; entities: DXFEntity[]; basePoint: DXFPoint },
  layers: { name: string; color: number; visible: boolean }[],
  isMetric: boolean
): ExtractedCabinetData | null {
  // Skip model space and paper space blocks
  if (block.name.startsWith('*') || block.name.toLowerCase().includes('model') || block.name.toLowerCase().includes('paper')) {
    return null;
  }

  // Skip blocks with no meaningful entities
  if (block.entities.length < 3) {
    return null;
  }

  const extents = calculateExtents(block.entities);
  const category = detectCategory(block.name, layers);
  const cabinetType = detectCabinetType(block.name, layers);
  
  const entityCounts: Record<string, number> = {};
  block.entities.forEach(e => {
    entityCounts[e.type] = (entityCounts[e.type] || 0) + 1;
  });

  const features = analyzeBlockGeometry(block.entities, block.name);
  const name = cleanFilename(block.name);
  
  const scaleFactor = isMetric ? 1 : 25.4;
  const width = Math.abs(extents.max.x - extents.min.x) * scaleFactor;
  const height = Math.abs(extents.max.y - extents.min.y) * scaleFactor;
  const depth = extents.max.z ? Math.abs(extents.max.z - extents.min.z) * scaleFactor : 580;

  // Skip if dimensions are too small (likely not a cabinet)
  if (width < 100 || height < 100) {
    return null;
  }

  return {
    filename: block.name,
    name,
    category,
    cabinetType,
    width: Math.round(width),
    height: Math.round(height),
    depth: Math.round(depth || 580),
    doorCount: features.doorCount,
    drawerCount: features.drawerCount,
    isCorner: features.isCorner,
    isBlind: features.isBlind,
    isSink: features.isSink,
    hasFalseFront: features.hasFalseFront,
    hasAdjustableShelves: features.hasAdjustableShelves,
    frontView: features.frontView,
    sideView: features.sideView,
    topView: features.topView,
    layers: layers.map(l => l.name),
    entityCounts
  };
}

/**
 * Extract ALL cabinets from a DXF file (from blocks)
 */
export function extractAllCabinetsFromDXF(
  parsed: ParsedDXF,
  filename: string
): ExtractedCabinetData[] {
  const cabinets: ExtractedCabinetData[] = [];
  const isMetric = parsed.header.measurement === 1;

  // Method 1: Extract from block definitions (most common for cabinet libraries)
  for (const block of parsed.blocks) {
    const cabinet = extractCabinetFromBlock(block, parsed.layers, isMetric);
    if (cabinet) {
      cabinet.filename = `${filename}::${block.name}`;
      cabinets.push(cabinet);
    }
  }

  // Method 2: If no blocks found, try to extract from INSERT references
  if (cabinets.length === 0) {
    const insertEntities = parsed.entities.filter(e => e.type === 'INSERT') as Array<{ type: 'INSERT'; name: string; position: DXFPoint; scale: { x: number; y: number; z: number }; rotation: number; layer: string }>;
    
    // Group by block name to find unique cabinet types
    const blockRefs = new Map<string, typeof insertEntities[0]>();
    for (const insert of insertEntities) {
      if (!blockRefs.has(insert.name) && !insert.name.startsWith('*')) {
        blockRefs.set(insert.name, insert);
      }
    }

    // Find matching blocks for each insert
    for (const [blockName] of blockRefs) {
      const matchingBlock = parsed.blocks.find(b => b.name === blockName);
      if (matchingBlock) {
        const cabinet = extractCabinetFromBlock(matchingBlock, parsed.layers, isMetric);
        if (cabinet) {
          cabinet.filename = `${filename}::${blockName}`;
          cabinets.push(cabinet);
        }
      }
    }
  }

  // Method 3: If still no cabinets, try layer-based extraction
  if (cabinets.length === 0) {
    const cabinetLayers = parsed.layers.filter(l => 
      /cabinet|base|wall|tall|sink|corner|drawer/i.test(l.name)
    );

    if (cabinetLayers.length > 0) {
      for (const layer of cabinetLayers) {
        const layerEntities = parsed.entities.filter(e => e.layer === layer.name);
        if (layerEntities.length >= 3) {
          const extents = calculateExtents(layerEntities);
          const features = analyzeBlockGeometry(layerEntities, layer.name);
          const scaleFactor = isMetric ? 1 : 25.4;
          
          const width = Math.abs(extents.max.x - extents.min.x) * scaleFactor;
          const height = Math.abs(extents.max.y - extents.min.y) * scaleFactor;
          
          if (width >= 100 && height >= 100) {
            cabinets.push({
              filename: `${filename}::${layer.name}`,
              name: cleanFilename(layer.name),
              category: detectCategory(layer.name, []),
              cabinetType: detectCabinetType(layer.name, []),
              width: Math.round(width),
              height: Math.round(height),
              depth: 580,
              doorCount: features.doorCount,
              drawerCount: features.drawerCount,
              isCorner: features.isCorner,
              isBlind: features.isBlind,
              isSink: features.isSink,
              hasFalseFront: features.hasFalseFront,
              hasAdjustableShelves: features.hasAdjustableShelves,
              layers: [layer.name],
              entityCounts: {}
            });
          }
        }
      }
    }
  }

  // Method 4: Fallback - treat entire file as one cabinet
  if (cabinets.length === 0 && parsed.entities.length > 0) {
    const extents = parsed.header.extents || calculateExtents(parsed.entities);
    const features = analyzeBlockGeometry(parsed.entities, filename);
    const scaleFactor = isMetric ? 1 : 25.4;
    
    const width = Math.abs(extents.max.x - extents.min.x) * scaleFactor;
    const height = Math.abs(extents.max.y - extents.min.y) * scaleFactor;
    const depth = extents.max.z ? Math.abs(extents.max.z - extents.min.z) * scaleFactor : 580;

    if (width >= 100 && height >= 100) {
      cabinets.push({
        filename,
        name: cleanFilename(filename),
        category: detectCategory(filename, parsed.layers),
        cabinetType: detectCabinetType(filename, parsed.layers),
        width: Math.round(width),
        height: Math.round(height),
        depth: Math.round(depth || 580),
        doorCount: features.doorCount,
        drawerCount: features.drawerCount,
        isCorner: features.isCorner,
        isBlind: features.isBlind,
        isSink: features.isSink,
        hasFalseFront: features.hasFalseFront,
        hasAdjustableShelves: features.hasAdjustableShelves,
        layers: parsed.layers.map(l => l.name),
        entityCounts: {}
      });
    }
  }

  return cabinets;
}

/**
 * Legacy: Extract single cabinet data from parsed DXF (for backward compatibility)
 */
export function extractCabinetData(
  parsed: ParsedDXF, 
  filename: string
): ExtractedCabinetData {
  const allCabinets = extractAllCabinetsFromDXF(parsed, filename);
  if (allCabinets.length > 0) {
    return allCabinets[0];
  }
  
  // Fallback to basic extraction
  const extents = parsed.header.extents || calculateExtents(parsed.entities);
  const category = detectCategory(filename, parsed.layers);
  const cabinetType = detectCabinetType(filename, parsed.layers);
  
  const entityCounts: Record<string, number> = {};
  parsed.entities.forEach(e => {
    entityCounts[e.type] = (entityCounts[e.type] || 0) + 1;
  });

  const features = analyzeBlockGeometry(parsed.entities, filename);
  const name = cleanFilename(filename);
  const isMetric = parsed.header.measurement === 1;
  const scaleFactor = isMetric ? 1 : 25.4;
  
  const width = Math.abs(extents.max.x - extents.min.x) * scaleFactor;
  const height = Math.abs(extents.max.y - extents.min.y) * scaleFactor;
  const depth = extents.max.z ? Math.abs(extents.max.z - extents.min.z) * scaleFactor : 580;

  return {
    filename,
    name,
    category,
    cabinetType,
    width: Math.round(width),
    height: Math.round(height),
    depth: Math.round(depth || 580),
    doorCount: features.doorCount,
    drawerCount: features.drawerCount,
    isCorner: features.isCorner,
    isBlind: features.isBlind,
    isSink: features.isSink,
    hasFalseFront: features.hasFalseFront,
    hasAdjustableShelves: features.hasAdjustableShelves,
    frontView: features.frontView,
    sideView: features.sideView,
    topView: features.topView,
    layers: parsed.layers.map(l => l.name),
    entityCounts
  };
}

/**
 * Calculate bounding box from entities
 */
function calculateExtents(entities: DXFEntity[]): { min: DXFPoint; max: DXFPoint } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  entities.forEach(entity => {
    const points = getEntityPoints(entity);
    points.forEach(p => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
      if (p.z !== undefined) {
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    });
  });

  return {
    min: { x: minX === Infinity ? 0 : minX, y: minY === Infinity ? 0 : minY, z: minZ === Infinity ? 0 : minZ },
    max: { x: maxX === -Infinity ? 600 : maxX, y: maxY === -Infinity ? 870 : maxY, z: maxZ === -Infinity ? 580 : maxZ }
  };
}

/**
 * Get all points from an entity
 */
function getEntityPoints(entity: DXFEntity): DXFPoint[] {
  switch (entity.type) {
    case 'LINE':
      return [entity.start, entity.end];
    case 'ARC':
    case 'CIRCLE':
      return [entity.center];
    case 'POLYLINE':
    case 'LWPOLYLINE':
      return entity.vertices;
    case 'TEXT':
    case 'MTEXT':
      return [entity.position];
    case 'INSERT':
      return [entity.position];
    default:
      return [];
  }
}

/**
 * Detect cabinet category from filename/layers
 */
function detectCategory(filename: string, layers: { name: string }[]): 'Base' | 'Wall' | 'Tall' | 'Accessory' {
  const lower = filename.toLowerCase();
  const layerNames = layers.map(l => l.name.toLowerCase()).join(' ');
  const combined = `${lower} ${layerNames}`;
  
  if (/wall|overhead|upper/i.test(combined)) return 'Wall';
  if (/tall|pantry|full[- ]?height|tower/i.test(combined)) return 'Tall';
  if (/base|floor|sink|drawer|corner/i.test(combined)) return 'Base';
  
  return 'Base'; // Default
}

/**
 * Detect specific cabinet type
 */
function detectCabinetType(filename: string, layers: { name: string }[]): string {
  const lower = filename.toLowerCase();
  
  if (/sink/i.test(lower)) return 'Sink';
  if (/corner/i.test(lower)) return 'Corner';
  if (/blind/i.test(lower)) return 'Blind';
  if (/drawer/i.test(lower)) return 'Drawer';
  if (/pantry/i.test(lower)) return 'Pantry';
  if (/oven|appliance/i.test(lower)) return 'Appliance';
  if (/fridge|refrigerator/i.test(lower)) return 'Fridge';
  if (/rangehood|hood/i.test(lower)) return 'Rangehood';
  
  return 'Standard';
}

/**
 * Analyze geometry from entities and name to detect cabinet features
 */
function analyzeBlockGeometry(entities: DXFEntity[], nameHint: string): {
  doorCount: number;
  drawerCount: number;
  isCorner: boolean;
  isBlind: boolean;
  isSink: boolean;
  hasFalseFront: boolean;
  hasAdjustableShelves: boolean;
  frontView?: ExtractedCabinetData['frontView'];
  sideView?: ExtractedCabinetData['sideView'];
  topView?: ExtractedCabinetData['topView'];
} {
  const lowerName = nameHint.toLowerCase();
  
  // Count rectangles that could be doors/drawers
  const rectangles = findRectangles(entities);
  
  // Detect from name hints
  let doorCount = 1;
  if (/2[- ]?door|double/i.test(lowerName)) doorCount = 2;
  else if (/3[- ]?door/i.test(lowerName)) doorCount = 3;
  else if (/4[- ]?door/i.test(lowerName)) doorCount = 4;
  else if (/door/i.test(lowerName)) doorCount = 1;
  else if (rectangles.length > 0) {
    doorCount = rectangles.filter(r => r.height > r.width * 0.5).length || 1;
  }
  
  let drawerCount = 0;
  const drawerMatch = lowerName.match(/(\d)[- ]?drawer/i);
  if (drawerMatch) {
    drawerCount = parseInt(drawerMatch[1]);
  } else if (/drawer/i.test(lowerName)) {
    drawerCount = countDrawersFromGeometry(entities, lowerName);
  }
  
  const isCorner = /corner/i.test(lowerName) || hasLShapeGeometry(entities);
  const isBlind = /blind/i.test(lowerName);
  const isSink = /sink/i.test(lowerName) || hasCircularCutout(entities);
  const hasFalseFront = (/false[- ]?front|tilt[- ]?out/i.test(lowerName)) || (isSink && /false|tilt/i.test(lowerName));
  const hasAdjustableShelves = /shelf|adjustable/i.test(lowerName) || !(/drawer/i.test(lowerName));

  return {
    doorCount: Math.max(0, Math.min(4, doorCount)),
    drawerCount: Math.max(0, Math.min(8, drawerCount)),
    isCorner,
    isBlind,
    isSink,
    hasFalseFront,
    hasAdjustableShelves
  };
}

/**
 * Analyze geometry to detect cabinet features (legacy wrapper)
 */
function analyzeGeometry(parsed: ParsedDXF): {
  doorCount: number;
  drawerCount: number;
  isCorner: boolean;
  isBlind: boolean;
  isSink: boolean;
  hasFalseFront: boolean;
  hasAdjustableShelves: boolean;
  frontView?: ExtractedCabinetData['frontView'];
  sideView?: ExtractedCabinetData['sideView'];
  topView?: ExtractedCabinetData['topView'];
} {
  const layerNames = parsed.layers.map(l => l.name.toLowerCase()).join(' ');
  return analyzeBlockGeometry(parsed.entities, layerNames);
}

/**
 * Find rectangular shapes in entities
 */
function findRectangles(entities: DXFEntity[]): Array<{ x: number; y: number; width: number; height: number }> {
  const rectangles: Array<{ x: number; y: number; width: number; height: number }> = [];
  
  // Look for closed polylines that form rectangles
  entities.forEach(entity => {
    if ((entity.type === 'POLYLINE' || entity.type === 'LWPOLYLINE') && entity.closed && entity.vertices.length === 4) {
      const vs = entity.vertices;
      const minX = Math.min(...vs.map(v => v.x));
      const maxX = Math.max(...vs.map(v => v.x));
      const minY = Math.min(...vs.map(v => v.y));
      const maxY = Math.max(...vs.map(v => v.y));
      
      rectangles.push({
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY
      });
    }
  });
  
  return rectangles;
}

/**
 * Count drawers from geometry patterns
 */
function countDrawersFromGeometry(entities: DXFEntity[], layerNames: string): number {
  if (/(\d)[- ]?drawer/i.test(layerNames)) {
    const match = layerNames.match(/(\d)[- ]?drawer/i);
    return match ? parseInt(match[1]) : 0;
  }
  
  // Look for horizontal lines that indicate drawer dividers
  const horizontalLines = entities.filter(e => 
    e.type === 'LINE' && 
    Math.abs(e.start.y - e.end.y) < 1 &&
    Math.abs(e.start.x - e.end.x) > 100
  );
  
  return Math.max(0, horizontalLines.length - 1);
}

/**
 * Check for L-shaped geometry (corner cabinet)
 */
function hasLShapeGeometry(entities: DXFEntity[]): boolean {
  // Look for polylines with 6+ vertices (L-shape outline)
  return entities.some(e => 
    (e.type === 'POLYLINE' || e.type === 'LWPOLYLINE') && 
    e.vertices.length >= 6
  );
}

/**
 * Check for circular cutouts (sink)
 */
function hasCircularCutout(entities: DXFEntity[]): boolean {
  return entities.some(e => e.type === 'CIRCLE' && e.radius > 100);
}

/**
 * Clean filename to readable name
 */
function cleanFilename(filename: string): string {
  return filename
    .replace(/\.dxf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Process a ZIP file containing DXF cabinet drawings
 * Now extracts ALL cabinets from each DXF file (blocks, layers, etc.)
 */
export async function processZipFile(zipData: ArrayBuffer): Promise<DXFProcessingResult> {
  const result: DXFProcessingResult = {
    success: false,
    cabinets: [],
    errors: [],
    totalFiles: 0,
    processedFiles: 0
  };

  try {
    const zip = await JSZip.loadAsync(zipData);
    const dxfFiles = Object.keys(zip.files).filter(name => 
      name.toLowerCase().endsWith('.dxf') && !zip.files[name].dir
    );
    
    result.totalFiles = dxfFiles.length;

    for (const filename of dxfFiles) {
      try {
        const content = await zip.files[filename].async('string');
        const parsed = parseDXFContent(content);
        
        if (parsed) {
          // Extract ALL cabinets from this DXF file
          const cabinets = extractAllCabinetsFromDXF(parsed, filename);
          result.cabinets.push(...cabinets);
          result.processedFiles++;
          
          if (cabinets.length === 0) {
            result.errors.push(`No cabinets found in: ${filename}`);
          }
        } else {
          result.errors.push(`Failed to parse: ${filename}`);
        }
      } catch (error) {
        result.errors.push(`Error processing ${filename}: ${error}`);
      }
    }

    result.success = result.processedFiles > 0;
  } catch (error) {
    result.errors.push(`ZIP processing error: ${error}`);
  }

  return result;
}

/**
 * Process multiple ZIP files
 */
export async function processMultipleZips(
  zipFiles: Array<{ name: string; data: ArrayBuffer }>
): Promise<DXFProcessingResult> {
  const combined: DXFProcessingResult = {
    success: false,
    cabinets: [],
    errors: [],
    totalFiles: 0,
    processedFiles: 0
  };

  for (const { name, data } of zipFiles) {
    const result = await processZipFile(data);
    combined.cabinets.push(...result.cabinets);
    combined.errors.push(...result.errors.map(e => `[${name}] ${e}`));
    combined.totalFiles += result.totalFiles;
    combined.processedFiles += result.processedFiles;
  }

  combined.success = combined.processedFiles > 0;
  return combined;
}
