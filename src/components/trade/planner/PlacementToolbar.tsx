import React, { useState, useMemo } from 'react';
import { useCatalog, ExtendedCatalogItem } from '@/hooks/useCatalog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Search, 
  Plus, 
  Package, 
  ChevronDown,
  ChevronUp,
  Grid3X3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  SPEC_GROUP_ICONS, 
  SPEC_GROUP_COLORS, 
  sortSpecGroups 
} from '@/constants/catalogGroups';

interface PlacementToolbarProps {
  onSelectProduct: (productId: string) => void;
  className?: string;
}

export function PlacementToolbar({ onSelectProduct, className }: PlacementToolbarProps) {
  const { catalog, isLoading } = useCatalog('trade');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>('Base Cabinets');

  // Group by specGroup (Microvellum-style categories)
  const groupedProducts = useMemo(() => {
    return catalog.reduce((acc, product) => {
      const group = product.specGroup || 'Other';
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
                      <button
                        key={product.id}
                        onClick={() => onSelectProduct(product.id)}
                        className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-trade-amber/10 active:bg-trade-amber/20 transition-colors text-left group"
                        title={`Click to add ${product.name} to the scene`}
                      >
                        <div className="w-8 h-8 bg-muted rounded flex items-center justify-center group-hover:bg-trade-amber/10 transition-colors">
                          <Package className="w-4 h-4 text-muted-foreground group-hover:text-trade-amber transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{product.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {product.defaultWidth} × {product.defaultDepth}mm
                          </p>
                        </div>
                        <div className="flex items-center gap-1 text-trade-amber opacity-0 group-hover:opacity-100 transition-opacity">
                          <Plus className="w-4 h-4" />
                          <span className="text-[10px] font-medium">Add</span>
                        </div>
                      </button>
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

function SpecGroupIcon({ group }: { group: string }) {
  const colorClass = SPEC_GROUP_COLORS[group] || SPEC_GROUP_COLORS['Other'];
  
  return (
    <div className={cn("w-2 h-2 rounded-full flex-shrink-0", colorClass)} />
  );
}
