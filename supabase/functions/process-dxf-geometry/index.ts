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

// Detect cabinet features from name
function detectFeatures(name: string): { doorCount: number; drawerCount: number; isCorner: boolean; isSink: boolean } {
  const nameLower = name.toLowerCase();
  
  let doorCount = 0;
  let drawerCount = 0;
  
  // Detect drawers
  const drawerMatch = nameLower.match(/(\d+)\s*dr(?:aw)?(?:er)?/);
  if (drawerMatch) drawerCount = parseInt(drawerMatch[1], 10);
  else if (nameLower.includes('drawer')) drawerCount = 1;
  
  // Detect doors
  if (nameLower.includes('2 door') || nameLower.includes('double door')) doorCount = 2;
  else if (nameLower.includes('door') || nameLower.includes('dr ')) doorCount = 1;
  
  // If no doors/drawers detected, infer from cabinet type
  if (doorCount === 0 && drawerCount === 0) {
    if (nameLower.includes('drawer')) drawerCount = 3;
    else doorCount = 1;
  }
  
  const isCorner = nameLower.includes('corner') || nameLower.includes('l-shape');
  const isSink = nameLower.includes('sink');
  
  return { doorCount, drawerCount, isCorner, isSink };
}

// Generate SVG thumbnail
function generateSVG(entities: DXFEntity[], bounds: { width: number; height: number }, features: ReturnType<typeof detectFeatures>): string {
  const svgWidth = 120;
  const svgHeight = 120;
  const padding = 8;
  
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
  
  const elements: string[] = [];
  
  // Cabinet outline
  elements.push(`<rect x="${offsetX}" y="${offsetY}" width="${cabinetWidth}" height="${cabinetHeight}" fill="#f3f4f6" stroke="#374151" stroke-width="1.5"/>`);
  
  const gap = 2;
  const innerWidth = cabinetWidth - gap * 2;
  const innerHeight = cabinetHeight - gap * 2;
  const innerX = offsetX + gap;
  const innerY = offsetY + gap;
  
  const { doorCount, drawerCount, isSink } = features;
  
  if (drawerCount > 0 && doorCount === 0) {
    const drawerHeight = innerHeight / drawerCount;
    for (let i = 0; i < drawerCount; i++) {
      const dy = innerY + i * drawerHeight + gap / 2;
      const dh = drawerHeight - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="#374151" stroke-width="1"/>`);
      const handleY = dy + dh * 0.3;
      elements.push(`<line x1="${innerX + innerWidth * 0.3}" y1="${handleY}" x2="${innerX + innerWidth * 0.7}" y2="${handleY}" stroke="#374151" stroke-width="0.75"/>`);
    }
  } else if (doorCount > 0 && drawerCount === 0) {
    const doorWidth = innerWidth / doorCount;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${innerY}" width="${dw}" height="${innerHeight}" fill="none" stroke="#374151" stroke-width="1"/>`);
      const handleX = i === 0 ? dx + dw * 0.85 : dx + dw * 0.15;
      elements.push(`<circle cx="${handleX}" cy="${innerY + innerHeight * 0.5}" r="2" fill="#374151"/>`);
    }
  } else if (doorCount > 0 && drawerCount > 0) {
    const drawerTotalHeight = innerHeight * 0.3;
    const doorHeight = innerHeight - drawerTotalHeight - gap;
    
    const drawerHeight = drawerTotalHeight / drawerCount;
    for (let i = 0; i < drawerCount; i++) {
      const dy = innerY + i * drawerHeight + gap / 2;
      const dh = drawerHeight - gap;
      elements.push(`<rect x="${innerX}" y="${dy}" width="${innerWidth}" height="${dh}" fill="none" stroke="#374151" stroke-width="1"/>`);
    }
    
    const doorWidth = innerWidth / doorCount;
    const doorY = innerY + drawerTotalHeight + gap;
    for (let i = 0; i < doorCount; i++) {
      const dx = innerX + i * doorWidth + gap / 2;
      const dw = doorWidth - gap;
      elements.push(`<rect x="${dx}" y="${doorY}" width="${dw}" height="${doorHeight}" fill="none" stroke="#374151" stroke-width="1"/>`);
    }
  }
  
  if (isSink) {
    const sinkWidth = innerWidth * 0.6;
    const sinkHeight = innerHeight * 0.12;
    const sinkX = innerX + (innerWidth - sinkWidth) / 2;
    const sinkY = offsetY + cabinetHeight * 0.08;
    elements.push(`<ellipse cx="${sinkX + sinkWidth / 2}" cy="${sinkY + sinkHeight / 2}" rx="${sinkWidth / 2}" ry="${sinkHeight / 2}" fill="none" stroke="#374151" stroke-width="0.75" stroke-dasharray="2,2"/>`);
  }
  
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
  <rect width="100%" height="100%" fill="transparent"/>
  ${elements.join('\n  ')}
</svg>`;
}

// Process a single DXF file
function processDXF(content: string, filename: string): CabinetGeometry {
  const entities = parseDXFContent(content);
  const bounds = calculateBounds(entities);
  
  // Clean filename for cabinet name
  const name = filename.replace(/\.dxf$/i, '').replace(/_/g, ' ').trim();
  const features = detectFeatures(name);
  
  const thumbnailSvg = generateSVG(entities, bounds, features);
  
  return {
    name,
    width: bounds.width || 600,
    height: bounds.height || 870,
    depth: bounds.depth,
    ...features,
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

    // Check auth
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

    // Get request body
    const body = await req.json();
    const { zipUrl, action } = body;

    if (action === 'generate-from-products') {
      // Generate thumbnails for existing products without geometry
      const { data: products, error: fetchError } = await supabase
        .from('microvellum_products')
        .select('id, name, default_width, default_height, default_depth, door_count, drawer_count, is_corner, is_sink')
        .eq('has_dxf_geometry', false);

      if (fetchError) throw fetchError;

      console.log(`Generating thumbnails for ${products?.length || 0} products`);

      let updated = 0;
      for (const product of products || []) {
        const features = {
          doorCount: product.door_count || 0,
          drawerCount: product.drawer_count || 0,
          isCorner: product.is_corner || false,
          isSink: product.is_sink || false,
        };

        const bounds = {
          width: product.default_width || 600,
          height: product.default_height || 870,
        };

        const thumbnailSvg = generateSVG([], bounds, features);

        const { error: updateError } = await supabase
          .from('microvellum_products')
          .update({
            thumbnail_svg: thumbnailSvg,
            front_geometry: {
              doors: [],
              drawers: [],
              handles: [],
              generated: true,
            },
            has_dxf_geometry: false,
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
