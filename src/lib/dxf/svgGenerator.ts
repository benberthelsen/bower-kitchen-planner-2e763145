// DXF to SVG Thumbnail Generator
import type { DXFEntity, DXFPoint, ParsedDXF, ExtractedCabinetData } from './types';

export interface SVGGeneratorOptions {
  width?: number;
  height?: number;
  padding?: number;
  strokeWidth?: number;
  backgroundColor?: string;
  strokeColor?: string;
  fillColor?: string;
}

const DEFAULT_OPTIONS: Required<SVGGeneratorOptions> = {
  width: 120,
  height: 120,
  padding: 8,
  strokeWidth: 1.5,
  backgroundColor: 'transparent',
  strokeColor: '#374151',
  fillColor: '#f3f4f6',
};

/**
 * Convert DXF entities to an SVG string suitable for thumbnails
 */
export function generateSVGFromEntities(
  entities: DXFEntity[],
  options: SVGGeneratorOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  if (entities.length === 0) {
    return generatePlaceholderSVG(opts);
  }

  // Calculate bounding box
  const bounds = calculateBounds(entities);
  if (!bounds) {
    return generatePlaceholderSVG(opts);
  }

  const { minX, minY, maxX, maxY } = bounds;
  const dxfWidth = maxX - minX;
  const dxfHeight = maxY - minY;

  if (dxfWidth === 0 || dxfHeight === 0) {
    return generatePlaceholderSVG(opts);
  }

  // Calculate scale to fit within SVG dimensions with padding
  const availableWidth = opts.width - opts.padding * 2;
  const availableHeight = opts.height - opts.padding * 2;
  const scale = Math.min(availableWidth / dxfWidth, availableHeight / dxfHeight);

  // Calculate offset to center the drawing
  const scaledWidth = dxfWidth * scale;
  const scaledHeight = dxfHeight * scale;
  const offsetX = opts.padding + (availableWidth - scaledWidth) / 2;
  const offsetY = opts.padding + (availableHeight - scaledHeight) / 2;

  // Transform function to convert DXF coordinates to SVG coordinates
  const transform = (x: number, y: number): { x: number; y: number } => ({
    x: (x - minX) * scale + offsetX,
    y: opts.height - ((y - minY) * scale + offsetY), // Flip Y axis
  });

  // Generate SVG paths for each entity
  const paths = entities.map(entity => entityToSVGPath(entity, transform, opts)).filter(Boolean);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  <g stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}" fill="${opts.fillColor}">
    ${paths.join('\n    ')}
  </g>
