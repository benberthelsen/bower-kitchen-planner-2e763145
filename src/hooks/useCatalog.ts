import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { CatalogItemDefinition, ItemType, CabinetType } from '@/types';
import { CabinetRenderConfig, parseProductToRenderConfig } from '@/types/cabinetConfig';

export type UserType = 'standard' | 'trade' | 'admin';

interface MicrovellumProduct {
  id: string;
  microvellum_link_id: string | null;
  name: string;
  category: string | null;
  cabinet_type: string | null;
  default_width: number | null;
  default_depth: number | null;
  default_height: number | null;
  door_count: number | null;
  drawer_count: number | null;
  is_corner: boolean | null;
  is_sink: boolean | null;
  is_blind: boolean | null;
  spec_group: string | null;
  room_component_type: string | null;
  visible_to_standard: boolean | null;
  visible_to_trade: boolean | null;
  featured: boolean | null;
  display_order: number | null;
  // Columns from migration
  has_false_front: boolean | null;
  has_adjustable_shelves: boolean | null;
  corner_type: string | null;
  // Corner dimension columns
  left_arm_depth: number | null;
  right_arm_depth: number | null;
  blind_depth: number | null;
  filler_width: number | null;
  return_filler: boolean | null;
  // DXF geometry columns
  thumbnail_svg: string | null;
  front_geometry: object | null;
  has_dxf_geometry: boolean | null;
}

interface StaticCatalogTemplate {
  id: string;
  name: string;
  specGroup: string;
}

// Extended catalog definition with render config
export interface ExtendedCatalogItem extends CatalogItemDefinition {
  renderConfig: CabinetRenderConfig;
  microvellumProduct?: MicrovellumProduct;
  specGroup?: string | null;
  displayOrder?: number | null;
  microvellumLinkId?: string | null;
}

function mapCategoryToItemType(category: string | null, specGroup: string | null): ItemType {
  // Check specGroup first for more accurate mapping
  if (specGroup) {
    const lowerGroup = specGroup.toLowerCase();
    if (lowerGroup.includes('appliance')) return 'Appliance';
  }
  
  if (!category) return 'Cabinet';
  const lower = category.toLowerCase();
  if (lower === 'appliance' || lower === 'appliances') return 'Appliance';
  if (lower === 'accessory' || lower === 'accessories') return 'Structure';
  return 'Cabinet';
}

function mapCategoryToCabinetType(category: string | null, specGroup: string | null): CabinetType | undefined {
  // Use specGroup for more accurate mapping
  if (specGroup) {
    const lowerGroup = specGroup.toLowerCase();
    if (lowerGroup.includes('upper') || lowerGroup.includes('wall')) return 'Wall';
    if (lowerGroup.includes('tall')) return 'Tall';
    if (lowerGroup.includes('base') || lowerGroup.includes('sink')) return 'Base';
  }
  
  if (!category) return 'Base';
  const lower = category.toLowerCase();
  if (lower === 'base') return 'Base';
  if (lower === 'wall' || lower === 'upper') return 'Wall';
  if (lower === 'tall') return 'Tall';
  return undefined;
}

function generateSku(product: MicrovellumProduct): string {
  const category = product.category?.charAt(0).toUpperCase() || 'B';
  const width = product.default_width || 600;
  const doors = product.door_count || 0;
  const drawers = product.drawer_count || 0;
  
  let suffix = '';
  if (drawers > 0) suffix = `${drawers}Dr`;
  else if (doors > 0) suffix = `${doors}D`;
  else if (product.is_corner) suffix = 'C';
  else if (product.is_sink) suffix = 'S';
  else if (product.is_blind) suffix = 'BL';
  
  return `${category}${width}${suffix ? '-' + suffix : ''}`;
}

