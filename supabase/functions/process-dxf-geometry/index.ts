import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import JSZip from "https://esm.sh/jszip@3.10.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DXFPoint {
  x: number;
  y: number;
  z?: number;
}

interface DXFEntity {
  type: string;
  start?: DXFPoint;
  end?: DXFPoint;
  center?: DXFPoint;
  radius?: number;
  vertices?: DXFPoint[];
  closed?: boolean;
}

interface CabinetGeometry {
  name: string;
  width: number;
  height: number;
  depth: number;
  doorCount: number;
  drawerCount: number;
  isCorner: boolean;
  isSink: boolean;
  thumbnailSvg: string;
  frontGeometry: object;
}

interface CabinetFeatures {
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

// Parse product name to extract features
function parseProductName(name: string): CabinetFeatures {
  const n = name.toLowerCase();
  
  // Extract door count
  const doorMatch = n.match(/(\d+)\s*door/);
  let doorCount = doorMatch ? parseInt(doorMatch[1], 10) : 0;
  if (doorCount === 0 && (n.includes('bi fold') || n.includes('bifold'))) doorCount = 2;
  if (doorCount === 0 && n.includes('door') && !n.includes('drawer')) doorCount = 1;
  
  // Extract drawer count
  const drawerMatch = n.match(/(\d+)\s*drawer/);
  let drawerCount = drawerMatch ? parseInt(drawerMatch[1], 10) : 0;
  if (drawerCount === 0 && n.includes('drawer') && !n.includes('door')) {
    const bayMatch = n.match(/(\d+)\s*bay/);
    drawerCount = bayMatch ? parseInt(bayMatch[1], 10) : 1;
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

// Get variable drawer heights (larger at bottom)
function getDrawerHeightRatios(count: number, totalHeight: number): number[] {
  const distributions: Record<number, number[]> = {
    1: [1.0],
    2: [0.40, 0.60],
    3: [0.25, 0.33, 0.42],
    4: [0.18, 0.24, 0.28, 0.30],
    5: [0.14, 0.18, 0.22, 0.22, 0.24],
    6: [0.12, 0.14, 0.18, 0.18, 0.18, 0.20],
  };
  
  const ratios = distributions[count] || Array(count).fill(1 / count);
  return ratios.map(ratio => ratio * totalHeight);
}

// Simple DXF parser for edge function
function parseDXFContent(content: string): DXFEntity[] {
  const entities: DXFEntity[] = [];
  const lines = content.split('\n').map(l => l.trim());
  
  let i = 0;
  let inEntities = false;
  
  while (i < lines.length) {
    const code = parseInt(lines[i], 10);
    const value = lines[i + 1] || '';
    
    if (value === 'ENTITIES') {
      inEntities = true;
      i += 2;
      continue;
    }
    
    if (value === 'ENDSEC' && inEntities) {
      break;
    }
    
    if (inEntities && code === 0) {
      if (value === 'LINE') {
        const entity: DXFEntity = { type: 'LINE' };
        i += 2;
        while (i < lines.length) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          if (c === 0) break;
          if (c === 10) entity.start = { ...entity.start, x: parseFloat(v) } as DXFPoint;
          if (c === 20) entity.start = { ...entity.start, y: parseFloat(v) } as DXFPoint;
          if (c === 11) entity.end = { ...entity.end, x: parseFloat(v) } as DXFPoint;
          if (c === 21) entity.end = { ...entity.end, y: parseFloat(v) } as DXFPoint;
          i += 2;
        }
        if (entity.start && entity.end) entities.push(entity);
        continue;
      }
      
      if (value === 'CIRCLE') {
        const entity: DXFEntity = { type: 'CIRCLE' };
        i += 2;
        while (i < lines.length) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          if (c === 0) break;
          if (c === 10) entity.center = { ...entity.center, x: parseFloat(v) } as DXFPoint;
          if (c === 20) entity.center = { ...entity.center, y: parseFloat(v) } as DXFPoint;
          if (c === 40) entity.radius = parseFloat(v);
          i += 2;
        }
        if (entity.center && entity.radius) entities.push(entity);
        continue;
      }
      
      if (value === 'LWPOLYLINE') {
        const entity: DXFEntity = { type: 'LWPOLYLINE', vertices: [], closed: false };
        i += 2;
        let currentVertex: Partial<DXFPoint> = {};
        while (i < lines.length) {
          const c = parseInt(lines[i], 10);
          const v = lines[i + 1];
          if (c === 0) break;
          if (c === 70) entity.closed = (parseInt(v, 10) & 1) === 1;
          if (c === 10) {
            if (currentVertex.x !== undefined) {
              entity.vertices!.push(currentVertex as DXFPoint);
            }
            currentVertex = { x: parseFloat(v) };
          }
          if (c === 20) currentVertex.y = parseFloat(v);
          i += 2;
        }
        if (currentVertex.x !== undefined) {
          entity.vertices!.push(currentVertex as DXFPoint);
        }
        if (entity.vertices!.length >= 2) entities.push(entity);
        continue;
      }
    }
    
    i += 2;
  }
  
  return entities;
}

// Calculate bounding box
function calculateBounds(entities: DXFEntity[]): { width: number; height: number; depth: number } {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  
  for (const entity of entities) {
    const points: DXFPoint[] = [];
    if (entity.start) points.push(entity.start);
    if (entity.end) points.push(entity.end);
    if (entity.center && entity.radius) {
      points.push({ x: entity.center.x - entity.radius, y: entity.center.y - entity.radius });
      points.push({ x: entity.center.x + entity.radius, y: entity.center.y + entity.radius });
    }
    if (entity.vertices) points.push(...entity.vertices);
    
    for (const p of points) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
  }
  
  const width = maxX - minX;
  const height = maxY - minY;
  return { width: Math.round(width), height: Math.round(height), depth: 580 };
}

// Generate SVG thumbnail based on cabinet features
function generateSVG(
  _entities: DXFEntity[], 
  bounds: { width: number; height: number }, 
  features: CabinetFeatures,
  productName: string
): string {
  const svgWidth = 120;
  const svgHeight = 120;
  const padding = 8;
  const strokeColor = '#374151';
  const fillColor = '#f3f4f6';
  const strokeWidth = 1.5;
  
  const availableWidth = svgWidth - padding * 2;
  const availableHeight = svgHeight - padding * 2;
  
  const aspect = bounds.width / bounds.height;
  let cabinetWidth: number, cabinetHeight: number;
  
  if (aspect > availableWidth / availableHeight) {
    cabinetWidth = availableWidth;
    cabinetHeight = availableWidth / aspect;
  } else {
    cabinetHeight = availableHeight;
    cabinetWidth = availableHeight * aspect;
  }
  
  const offsetX = padding + (availableWidth - cabinetWidth) / 2;
  const offsetY = padding + (availableHeight - cabinetHeight) / 2;
  
  const { doorCount, drawerCount, isCorner, isSink, isOpen, isLiftUp, isDiagonal, isPantry, hasFalseFront, cornerType } = features;
  
  // Handle special cabinet types with dedicated SVG generators
  if (isCorner && !isDiagonal) {
    return generateCornerSVG(cabinetWidth, cabinetHeight, offsetX, offsetY, strokeColor, fillColor, strokeWidth, svgWidth, svgHeight, cornerType);
  }
  
  if (isDiagonal) {
    return generateDiagonalSVG(cabinetWidth, cabinetHeight, offsetX, offsetY, strokeColor, fillColor, strokeWidth, svgWidth, svgHeight);
  }
  
  if (isOpen) {
    return generateOpenCabinetSVG(cabinetWidth, cabinetHeight, offsetX, offsetY, strokeColor, fillColor, strokeWidth, svgWidth, svgHeight);
  }
  
  if (isLiftUp) {
    return generateLiftUpSVG(cabinetWidth, cabinetHeight, offsetX, offsetY, strokeColor, fillColor, strokeWidth, svgWidth, svgHeight, doorCount);
  }
  
  if (isSink && hasFalseFront) {
    return generateSinkSVG(cabinetWidth, cabinetHeight, offsetX, offsetY, strokeColor, fillColor, strokeWidth, svgWidth, svgHeight, doorCount);
  }
  
  if (isPantry) {
    return generatePantrySVG(cabinetWidth, cabinetHeight, offsetX, offsetY, strokeColor, fillColor, strokeWidth, svgWidth, svgHeight);
  }
  
  // Standard cabinet rendering
  const elements: string[] = [];
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${cabinetWidth}" height="${cabinetHeight}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  
  const gap = 2;
  const innerWidth = cabinetWidth - gap * 2;
  const innerHeight = cabinetHeight - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  
  if (drawerCount > 0 && doorCount === 0) {
    // All drawers - variable heights
    const drawerHeights = getDrawerHeightRatios(drawerCount, innerHeight);
    let currentY = innerY;
    
    for (let i = 0; i < drawerCount; i++) {
      const dy = currentY + gap / 2;
      const dh = drawerHeights[i] - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="${strokeColor}" stroke-width="1"/>`);
      const handleY = dy + Math.min(dh * 0.25, 12);
      elements.push(`<line x1="${innerX + innerWidth * 0.3}" y1="${handleY}" x2="${innerX + innerWidth * 0.7}" y2="${handleY}" stroke="${strokeColor}" stroke-width="0.75"/>`);
      currentY += drawerHeights[i];
    }
  } else if (doorCount > 0 && drawerCount === 0) {
    // All doors
    const doorWidth = innerWidth / doorCount;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${innerY}" width="${dw}" height="${innerHeight}" fill="none" stroke="${strokeColor}" stroke-width="1"/>`);
      const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
      elements.push(`<circle cx="${handleX}" cy="${innerY + innerHeight * 0.5}" r="2" fill="${strokeColor}"/>`);
    }
  } else if (doorCount > 0 && drawerCount > 0) {
    // Drawers on top, doors below
    const drawerSectionHeight = Math.min(innerHeight * 0.35, drawerCount * (innerHeight / 5));
    const doorHeight = innerHeight - drawerSectionHeight - gap;
    
    const drawerHeights = getDrawerHeightRatios(drawerCount, drawerSectionHeight);
    let currentY = innerY;
    for (let i = 0; i < drawerCount; i++) {
      const dy = currentY + gap / 2;
      const dh = drawerHeights[i] - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="${strokeColor}" stroke-width="1"/>`);
      const handleY = dy + Math.min(dh * 0.25, 8);
      elements.push(`<line x1="${innerX + innerWidth * 0.35}" y1="${handleY}" x2="${innerX + innerWidth * 0.65}" y2="${handleY}" stroke="${strokeColor}" stroke-width="0.5"/>`);
      currentY += drawerHeights[i];
    }
    
    const doorWidth = innerWidth / doorCount;
    const doorY = innerY + drawerSectionHeight + gap;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${doorY}" width="${dw}" height="${doorHeight}" fill="none" stroke="${strokeColor}" stroke-width="1"/>`);
      const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
      elements.push(`<circle cx="${handleX}" cy="${doorY + doorHeight * 0.2}" r="1.5" fill="${strokeColor}"/>`);
    }
  }
  
  if (isSink && !hasFalseFront) {
    const sinkWidth = innerWidth * 0.6;
    const sinkHeight = innerHeight * 0.12;
    const sinkX = innerX + (innerWidth - sinkWidth) / 2;
    const sinkY = offsetY + cabinetHeight * 0.08;
    elements.push(`<ellipse cx="${sinkX + sinkWidth / 2}" cy="${sinkY + sinkHeight / 2}" rx="${sinkWidth / 2}" ry="${sinkHeight / 2}" fill="none" stroke="${strokeColor}" stroke-width="0.75" stroke-dasharray="2,2"/>`);
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="transparent"/>
  ${elements.join('\n  ')}
</svg>`;
}

function generateCornerSVG(
  width: number, height: number, offsetX: number, offsetY: number,
  strokeColor: string, fillColor: string, strokeWidth: number,
  svgWidth: number, svgHeight: number,
  cornerType: 'l-shape' | 'blind' | 'diagonal' | null
): string {
  const elements: string[] = [];
  const armWidth = width * 0.45;
  const cutoutSize = width * 0.4;
  
  const path = `M ${offsetX} ${offsetY} L ${offsetX + width} ${offsetY} L ${offsetX + width} ${offsetY + height - cutoutSize} L ${offsetX + armWidth} ${offsetY + height - cutoutSize} L ${offsetX + armWidth} ${offsetY + height} L ${offsetX} ${offsetY + height} Z`;
  elements.push(`<path d="${path}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  
  const diagonalPath = `M ${offsetX + armWidth - 2} ${offsetY + height - cutoutSize + 4} L ${offsetX + width - 4} ${offsetY + height - cutoutSize - (cutoutSize * 0.3)}`;
  elements.push(`<path d="${diagonalPath}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}" stroke-dasharray="3,2"/>`);
  
  if (cornerType) {
    elements.push(`<text x="${offsetX + width/2}" y="${offsetY + height - 8}" font-size="7" fill="${strokeColor}" text-anchor="middle" font-family="sans-serif">${cornerType}</text>`);
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}"><rect width="100%" height="100%" fill="transparent"/>${elements.join('\n')}</svg>`;
}

