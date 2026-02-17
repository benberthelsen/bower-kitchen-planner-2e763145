import React, { useState, useMemo, useCallback } from 'react';
import { useCatalog, ExtendedCatalogItem, UserType } from '@/hooks/useCatalog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  Plus, 
  ChevronDown,
  ChevronUp,
  Grid3X3,
  GripVertical,
  FolderOpen,
  MousePointer,
  Loader2,
  Droplets,
  CornerDownRight,
  LayoutGrid,
  PanelTop
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  SPEC_GROUP_COLORS, 
  sortSpecGroups 
} from '@/constants/catalogGroups';
import { CatalogItemDefinition } from '@/types';

// Hidden categories that shouldn't appear in the catalog
const HIDDEN_SPEC_GROUPS = ['Props', 'Parts'];

export interface SampleKitchenPreset {
  name: string;
  cabinetCount: number;
}

export interface UnifiedCatalogProps {
  userType: UserType;
  onSelectProduct: (productId: string) => void;
  placementItemId?: string | null;
  onCancelPlacement?: () => void;
  onLoadSampleKitchen?: (kitchenId: string) => void;
  sampleKitchens?: Record<string, SampleKitchenPreset>;
  className?: string;
}

// Helper to detect cabinet characteristics from extended item
const getCabinetTypeInfo = (item: ExtendedCatalogItem) => {
  const renderConfig = item.renderConfig;
  const name = item.name.toLowerCase();
  const sku = item.sku.toLowerCase();
  
  const isSink = renderConfig?.isSink || name.includes('sink') || sku.includes('sink');
  const isCorner = renderConfig?.isCorner || name.includes('corner') || sku.includes('corner') || sku.includes('bc') || sku.includes('lc');
  const isBlind = renderConfig?.isBlind || name.includes('blind');
  const hasDrawers = (renderConfig?.drawerCount ?? 0) > 0 || name.includes('drawer') || sku.includes('dr');
  const hasDoors = (renderConfig?.doorCount ?? 0) > 0 || name.includes('door') || sku.includes('d');
  const doorCount = renderConfig?.doorCount ?? (name.includes('2 door') || sku.includes('2d') ? 2 : hasDoors ? 1 : 0);
  const drawerCount = renderConfig?.drawerCount ?? 0;
  
  return { isSink, isCorner, isBlind, hasDrawers, hasDoors, doorCount, drawerCount };
};

// Type indicator badges
function CabinetTypeIndicators({ item }: { item: ExtendedCatalogItem }) {
  const { isSink, isCorner, isBlind, hasDrawers, drawerCount } = getCabinetTypeInfo(item);
  
  return (
    <div className="flex gap-0.5 flex-wrap justify-center mt-0.5">
      {isSink && (
        <Badge variant="secondary" className="px-1 py-0 text-[8px] bg-blue-100 text-blue-700 border-blue-200">
          <Droplets size={8} className="mr-0.5" />
          Sink
        </Badge>
      )}
      {isCorner && (
        <Badge variant="secondary" className="px-1 py-0 text-[8px] bg-amber-100 text-amber-700 border-amber-200">
          <CornerDownRight size={8} className="mr-0.5" />
          Corner
        </Badge>
      )}
      {isBlind && (
        <Badge variant="secondary" className="px-1 py-0 text-[8px] bg-purple-100 text-purple-700 border-purple-200">
          <PanelTop size={8} className="mr-0.5" />
          Blind
        </Badge>
      )}
      {hasDrawers && drawerCount > 0 && (
        <Badge variant="secondary" className="px-1 py-0 text-[8px] bg-green-100 text-green-700 border-green-200">
          <LayoutGrid size={8} className="mr-0.5" />
          {drawerCount}Dr
        </Badge>
      )}
    </div>
  );
}