function transformToDefinition(product: MicrovellumProduct): ExtendedCatalogItem {
  const itemType = mapCategoryToItemType(product.category, product.spec_group);
  const category = mapCategoryToCabinetType(product.category, product.spec_group);
  
  // Default dimensions based on category
  const defaultWidth = product.default_width || 600;
  let defaultDepth = product.default_depth || 575;
  let defaultHeight = product.default_height || 870;
  
  if (category === 'Wall') {
    defaultDepth = product.default_depth || 350;
    defaultHeight = product.default_height || 720;
  } else if (category === 'Tall') {
    defaultDepth = product.default_depth || 580;
    defaultHeight = product.default_height || 2100;
  }
  
  // Generate render config from Microvellum metadata
  const renderConfig = parseProductToRenderConfig(product);
  
  return {
    id: product.id,
    sku: generateSku(product),
    name: product.name,
    itemType,
    category,
    defaultWidth,
    defaultDepth,
    defaultHeight,
    price: 0, // Pricing comes from BOM calculation
    renderConfig,
    microvellumProduct: product,
    specGroup: product.spec_group,
    displayOrder: product.display_order,
    microvellumLinkId: product.microvellum_link_id,
  };
}

function inferStaticDimensions(specGroup: string, id: string): { width: number; depth: number; height: number; category: 'Base' | 'Wall' | 'Tall' | 'Accessory' } {
  const lowerSpecGroup = specGroup.toLowerCase();
  const lowerId = id.toLowerCase();

  if (lowerSpecGroup.includes('wall')) {
    return { width: 600, depth: 350, height: 720, category: 'Wall' };
  }

  if (lowerSpecGroup.includes('tall')) {
    return { width: 600, depth: 580, height: 2100, category: 'Tall' };
  }

  if (lowerSpecGroup.includes('panel') || lowerSpecGroup.includes('filler')) {
    return { width: 100, depth: 18, height: 870, category: 'Accessory' };
  }

  if (lowerSpecGroup.includes('kick') || lowerSpecGroup.includes('trim')) {
    return { width: 2400, depth: 16, height: 135, category: 'Accessory' };
  }

  if (lowerSpecGroup.includes('appliance')) {
    if (lowerId.includes('fridge')) return { width: 900, depth: 650, height: 2100, category: 'Tall' };
    if (lowerId.includes('dishwasher')) return { width: 600, depth: 580, height: 870, category: 'Base' };
    if (lowerId.includes('range')) return { width: 900, depth: 650, height: 900, category: 'Base' };
    if (lowerId.includes('microwave')) return { width: 600, depth: 580, height: 450, category: 'Wall' };
    return { width: 600, depth: 580, height: 870, category: 'Base' };
  }

  if (lowerId.includes('corner') || lowerId.includes('diagonal')) {
    return { width: 900, depth: 900, height: 870, category: 'Base' };
  }

  return { width: 600, depth: 575, height: 870, category: 'Base' };
}

