import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Category detection based on naming patterns
function detectCategory(name: string): 'Base' | 'Wall' | 'Tall' | 'Accessory' {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('tall') || lowerName.includes('pantry') || 
      lowerName.includes('oven tower') || lowerName.includes('broom')) {
    return 'Tall';
  }
  
  if (lowerName.includes('upper') || lowerName.includes('wall') || 
      lowerName.includes('rangehood') || lowerName.includes('microwave')) {
    return 'Wall';
  }
  
  if (lowerName.includes('panel') || lowerName.includes('filler') || 
      lowerName.includes('spacer') || lowerName.includes('kick') ||
      lowerName.includes('scribe') || lowerName.includes('moulding')) {
    return 'Accessory';
  }
  
  return 'Base';
}

// Detect cabinet sub-type
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

// Extract door/drawer counts from name
function extractCounts(name: string): { doors: number; drawers: number } {
  const lowerName = name.toLowerCase();
  
  const drawerMatch = lowerName.match(/(\d+)\s*drawer/);
  const doorMatch = lowerName.match(/(\d+)\s*door/);
  
  let drawers = drawerMatch ? parseInt(drawerMatch[1], 10) : 0;
  let doors = doorMatch ? parseInt(doorMatch[1], 10) : 0;
  
  if (!drawerMatch && lowerName.includes('drawer')) drawers = 1;
  if (!doorMatch && !drawerMatch && !lowerName.includes('drawer')) {
    if (lowerName.includes('door') || detectCabinetType(name) === 'Standard') {
      doors = lowerName.includes('double') ? 2 : 1;
    }
  }
  
  return { doors, drawers };
}

// Get default dimensions based on category
function getDefaultDimensions(category: string, name: string) {
  const lowerName = name.toLowerCase();
  
  switch (category) {
    case 'Base':
      return {
        width: lowerName.includes('corner') ? 900 : 600,
        depth: 575,
        height: 870
      };
    case 'Wall':
      return {
        width: lowerName.includes('corner') ? 600 : 600,
        depth: 350,
        height: 720
      };
    case 'Tall':
      return {
        width: 600,
        depth: 580,
        height: 2100
      };
    case 'Accessory':
      return {
        width: 50,
        depth: 580,
        height: 870
      };
    default:
      return { width: 600, depth: 575, height: 870 };
  }
}

// Parse Excel XML (SpreadsheetML) format
function parseExcelXML(xmlContent: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  
  // Extract all rows from the Worksheet
  const rowRegex = /<Row[^>]*>([\s\S]*?)<\/Row>/g;
  const cellRegex = /<Cell[^>]*>[\s\S]*?<Data[^>]*>([\s\S]*?)<\/Data>[\s\S]*?<\/Cell>/g;
  
  let rowMatch;
  let headers: string[] = [];
  let isFirstRow = true;
  
  while ((rowMatch = rowRegex.exec(xmlContent)) !== null) {
    const rowContent = rowMatch[1];
    const cells: string[] = [];
    
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      cells.push(cellMatch[1].trim());
    }
    
    if (cells.length === 0) continue;
    
    if (isFirstRow) {
      headers = cells;
      isFirstRow = false;
    } else {
      const row: Record<string, string> = {};
      cells.forEach((cell, index) => {
        if (headers[index]) {
          row[headers[index]] = cell;
        }
      });
      if (Object.keys(row).length > 0) {
        rows.push(row);
      }
    }
  }
  
  console.log(`Parsed ${rows.length} rows from XML with headers: ${headers.slice(0, 10).join(', ')}...`);
  return rows;
}

serve(async (req) => {
  // Handle CORS preflight
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
      console.error('Missing required environment variables');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // 1) Verify caller identity (JWT)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired session' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = userData.user.id;

    // 2) Enforce admin-only access (backend-only)
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roleRow, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    if (roleError) {
      console.error('Role lookup error:', roleError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to verify permissions' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    if (!roleRow) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // 3) Parse body
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const { xmlContent } = body ?? {};
    if (!xmlContent || typeof xmlContent !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'No XML content provided' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Import requested by admin ${userId}. XML length: ${xmlContent.length}`);

    // Parse the Excel XML
    const rows = parseExcelXML(xmlContent);
    console.log(`Parsed ${rows.length} product rows`);

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No products found in XML file' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Transform rows into database records
    const products = rows
      .map((row) => {
        const name = row['Name'] || '';
        const linkId = row['LinkID'] || row['ID'] || '';

        if (!name || !linkId) return null;

        const category = detectCategory(name);
        const cabinetType = detectCabinetType(name);
        const { doors, drawers } = extractCounts(name);
        const lowerName = name.toLowerCase();

        const xmlWidth = parseFloat(row['Width'] || '0');
        const xmlDepth = parseFloat(row['Depth'] || '0');
        const xmlHeight = parseFloat(row['Height'] || '0');

        const defaults = getDefaultDimensions(category, name);

        return {
          microvellum_link_id: linkId,
          name,
          category,
          cabinet_type: cabinetType,
          default_width: xmlWidth > 0 ? xmlWidth : defaults.width,
          default_depth: xmlDepth > 0 ? xmlDepth : defaults.depth,
          default_height: xmlHeight > 0 ? xmlHeight : defaults.height,
          door_count: doors,
          drawer_count: drawers,
          is_corner: lowerName.includes('corner'),
          is_sink: lowerName.includes('sink'),
          is_blind: lowerName.includes('blind'),
          spec_group: row['ProductSpecGroupName'] || null,
          room_component_type: row['RoomComponentType'] || null,
          raw_metadata: row,
        };
      })
      .filter(Boolean);

    console.log(`Transformed ${products.length} valid products`);

    const { error: upsertError } = await adminClient
      .from('microvellum_products')
      .upsert(products, {
        onConflict: 'microvellum_link_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('Database error:', upsertError);
      return new Response(
        JSON.stringify({ success: false, error: `Database error: ${upsertError.message}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      );
    }

    // Get category counts
    const categoryCounts = products.reduce((acc: Record<string, number>, p: any) => {
      acc[p.category] = (acc[p.category] || 0) + 1;
      return acc;
    }, {});

    console.log('Import complete:', { total: products.length, categoryCounts });

    return new Response(
      JSON.stringify({
        success: true,
        imported: products.length,
        categoryCounts,
        message: `Successfully imported ${products.length} products`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Import error:', errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
