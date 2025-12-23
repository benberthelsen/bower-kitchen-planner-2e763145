import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { jobId } = await req.json();
    
    if (!jobId) {
      throw new Error('Job ID is required');
    }

    console.log('Exporting job:', jobId);

    // Fetch job with customer info
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        *,
        profiles:customer_id (
          full_name,
          email,
          phone,
          company_name
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobError) {
      console.error('Error fetching job:', jobError);
      throw jobError;
    }

    if (!job) {
      throw new Error('Job not found');
    }

    const designData = job.design_data || {};
    const cabinets = designData.items?.filter((i: any) => i.itemType === 'Cabinet') || [];
    const room = designData.room || {};
    const globalDims = designData.globalDimensions || {};
    const hardware = designData.hardwareOptions || {};
    const finish = designData.selectedFinish || {};

    // Generate XML
    const xml = generateMicrovellumXML({
      job,
      cabinets,
      room,
      globalDims,
      hardware,
      finish,
    });

    const filename = `Job_${job.job_number}_${job.name.replace(/\s+/g, '_')}`;

    console.log('XML generated successfully, length:', xml.length);

    return new Response(
      JSON.stringify({ xml, filename }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in export-microvellum-xml:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateMicrovellumXML(data: {
  job: any;
  cabinets: any[];
  room: any;
  globalDims: any;
  hardware: any;
  finish: any;
}): string {
  const { job, cabinets, room, globalDims, hardware, finish } = data;
  const createdDate = new Date(job.created_at).toISOString().split('T')[0];

  let cabinetXML = '';
  let hardwareItems: { sku: string; qty: number; desc: string }[] = [];

  cabinets.forEach((cab, index) => {
    const cabNum = cab.cabinetNumber || `C${String(index + 1).padStart(2, '0')}`;
    const category = cab.definitionId?.includes('wall-') ? 'Wall' 
      : cab.definitionId?.includes('tall-') ? 'Tall' : 'Base';
    
    // Calculate parts based on cabinet dimensions
    const parts = generateCabinetParts(cab, category, globalDims, finish);
    
    cabinetXML += `
    <Cabinet>
      <CabinetNumber>${escapeXml(cabNum)}</CabinetNumber>
      <Type>${category}</Type>
      <SKU>${escapeXml(cab.definitionId || '')}</SKU>
      <Width>${cab.width}</Width>
      <Depth>${cab.depth}</Depth>
      <Height>${cab.height}</Height>
      <PositionX>${Math.round(cab.x)}</PositionX>
      <PositionY>${Math.round(cab.y || 0)}</PositionY>
      <PositionZ>${Math.round(cab.z)}</PositionZ>
      <Rotation>${cab.rotation || 0}</Rotation>
      <Hinge>${cab.hinge || 'Left'}</Hinge>
      <Material>${escapeXml(finish.name || 'Designer White')}</Material>
      <Handle>${escapeXml(hardware.handleId || 'Bar Handle')}</Handle>
      <EndPanelLeft>${cab.endPanelLeft ? 'Yes' : 'No'}</EndPanelLeft>
      <EndPanelRight>${cab.endPanelRight ? 'Yes' : 'No'}</EndPanelRight>
      <FillerLeft>${cab.fillerLeft || 0}</FillerLeft>
      <FillerRight>${cab.fillerRight || 0}</FillerRight>
      <Parts>
${parts.map(p => `        <Part name="${escapeXml(p.name)}" w="${p.w}" h="${p.h}" d="${p.d}" material="${escapeXml(p.material)}" />`).join('\n')}
      </Parts>
    </Cabinet>`;

    // Count hardware
    if (cab.hinge) {
      const hingeCount = category === 'Tall' ? 6 : category === 'Wall' ? 2 : 4;
      addHardware(hardwareItems, 'HINGE-BLUM-SC', hingeCount, 'Blum Soft Close Hinge');
    }
    addHardware(hardwareItems, 'HANDLE-STD', 1, 'Standard Handle');
  });

  // Build hardware XML
  const hardwareXML = hardwareItems.map(h => 
    `    <Item sku="${escapeXml(h.sku)}" qty="${h.qty}" description="${escapeXml(h.desc)}" />`
  ).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<MicrovellumJob version="1.0">
  <JobInfo>
    <JobNumber>${job.job_number}</JobNumber>
    <JobName>${escapeXml(job.name)}</JobName>
    <CustomerName>${escapeXml(job.profiles?.full_name || 'Unknown')}</CustomerName>
    <CustomerEmail>${escapeXml(job.profiles?.email || '')}</CustomerEmail>
    <CustomerPhone>${escapeXml(job.profiles?.phone || '')}</CustomerPhone>
    <CompanyName>${escapeXml(job.profiles?.company_name || '')}</CompanyName>
    <Status>${escapeXml(job.status)}</Status>
    <DeliveryMethod>${escapeXml(job.delivery_method)}</DeliveryMethod>
    <CostExclTax>${job.cost_excl_tax || 0}</CostExclTax>
    <CostInclTax>${job.cost_incl_tax || 0}</CostInclTax>
    <Created>${createdDate}</Created>
    <Notes>${escapeXml(job.notes || '')}</Notes>
  </JobInfo>
  
  <RoomConfig>
    <Width>${room.width || 4000}</Width>
    <Depth>${room.depth || 3000}</Depth>
    <Height>${room.height || 2400}</Height>
    <Shape>${room.shape || 'Rectangle'}</Shape>
  </RoomConfig>
  
  <GlobalDimensions>
    <ToeKickHeight>${globalDims.toeKickHeight || 135}</ToeKickHeight>
    <BaseHeight>${globalDims.baseHeight || 730}</BaseHeight>
    <BaseDepth>${globalDims.baseDepth || 575}</BaseDepth>
    <WallHeight>${globalDims.wallHeight || 720}</WallHeight>
    <WallDepth>${globalDims.wallDepth || 350}</WallDepth>
    <TallHeight>${globalDims.tallHeight || 2100}</TallHeight>
    <TallDepth>${globalDims.tallDepth || 580}</TallDepth>
    <BenchtopThickness>${globalDims.benchtopThickness || 33}</BenchtopThickness>
    <BenchtopOverhang>${globalDims.benchtopOverhang || 25}</BenchtopOverhang>
    <SplashbackHeight>${globalDims.splashbackHeight || 600}</SplashbackHeight>
  </GlobalDimensions>
  
  <Materials>
    <CabinetFinish id="${escapeXml(finish.id || '')}">${escapeXml(finish.name || 'Designer White')}</CabinetFinish>
    <FinishColor>${escapeXml(finish.hex || '#fcfcfc')}</FinishColor>
  </Materials>
  
  <Hardware>
    <HingeType>${escapeXml(hardware.hingeType || 'Blum Inserta Soft Close')}</HingeType>
    <DrawerType>${escapeXml(hardware.drawerType || 'Hafele Alto Slim')}</DrawerType>
    <HandleId>${escapeXml(hardware.handleId || 'handle-bar-ss')}</HandleId>
    <SupplyHardware>${hardware.supplyHardware !== false ? 'Yes' : 'No'}</SupplyHardware>
    <AdjustableLegs>${hardware.adjustableLegs !== false ? 'Yes' : 'No'}</AdjustableLegs>
  </Hardware>
  
  <Cabinets count="${cabinets.length}">${cabinetXML}
  </Cabinets>
  
  <HardwareList>
${hardwareXML}
  </HardwareList>
</MicrovellumJob>`;
}

function generateCabinetParts(cab: any, category: string, globalDims: any, finish: any): any[] {
  const parts: any[] = [];
  const material = finish.name || '18mm White Melamine';
  const backingMaterial = '3mm White Backing';
  
  const panelThickness = 18;
  const internalWidth = cab.width - (panelThickness * 2);
  const internalDepth = cab.depth - 3; // Back panel
  
  // Calculate panel heights based on category
  let panelHeight = cab.height;
  if (category === 'Base') {
    panelHeight = cab.height - (globalDims.toeKickHeight || 135);
  }

  // Left Panel
  parts.push({ name: 'Left Panel', w: cab.depth, h: panelHeight, d: panelThickness, material });
  
  // Right Panel
  parts.push({ name: 'Right Panel', w: cab.depth, h: panelHeight, d: panelThickness, material });
  
  // Bottom
  parts.push({ name: 'Bottom', w: internalWidth, h: internalDepth, d: panelThickness, material });
  
  // Top (for wall and tall cabinets)
  if (category !== 'Base') {
    parts.push({ name: 'Top', w: internalWidth, h: internalDepth, d: panelThickness, material });
  }
  
  // Back
  parts.push({ name: 'Back', w: cab.width, h: panelHeight, d: 3, material: backingMaterial });
  
  // Door(s)
  const doorGap = globalDims.doorGap || 2;
  const doorWidth = cab.width - (doorGap * 2);
  const doorHeight = panelHeight - (doorGap * 2);
  
  if (cab.definitionId?.includes('2d') || cab.definitionId?.includes('2D')) {
    // Two doors
    parts.push({ name: 'Left Door', w: (doorWidth / 2) - 1, h: doorHeight, d: panelThickness, material });
    parts.push({ name: 'Right Door', w: (doorWidth / 2) - 1, h: doorHeight, d: panelThickness, material });
  } else if (!cab.definitionId?.includes('dr')) {
    // Single door (not drawers)
    parts.push({ name: 'Door', w: doorWidth, h: doorHeight, d: panelThickness, material });
  }
  
  // Shelves (1-2 depending on height)
  const shelfCount = category === 'Tall' ? 4 : category === 'Wall' ? 2 : 1;
  for (let i = 0; i < shelfCount; i++) {
    parts.push({ 
      name: `Shelf ${i + 1}`, 
      w: internalWidth - 10, 
      h: internalDepth - (globalDims.shelfSetback || 5), 
      d: panelThickness, 
      material 
    });
  }
  
  return parts;
}

function addHardware(items: any[], sku: string, qty: number, desc: string) {
  const existing = items.find(i => i.sku === sku);
  if (existing) {
    existing.qty += qty;
  } else {
    items.push({ sku, qty, desc });
  }
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}