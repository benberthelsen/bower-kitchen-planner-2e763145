import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ProductCategory = 'Base' | 'Wall' | 'Tall' | 'Accessory';

interface ParsedXmlRow {
  [key: string]: string;
}

interface ParsedProduct {
  microvellum_link_id: string;
  name: string;
  category: ProductCategory;
  cabinet_type: string;
  default_width: number;
  default_depth: number;
  default_height: number;
  door_count: number;
  drawer_count: number;
  is_corner: boolean;
  is_sink: boolean;
  is_blind: boolean;
  spec_group: string | null;
  room_component_type: string | null;
  raw_metadata: ParsedXmlRow;
}

interface ImportSummary {
  success: boolean;
  imported?: number;
  skipped?: number;
  warnings?: string[];
  errors?: string[];
  categoryCounts?: Record<string, number>;
  message?: string;
  error?: string;
}

function parseExcelXML(xmlContent: string): ParsedXmlRow[] {
  const rows: ParsedXmlRow[] = [];
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
  const cellRegex = /<Cell[^>]*>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>[\s\S]*?<\/Cell>/g;

  let headers: string[] = [];
  let isFirstRow = true;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(xmlContent)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];

    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cellMatch[1].trim());
    }

    if (cells.length === 0) continue;

    if (isFirstRow) {
      headers = cells;
      isFirstRow = false;
      continue;
    }

    const row: ParsedXmlRow = {};
    cells.forEach((cell, index) => {
      if (headers[index]) row[headers[index]] = cell;
    });

    if (Object.keys(row).length > 0) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeCategoryFromMetadata(specGroup?: string | null, roomComponentType?: string | null): ProductCategory | null {
  const source = `${specGroup || ''} ${roomComponentType || ''}`.toLowerCase();
  if (!source.trim()) return null;

  if (source.includes('tall') || source.includes('pantry')) return 'Tall';
  if (source.includes('wall') || source.includes('upper')) return 'Wall';
  if (source.includes('accessor') || source.includes('filler') || source.includes('panel') || source.includes('kick') || source.includes('moulding')) return 'Accessory';
  if (source.includes('base') || source.includes('sink')) return 'Base';

  return null;
}

function detectCategoryByName(name: string): ProductCategory {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('tall') || lowerName.includes('pantry') || lowerName.includes('oven tower') || lowerName.includes('broom')) {
    return 'Tall';
  }

  if (lowerName.includes('upper') || lowerName.includes('wall') || lowerName.includes('rangehood') || lowerName.includes('microwave')) {
    return 'Wall';
  }

  if (lowerName.includes('panel') || lowerName.includes('filler') || lowerName.includes('spacer') || lowerName.includes('kick') || lowerName.includes('scribe') || lowerName.includes('moulding')) {
    return 'Accessory';
  }

  return 'Base';
}

function detectCabinetType(name: string): string {
  const lowerName = name.toLowerCase();

  if (lowerName.includes('drawer')) return 'Drawer';
  if (lowerName.includes('corner')) return 'Corner';
  if (lowerName.includes('sink')) return 'Sink';
  if (lowerName.includes('blind')) return 'Blind';
  if (lowerName.includes('appliance') || lowerName.includes('oven')) return 'Appliance';
  if (lowerName.includes('pantry')) return 'Pantry';
  if (lowerName.includes('rangehood')) return 'Rangehood';

  return 'Standard';
}

function extractCounts(name: string): { doors: number; drawers: number } {
  const lowerName = name.toLowerCase();

  const drawerMatch = lowerName.match(/(\d+)\s*drawer/);
  const doorMatch = lowerName.match(/(\d+)\s*door/);

  let drawers = drawerMatch ? Number.parseInt(drawerMatch[1], 10) : 0;
  let doors = doorMatch ? Number.parseInt(doorMatch[1], 10) : 0;

  if (!drawerMatch && lowerName.includes('drawer')) drawers = 1;
  if (!doorMatch && !drawerMatch && !lowerName.includes('drawer')) {
    if (lowerName.includes('door') || detectCabinetType(name) === 'Standard') {
      doors = lowerName.includes('double') ? 2 : 1;
    }
  }

  return { doors, drawers };
}