function inferStaticMetadata(item: StaticCatalogTemplate) {
  const nameLower = item.name.toLowerCase();
  const idLower = item.id.toLowerCase();
  const dims = inferStaticDimensions(item.specGroup, item.id);

  const doorCount = (() => {
    if (idLower.includes('1_door')) return 1;
    if (idLower.includes('2_door')) return 2;
    if (idLower.includes('3_door')) return 3;
    // Open shelves/units — no door regardless of category
    if (idLower.includes('open_') || idLower.includes('_open_') || idLower.includes('_open')) return 0;
    if (nameLower.includes('open shelf') || nameLower.includes('open unit') || nameLower.match(/\bopen\b/) && !nameLower.includes('opening')) return 0;
    if (idLower.includes('drawer') && !idLower.includes('door')) return 0;
    if (idLower.includes('opening')) return 0;
    if (idLower.includes('bin_pullout') || idLower.includes('spice_pullout') || idLower.includes('bottle_pullout') || idLower.includes('tray')) return 1;
    if (dims.category === 'Wall') return 2;
    if (dims.category === 'Tall') return 2;
    return 2;
  })();

  const drawerCount = (() => {
    if (idLower.includes('4_drawer')) return 4;
    if (idLower.includes('3_drawer')) return 3;
    if (idLower.includes('2_drawer')) return 2;
    if (idLower.includes('1_drawer')) return 1;
    return 0;
  })();

  const isCorner = idLower.includes('corner');
  const isBlind = idLower.includes('blind');
  const isSink = idLower.includes('sink');
  const isDishwasher = idLower.includes('dishwasher');
  const isRangehood = idLower.includes('rangehood');
  const isFridge = idLower.includes('fridge');
  const isOven = idLower.includes('oven');
  const isMicrowave = idLower.includes('microwave');

  const productType = item.specGroup === 'Appliance Openings'
    ? ('appliance' as const)
    : item.specGroup === 'Panels' || item.specGroup === 'Fillers' || item.specGroup === 'Kicks and Trim'
      ? ('panel' as const)
      : ('cabinet' as const);

  const itemType: ItemType = item.specGroup === 'Appliance Openings' || isDishwasher || isRangehood
    ? 'Appliance'
    : item.specGroup === 'Panels' || item.specGroup === 'Fillers' || item.specGroup === 'Kicks and Trim'
      ? 'Structure'
      : 'Cabinet';

  const category = dims.category === 'Accessory' ? undefined : dims.category;

  return {
    dims,
    doorCount,
    drawerCount,
    isCorner,
    isBlind,
    isSink,
    isDishwasher,
    isRangehood,
    isFridge,
    isOven,
    isMicrowave,
    productType,
    itemType,
    category,
    nameLower,
  };
}

function transformStaticTemplate(item: StaticCatalogTemplate): ExtendedCatalogItem {
  const meta = inferStaticMetadata(item);

  return {
    id: item.id,
    sku: item.id.toUpperCase(),
    name: item.name,
    itemType: meta.itemType,
    category: meta.category,
    defaultWidth: meta.dims.width,
    defaultDepth: meta.dims.depth,
    defaultHeight: meta.dims.height,
    price: 0,
    specGroup: item.specGroup,
    displayOrder: null,
    microvellumLinkId: item.id,
    renderConfig: {
      productId: item.id,
      productName: item.name,
      category: meta.category || 'Accessory',
      cabinetType: meta.drawerCount > 0 ? 'Drawer' : meta.isCorner ? 'Corner' : 'Standard',
      productType: meta.productType,
      specGroup: item.specGroup,
      doorCount: meta.doorCount,
      drawerCount: meta.drawerCount,
      isCorner: meta.isCorner,
      isSink: meta.isSink,
      isBlind: meta.isBlind,
      isPantry: item.specGroup === 'Tall Cabinets' && (meta.nameLower.includes('pantry') || meta.nameLower.includes('broom') || meta.nameLower.includes('coffee')),
      isAppliance: item.specGroup === 'Appliance Openings' || meta.isDishwasher || meta.isRangehood || meta.isFridge || meta.isOven || meta.isMicrowave,
      isOven: meta.isOven,
      isFridge: meta.isFridge,
      isRangehood: meta.isRangehood,
      isDishwasher: meta.isDishwasher,
      hasFalseFront: item.id.includes('false_front'),
      hasAdjustableShelves: meta.drawerCount === 0 && !meta.isSink && !meta.isDishwasher,
      shelfCount: meta.category === 'Tall' ? 5 : meta.category === 'Wall' ? 2 : 1,
      cornerType: meta.isBlind ? 'blind' : item.id.includes('diagonal') ? 'diagonal' : meta.isCorner ? 'l-shape' : null,
      // Corner arm depth = the standard carcase depth of the adjoining run
      // (NOT the corner cabinet's own footprint depth — that would make the
      // pie-cut notch zero and render the cabinet as a solid box).
      // Matches Microvellum's Base Corner Cabinet: 900-1000 square footprint
      // with Cabinet Depth Left/Right ≈ 555-575.
      leftArmDepth: meta.category === 'Wall' ? 350 : 575,
      rightArmDepth: meta.category === 'Wall' ? 350 : 575,
      blindDepth: meta.isBlind ? 300 : 150,
      fillerWidth: meta.isBlind ? 75 : 0,
      hasReturnFiller: meta.isBlind,
      defaultWidth: meta.dims.width,
      defaultHeight: meta.dims.height,
      defaultDepth: meta.dims.depth,
    },
  };
}