// Procedural thumbnail
function ProductThumbnail({ product }: { product: ExtendedCatalogItem }) {
  const thumbnailSvg = product.renderConfig?.thumbnailSvg;
  
  if (thumbnailSvg) {
    return (
      <div 
        className="w-8 h-8 bg-white rounded border border-border flex-shrink-0 overflow-hidden"
        dangerouslySetInnerHTML={{ __html: thumbnailSvg }}
      />
    );
  }
  
  const { doorCount = 0, drawerCount = 0, isSink, isCorner } = getCabinetTypeInfo(product);
  
  return (
    <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 32 32" fill="none">
      <rect x="2" y="2" width="28" height="28" rx="2" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1"/>
      {drawerCount > 0 && doorCount === 0 ? (
        Array.from({ length: Math.min(drawerCount, 4) }).map((_, i) => {
          const h = 24 / Math.min(drawerCount, 4);
          return (
            <g key={i}>
              <rect x="4" y={4 + i * h} width="24" height={h - 1} fill="none" stroke="#6b7280" strokeWidth="0.5"/>
              <line x1="12" y1={4 + i * h + h * 0.4} x2="20" y2={4 + i * h + h * 0.4} stroke="#6b7280" strokeWidth="0.5"/>
            </g>
          );
        })
      ) : doorCount > 0 && drawerCount === 0 ? (
        Array.from({ length: Math.min(doorCount, 2) }).map((_, i) => {
          const w = 24 / Math.min(doorCount, 2);
          return (
            <g key={i}>
              <rect x={4 + i * w} y="4" width={w - 1} height="24" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
              <circle cx={i === 0 ? 4 + w - 4 : 4 + i * w + 3} cy="16" r="1.5" fill="#6b7280"/>
            </g>
          );
        })
      ) : doorCount > 0 && drawerCount > 0 ? (
        <>
          <rect x="4" y="4" width="24" height="8" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
          {Array.from({ length: Math.min(doorCount, 2) }).map((_, i) => {
            const w = 24 / Math.min(doorCount, 2);
            return (
              <rect key={i} x={4 + i * w} y="13" width={w - 1} height="15" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
            );
          })}
        </>
      ) : (
        <rect x="4" y="4" width="24" height="24" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
      )}
      {isSink && (
        <ellipse cx="16" cy="10" rx="8" ry="3" fill="none" stroke="#3b82f6" strokeWidth="0.5" strokeDasharray="2,1"/>
      )}
      {isCorner && (
        <path d="M4 28 L12 20 L28 4" fill="none" stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="2,1"/>
      )}
    </svg>
  );
}

function SpecGroupIcon({ group }: { group: string }) {
  const colorClass = SPEC_GROUP_COLORS[group] || SPEC_GROUP_COLORS['Other'];
  return <div className={cn("w-2 h-2 rounded-full flex-shrink-0", colorClass)} />;
}

