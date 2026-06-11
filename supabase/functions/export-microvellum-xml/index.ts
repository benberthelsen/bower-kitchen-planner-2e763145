import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PersistedCabinet {
  instanceId: string;
  definitionId: string;
  cabinetNumber?: string;
  productName: string;
  category: 'Base' | 'Wall' | 'Tall' | 'Appliance';
  dimensions: { width: number; height: number; depth: number };
  materials?: { exteriorFinish?: string; carcaseFinish?: string; doorStyle?: string; edgeBanding?: string };
  hardware?: { handleType?: string; hingeType?: string; drawerType?: string; softClose?: boolean };
  accessories?: { shelfCount?: number; adjustableShelves?: boolean; dividers?: boolean; specialFittings?: string[] };
  /** Microvellum-style construction prompts (mirrors MV product prompt names) */
  construction?: {
    cabinetDepthLeft?: number;
    cabinetDepthRight?: number;
    toeKickHeight?: number;
    leftFillerWidth?: number;
    rightFillerWidth?: number;
    blindSide?: 'Left' | 'Right';
    hingeSide?: 'Left' | 'Right';
    frontType?: 'PieCut' | 'Angled';
  };
  position?: { x: number; y: number; z: number; rotation: number };
  isPlaced?: boolean;
}

interface PersistedTradeRoom {
  id: string;
  name: string;
  description?: string;
  shape?: string;
  config: { width: number; depth: number; height: number };
  dimensions?: {
    toeKickHeight?: number;
    baseHeight?: number;
    baseDepth?: number;
    wallHeight?: number;
    wallDepth?: number;
    tallHeight?: number;
    tallDepth?: number;
    benchtopThickness?: number;
    benchtopOverhang?: number;
    splashbackHeight?: number;
    shelfSetback?: number;
    doorGap?: number;
    drawerGap?: number;
  };
  materialDefaults?: { exteriorFinish?: string; carcaseFinish?: string; doorStyle?: string; edgeBanding?: string };
  hardwareDefaults?: { handleType?: string; hingeType?: string; drawerType?: string; softClose?: boolean };
  cabinets: PersistedCabinet[];
}

interface PersistedDesignData {
  tradeRooms?: PersistedTradeRoom[];
  quoteSnapshot?: { capturedAt?: string };
  jobTotals?: { subtotal?: number; tax?: number; total?: number; updatedAt?: string };
  /** Optional override for the MV specification group name */
  specificationGroup?: string;
}

