import { useQuery } from '@tanstack/react-query';
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
  let defaultWidth = product.default_width || 600;
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

  // Transform DB products to catalog format with render configs
  const dynamicCatalog: ExtendedCatalogItem[] = dbProducts?.map(transformToDefinition) || [];
  
  // Use dynamic catalog if available, otherwise minimal fallback
  const catalog: ExtendedCatalogItem[] = dynamicCatalog.length > 0 ? dynamicCatalog : FALLBACK_CATALOG;
  
  // Group by category for sidebar display
  const groupedCatalog = {
    Base: catalog.filter(item => item.category === 'Base'),
    Wall: catalog.filter(item => item.category === 'Wall'),
    Tall: catalog.filter(item => item.category === 'Tall'),
    Appliance: catalog.filter(item => item.itemType === 'Appliance'),
    Structure: catalog.filter(item => item.itemType === 'Structure' || item.itemType === 'Wall'),
  };

  // Group by spec_group (Microvellum categories)
  const specGroups = [...new Set(catalog.map(item => item.specGroup).filter(Boolean))] as string[];
  const groupedBySpecGroup: Record<string, ExtendedCatalogItem[]> = {};
  specGroups.forEach(group => {
    groupedBySpecGroup[group] = catalog.filter(item => item.specGroup === group);
  });

  return {
    catalog,
    groupedCatalog,
    groupedBySpecGroup,
    specGroups,
    isLoading,
    error,
    isDynamic: dynamicCatalog.length > 0,
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