function generateDiagonalSVG(
  width: number, height: number, offsetX: number, offsetY: number,
  strokeColor: string, fillColor: string, strokeWidth: number,
  svgWidth: number, svgHeight: number
): string {
  const elements: string[] = [];
  const cutDepth = width * 0.25;
  
  const path = `M ${offsetX} ${offsetY} L ${offsetX + width - cutDepth} ${offsetY} L ${offsetX + width} ${offsetY + cutDepth} L ${offsetX + width} ${offsetY + height} L ${offsetX} ${offsetY + height} Z`;
  elements.push(`<path d="${path}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}"><rect width="100%" height="100%" fill="transparent"/>${elements.join('\n')}</svg>`;
}

function generateOpenCabinetSVG(
  width: number, height: number, offsetX: number, offsetY: number,
  strokeColor: string, fillColor: string, strokeWidth: number,
  svgWidth: number, svgHeight: number
): string {
  const elements: string[] = [];
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  
  const shelfCount = 3;
  const shelfGap = height / (shelfCount + 1);
  for (let i = 1; i <= shelfCount; i++) {
    const shelfY = offsetY + shelfGap * i;
    elements.push(`<line x1="${offsetX + 3}" y1="${shelfY}" x2="${offsetX + width - 3}" y2="${shelfY}" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}"/>`);
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}"><rect width="100%" height="100%" fill="transparent"/>${elements.join('\n')}</svg>`;
}

function generateLiftUpSVG(
  width: number, height: number, offsetX: number, offsetY: number,
  strokeColor: string, fillColor: string, strokeWidth: number,
  svgWidth: number, svgHeight: number, doorCount: number
): string {
  const elements: string[] = [];
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  
  const gap = 2;
  const innerWidth = width - gap * 2;
  const innerHeight = height - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  
  if (doorCount === 2) {
    const panelWidth = innerWidth / 2;
    elements.push(`<rect x="${innerX}" y="${innerY}" width="${panelWidth - gap/2}" height="${innerHeight}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}"/>`);
    elements.push(`<rect x="${innerX + panelWidth + gap/2}" y="${innerY}" width="${panelWidth - gap/2}" height="${innerHeight}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}"/>`);
    elements.push(`<line x1="${innerX + panelWidth}" y1="${innerY}" x2="${innerX + panelWidth}" y2="${innerY + innerHeight}" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-dasharray="2,2"/>`);
  } else {
    elements.push(`<rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}"/>`);
  }
  
  const arrowY = innerY + 6;
  const arrowX = innerX + innerWidth / 2;
  elements.push(`<path d="M ${arrowX - 6} ${arrowY + 4} L ${arrowX} ${arrowY} L ${arrowX + 6} ${arrowY + 4}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}" stroke-linecap="round" stroke-linejoin="round"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}"><rect width="100%" height="100%" fill="transparent"/>${elements.join('\n')}</svg>`;
}

function generateSinkSVG(
  width: number, height: number, offsetX: number, offsetY: number,
  strokeColor: string, fillColor: string, strokeWidth: number,
  svgWidth: number, svgHeight: number, doorCount: number
): string {
  const elements: string[] = [];
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  
  const gap = 2;
  const innerWidth = width - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  
  const falseFrontHeight = height * 0.12;
  elements.push(`<rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${falseFrontHeight}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}"/>`);
  const handleY = innerY + falseFrontHeight / 2;
  elements.push(`<line x1="${innerX + innerWidth * 0.35}" y1="${handleY}" x2="${innerX + innerWidth * 0.65}" y2="${handleY}" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}"/>`);
  
  const doorY = innerY + falseFrontHeight + gap;
  const doorHeight = height - gap * 2 - falseFrontHeight - gap;
  const doorsToRender = doorCount || 2;
  const doorWidth = innerWidth / doorsToRender;
  
  for (let i = 0; i < doorsToRender; i++) {
    const dx = innerX + i * doorWidth + gap / 2;
    const dw = doorWidth - gap;
    elements.push(`<rect x="${dx}" y="${doorY}" width="${dw}" height="${doorHeight}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}"/>`);
    const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
    elements.push(`<circle cx="${handleX}" cy="${doorY + doorHeight * 0.15}" r="1.5" fill="${strokeColor}"/>`);
  }
  
  const sinkWidth = innerWidth * 0.5;
  const sinkX = innerX + (innerWidth - sinkWidth) / 2;
  elements.push(`<ellipse cx="${sinkX + sinkWidth / 2}" cy="${innerY - 4}" rx="${sinkWidth / 2}" ry="4" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.5}" stroke-dasharray="2,2"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}"><rect width="100%" height="100%" fill="transparent"/>${elements.join('\n')}</svg>`;
}

function generatePantrySVG(
  width: number, height: number, offsetX: number, offsetY: number,
  strokeColor: string, fillColor: string, strokeWidth: number,
  svgWidth: number, svgHeight: number
): string {
  const elements: string[] = [];
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${width}" height="${height}" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`);
  
  const gap = 2;
  const innerWidth = width - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  const doorWidth = innerWidth / 2;
  const doorHeight = height - gap * 2;
  
  elements.push(`<rect x="${innerX}" y="${innerY}" width="${doorWidth - gap/2}" height="${doorHeight}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}"/>`);
  elements.push(`<rect x="${innerX + doorWidth + gap/2}" y="${innerY}" width="${doorWidth - gap/2}" height="${doorHeight}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.75}"/>`);
  
  const basketCount = 5;
  const basketSpacing = doorHeight / (basketCount + 1);
  for (let i = 1; i <= basketCount; i++) {
    const basketY = innerY + basketSpacing * i;
    elements.push(`<line x1="${innerX + 4}" y1="${basketY}" x2="${innerX + doorWidth - gap - 4}" y2="${basketY}" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.3}" stroke-dasharray="2,2"/>`);
    elements.push(`<line x1="${innerX + doorWidth + gap + 4}" y1="${basketY}" x2="${innerX + innerWidth - 4}" y2="${basketY}" stroke="${strokeColor}" stroke-width="${strokeWidth * 0.3}" stroke-dasharray="2,2"/>`);
  }
  
  elements.push(`<circle cx="${innerX + doorWidth - gap - 4}" cy="${innerY + doorHeight * 0.5}" r="1.5" fill="${strokeColor}"/>`);
  elements.push(`<circle cx="${innerX + doorWidth + gap + 4}" cy="${innerY + doorHeight * 0.5}" r="1.5" fill="${strokeColor}"/>`);
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}"><rect width="100%" height="100%" fill="transparent"/>${elements.join('\n')}</svg>`;
}

// Process a single DXF file
function processDXF(content: string, filename: string): CabinetGeometry {
  const entities = parseDXFContent(content);
  const bounds = calculateBounds(entities);
  
  // Clean filename for cabinet name
  const name = filename.replace(/\.dxf$/i, '').replace(/_/g, ' ').trim();
  const features = parseProductName(name);
  
  const thumbnailSvg = generateSVG(entities, bounds, features, name);
  
  return {
    name,
    width: bounds.width || 600,
    height: bounds.height || 870,
    depth: bounds.depth,
    doorCount: features.doorCount,
    drawerCount: features.drawerCount,
    isCorner: features.isCorner,
    isSink: features.isSink,
    thumbnailSvg,
    frontGeometry: {
      doors: [],
      drawers: [],
      handles: [],
      entityCount: entities.length,
    },
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get request body first to check action
    const body = await req.json();
    const { zipUrl, action } = body;

    // Allow generate-from-products without auth for internal admin calls
    const isInternalGenerate = action === 'generate-from-products';

    if (!isInternalGenerate) {
      // Check auth for other actions
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'No authorization header' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace('Bearer ', '')
      );

      if (authError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .single();

      if (!roleData) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (action === 'generate-from-products') {
      // Generate thumbnails for all products (not just those without geometry)
      const { data: products, error: fetchError } = await supabase
        .from('microvellum_products')
        .select('id, name, default_width, default_height, default_depth, door_count, drawer_count, is_corner, is_sink, is_blind, has_false_front, corner_type');

      if (fetchError) throw fetchError;

      console.log(`Generating thumbnails for ${products?.length || 0} products`);

      let updated = 0;
      for (const product of products || []) {
        // Parse features from product name for more accurate thumbnails
        const features = parseProductName(product.name);
        
        // Override with database values where available
        const finalFeatures: CabinetFeatures = {
          ...features,
          doorCount: product.door_count ?? features.doorCount,
          drawerCount: product.drawer_count ?? features.drawerCount,
          isCorner: product.is_corner ?? features.isCorner,
          isSink: product.is_sink ?? features.isSink,
          isBlind: product.is_blind ?? features.isBlind,
          hasFalseFront: product.has_false_front ?? features.hasFalseFront,
          cornerType: (product.corner_type as 'l-shape' | 'blind' | 'diagonal' | null) ?? features.cornerType,
        };

        const bounds = {
          width: product.default_width || 600,
          height: product.default_height || 870,
        };

        const thumbnailSvg = generateSVG([], bounds, finalFeatures, product.name);

        const { error: updateError } = await supabase
          .from('microvellum_products')
          .update({
            thumbnail_svg: thumbnailSvg,
            front_geometry: {
              doors: [],
              drawers: [],
              handles: [],
              generated: true,
              features: finalFeatures,
            },
          })
          .eq('id', product.id);

        if (!updateError) updated++;
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Generated thumbnails for ${updated} products`,
        updated,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!zipUrl) {
      return new Response(JSON.stringify({ error: 'Missing zipUrl parameter' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch and process ZIP file
    console.log(`Fetching ZIP from: ${zipUrl}`);
    const zipResponse = await fetch(zipUrl);
    if (!zipResponse.ok) {
      throw new Error(`Failed to fetch ZIP: ${zipResponse.statusText}`);
    }

    const zipData = await zipResponse.arrayBuffer();
    const zip = await JSZip.loadAsync(zipData);
    
    const results: CabinetGeometry[] = [];
    const errors: string[] = [];

    for (const [filename, file] of Object.entries(zip.files)) {
      if (filename.endsWith('.dxf') && !file.dir) {
        try {
          const content = await file.async('string');
          const geometry = processDXF(content, filename);
          results.push(geometry);
          console.log(`Processed: ${filename} -> ${geometry.name}`);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${filename}: ${message}`);
          console.error(`Error processing ${filename}:`, err);
        }
      }
    }

    // Match and update database
    let matched = 0;
    for (const geometry of results) {
      // Try to find matching product by name
      const { data: products } = await supabase
        .from('microvellum_products')
        .select('id, name')
        .ilike('name', `%${geometry.name}%`)
        .limit(1);

      if (products && products.length > 0) {
        const { error: updateError } = await supabase
          .from('microvellum_products')
          .update({
            thumbnail_svg: geometry.thumbnailSvg,
            front_geometry: geometry.frontGeometry,
            has_dxf_geometry: true,
          })
          .eq('id', products[0].id);

        if (!updateError) {
          matched++;
          console.log(`Updated: ${products[0].name}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      matched,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error processing DXF:', error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      error: message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