interface MicrovellumProductRow {
  id: string;
  microvellum_link_id: string | null;
  name: string;
  category: string | null;
  cabinet_type: string | null;
  spec_group: string | null;
  room_component_type: string | null;
  default_width: number | null;
  default_depth: number | null;
  default_height: number | null;
  door_count: number | null;
  drawer_count: number | null;
  has_false_front: boolean | null;
  has_adjustable_shelves: boolean | null;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isCornerProduct(cabinet: PersistedCabinet, product?: MicrovellumProductRow | null): boolean {
  return /corner/i.test(product?.cabinet_type || '') || /corner|pie[-_ ]?cut|blind/i.test(cabinet.definitionId || '');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { jobId } = await req.json();
    if (!jobId || typeof jobId !== 'string') {
      throw new Error('Job ID is required');
    }

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        name,
        status,
        notes,
        created_at,
        updated_at,
        delivery_method,
        cost_excl_tax,
        cost_incl_tax,
        design_data,
        profiles:customer_id (
          full_name,
          email,
          phone,
          company_name
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobError) throw jobError;
    if (!job) throw new Error('Job not found');

    const designData = (job.design_data || {}) as PersistedDesignData;
    const tradeRooms = Array.isArray(designData.tradeRooms) ? designData.tradeRooms : [];
    if (tradeRooms.length === 0) {
      throw new Error('Job has no trade room data. Cannot export Microvellum XML.');
    }

    const allCabinets = tradeRooms.flatMap((room) => room.cabinets || []);
    const definitionIds = Array.from(new Set(allCabinets.map((cab) => cab.definitionId).filter(Boolean)));

    const productById = new Map<string, MicrovellumProductRow>();
    if (definitionIds.length > 0) {
      const { data: products, error: productError } = await supabase
        .from('microvellum_products')
        .select('id, microvellum_link_id, name, category, cabinet_type, spec_group, room_component_type, default_width, default_depth, default_height, door_count, drawer_count, has_false_front, has_adjustable_shelves')
        .in('id', definitionIds);

      if (productError) throw productError;
      (products || []).forEach((product) => {
        productById.set(product.id, product as MicrovellumProductRow);
      });
    }

    // ------------------------------------------------------------------
    // Microvellum XML Import format (Toolbox Setup > Import File).
    // Structure follows the official MV samples:
    //   <Root Application="Microvellum" ApplicationVersion="7.0">
    //     <Project> JobNumber/Category/... <SpecificationGroups> <Locations>
    //       <Walls><Wall><LinkID>... <Products><Product Name="{library name}">
    //         numeric Width/Height/Depth, ItemNumber, Angle, X/Y/ZOrigin,
    //         LinkIDSpecificationGroup, LinkIDLocation, LinkIDWall,
    //         <Prompts><Prompt Name="..."><Value>...</Value>
    // Rules honoured (per MV docs):
    // - Product Name must match the MV library product name (we use
    //   microvellum_products.name, which comes from the MV library import).
    // - Width/Height/Depth are numeric and live on the product element.
    // - Prompts that don't exist on a product are skipped by MV, so
    //   emitting extras is safe. Prompt names use Pascal_Case.
    // - LinkIDWall associates a product to its wall (pipe-separated pair
    //   for corner products spanning two walls).
    // Coordinates: mm, project origin at the room's back-left corner,
    // X along the back wall, Y toward the front of the room, angles CCW.
    // ------------------------------------------------------------------

    const warnings: string[] = [];
    const specGroupName = designData.specificationGroup || 'Metric Decorative Laminate';

    const locationsXml: string[] = [];
    const wallsXml: string[] = [];
    const productsXml: string[] = [];

    tradeRooms.forEach((room, roomIndex) => {
      const roomName = room.name || `Room ${roomIndex + 1}`;
      const roomW = numberValue(room.config?.width, 4000);
      const roomD = numberValue(room.config?.depth, 3000);
      const roomH = numberValue(room.config?.height, 2400);

      locationsXml.push(`      <Location Name="${escapeXml(roomName)}"></Location>`);

      // Four walls per room, CCW perimeter. LinkIDs referenced by products.
      const wallId = (n: number) => `WALL.R${roomIndex + 1}.${String(n).padStart(3, '0')}`;
      const wallDefs = [
        { n: 1, x: 0, y: 0, angle: 0, len: roomW },           // back
        { n: 2, x: roomW, y: 0, angle: 90, len: roomD },      // right
        { n: 3, x: roomW, y: roomD, angle: 180, len: roomW }, // front
        { n: 4, x: 0, y: roomD, angle: 270, len: roomD },     // left
      ];
      wallDefs.forEach((w) => {
        wallsXml.push(`      <Wall Name="Wall ${w.n}">
        <LinkID>${wallId(w.n)}</LinkID>
        <LinkIDLocation>${escapeXml(roomName)}</LinkIDLocation>
        <Width>${Math.round(w.len)}</Width>
        <Height>${Math.round(roomH)}</Height>
        <Depth>100</Depth>
        <XOrigin>${w.x}</XOrigin>
        <YOrigin>${w.y}</YOrigin>
        <ZOrigin>0</ZOrigin>
        <Angle>${w.angle}</Angle>
      </Wall>`);
      });

      // Wall LinkID by planner rotation (0 back, 90 right, 180 front, 270 left)
      const wallForRotation: Record<number, string> = {
        0: wallId(1),
        90: wallId(2),
        180: wallId(3),
        270: wallId(4),
      };
      // Corner cabinets span two walls (rotation encodes which corner)
      const cornerWalls: Record<number, string> = {
        0: `${wallId(1)}|${wallId(4)}`,   // back-left
        90: `${wallId(2)}|${wallId(1)}`,  // back-right
        180: `${wallId(3)}|${wallId(2)}`, // front-right
        270: `${wallId(4)}|${wallId(3)}`, // front-left
      };

      (room.cabinets || []).forEach((cabinet, cabinetIndex) => {
        const product = productById.get(cabinet.definitionId);

        if (!product) {
          warnings.push(`Missing product mapping for cabinet ${cabinet.cabinetNumber || cabinet.instanceId} (definitionId=${cabinet.definitionId}). The exported product name may not match the Microvellum library.`);
        }

        const width = numberValue(cabinet.dimensions?.width, numberValue(product?.default_width, 600));
        const depth = numberValue(cabinet.dimensions?.depth, numberValue(product?.default_depth, 575));
        const height = numberValue(cabinet.dimensions?.height, numberValue(product?.default_height, 870));
        const pos = cabinet.position || { x: 0, y: 0, z: 0, rotation: 0 };
        const rotation = ((Math.round(numberValue(pos.rotation)) % 360) + 360) % 360;
        const rightAngle = (Math.round(rotation / 90) * 90) % 360;

        // Convert centre-based planner position to MV product origin
        // (left-back corner of the product footprint, in project coords)
        const cx = numberValue(pos.x);
        const cz = numberValue(pos.z);
        let xOrigin: number;
        let yOrigin: number;
        switch (rightAngle) {
          case 90:
            xOrigin = cx + depth / 2;
            yOrigin = cz - width / 2;
            break;
          case 180:
            xOrigin = cx + width / 2;
            yOrigin = cz + depth / 2;
            break;
          case 270:
            xOrigin = cx - depth / 2;
            yOrigin = cz + width / 2;
            break;
          default:
            xOrigin = cx - width / 2;
            yOrigin = cz - depth / 2;
        }
        const zOrigin = cabinet.category === 'Wall'
          ? Math.round(numberValue(pos.y, 1350))
          : Math.round(numberValue(pos.y, 0));

        const corner = isCornerProduct(cabinet, product);
        const linkIdWall = corner
          ? cornerWalls[rightAngle] ?? wallForRotation[rightAngle] ?? wallId(1)
          : wallForRotation[rightAngle] ?? wallId(1);

        // Prompts — Pascal_Case names matching the MV library prompts.
        // MV skips prompts that don't exist on a product, so these are safe.
        const construction = cabinet.construction || {};
        const roomDims = room.dimensions || {};
        const promptLines: string[] = [];
        const addPrompt = (name: string, value: string | number) => {
          promptLines.push(`          <Prompt Name="${escapeXml(name)}">
            <Value>${escapeXml(String(value))}</Value>
          </Prompt>`);
        };

        addPrompt('Toe_Kick_Height', Math.round(numberValue(construction.toeKickHeight, numberValue(roomDims.toeKickHeight, 135))));
        if (corner) {
          addPrompt('Cabinet_Depth_Left', Math.round(numberValue(construction.cabinetDepthLeft, 575)));
          addPrompt('Cabinet_Depth_Right', Math.round(numberValue(construction.cabinetDepthRight, 575)));
        }
        if (numberValue(construction.leftFillerWidth, 0) > 0) {
          addPrompt('Left_Filler_Width', Math.round(numberValue(construction.leftFillerWidth, 0)));
        }
        if (numberValue(construction.rightFillerWidth, 0) > 0) {
          addPrompt('Right_Filler_Width', Math.round(numberValue(construction.rightFillerWidth, 0)));
        }
        if (construction.hingeSide) {
          addPrompt('Face_Options', construction.hingeSide === 'Right' ? 'Right Swing' : 'Left Swing');
        }
        const doorStyle = cabinet.materials?.doorStyle || room.materialDefaults?.doorStyle;
        if (doorStyle) {
          addPrompt('Door_Type', doorStyle);
        }

        const itemNumber = `${roomIndex + 1}.${String(cabinetIndex + 1).padStart(2, '0')}`;
        const productName = product?.name || cabinet.productName;
        const comment = cabinet.cabinetNumber ? `Planner ${cabinet.cabinetNumber}` : '';

        productsXml.push(`      <Product Name="${escapeXml(productName)}">
        <Quantity>1</Quantity>
        <Height>${Math.round(height)}</Height>
        <Width>${Math.round(width)}</Width>
        <Depth>${Math.round(depth)}</Depth>
        <ItemNumber>${escapeXml(itemNumber)}</ItemNumber>
        <Comment>${escapeXml(comment)}</Comment>
        <Angle>${rightAngle}</Angle>
        <XOrigin>${Math.round(xOrigin)}</XOrigin>
        <YOrigin>${Math.round(yOrigin)}</YOrigin>
        <ZOrigin>${zOrigin}</ZOrigin>
        <LinkIDSpecificationGroup>${escapeXml(specGroupName)}</LinkIDSpecificationGroup>
        <LinkIDLocation>${escapeXml(roomName)}</LinkIDLocation>
        <LinkIDWall>${linkIdWall}</LinkIDWall>
        <Prompts>
${promptLines.join('\n')}
        </Prompts>
      </Product>`);
      });
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Root Application="Microvellum" ApplicationVersion="7.0">
  <Project Name="${escapeXml(job.name || `Job ${job.job_number ?? ''}`)}">
    <JobDescription>${escapeXml(job.notes || 'Planner export')}</JobDescription>
    <JobNumber>${escapeXml(String(job.job_number ?? ''))}</JobNumber>
    <Category>Estimates</Category>
    <JobEmail>${escapeXml((job.profiles as Record<string, string> | null)?.email || '')}</JobEmail>
    <SpecificationGroups>
      <SpecificationGroup Name="${escapeXml(specGroupName)}">
      </SpecificationGroup>
    </SpecificationGroups>
    <Locations>
${locationsXml.join('\n')}
    </Locations>
    <Walls>
${wallsXml.join('\n')}
    </Walls>
    <Products>
${productsXml.join('\n')}
    </Products>
  </Project>
</Root>`;

    const filename = `Job_${job.job_number ?? 'NA'}_${(job.name || 'trade_job').replace(/\s+/g, '_')}`;

    return new Response(JSON.stringify({ xml, filename, warnings }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