const STATIC_LIBRARY_TEMPLATES: StaticCatalogTemplate[] = [
  { specGroup: 'Base Cabinets', id: 'base_1_door', name: 'Base 1 Door' },
  { specGroup: 'Base Cabinets', id: 'base_2_door', name: 'Base 2 Door' },
  { specGroup: 'Base Cabinets', id: 'base_3_drawer', name: 'Base 3 Drawer' },
  { specGroup: 'Base Cabinets', id: 'base_4_drawer', name: 'Base 4 Drawer' },
  { specGroup: 'Base Cabinets', id: 'base_1_door_1_drawer', name: 'Base 1 Door 1 Drawer' },
  { specGroup: 'Base Cabinets', id: 'base_2_door_1_drawer', name: 'Base 2 Door 1 Drawer' },
  { specGroup: 'Base Cabinets', id: 'open_base', name: 'Open Base' },
  { specGroup: 'Base Cabinets', id: 'sink_base_1_door', name: 'Sink Base 1 Door' },
  { specGroup: 'Base Cabinets', id: 'sink_base_2_door', name: 'Sink Base 2 Door' },
  { specGroup: 'Base Cabinets', id: 'base_bin_pullout', name: 'Base Bin Pullout' },
  { specGroup: 'Base Cabinets', id: 'base_spice_pullout', name: 'Base Spice Pullout' },
  { specGroup: 'Base Cabinets', id: 'base_bottle_pullout', name: 'Base Bottle Pullout' },
  { specGroup: 'Base Cabinets', id: 'base_tray', name: 'Base Tray' },
  { specGroup: 'Base Cabinets', id: 'base_microwave', name: 'Base Microwave' },
  { specGroup: 'Base Cabinets', id: 'base_oven', name: 'Base Oven' },
  { specGroup: 'Base Cabinets', id: 'dishwasher_opening', name: 'Dishwasher Opening' },
  { specGroup: 'Corner Base Cabinets', id: 'base_corner_pie_cut_2_door', name: '2 Door Pie Cut Corner Base' },
  { specGroup: 'Corner Base Cabinets', id: 'base_corner_blind_left', name: 'Blind Corner Base Left' },
  { specGroup: 'Corner Base Cabinets', id: 'base_corner_blind_right', name: 'Blind Corner Base Right' },
  { specGroup: 'Corner Base Cabinets', id: 'base_corner_diagonal', name: 'Diagonal Corner Base' },
  { specGroup: 'Wall Cabinets', id: 'wall_1_door', name: 'Wall 1 Door' },
  { specGroup: 'Wall Cabinets', id: 'wall_2_door', name: 'Wall 2 Door' },
  { specGroup: 'Wall Cabinets', id: 'wall_3_door', name: 'Wall 3 Door' },
  { specGroup: 'Wall Cabinets', id: 'open_wall', name: 'Open Wall' },
  { specGroup: 'Wall Cabinets', id: 'glass_wall_1_door', name: 'Glass Wall 1 Door' },
  { specGroup: 'Wall Cabinets', id: 'glass_wall_2_door', name: 'Glass Wall 2 Door' },
  { specGroup: 'Wall Cabinets', id: 'wall_microwave', name: 'Wall Microwave' },
  { specGroup: 'Wall Cabinets', id: 'wall_rangehood', name: 'Wall Rangehood' },
  { specGroup: 'Wall Cabinets', id: 'wall_plate_rack', name: 'Wall Plate Rack' },
  { specGroup: 'Wall Cabinets', id: 'wall_wine', name: 'Wall Wine' },
  { specGroup: 'Wall Cabinets', id: 'fridge_top_cabinet', name: 'Fridge Top Cabinet' },
  { specGroup: 'Corner Wall Cabinets', id: 'wall_corner_blind_left', name: 'Blind Corner Wall Left' },
  { specGroup: 'Corner Wall Cabinets', id: 'wall_corner_blind_right', name: 'Blind Corner Wall Right' },
  { specGroup: 'Corner Wall Cabinets', id: 'wall_corner_diagonal', name: 'Diagonal Corner Wall' },
  { specGroup: 'Corner Wall Cabinets', id: 'open_corner_wall', name: 'Open Corner Wall' },
  { specGroup: 'Tall Cabinets', id: 'tall_1_door_pantry', name: 'Tall 1 Door Pantry' },
  { specGroup: 'Tall Cabinets', id: 'tall_2_door_pantry', name: 'Tall 2 Door Pantry' },
  { specGroup: 'Tall Cabinets', id: 'tall_2_door_pantry_2_drawer', name: 'Tall 2 Door Pantry 2 Drawer' },
  { specGroup: 'Tall Cabinets', id: 'open_tall', name: 'Open Tall' },
  { specGroup: 'Tall Cabinets', id: 'tall_broom', name: 'Tall Broom' },
  { specGroup: 'Tall Cabinets', id: 'tall_oven', name: 'Tall Oven' },
  { specGroup: 'Tall Cabinets', id: 'tall_oven_microwave', name: 'Tall Oven Microwave' },
  { specGroup: 'Tall Cabinets', id: 'tall_fridge', name: 'Tall Fridge' },
  { specGroup: 'Tall Cabinets', id: 'tall_coffee', name: 'Tall Coffee' },
  { specGroup: 'Panels', id: 'tall_applied_panel', name: 'Tall Applied Panel' },
  { specGroup: 'Panels', id: 'base_applied_panel', name: 'Base Applied Panel' },
  { specGroup: 'Panels', id: 'wall_applied_panel', name: 'Wall Applied Panel' },
  { specGroup: 'Panels', id: 'fridge_side_panel', name: 'Fridge Side Panel' },
  { specGroup: 'Panels', id: 'island_end_panel', name: 'Island End Panel' },
  { specGroup: 'Panels', id: 'finished_end_panel', name: 'Finished End Panel' },
  { specGroup: 'Fillers', id: 'base_filler', name: 'Base Filler' },
  { specGroup: 'Fillers', id: 'wall_filler', name: 'Wall Filler' },
  { specGroup: 'Fillers', id: 'tall_filler', name: 'Tall Filler' },
  { specGroup: 'Fillers', id: 'scribe_filler', name: 'Scribe Filler' },
  { specGroup: 'Fillers', id: 'corner_filler', name: 'Corner Filler' },
  { specGroup: 'Kicks and Trim', id: 'base_kick', name: 'Base Kick' },
  { specGroup: 'Kicks and Trim', id: 'return_kick', name: 'Return Kick' },
  { specGroup: 'Kicks and Trim', id: 'light_rail', name: 'Light Rail' },
  { specGroup: 'Kicks and Trim', id: 'top_rail', name: 'Top Rail' },
  { specGroup: 'Appliance Openings', id: 'fridge_opening', name: 'Fridge Opening' },
  { specGroup: 'Appliance Openings', id: 'dishwasher_opening_only', name: 'Dishwasher Opening Only' },
  { specGroup: 'Appliance Openings', id: 'range_opening', name: 'Range Opening' },
  { specGroup: 'Appliance Openings', id: 'microwave_opening', name: 'Microwave Opening' },
];