</svg>`;
}

/**
 * Generate SVG from extracted cabinet data
 */
export function generateSVGFromCabinetData(
  cabinet: ExtractedCabinetData,
  options: SVGGeneratorOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // If we have front view data, use it
  if (cabinet.frontView) {
    return generateSVGFromFrontView(cabinet, opts);
  }
  
  // Otherwise generate a simple representation based on dimensions
  return generateProceduralSVG(cabinet, opts);
}

/**
 * Generate SVG from front view geometry data
 */
function generateSVGFromFrontView(
  cabinet: ExtractedCabinetData,
  opts: Required<SVGGeneratorOptions>
): string {
  const { frontView, width, height } = cabinet;
  if (!frontView) return generateProceduralSVG(cabinet, opts);

  const availableWidth = opts.width - opts.padding * 2;
  const availableHeight = opts.height - opts.padding * 2;
  const scale = Math.min(availableWidth / width, availableHeight / height);
  
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const offsetX = opts.padding + (availableWidth - scaledWidth) / 2;
  const offsetY = opts.padding + (availableHeight - scaledHeight) / 2;

  const elements: string[] = [];

  // Draw cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${scaledWidth}" height="${scaledHeight}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);

  // Draw doors
  for (const door of frontView.doors) {
    const dx = offsetX + door.x * scale;
    const dy = offsetY + (height - door.y - door.height) * scale;
    const dw = door.width * scale;
    const dh = door.height * scale;
    elements.push(`<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
  }

  // Draw drawers
  for (const drawer of frontView.drawers) {
    const dx = offsetX + drawer.x * scale;
    const dy = offsetY + (height - drawer.y - drawer.height) * scale;
    const dw = drawer.width * scale;
    const dh = drawer.height * scale;
    elements.push(`<rect x="${dx}" y="${dy}" width="${dw}" height="${dh}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
    // Draw drawer handle line
    const handleY = dy + dh * 0.2;
    const handleX1 = dx + dw * 0.3;
    const handleX2 = dx + dw * 0.7;
    elements.push(`<line x1="${handleX1}" y1="${handleY}" x2="${handleX2}" y2="${handleY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}"/>`);
  }

  // Draw handles
  for (const handle of frontView.handles) {
    const hx = offsetX + handle.x * scale;
    const hy = offsetY + (height - handle.y) * scale;
    if (handle.type === 'knob') {
      elements.push(`<circle cx="${hx}" cy="${hy}" r="${3}" fill="${opts.strokeColor}"/>`);
    } else {
      elements.push(`<line x1="${hx - 8}" y1="${hy}" x2="${hx + 8}" y2="${hy}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 2}" stroke-linecap="round"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Generate a procedural SVG based on cabinet properties
 */
function generateProceduralSVG(
  cabinet: ExtractedCabinetData,
  opts: Required<SVGGeneratorOptions>
): string {
  const availableWidth = opts.width - opts.padding * 2;
  const availableHeight = opts.height - opts.padding * 2;
  
  // Use cabinet dimensions to determine aspect ratio
  const cabinetAspect = cabinet.width / cabinet.height;
  let svgCabinetWidth: number;
  let svgCabinetHeight: number;
  
  if (cabinetAspect > availableWidth / availableHeight) {
    svgCabinetWidth = availableWidth;
    svgCabinetHeight = availableWidth / cabinetAspect;
  } else {
    svgCabinetHeight = availableHeight;
    svgCabinetWidth = availableHeight * cabinetAspect;
  }
  
  const offsetX = opts.padding + (availableWidth - svgCabinetWidth) / 2;
  const offsetY = opts.padding + (availableHeight - svgCabinetHeight) / 2;

  const elements: string[] = [];
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${svgCabinetWidth}" height="${svgCabinetHeight}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);

  const gap = 2;
  const innerWidth = svgCabinetWidth - gap * 2;
  const innerHeight = svgCabinetHeight - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;

  // Draw doors and drawers based on counts
  const doorCount = cabinet.doorCount || 0;
  const drawerCount = cabinet.drawerCount || 0;
  
  if (drawerCount > 0 && doorCount === 0) {
    // All drawers
    const drawerHeight = innerHeight / drawerCount;
    for (let i = 0; i < drawerCount; i++) {
      const dy = innerY + i * drawerHeight + gap / 2;
      const dh = drawerHeight - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
      // Handle
      const handleY = dy + dh * 0.3;
      elements.push(`<line x1="${innerX + innerWidth * 0.3}" y1="${handleY}" x2="${innerX + innerWidth * 0.7}" y2="${handleY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}"/>`);
    }
  } else if (doorCount > 0 && drawerCount === 0) {
    // All doors
    const doorWidth = innerWidth / doorCount;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${innerY}" width="${dw}" height="${innerHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
      // Handle
      const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
      elements.push(`<circle cx="${handleX}" cy="${innerY + innerHeight * 0.5}" r="${2}" fill="${opts.strokeColor}"/>`);
    }
  } else if (doorCount > 0 && drawerCount > 0) {
    // Drawers on top, doors below
    const drawerTotalHeight = innerHeight * 0.3;
    const doorHeight = innerHeight - drawerTotalHeight - gap;
    
    // Drawers
    const drawerHeight = drawerTotalHeight / drawerCount;
    for (let i = 0; i < drawerCount; i++) {
      const dy = innerY + i * drawerHeight + gap / 2;
      const dh = drawerHeight - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
    }
    
    // Doors
    const doorWidth = innerWidth / doorCount;
    const doorY = innerY + drawerTotalHeight + gap;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${doorY}" width="${dw}" height="${doorHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
    }
  }

  // Add sink indicator if applicable
  if (cabinet.isSink) {
    const sinkWidth = innerWidth * 0.6;
    const sinkHeight = innerHeight * 0.15;
    const sinkX = innerX + (innerWidth - sinkWidth) / 2;
    const sinkY = offsetY + svgCabinetHeight * 0.1;
    elements.push(`<ellipse cx="${sinkX + sinkWidth / 2}" cy="${sinkY + sinkHeight / 2}" rx="${sinkWidth / 2}" ry="${sinkHeight / 2}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}" stroke-dasharray="2,2"/>`);
  }

  // Add corner indicator if applicable
  if (cabinet.isCorner) {
    elements.push(`<path d="M${offsetX} ${offsetY + svgCabinetHeight} L${offsetX + svgCabinetWidth * 0.3} ${offsetY + svgCabinetHeight * 0.7} L${offsetX + svgCabinetWidth} ${offsetY}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}" stroke-dasharray="3,3"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Generate a placeholder SVG when no geometry is available
 */
function generatePlaceholderSVG(opts: Required<SVGGeneratorOptions>): string {
  const cx = opts.width / 2;
  const cy = opts.height / 2;
  const size = Math.min(opts.width, opts.height) * 0.4;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  <rect x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}" rx="4"/>
  <text x="${cx}" y="${cy + 4}" font-size="10" fill="${opts.strokeColor}" text-anchor="middle">?</text>
</svg>`;
}

/**
 * Convert a single DXF entity to SVG path string
 */
function entityToSVGPath(
  entity: DXFEntity,
  transform: (x: number, y: number) => { x: number; y: number },
  opts: Required<SVGGeneratorOptions>
): string | null {
  switch (entity.type) {
    case 'LINE': {
      const start = transform(entity.start.x, entity.start.y);
      const end = transform(entity.end.x, entity.end.y);
      return `<line x1="${start.x.toFixed(2)}" y1="${start.y.toFixed(2)}" x2="${end.x.toFixed(2)}" y2="${end.y.toFixed(2)}" fill="none"/>`;
    }
    
    case 'CIRCLE': {
      const center = transform(entity.center.x, entity.center.y);
      // Scale radius appropriately
      const r = entity.radius * (opts.width / 100); // Approximate scaling
      return `<circle cx="${center.x.toFixed(2)}" cy="${center.y.toFixed(2)}" r="${r.toFixed(2)}" fill="none"/>`;
    }
    
    case 'ARC': {
      const center = transform(entity.center.x, entity.center.y);
      const r = entity.radius * (opts.width / 100);
      const startAngle = entity.startAngle * Math.PI / 180;
      const endAngle = entity.endAngle * Math.PI / 180;
      
      const startX = center.x + r * Math.cos(startAngle);
      const startY = center.y - r * Math.sin(startAngle);
      const endX = center.x + r * Math.cos(endAngle);
      const endY = center.y - r * Math.sin(endAngle);
      
      const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
      const sweep = endAngle > startAngle ? 0 : 1;
      
      return `<path d="M ${startX.toFixed(2)} ${startY.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${largeArc} ${sweep} ${endX.toFixed(2)} ${endY.toFixed(2)}" fill="none"/>`;
    }
    
    case 'POLYLINE':
    case 'LWPOLYLINE': {
      if (entity.vertices.length < 2) return null;
      
      const points = entity.vertices.map(v => transform(v.x, v.y));
      const pathData = points.map((p, i) => 
        `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
      ).join(' ');
      
      return `<path d="${pathData}${entity.closed ? ' Z' : ''}" fill="${entity.closed ? opts.fillColor : 'none'}"/>`;
    }
    
    default:
      return null;
  }
}

/**
 * Calculate bounding box of DXF entities
 */
function calculateBounds(entities: DXFEntity[]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let hasPoints = false;

  const updateBounds = (x: number, y: number) => {
    hasPoints = true;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  for (const entity of entities) {
    switch (entity.type) {
      case 'LINE':
        updateBounds(entity.start.x, entity.start.y);
        updateBounds(entity.end.x, entity.end.y);
        break;
      case 'CIRCLE':
        updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
        updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
        break;
      case 'ARC':
        updateBounds(entity.center.x - entity.radius, entity.center.y - entity.radius);
        updateBounds(entity.center.x + entity.radius, entity.center.y + entity.radius);
        break;
      case 'POLYLINE':
      case 'LWPOLYLINE':
        for (const v of entity.vertices) {
          updateBounds(v.x, v.y);
        }
        break;
    }
  }

  return hasPoints ? { minX, minY, maxX, maxY } : null;
}

/**
 * Convert extracted cabinet geometry to a storable JSON format
 */
export function cabinetToGeometryJSON(cabinet: ExtractedCabinetData): object {
  return {
    width: cabinet.width,
    height: cabinet.height,
    depth: cabinet.depth,
    doorCount: cabinet.doorCount,
    drawerCount: cabinet.drawerCount,
    isCorner: cabinet.isCorner,
    isSink: cabinet.isSink,
    isBlind: cabinet.isBlind,
    hasFalseFront: cabinet.hasFalseFront,
    frontView: cabinet.frontView || null,
    sideView: cabinet.sideView || null,
    topView: cabinet.topView || null,
  };
}
