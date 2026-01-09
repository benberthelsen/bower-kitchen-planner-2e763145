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
 * Parse product name to extract cabinet features
 */
export interface CabinetFeatures {
  doorCount: number;
  drawerCount: number;
  isCorner: boolean;
  isSink: boolean;
  isBlind: boolean;
  isOpen: boolean;
  isLiftUp: boolean;
  isDiagonal: boolean;
  isPantry: boolean;
  hasFalseFront: boolean;
  cornerType: 'l-shape' | 'blind' | 'diagonal' | null;
}

function extractNumber(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? parseInt(match[1], 10) : 0;
}

export function parseProductName(name: string): CabinetFeatures {
  const n = name.toLowerCase();
  
  // Extract door count
  let doorCount = extractNumber(n, /(\d+)\s*door/);
  if (doorCount === 0 && (n.includes('bi fold') || n.includes('bifold'))) doorCount = 2;
  if (doorCount === 0 && n.includes('door') && !n.includes('drawer')) doorCount = 1;
  
  // Extract drawer count
  let drawerCount = extractNumber(n, /(\d+)\s*drawer/);
  if (drawerCount === 0 && n.includes('drawer') && !n.includes('door')) {
    // Try to detect from bay count
    drawerCount = extractNumber(n, /(\d+)\s*bay/) || 1;
  }
  
  // Detect features
  const isCorner = n.includes('corner') || n.includes('l-shape') || n.includes('l shape');
  const isSink = n.includes('sink');
  const isBlind = n.includes('blind');
  const isOpen = n.includes('open') && !n.includes('open end');
  const isLiftUp = n.includes('lift up') || n.includes('lift-up') || n.includes('bi fold') || n.includes('bifold');
  const isDiagonal = n.includes('diagonal') || n.includes('angle');
  const isPantry = n.includes('pantry') || n.includes('larder');
  const hasFalseFront = n.includes('false front') || n.includes('false drawer') || isSink;
  
  // Determine corner type
  let cornerType: 'l-shape' | 'blind' | 'diagonal' | null = null;
  if (isBlind) cornerType = 'blind';
  else if (isDiagonal) cornerType = 'diagonal';
  else if (isCorner) cornerType = 'l-shape';
  
  // Open cabinets have no doors
  if (isOpen) doorCount = 0;
  
  return {
    doorCount,
    drawerCount,
    isCorner,
    isSink,
    isBlind,
    isOpen,
    isLiftUp,
    isDiagonal,
    isPantry,
    hasFalseFront,
    cornerType,
  };
}

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
  // Parse features from name if available
  const features = cabinet.name ? parseProductName(cabinet.name) : {
    doorCount: cabinet.doorCount || 0,
    drawerCount: cabinet.drawerCount || 0,
    isCorner: cabinet.isCorner || false,
    isSink: cabinet.isSink || false,
    isBlind: cabinet.isBlind || false,
    isOpen: false,
    isLiftUp: false,
    isDiagonal: false,
    isPantry: false,
    hasFalseFront: cabinet.hasFalseFront || false,
    cornerType: null,
  };
  
  // Override with cabinet data if available
  const doorCount = cabinet.doorCount ?? features.doorCount;
  const drawerCount = cabinet.drawerCount ?? features.drawerCount;
  const isCorner = cabinet.isCorner ?? features.isCorner;
  const isSink = cabinet.isSink ?? features.isSink;
  const isOpen = features.isOpen;
  const isLiftUp = features.isLiftUp;
  const isDiagonal = features.isDiagonal;
  const isPantry = features.isPantry;
  const hasFalseFront = cabinet.hasFalseFront ?? features.hasFalseFront;

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
  
  // For corner cabinets, draw L-shape outline
  if (isCorner && !isDiagonal) {
    return generateCornerSVG(svgCabinetWidth, svgCabinetHeight, offsetX, offsetY, opts, doorCount, features.cornerType);
  }
  
  // For diagonal cabinets, draw angled front
  if (isDiagonal) {
    return generateDiagonalSVG(svgCabinetWidth, svgCabinetHeight, offsetX, offsetY, opts, doorCount);
  }
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${svgCabinetWidth}" height="${svgCabinetHeight}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);

  const gap = 2;
  const innerWidth = svgCabinetWidth - gap * 2;
  const innerHeight = svgCabinetHeight - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;

  // For open cabinets - show shelves
  if (isOpen) {
    return generateOpenCabinetSVG(svgCabinetWidth, svgCabinetHeight, offsetX, offsetY, opts);
  }
  
  // For lift-up door cabinets
  if (isLiftUp) {
    return generateLiftUpSVG(svgCabinetWidth, svgCabinetHeight, offsetX, offsetY, opts, doorCount);
  }
  
  // For sink cabinets with false front
  if (isSink && hasFalseFront) {
    return generateSinkSVG(svgCabinetWidth, svgCabinetHeight, offsetX, offsetY, opts, doorCount);
  }
  
  // For pantry cabinets - tall with internal drawers
  if (isPantry) {
    return generatePantrySVG(svgCabinetWidth, svgCabinetHeight, offsetX, offsetY, opts);
  }

  // Draw doors and drawers based on counts
  if (drawerCount > 0 && doorCount === 0) {
    // All drawers - variable heights (larger at bottom)
    const drawerHeights = getDrawerHeightRatios(drawerCount, innerHeight);
    let currentY = innerY;
    
    for (let i = 0; i < drawerCount; i++) {
      const dy = currentY + gap / 2;
      const dh = drawerHeights[i] - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
      // Handle - horizontal line near top
      const handleY = dy + Math.min(dh * 0.25, 12);
      elements.push(`<line x1="${innerX + innerWidth * 0.3}" y1="${handleY}" x2="${innerX + innerWidth * 0.7}" y2="${handleY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}"/>`);
      currentY += drawerHeights[i];
    }
  } else if (doorCount > 0 && drawerCount === 0) {
    // All doors
    const doorWidth = innerWidth / doorCount;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${innerY}" width="${dw}" height="${innerHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
      // Handle - knob on hinge-opposite side
      const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
      elements.push(`<circle cx="${handleX}" cy="${innerY + innerHeight * 0.5}" r="${2}" fill="${opts.strokeColor}"/>`);
    }
  } else if (doorCount > 0 && drawerCount > 0) {
    // Drawers on top, doors below
    const drawerSectionHeight = Math.min(innerHeight * 0.35, drawerCount * (innerHeight / 5));
    const doorHeight = innerHeight - drawerSectionHeight - gap;
    
    // Draw drawers (top)
    const drawerHeights = getDrawerHeightRatios(drawerCount, drawerSectionHeight);
    let currentY = innerY;
    for (let i = 0; i < drawerCount; i++) {
      const dy = currentY + gap / 2;
      const dh = drawerHeights[i] - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
      // Handle
      const handleY = dy + Math.min(dh * 0.25, 8);
      elements.push(`<line x1="${innerX + innerWidth * 0.35}" y1="${handleY}" x2="${innerX + innerWidth * 0.65}" y2="${handleY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}"/>`);
      currentY += drawerHeights[i];
    }
    
    // Draw doors (bottom)
    const doorWidth = innerWidth / doorCount;
    const doorY = innerY + drawerSectionHeight + gap;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${doorY}" width="${dw}" height="${doorHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
      // Handle
      const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
      elements.push(`<circle cx="${handleX}" cy="${doorY + doorHeight * 0.2}" r="${1.5}" fill="${opts.strokeColor}"/>`);
    }
  }

  // Add sink indicator if applicable
  if (isSink && !hasFalseFront) {
    const sinkWidth = innerWidth * 0.6;
    const sinkHeight = innerHeight * 0.15;
    const sinkX = innerX + (innerWidth - sinkWidth) / 2;
    const sinkY = offsetY + svgCabinetHeight * 0.1;
    elements.push(`<ellipse cx="${sinkX + sinkWidth / 2}" cy="${sinkY + sinkHeight / 2}" rx="${sinkWidth / 2}" ry="${sinkHeight / 2}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}" stroke-dasharray="2,2"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Get variable drawer heights - larger at bottom (Microvellum standard)
 */
function getDrawerHeightRatios(count: number, totalHeight: number): number[] {
  const distributions: Record<number, number[]> = {
    1: [1.0],
    2: [0.40, 0.60],           // Top 40%, Bottom 60%
    3: [0.25, 0.33, 0.42],     // Small, Medium, Large
    4: [0.18, 0.24, 0.28, 0.30],
    5: [0.14, 0.18, 0.22, 0.22, 0.24],
    6: [0.12, 0.14, 0.18, 0.18, 0.18, 0.20],
  };
  
  const ratios = distributions[count] || Array(count).fill(1 / count);
  return ratios.map(ratio => ratio * totalHeight);
}

/**
 * Generate SVG for corner cabinet (L-shape outline)
 */
function generateCornerSVG(
  width: number, 
  height: number, 
  offsetX: number, 
  offsetY: number, 
  opts: Required<SVGGeneratorOptions>,
  doorCount: number,
  cornerType: 'l-shape' | 'blind' | 'diagonal' | null
): string {
  const elements: string[] = [];
  
  // L-shape cabinet outline
  const armWidth = width * 0.45;
  const cutoutSize = width * 0.4;
  
  // Draw L-shape path
  const path = `M ${offsetX} ${offsetY} 
    L ${offsetX + width} ${offsetY} 
    L ${offsetX + width} ${offsetY + height - cutoutSize} 
    L ${offsetX + armWidth} ${offsetY + height - cutoutSize} 
    L ${offsetX + armWidth} ${offsetY + height} 
    L ${offsetX} ${offsetY + height} Z`;
  elements.push(`<path d="${path}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);
  
  // Draw diagonal front indicator (angled line where doors would be)
  const diagonalPath = `M ${offsetX + armWidth - 2} ${offsetY + height - cutoutSize + 4} 
    L ${offsetX + width - 4} ${offsetY + height - cutoutSize - (cutoutSize * 0.3)}`;
  elements.push(`<path d="${diagonalPath}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}" stroke-dasharray="3,2"/>`);
  
  // Add corner type label
  if (cornerType) {
    elements.push(`<text x="${offsetX + width/2}" y="${offsetY + height - 8}" font-size="7" fill="${opts.strokeColor}" text-anchor="middle" font-family="sans-serif">${cornerType}</text>`);
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Generate SVG for diagonal/angle cabinet
 */
function generateDiagonalSVG(
  width: number, 
  height: number, 
  offsetX: number, 
  offsetY: number, 
  opts: Required<SVGGeneratorOptions>,
  doorCount: number
): string {
  const elements: string[] = [];
  
  // Diagonal cabinet - angled front
  const cutDepth = width * 0.25;
  
  // Cabinet shape with angled corner
  const path = `M ${offsetX} ${offsetY} 
    L ${offsetX + width - cutDepth} ${offsetY} 
    L ${offsetX + width} ${offsetY + cutDepth} 
    L ${offsetX + width} ${offsetY + height} 
    L ${offsetX} ${offsetY + height} Z`;
  elements.push(`<path d="${path}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);
  
  // Draw door on angled section
  const doorPath = `M ${offsetX + width - cutDepth + 3} ${offsetY + 3} 
    L ${offsetX + width - 3} ${offsetY + cutDepth + 3}
    L ${offsetX + width - 3} ${offsetY + height - 3}
    L ${offsetX + 3} ${offsetY + height - 3}
    L ${offsetX + 3} ${offsetY + 3}
    L ${offsetX + width - cutDepth - 3} ${offsetY + 3}`;
  elements.push(`<path d="${doorPath}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Generate SVG for open cabinet (shelves, no doors)
 */
function generateOpenCabinetSVG(
  width: number, 
  height: number, 
  offsetX: number, 
  offsetY: number, 
  opts: Required<SVGGeneratorOptions>
): string {
  const elements: string[] = [];
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);
  
  // Draw shelves (3 shelves for typical open cabinet)
  const shelfCount = 3;
  const shelfGap = height / (shelfCount + 1);
  
  for (let i = 1; i <= shelfCount; i++) {
    const shelfY = offsetY + shelfGap * i;
    elements.push(`<line x1="${offsetX + 3}" y1="${shelfY}" x2="${offsetX + width - 3}" y2="${shelfY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}"/>`);
  }
  
  // Side gables (slightly darker)
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${3}" height="${height}" fill="${opts.strokeColor}" opacity="0.1"/>`);
  elements.push(`<rect x="${offsetX + width - 3}" y="${offsetY}" width="${3}" height="${height}" fill="${opts.strokeColor}" opacity="0.1"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Generate SVG for lift-up door cabinet
 */
function generateLiftUpSVG(
  width: number, 
  height: number, 
  offsetX: number, 
  offsetY: number, 
  opts: Required<SVGGeneratorOptions>,
  doorCount: number
): string {
  const elements: string[] = [];
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);
  
  const gap = 2;
  const innerWidth = width - gap * 2;
  const innerHeight = height - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  
  if (doorCount === 2) {
    // Bi-fold - two panels
    const panelWidth = innerWidth / 2;
    elements.push(`<rect x="${innerX}" y="${innerY}" width="${panelWidth - gap/2}" height="${innerHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
    elements.push(`<rect x="${innerX + panelWidth + gap/2}" y="${innerY}" width="${panelWidth - gap/2}" height="${innerHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
    // Center fold line
    elements.push(`<line x1="${innerX + panelWidth}" y1="${innerY}" x2="${innerX + panelWidth}" y2="${innerY + innerHeight}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}" stroke-dasharray="2,2"/>`);
  } else {
    // Single lift-up door
    elements.push(`<rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
  }
  
  // Lift-up arrow indicator at top
  const arrowY = innerY + 6;
  const arrowX = innerX + innerWidth / 2;
  elements.push(`<path d="M ${arrowX - 6} ${arrowY + 4} L ${arrowX} ${arrowY} L ${arrowX + 6} ${arrowY + 4}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}" stroke-linecap="round" stroke-linejoin="round"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Generate SVG for sink cabinet (false front + doors)
 */
function generateSinkSVG(
  width: number, 
  height: number, 
  offsetX: number, 
  offsetY: number, 
  opts: Required<SVGGeneratorOptions>,
  doorCount: number
): string {
  const elements: string[] = [];
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);
  
  const gap = 2;
  const innerWidth = width - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  
  // False front at top (like a drawer but not openable)
  const falseFrontHeight = height * 0.12;
  elements.push(`<rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${falseFrontHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
  // Handle on false front
  const handleY = innerY + falseFrontHeight / 2;
  elements.push(`<line x1="${innerX + innerWidth * 0.35}" y1="${handleY}" x2="${innerX + innerWidth * 0.65}" y2="${handleY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}"/>`);
  
  // Doors below false front
  const doorY = innerY + falseFrontHeight + gap;
  const doorHeight = height - gap * 2 - falseFrontHeight - gap;
  const doorsToRender = doorCount || 2;
  const doorWidth = innerWidth / doorsToRender;
  
  for (let i = 0; i < doorsToRender; i++) {
    const dx = innerX + i * doorWidth + gap / 2;
    const dw = doorWidth - gap;
    elements.push(`<rect x="${dx}" y="${doorY}" width="${dw}" height="${doorHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
    // Handle
    const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
    elements.push(`<circle cx="${handleX}" cy="${doorY + doorHeight * 0.15}" r="${1.5}" fill="${opts.strokeColor}"/>`);
  }
  
  // Sink cutout indicator at top
  const sinkWidth = innerWidth * 0.5;
  const sinkX = innerX + (innerWidth - sinkWidth) / 2;
  elements.push(`<ellipse cx="${sinkX + sinkWidth / 2}" cy="${innerY - 4}" rx="${sinkWidth / 2}" ry="${4}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.5}" stroke-dasharray="2,2"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
  <rect width="100%" height="100%" fill="${opts.backgroundColor}"/>
  ${elements.join('\n  ')}
</svg>`;
}

/**
 * Generate SVG for pantry/larder cabinet
 */
function generatePantrySVG(
  width: number, 
  height: number, 
  offsetX: number, 
  offsetY: number, 
  opts: Required<SVGGeneratorOptions>
): string {
  const elements: string[] = [];
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${opts.fillColor}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth}"/>`);
  
  const gap = 2;
  const innerWidth = width - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  
  // Tall doors with internal pull-out baskets/drawers visible
  const doorWidth = innerWidth / 2;
  const doorHeight = height - gap * 2;
  
  // Left door outline
  elements.push(`<rect x="${innerX}" y="${innerY}" width="${doorWidth - gap/2}" height="${doorHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
  // Right door outline  
  elements.push(`<rect x="${innerX + doorWidth + gap/2}" y="${innerY}" width="${doorWidth - gap/2}" height="${doorHeight}" fill="none" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.75}"/>`);
  
  // Internal basket/shelf indicators (dashed lines inside doors)
  const basketCount = 5;
  const basketSpacing = doorHeight / (basketCount + 1);
  for (let i = 1; i <= basketCount; i++) {
    const basketY = innerY + basketSpacing * i;
    // Left door baskets
    elements.push(`<line x1="${innerX + 4}" y1="${basketY}" x2="${innerX + doorWidth - gap - 4}" y2="${basketY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.3}" stroke-dasharray="2,2"/>`);
    // Right door baskets
    elements.push(`<line x1="${innerX + doorWidth + gap + 4}" y1="${basketY}" x2="${innerX + innerWidth - 4}" y2="${basketY}" stroke="${opts.strokeColor}" stroke-width="${opts.strokeWidth * 0.3}" stroke-dasharray="2,2"/>`);
  }
  
  // Door handles
  elements.push(`<circle cx="${innerX + doorWidth - gap - 4}" cy="${innerY + doorHeight * 0.5}" r="${1.5}" fill="${opts.strokeColor}"/>`);
  elements.push(`<circle cx="${innerX + doorWidth + gap + 4}" cy="${innerY + doorHeight * 0.5}" r="${1.5}" fill="${opts.strokeColor}"/>`);
  
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
