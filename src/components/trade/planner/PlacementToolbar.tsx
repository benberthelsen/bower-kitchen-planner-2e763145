import React, { useState } from 'react';
import { useCatalog } from '@/hooks/useCatalog';
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

interface PlacementToolbarProps {
  onSelectProduct: (productId: string) => void;
  className?: string;
}

export function PlacementToolbar({ onSelectProduct, className }: PlacementToolbarProps) {
  const { catalog, isLoading } = useCatalog('trade');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>('Base');

  // Group by category
  const groupedProducts = catalog.reduce((acc, product) => {
    const category = product.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(product);
    return acc;
  }, {} as Record<string, typeof catalog>);

  // Filter by search
  const filteredGroups = Object.entries(groupedProducts).reduce((acc, [category, products]) => {
    const filtered = products.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase())
    );
    if (filtered.length > 0) acc[category] = filtered;
    return acc;
  }, {} as Record<string, typeof catalog>);

  const categoryOrder = ['Base', 'Wall', 'Tall', 'Appliance', 'Other'];
  const sortedCategories = Object.keys(filteredGroups).sort(
    (a, b) => categoryOrder.indexOf(a) - categoryOrder.indexOf(b)
  );

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
          ) : sortedCategories.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No products found
            </div>
          ) : (
            sortedCategories.map((category) => (
              <Collapsible
                key={category}
                open={expandedCategory === category}
                onOpenChange={(open) => setExpandedCategory(open ? category : null)}
              >
                <CollapsibleTrigger className="flex items-center justify-between w-full p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-2">
                    <CategoryIcon category={category} />
                    <span className="font-medium text-sm">{category}</span>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {filteredGroups[category].length}
                    </Badge>
                  </div>
                  {expandedCategory === category ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pl-2">
                  <div className="space-y-0.5">
                    {filteredGroups[category].map((product) => (
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

function CategoryIcon({ category }: { category: string }) {
  const colors: Record<string, string> = {
    Base: 'text-blue-500',
    Wall: 'text-green-500',
    Tall: 'text-purple-500',
    Appliance: 'text-orange-500',
    Other: 'text-gray-500',
  };

  return (
    <div className={cn("w-2 h-2 rounded-full", colors[category]?.replace('text-', 'bg-'))} />
  );
}
