import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CatalogItemDefinition, ItemType, CabinetType } from '@/types';
import { CATALOG as STATIC_CATALOG } from '@/constants';

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
}

function mapCategoryToItemType(category: string | null): ItemType {
  if (!category) return 'Cabinet';
  const lower = category.toLowerCase();
  if (lower === 'accessory' || lower === 'accessories') return 'Structure';
  return 'Cabinet';
}

function mapCategoryToCabinetType(category: string | null): CabinetType | undefined {
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
  
  return `${category}${width}${suffix ? '-' + suffix : ''}`;
}

function transformToDefinition(product: MicrovellumProduct): CatalogItemDefinition {
  const itemType = mapCategoryToItemType(product.category);
  const category = mapCategoryToCabinetType(product.category);
  
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
  };
}

export function useCatalog() {
  const { data: dbProducts, isLoading, error, refetch } = useQuery({
    queryKey: ['microvellum-catalog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('microvellum_products')
        .select('*')
        .order('category', { ascending: true })
        .order('name', { ascending: true });
      
      if (error) throw error;
      return data as MicrovellumProduct[];
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Transform DB products to catalog format
  const dynamicCatalog: CatalogItemDefinition[] = dbProducts?.map(transformToDefinition) || [];
  
  // Use dynamic catalog if we have products, otherwise fall back to static
  const catalog = dynamicCatalog.length > 0 ? dynamicCatalog : STATIC_CATALOG;
  
  // Group by category for sidebar display
  const groupedCatalog = {
    Base: catalog.filter(item => item.category === 'Base'),
    Wall: catalog.filter(item => item.category === 'Wall'),
    Tall: catalog.filter(item => item.category === 'Tall'),
    Appliance: catalog.filter(item => item.itemType === 'Appliance'),
    Structure: catalog.filter(item => item.itemType === 'Structure' || item.itemType === 'Wall'),
  };

  return {
    catalog,
    groupedCatalog,
    isLoading,
    error,
    isDynamic: dynamicCatalog.length > 0,
    refetch,
  };
}

// Helper to find a definition by ID (checks both dynamic and static)
export function useCatalogItem(definitionId: string | null) {
  const { catalog } = useCatalog();
  
  if (!definitionId) return null;
  
  // First check dynamic catalog
  const item = catalog.find(c => c.id === definitionId);
  if (item) return item;
  
  // Fall back to static catalog for legacy items
  return STATIC_CATALOG.find(c => c.id === definitionId) || null;
}