const STATIC_LIBRARY_CATALOG: ExtendedCatalogItem[] = STATIC_LIBRARY_TEMPLATES.map(transformStaticTemplate);

// Minimal fallback catalog for offline/error cases
const FALLBACK_CATALOG: ExtendedCatalogItem[] = [
  {
    id: 'fallback-base-600',
    sku: 'B600-1D',
    name: 'Base Cabinet 600',
    itemType: 'Cabinet',
    category: 'Base',
    defaultWidth: 600,
    defaultDepth: 575,
    defaultHeight: 870,
    price: 0,
    renderConfig: {
      productId: 'fallback-base-600',
      productName: 'Base Cabinet 600',
      category: 'Base',
      cabinetType: 'Standard',
      productType: 'cabinet' as const,
      specGroup: 'Base Cabinets',
      doorCount: 1,
      drawerCount: 0,
      isCorner: false,
      isSink: false,
      isBlind: false,
      isPantry: false,
      isAppliance: false,
      isOven: false,
      isFridge: false,
      isRangehood: false,
      isDishwasher: false,
      hasFalseFront: false,
      hasAdjustableShelves: true,
      shelfCount: 1,
      cornerType: null,
      leftArmDepth: 575,
      rightArmDepth: 575,
      blindDepth: 150,
      fillerWidth: 75,
      hasReturnFiller: false,
      defaultWidth: 600,
      defaultHeight: 870,
      defaultDepth: 575,
    },
  },
  {
    id: 'fallback-wall-600',
    sku: 'W600-2D',
    name: 'Wall Cabinet 600',
    itemType: 'Cabinet',
    category: 'Wall',
    defaultWidth: 600,
    defaultDepth: 350,
    defaultHeight: 720,
    price: 0,
    renderConfig: {
      productId: 'fallback-wall-600',
      productName: 'Wall Cabinet 600',
      category: 'Wall',
      cabinetType: 'Standard',
      productType: 'cabinet' as const,
      specGroup: 'Upper Cabinets',
      doorCount: 2,
      drawerCount: 0,
      isCorner: false,
      isSink: false,
      isBlind: false,
      isPantry: false,
      isAppliance: false,
      isOven: false,
      isFridge: false,
      isRangehood: false,
      isDishwasher: false,
      hasFalseFront: false,
      hasAdjustableShelves: true,
      shelfCount: 2,
      cornerType: null,
      leftArmDepth: 350,
      rightArmDepth: 350,
      blindDepth: 150,
      fillerWidth: 75,
      hasReturnFiller: false,
      defaultWidth: 600,
      defaultHeight: 720,
      defaultDepth: 350,
    },
  },
  {
    id: 'fallback-tall-600',
    sku: 'T600-2D',
    name: 'Tall Cabinet 600',
    itemType: 'Cabinet',
    category: 'Tall',
    defaultWidth: 600,
    defaultDepth: 580,
    defaultHeight: 2100,
    price: 0,
    renderConfig: {
      productId: 'fallback-tall-600',
      productName: 'Tall Cabinet 600',
      category: 'Tall',
      cabinetType: 'Standard',
      productType: 'cabinet' as const,
      specGroup: 'Tall Cabinets',
      doorCount: 2,
      drawerCount: 0,
      isCorner: false,
      isSink: false,
      isBlind: false,
      isPantry: true,
      isAppliance: false,
      isOven: false,
      isFridge: false,
      isRangehood: false,
      isDishwasher: false,
      hasFalseFront: false,
      hasAdjustableShelves: true,
      shelfCount: 5,
      cornerType: null,
      leftArmDepth: 580,
      rightArmDepth: 580,
      blindDepth: 150,
      fillerWidth: 75,
      hasReturnFiller: false,
      defaultWidth: 600,
      defaultHeight: 2100,
      defaultDepth: 580,
    },
  },
];

