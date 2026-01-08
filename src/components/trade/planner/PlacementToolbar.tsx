import React, { useState, useMemo, useCallback } from 'react';
import { useCatalog, ExtendedCatalogItem } from '@/hooks/useCatalog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  Package, 
  ChevronDown,
  ChevronUp,
  Grid3X3,
  GripVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  SPEC_GROUP_COLORS, 
  sortSpecGroups 
} from '@/constants/catalogGroups';

interface PlacementToolbarProps {
  onSelectProduct: (productId: string) => void;
  className?: string;
}

// Hidden categories that shouldn't appear in the catalog
const HIDDEN_SPEC_GROUPS = ['Props', 'Parts'];

export function PlacementToolbar({ onSelectProduct, className }: PlacementToolbarProps) {
  const { catalog, isLoading } = useCatalog('trade');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Base Cabinets');
  const [draggedProduct, setDraggedProduct] = useState<string | null>(null);

  // Group by specGroup (Microvellum-style categories), filtering out hidden groups
  const groupedProducts = useMemo(() => {
    return catalog.reduce((acc, product) => {
      const group = product.specGroup || 'Other';
      // Skip hidden groups
      if (HIDDEN_SPEC_GROUPS.includes(group)) return acc;
      if (!acc[group]) acc[group] = [];
      acc[group].push(product);
      return acc;
    }, {} as Record<string, ExtendedCatalogItem[]>);
  }, [catalog]);

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

  // Sort groups in Microvellum order
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
    e.dataTransfer.setData('application/json', JSON.stringify({
      productId: product.id,
      productName: product.name,
      width: product.defaultWidth,
      height: product.defaultHeight,
      depth: product.defaultDepth,
    }));
    e.dataTransfer.effectAllowed = 'copy';
    
    // Create a custom drag image
    const dragImage = document.createElement('div');
    dragImage.className = 'bg-trade-amber text-trade-navy px-3 py-2 rounded-md shadow-lg font-medium text-sm';
    dragImage.textContent = product.name;
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 50, 20);
    
    // Clean up drag image after a short delay
    setTimeout(() => document.body.removeChild(dragImage), 0);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedProduct(null);
  }, []);

  return (
    <div className={cn("flex flex-col bg-background border-r h-full w-64", className)}>
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center gap-2 mb-3">
          <Grid3X3 className="w-4 h-4 text-trade-amber" />
          <h3 className="font-semibold text-trade-navy text-sm">Product Catalog</h3>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          Click to add or drag into scene
        </p>
      </div>

      {/* Product List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              Loading products...
            </div>
          ) : sortedGroups.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No products found
            </div>
          ) : (
            sortedGroups.map((group) => (
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
                    {filteredGroups[group].map((product) => (
                      <div
                        key={product.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, product)}
                        onDragEnd={handleDragEnd}
                        onClick={() => onSelectProduct(product.id)}
                        className={cn(
                          "flex items-center gap-2 w-full p-2 rounded-md transition-colors text-left group cursor-grab active:cursor-grabbing",
                          draggedProduct === product.id 
                            ? "bg-trade-amber/20 ring-2 ring-trade-amber" 
                            : "hover:bg-trade-amber/10 active:bg-trade-amber/20"
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
                        </div>
                        <div className="flex items-center gap-1 text-trade-amber opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// Product thumbnail - shows SVG if available, otherwise icon
function ProductThumbnail({ product }: { product: ExtendedCatalogItem }) {
  const thumbnailSvg = product.renderConfig?.thumbnailSvg;
  
  if (thumbnailSvg) {
    return (
      <div 
        className="w-7 h-7 bg-white rounded border border-border flex-shrink-0 overflow-hidden"
        dangerouslySetInnerHTML={{ __html: thumbnailSvg }}
      />
    );
  }
  
  // Fallback to generated procedural thumbnail
  return <ProceduralThumbnail product={product} />;
}

// Procedural thumbnail based on door/drawer counts
function ProceduralThumbnail({ product }: { product: ExtendedCatalogItem }) {
  const { doorCount = 0, drawerCount = 0, isSink, isCorner } = product.renderConfig || {};
  
  return (
    <svg 
      className="w-7 h-7 flex-shrink-0" 
      viewBox="0 0 28 28" 
      fill="none"
    >
      <rect x="2" y="2" width="24" height="24" rx="2" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1"/>
      {drawerCount > 0 && doorCount === 0 ? (
        // All drawers
        Array.from({ length: Math.min(drawerCount, 4) }).map((_, i) => {
          const h = 20 / Math.min(drawerCount, 4);
          return (
            <g key={i}>
              <rect x="4" y={4 + i * h} width="20" height={h - 1} fill="none" stroke="#6b7280" strokeWidth="0.5"/>
              <line x1="10" y1={4 + i * h + h * 0.3} x2="18" y2={4 + i * h + h * 0.3} stroke="#6b7280" strokeWidth="0.5"/>
            </g>
          );
        })
      ) : doorCount > 0 && drawerCount === 0 ? (
        // All doors
        Array.from({ length: Math.min(doorCount, 2) }).map((_, i) => {
          const w = 20 / Math.min(doorCount, 2);
          return (
            <g key={i}>
              <rect x={4 + i * w} y="4" width={w - 1} height="20" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
              <circle cx={i === 0 ? 4 + w - 4 : 4 + i * w + 3} cy="14" r="1.5" fill="#6b7280"/>
            </g>
          );
        })
      ) : doorCount > 0 && drawerCount > 0 ? (
        // Drawers on top, doors below
        <>
          <rect x="4" y="4" width="20" height="6" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
          {Array.from({ length: Math.min(doorCount, 2) }).map((_, i) => {
            const w = 20 / Math.min(doorCount, 2);
            return (
              <rect key={i} x={4 + i * w} y="11" width={w - 1} height="13" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
            );
          })}
        </>
      ) : (
        // Default single door
        <rect x="4" y="4" width="20" height="20" fill="none" stroke="#6b7280" strokeWidth="0.5"/>
      )}
      {isSink && (
        <ellipse cx="14" cy="8" rx="6" ry="2" fill="none" stroke="#6b7280" strokeWidth="0.5" strokeDasharray="2,1"/>
      )}
      {isCorner && (
        <path d="M4 24 L10 18 L24 4" fill="none" stroke="#6b7280" strokeWidth="0.5" strokeDasharray="2,1"/>
      )}
    </svg>
  );
}

function SpecGroupIcon({ group }: { group: string }) {
  const colorClass = SPEC_GROUP_COLORS[group] || SPEC_GROUP_COLORS['Other'];
  
  return (
    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", colorClass)} />
  );
}
