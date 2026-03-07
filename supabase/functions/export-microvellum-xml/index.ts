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

function mapCategoryForXml(category: string | null | undefined): 'Base' | 'Wall' | 'Tall' | 'Appliance' {
  const normalized = (category || '').toLowerCase();
  if (normalized === 'wall' || normalized === 'upper') return 'Wall';
  if (normalized === 'tall') return 'Tall';
  if (normalized === 'appliance' || normalized === 'appliances') return 'Appliance';
  return 'Base';
}

function cabinetParts(cabinet: PersistedCabinet, room: PersistedTradeRoom, finishName: string): Array<{ name: string; w: number; h: number; d: number; material: string }> {
  const dims = room.dimensions || {};
  const toeKick = numberValue(dims.toeKickHeight, 135);
  const shelfSetback = numberValue(dims.shelfSetback, 5);
  const doorGap = numberValue(dims.doorGap, 2);

  const width = numberValue(cabinet.dimensions?.width, 600);
  const depth = numberValue(cabinet.dimensions?.depth, 575);
  const height = numberValue(cabinet.dimensions?.height, 870);

  const sideHeight = cabinet.category === 'Base' ? Math.max(0, height - toeKick) : height;
  const sideDepth = depth;
  const internalWidth = Math.max(0, width - 36);
  const internalDepth = Math.max(0, depth - 18);

  const shelfCount = Math.max(0, numberValue(cabinet.accessories?.shelfCount, 1));
  const shelves = Array.from({ length: shelfCount }).map((_, idx) => ({
    name: `Shelf ${idx + 1}`,
    w: internalWidth,
    h: 16,
    d: Math.max(0, internalDepth - shelfSetback),
    material: cabinet.materials?.carcaseFinish || finishName,
  }));

  const parts = [
    { name: 'Side Left', w: sideDepth, h: sideHeight, d: 16, material: cabinet.materials?.carcaseFinish || finishName },
    { name: 'Side Right', w: sideDepth, h: sideHeight, d: 16, material: cabinet.materials?.carcaseFinish || finishName },
    { name: 'Bottom', w: internalWidth, h: internalDepth, d: 16, material: cabinet.materials?.carcaseFinish || finishName },
    { name: 'Top', w: internalWidth, h: internalDepth, d: 16, material: cabinet.materials?.carcaseFinish || finishName },
    { name: 'Back', w: internalWidth, h: sideHeight, d: 16, material: cabinet.materials?.carcaseFinish || finishName },
    ...shelves,
  ];

  const drawerCount = numberValue(cabinet.accessories?.dividers ? 1 : 0, 0);
  if (drawerCount === 0) {
    parts.push({
      name: 'Door',
      w: Math.max(0, width - doorGap),
      h: Math.max(0, sideHeight - doorGap),
      d: 18,
      material: cabinet.materials?.exteriorFinish || finishName,
    });
  }

  return parts;
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

    const warnings: string[] = [];
    const cabinetsXml: string[] = [];
    const hardwareSummary = new Map<string, { qty: number; description: string }>();

    tradeRooms.forEach((room, roomIndex) => {
      (room.cabinets || []).forEach((cabinet, cabinetIndex) => {
        const product = productById.get(cabinet.definitionId);

        if (!product) {
          warnings.push(`Missing product mapping for cabinet ${cabinet.cabinetNumber || cabinet.instanceId} (definitionId=${cabinet.definitionId}).`);
        } else {
          if (!product.microvellum_link_id) {
            warnings.push(`Product ${product.id} (${product.name}) missing microvellum_link_id.`);
          }
          if (!product.spec_group && !product.room_component_type) {
            warnings.push(`Product ${product.id} (${product.name}) missing spec_group and room_component_type metadata.`);
          }
        }

        const xmlCategory = product ? mapCategoryForXml(product.category) : cabinet.category;
        const width = numberValue(cabinet.dimensions?.width, numberValue(product?.default_width, 600));
        const depth = numberValue(cabinet.dimensions?.depth, numberValue(product?.default_depth, 575));
        const height = numberValue(cabinet.dimensions?.height, numberValue(product?.default_height, 870));
        const pos = cabinet.position || { x: 0, y: 0, z: 0, rotation: 0 };
        const finishName = cabinet.materials?.exteriorFinish || room.materialDefaults?.exteriorFinish || 'Designer White';
        const handleType = cabinet.hardware?.handleType || room.hardwareDefaults?.handleType || 'bar-handle';

        const parts = cabinetParts(cabinet, room, finishName)
          .map((part) => `          <Part name="${escapeXml(part.name)}" w="${Math.round(part.w)}" h="${Math.round(part.h)}" d="${Math.round(part.d)}" material="${escapeXml(part.material)}" />`)
          .join('\n');

        const cabinetNumber = cabinet.cabinetNumber || `R${roomIndex + 1}-C${cabinetIndex + 1}`;
        const xmlSku = product?.microvellum_link_id || cabinet.definitionId;

        cabinetsXml.push(`      <Cabinet>
        <RoomId>${escapeXml(room.id)}</RoomId>
        <RoomName>${escapeXml(room.name)}</RoomName>
        <CabinetNumber>${escapeXml(cabinetNumber)}</CabinetNumber>
        <DefinitionId>${escapeXml(cabinet.definitionId)}</DefinitionId>
        <SKU>${escapeXml(xmlSku)}</SKU>
        <ProductName>${escapeXml(product?.name || cabinet.productName)}</ProductName>
        <Type>${escapeXml(xmlCategory)}</Type>
        <CabinetType>${escapeXml(product?.cabinet_type || 'Standard')}</CabinetType>
        <SpecGroup>${escapeXml(product?.spec_group || '')}</SpecGroup>
        <RoomComponentType>${escapeXml(product?.room_component_type || '')}</RoomComponentType>
        <Width>${Math.round(width)}</Width>
        <Depth>${Math.round(depth)}</Depth>
        <Height>${Math.round(height)}</Height>
        <PositionX>${Math.round(numberValue(pos.x))}</PositionX>
        <PositionY>${Math.round(numberValue(pos.y))}</PositionY>
        <PositionZ>${Math.round(numberValue(pos.z))}</PositionZ>
        <Rotation>${Math.round(numberValue(pos.rotation))}</Rotation>
        <ExteriorFinish>${escapeXml(finishName)}</ExteriorFinish>
        <CarcaseFinish>${escapeXml(cabinet.materials?.carcaseFinish || room.materialDefaults?.carcaseFinish || finishName)}</CarcaseFinish>
        <DoorStyle>${escapeXml(cabinet.materials?.doorStyle || room.materialDefaults?.doorStyle || '')}</DoorStyle>
        <EdgeBanding>${escapeXml(cabinet.materials?.edgeBanding || room.materialDefaults?.edgeBanding || '')}</EdgeBanding>
        <HandleType>${escapeXml(handleType)}</HandleType>
        <HingeType>${escapeXml(cabinet.hardware?.hingeType || room.hardwareDefaults?.hingeType || '')}</HingeType>
        <DrawerType>${escapeXml(cabinet.hardware?.drawerType || room.hardwareDefaults?.drawerType || '')}</DrawerType>
        <SoftClose>${cabinet.hardware?.softClose ?? room.hardwareDefaults?.softClose ? 'Yes' : 'No'}</SoftClose>
        <Parts>
${parts}
        </Parts>
      </Cabinet>`);

        const hingeSku = `HINGE-${(cabinet.hardware?.hingeType || room.hardwareDefaults?.hingeType || 'std').toUpperCase()}`;
        const handleSku = `HANDLE-${(handleType || 'std').toUpperCase()}`;
        const hingeQty = xmlCategory === 'Tall' ? 6 : xmlCategory === 'Wall' ? 2 : 4;

        const existingHinge = hardwareSummary.get(hingeSku) || { qty: 0, description: `Hinge ${cabinet.hardware?.hingeType || room.hardwareDefaults?.hingeType || 'Standard'}` };
        existingHinge.qty += hingeQty;
        hardwareSummary.set(hingeSku, existingHinge);

        const existingHandle = hardwareSummary.get(handleSku) || { qty: 0, description: `Handle ${handleType}` };
        existingHandle.qty += 1;
        hardwareSummary.set(handleSku, existingHandle);
      });
    });

    const hardwareXml = Array.from(hardwareSummary.entries())
      .map(([sku, item]) => `      <Item sku="${escapeXml(sku)}" qty="${item.qty}" description="${escapeXml(item.description)}" />`)
      .join('\n');

    const roomXml = tradeRooms
      .map((room) => `      <Room id="${escapeXml(room.id)}">
        <Name>${escapeXml(room.name)}</Name>
        <Description>${escapeXml(room.description || '')}</Description>
        <Shape>${escapeXml(room.shape || 'rectangular')}</Shape>
        <Width>${Math.round(numberValue(room.config?.width, 4000))}</Width>
        <Depth>${Math.round(numberValue(room.config?.depth, 3000))}</Depth>
        <Height>${Math.round(numberValue(room.config?.height, 2400))}</Height>
      </Room>`)
      .join('\n');

    const quoteTotals = designData.jobTotals || {};

    const warningXml = warnings.length
      ? warnings.map((w) => `      <Warning>${escapeXml(w)}</Warning>`).join('\n')
      : '      <Warning>None</Warning>';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MicrovellumJob version="2.0">
  <JobInfo>
    <JobId>${escapeXml(job.id)}</JobId>
    <JobNumber>${job.job_number ?? 0}</JobNumber>
    <JobName>${escapeXml(job.name || '')}</JobName>
    <Status>${escapeXml(job.status || 'draft')}</Status>
    <Created>${escapeXml((job.created_at || '').split('T')[0] || '')}</Created>
    <Updated>${escapeXml((job.updated_at || '').split('T')[0] || '')}</Updated>
    <CustomerName>${escapeXml(job.profiles?.full_name || '')}</CustomerName>
    <CustomerEmail>${escapeXml(job.profiles?.email || '')}</CustomerEmail>
    <CustomerPhone>${escapeXml(job.profiles?.phone || '')}</CustomerPhone>
    <CompanyName>${escapeXml(job.profiles?.company_name || '')}</CompanyName>
    <DeliveryMethod>${escapeXml(job.delivery_method || '')}</DeliveryMethod>
    <Notes>${escapeXml(job.notes || '')}</Notes>
  </JobInfo>
  <Quote>
    <Subtotal>${numberValue(quoteTotals.subtotal, 0).toFixed(2)}</Subtotal>
    <Tax>${numberValue(quoteTotals.tax, 0).toFixed(2)}</Tax>
    <Total>${numberValue(quoteTotals.total, 0).toFixed(2)}</Total>
    <UpdatedAt>${escapeXml(quoteTotals.updatedAt || designData.quoteSnapshot?.capturedAt || '')}</UpdatedAt>
  </Quote>
  <Rooms>
${roomXml}
  </Rooms>
  <Cabinets>
${cabinetsXml.join('\n')}
  </Cabinets>
  <HardwareSummary>
${hardwareXml}
  </HardwareSummary>
  <Validation>
    <WarningCount>${warnings.length}</WarningCount>
${warningXml}
  </Validation>
</MicrovellumJob>`;

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