function getDefaultDimensions(category: ProductCategory, name: string): { width: number; depth: number; height: number } {
  const lowerName = name.toLowerCase();

  switch (category) {
    case 'Base':
      return { width: lowerName.includes('corner') ? 900 : 600, depth: 575, height: 870 };
    case 'Wall':
      return { width: 600, depth: 350, height: 720 };
    case 'Tall':
      return { width: 600, depth: 580, height: 2100 };
    case 'Accessory':
      return { width: 50, depth: 580, height: 870 };
    default:
      return { width: 600, depth: 575, height: 870 };
  }
}

function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(JSON.stringify({ success: false, error: 'Server configuration error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, error: 'Missing authorization header' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid or expired session' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleRow, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to verify permissions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    if (!roleRow) {
      return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }

    const body = (await req.json()) as { xmlContent?: string };
    if (!body?.xmlContent || typeof body.xmlContent !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'No XML content provided' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const rows = parseExcelXML(body.xmlContent);
    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No products found in XML file' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const warnings: string[] = [];
    const rowErrors: string[] = [];
    const products: ParsedProduct[] = [];

    rows.forEach((row, rowIndex) => {
      const name = (row['Name'] || '').trim();
      const linkId = (row['LinkID'] || row['ID'] || '').trim();

      if (!name || !linkId) {
        rowErrors.push(`Row ${rowIndex + 2}: missing required Name/LinkID.`);
        return;
      }

      const metadataCategory = normalizeCategoryFromMetadata(row['ProductSpecGroupName'] || null, row['RoomComponentType'] || null);
      const category = metadataCategory || detectCategoryByName(name);
      if (!metadataCategory) {
        warnings.push(`Row ${rowIndex + 2} (${linkId}) used name-based category fallback.`);
      }

      const defaults = getDefaultDimensions(category, name);
      const width = toNumber(row['Width']) || defaults.width;
      const depth = toNumber(row['Depth']) || defaults.depth;
      const height = toNumber(row['Height']) || defaults.height;
      const { doors, drawers } = extractCounts(name);
      const lowerName = name.toLowerCase();

      products.push({
        microvellum_link_id: linkId,
        name,
        category,
        cabinet_type: detectCabinetType(name),
        default_width: width,
        default_depth: depth,
        default_height: height,
        door_count: doors,
        drawer_count: drawers,
        is_corner: lowerName.includes('corner'),
        is_sink: lowerName.includes('sink'),
        is_blind: lowerName.includes('blind'),
        spec_group: row['ProductSpecGroupName'] || null,
        room_component_type: row['RoomComponentType'] || null,
        raw_metadata: {
          ...row,
          __import_source: 'import-microvellum-v2',
          __imported_at: new Date().toISOString(),
        },
      });
    });

    if (products.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid products found', errors: rowErrors } satisfies ImportSummary),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const { error: upsertError } = await adminClient
      .from('microvellum_products')
      .upsert(products, {
        onConflict: 'microvellum_link_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      return new Response(
        JSON.stringify({ success: false, error: `Database error: ${upsertError.message}` } satisfies ImportSummary),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    const categoryCounts = products.reduce<Record<string, number>>((acc, product) => {
      acc[product.category] = (acc[product.category] || 0) + 1;
      return acc;
    }, {});

    const summary: ImportSummary = {
      success: true,
      imported: products.length,
      skipped: rowErrors.length,
      warnings,
      errors: rowErrors,
      categoryCounts,
      message: `Successfully imported ${products.length} products${rowErrors.length ? ` (${rowErrors.length} skipped)` : ''}`,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: message } satisfies ImportSummary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