export function UnifiedCatalog({
  userType,
  onSelectProduct,
  placementItemId,
  onCancelPlacement,
  onLoadSampleKitchen,
  sampleKitchens,
  className,
}: UnifiedCatalogProps) {
  const { catalog, isLoading, isDynamic } = useCatalog(userType);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Base Cabinets');
  const [draggedProduct, setDraggedProduct] = useState<string | null>(null);

  const isTrade = userType === 'trade' || userType === 'admin';

  // Group by specGroup, filtering out hidden groups
  const groupedProducts = useMemo(() => {
    return catalog.reduce((acc, product) => {
      const group = product.specGroup || (isTrade ? 'Other' : product.category || 'Other');
      if (HIDDEN_SPEC_GROUPS.includes(group)) return acc;
      if (!acc[group]) acc[group] = [];
      acc[group].push(product);
      return acc;
    }, {} as Record<string, ExtendedCatalogItem[]>);
  }, [catalog, isTrade]);

  // Filter by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedProducts;
    
    const query = searchQuery.toLowerCase();
    return Object.entries(groupedProducts).reduce((acc, [group, products]) => {
      const filtered = products.filter(p => 
        p.name.toLowerCase().includes(query) ||
        p.sku.toLowerCase().includes(query)
      );
      if (filtered.length > 0) acc[group] = filtered;
      return acc;
    }, {} as Record<string, ExtendedCatalogItem[]>);
  }, [groupedProducts, searchQuery]);

  // Sort groups
  const sortedGroups = useMemo(() => {
    return sortSpecGroups(Object.keys(filteredGroups));
  }, [filteredGroups]);

  // Auto-expand first matching group when searching
  const effectiveExpandedGroup = useMemo(() => {
    if (searchQuery.trim() && sortedGroups.length > 0 && !sortedGroups.includes(expandedGroup || '')) {
      return sortedGroups[0];
    }
    return expandedGroup;
  }, [searchQuery, sortedGroups, expandedGroup]);

  // Drag handlers
  const handleDragStart = useCallback((e: React.DragEvent, product: ExtendedCatalogItem) => {
    setDraggedProduct(product.id);
    e.dataTransfer.setData('definitionId', product.id);
    e.dataTransfer.setData('application/json', JSON.stringify({
      productId: product.id,
      productName: product.name,
      width: product.defaultWidth,
      height: product.defaultHeight,
      depth: product.defaultDepth,
    }));
    e.dataTransfer.effectAllowed = 'copy';
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedProduct(null);
  }, []);

  const handleItemClick = useCallback((product: CatalogItemDefinition) => {
    onSelectProduct(product.id);
  }, [onSelectProduct]);

  return (
    <div className={cn("flex flex-col bg-background border-r h-full w-64", className)}>
      {/* Header */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center gap-2">
          <Grid3X3 className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">
            {isTrade ? 'Product Catalog' : 'Popular Cabinets'}
          </h3>
        </div>

        {/* Sample Kitchen Loader - Only for non-trade users */}
        {!isTrade && sampleKitchens && onLoadSampleKitchen && (
          <>
            <div className="rounded-md border border-blue-100 bg-blue-50 px-2 py-1.5">
              <p className="text-[10px] font-medium text-blue-900">Guided workflow</p>
              <p className="text-[10px] text-blue-700">Pick a starter layout, then customise cabinets, finishes, and hardware.</p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                  <FolderOpen size={14} />
                  Load Layout Preset
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {Object.entries(sampleKitchens).map(([id, preset]) => (
                  <DropdownMenuItem 
                    key={id} 
                    onClick={() => onLoadSampleKitchen(id)}
                    className="flex flex-col items-start"
                  >
                    <span className="font-medium">{preset.name}</span>
                    <span className="text-xs text-muted-foreground">{preset.cabinetCount} cabinets</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Placement mode indicator */}
        {placementItemId && (
          <div className="flex items-center gap-2 px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
            <MousePointer size={14} className="text-green-600" />
            <span className="text-xs text-green-700 font-medium">Click in scene to place</span>
            {onCancelPlacement && (
              <button 
                onClick={onCancelPlacement}
                className="ml-auto text-xs text-green-600 hover:text-green-800 font-medium"
              >
                Cancel
              </button>
            )}
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Click to add or drag into scene
        </p>
        {!isTrade && (
          <p className="text-[10px] text-muted-foreground">
            Built with original assets and naming. No affiliation with third-party planner brands.
          </p>
        )}
      </div>

      {/* Product List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : sortedGroups.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No products found
            </div>
          ) : (
            <>
              {/* Catalog info */}
              {isDynamic && (
                <div className="mb-2 px-2 py-1 text-xs text-muted-foreground bg-muted/50 rounded">
                  {catalog.length} products {userType === 'standard' ? '(curated)' : 'available'}
                </div>
              )}
              
              {!isDynamic && userType === 'standard' && (
                <div className="mb-2 px-2 py-1 text-xs text-muted-foreground bg-blue-50 rounded border border-blue-100">
                  Showing popular selections
                </div>
              )}

              {sortedGroups.map((group) => (
                <Collapsible
                  key={group}
                  open={effectiveExpandedGroup === group}
                  onOpenChange={(open) => setExpandedGroup(open ? group : null)}
                >
                  <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <SpecGroupIcon group={group} />
                      <span className="font-medium text-sm truncate">{group}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {filteredGroups[group].length}
                      </Badge>
                    </div>
                    {effectiveExpandedGroup === group ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pl-2">
                    <div className="space-y-0.5">
                      {filteredGroups[group].map((product) => {
                        const isSelected = placementItemId === product.id;
                        return (
                          <div
                            key={product.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, product)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleItemClick(product)}
                            className={cn(
                              "flex items-center gap-2 w-full p-2 rounded-md transition-colors text-left group cursor-grab active:cursor-grabbing",
                              isSelected
                                ? "bg-green-50 border border-green-400 ring-2 ring-green-200"
                                : draggedProduct === product.id 
                                  ? "bg-primary/20 ring-2 ring-primary" 
                                  : "hover:bg-primary/10 active:bg-primary/20"
                            )}
                            title={`Click to add or drag "${product.name}" to the scene`}
                          >
                            <GripVertical className="w-3 h-3 text-muted-foreground/50 group-hover:text-muted-foreground flex-shrink-0" />
                            <ProductThumbnail product={product} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{product.name}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {product.defaultWidth} × {product.defaultDepth}mm
                              </p>
                              <CabinetTypeIndicators item={product} />
                            </div>
                            <div className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <Plus className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default UnifiedCatalog;