export function useCatalog(userType: UserType = 'standard') {
  const { data: dbProducts, isLoading, error, refetch } = useQuery({
    queryKey: ['microvellum-catalog', userType],
    queryFn: async () => {
      let query = supabase
        .from('microvellum_products')
        .select('*');
      
      // Apply visibility filters based on user type
      if (userType === 'standard') {
        // Standard users see only featured products for a simpler experience
        query = query
          .eq('visible_to_standard', true)
          .eq('featured', true)
          .order('display_order', { ascending: true })
          .order('name', { ascending: true });
      } else if (userType === 'trade') {
        query = query
          .eq('visible_to_trade', true)
          .order('display_order', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true });
      } else {
        // Admin sees everything
        query = query
          .order('display_order', { ascending: true, nullsFirst: false })
          .order('name', { ascending: true });
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as MicrovellumProduct[];
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Transform DB products to catalog format with render configs.
  // IMPORTANT: memoised so the catalog keeps a STABLE identity across renders.
  // Without this, every render rebuilds the array (and every item object), so
  // useCatalogItem() returns a brand-new object each render. That made the
  // ProductConfigurator reset-effect fire on every render and overwrite the
  // user's in-progress edits — i.e. sliders / materials / soft-close "not working".
  const isDynamic = (dbProducts?.length ?? 0) > 0;

  const catalog = useMemo<ExtendedCatalogItem[]>(() => {
    const dynamicCatalog: ExtendedCatalogItem[] = dbProducts?.map(transformToDefinition) || [];
    if (dynamicCatalog.length > 0) {
      // Prefer dynamic products, keeping static planner defs that aren't in the DB.
      return [
        ...dynamicCatalog,
        ...STATIC_LIBRARY_CATALOG.filter((staticItem) => !dynamicCatalog.some((dynamicItem) => dynamicItem.id === staticItem.id)),
      ];
    }
    return [...STATIC_LIBRARY_CATALOG, ...FALLBACK_CATALOG].filter((item, index, all) =>
      all.findIndex((candidate) => candidate.id === item.id) === index
    );
  }, [dbProducts]);

  // Group by category for sidebar display
  const groupedCatalog = useMemo(() => ({
    Base: catalog.filter(item => item.category === 'Base'),
    Wall: catalog.filter(item => item.category === 'Wall'),
    Tall: catalog.filter(item => item.category === 'Tall'),
    Appliance: catalog.filter(item => item.itemType === 'Appliance'),
    Structure: catalog.filter(item => item.itemType === 'Structure' || item.itemType === 'Wall'),
  }), [catalog]);

  // Group by spec_group (Microvellum categories)
  const { specGroups, groupedBySpecGroup } = useMemo(() => {
    const groups = [...new Set(catalog.map(item => item.specGroup).filter(Boolean))] as string[];
    const bySpec: Record<string, ExtendedCatalogItem[]> = {};
    groups.forEach(group => {
      bySpec[group] = catalog.filter(item => item.specGroup === group);
    });
    return { specGroups: groups, groupedBySpecGroup: bySpec };
  }, [catalog]);

  return {
    catalog,
    groupedCatalog,
    groupedBySpecGroup,
    specGroups,
    isLoading,
    error,
    isDynamic,
    refetch,
  };
}

// Helper to find a definition by ID with render config
export function useCatalogItem(definitionId: string | null): ExtendedCatalogItem | null {
  const { catalog } = useCatalog('admin');
  
  if (!definitionId) return null;
  
  // Find in catalog (includes render config)
  const item = catalog.find(c => c.id === definitionId);
  if (item) return item;
  
  // Return null if not found (no static fallback)
  return null;
}

// Get render config for a placed item
export function useRenderConfig(definitionId: string | null): CabinetRenderConfig | null {
  const item = useCatalogItem(definitionId);
  return item?.renderConfig || null;
}
