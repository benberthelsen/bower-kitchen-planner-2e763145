import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Search, 
  Grid3X3, 
  List, 
  Star, 
  StarOff,
  Plus,
  Filter,
  ChevronRight,
  Ruler,
  Package
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import TradeLayout from './components/TradeLayout';
import { useCatalog, ExtendedCatalogItem } from '@/hooks/useCatalog';

type ViewMode = 'grid' | 'list';

// Microvellum spec_group categories in display order
const SPEC_GROUP_ORDER = [
  'Base Cabinets',
  'Base Corner Cabinets',
  'Base Door-Drawer Cabinets',
  'Base Drawer Bank Cabinets',
  'Sink Cabinets',
  'Upper Cabinets',
  'Upper Corner Cabinets',
  'Tall Cabinets',
  'Tall Corner Cabinets',
  'Appliances',
  'Accessories',
  'Parts',
];

const SPEC_GROUP_ICONS: Record<string, React.ReactNode> = {
  'Base Cabinets': <Package className="h-5 w-5" />,
  'Base Corner Cabinets': <Package className="h-5 w-5" />,
  'Base Door-Drawer Cabinets': <Package className="h-5 w-5" />,
  'Base Drawer Bank Cabinets': <Package className="h-5 w-5" />,
  'Sink Cabinets': <Package className="h-5 w-5" />,
  'Upper Cabinets': <Package className="h-5 w-5" />,
  'Upper Corner Cabinets': <Package className="h-5 w-5" />,
  'Tall Cabinets': <Package className="h-5 w-5" />,
  'Tall Corner Cabinets': <Package className="h-5 w-5" />,
  'Appliances': <Package className="h-5 w-5" />,
  'Accessories': <Package className="h-5 w-5" />,
  'Parts': <Package className="h-5 w-5" />,
};

export default function ProductCatalog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { catalog, groupedBySpecGroup, specGroups, isLoading } = useCatalog('trade');
  
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('catalog-favorites');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const activeSpecGroup = searchParams.get('specGroup') || 'all';

  const setActiveSpecGroup = (specGroup: string) => {
    setSearchParams({ specGroup });
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      localStorage.setItem('catalog-favorites', JSON.stringify([...next]));
      return next;
    });
  };

  // Sort spec groups according to defined order
  const sortedSpecGroups = useMemo(() => {
    return SPEC_GROUP_ORDER.filter(group => specGroups.includes(group));
  }, [specGroups]);

  const filteredCatalog = useMemo(() => {
    let items = catalog;

    // Spec group filter
    if (activeSpecGroup !== 'all') {
      items = items.filter(item => item.specGroup === activeSpecGroup);
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item => 
        item.name.toLowerCase().includes(query) ||
        item.sku.toLowerCase().includes(query)
      );
    }

    // Favorites filter
    if (showFavoritesOnly) {
      items = items.filter(item => favorites.has(item.id));
    }

    return items;
  }, [catalog, activeSpecGroup, searchQuery, showFavoritesOnly, favorites]);

  const specGroupCounts = useMemo(() => {
    const counts: Record<string, number> = { all: catalog.length };
    catalog.forEach(item => {
      if (item.specGroup) {
        counts[item.specGroup] = (counts[item.specGroup] || 0) + 1;
      }
    });
    return counts;
  }, [catalog]);

  const handleAddToJob = (item: ExtendedCatalogItem) => {
    // Navigate to job editor with product selection
    navigate(`/trade/job/new?addProduct=${item.id}`);
  };

  const getActiveLabel = () => {
    if (activeSpecGroup === 'all') return 'All Products';
    return activeSpecGroup;
  };

  const getActiveDescription = () => {
    if (activeSpecGroup === 'all') return 'Browse our complete Microvellum catalog';
    if (activeSpecGroup.includes('Base')) return 'Floor-standing cabinet units';
    if (activeSpecGroup.includes('Upper')) return 'Mounted wall cabinet units';
    if (activeSpecGroup.includes('Tall')) return 'Full-height storage units';
    if (activeSpecGroup.includes('Sink')) return 'Sink base cabinets';
    if (activeSpecGroup.includes('Appliance')) return 'Oven, fridge & dishwasher housings';
    if (activeSpecGroup.includes('Accessor')) return 'Cabinet accessories';
    if (activeSpecGroup.includes('Parts')) return 'Panels, fillers & parts';
    return 'Browse products';
  };

  return (
    <TradeLayout>
      <div className="flex h-[calc(100vh-3.5rem)] lg:h-screen">
        {/* Category Sidebar */}
        <aside className="hidden md:flex w-72 border-r border-trade-border bg-white flex-col">
          <div className="p-4 border-b border-trade-border">
            <h2 className="font-display font-semibold text-trade-navy">Microvellum Categories</h2>
          </div>
          <ScrollArea className="flex-1">
            <nav className="p-2 space-y-1">
              {/* All Products */}
              <button
                onClick={() => setActiveSpecGroup('all')}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left",
                  activeSpecGroup === 'all'
                    ? "bg-trade-amber/10 text-trade-amber border border-trade-amber/20"
                    : "text-trade-navy/70 hover:bg-trade-muted hover:text-trade-navy"
                )}
              >
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5" />
                  <span className="font-medium">All Products</span>
                </div>
                <Badge variant="secondary" className="bg-trade-muted text-trade-navy/60">
                  {specGroupCounts.all || 0}
                </Badge>
              </button>

              {/* Grouped by spec_group */}
              {sortedSpecGroups.map(specGroup => (
                <button
                  key={specGroup}
                  onClick={() => setActiveSpecGroup(specGroup)}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all text-left",
                    activeSpecGroup === specGroup
                      ? "bg-trade-amber/10 text-trade-amber border border-trade-amber/20"
                      : "text-trade-navy/70 hover:bg-trade-muted hover:text-trade-navy"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {SPEC_GROUP_ICONS[specGroup] || <Package className="h-5 w-5" />}
                    <span className="font-medium text-sm">{specGroup}</span>
                  </div>
                  <Badge variant="secondary" className="bg-trade-muted text-trade-navy/60">
                    {specGroupCounts[specGroup] || 0}
                  </Badge>
                </button>
              ))}
            </nav>
          </ScrollArea>
          
          {/* Favorites Toggle */}
          <div className="p-3 border-t border-trade-border">
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                showFavoritesOnly
                  ? "bg-trade-amber text-white"
                  : "bg-trade-muted text-trade-navy/70 hover:text-trade-navy"
              )}
            >
              <Star className="h-5 w-5" />
              <span className="font-medium">Favorites Only</span>
              {favorites.size > 0 && (
                <Badge variant="secondary" className="ml-auto">
                  {favorites.size}
                </Badge>
              )}
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col bg-trade-surface">
          {/* Header */}
          <header className="bg-white border-b border-trade-border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-display text-2xl font-bold text-trade-navy">
                  {getActiveLabel()}
                </h1>
                <p className="text-trade-navy/60 text-sm">
                  {getActiveDescription()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    "border-trade-border",
                    viewMode === 'grid' && "bg-trade-amber text-white border-trade-amber"
                  )}
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setViewMode('list')}
                  className={cn(
                    "border-trade-border",
                    viewMode === 'list' && "bg-trade-amber text-white border-trade-amber"
                  )}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-trade-navy/40" />
                <Input
                  placeholder="Search by name or SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 border-trade-border"
                />
              </div>
              
              {/* Mobile Category Filter */}
              <div className="md:hidden">
                <Button variant="outline" size="icon" className="border-trade-border">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          {/* Product Grid/List */}
          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-trade-border p-4 animate-pulse">
                    <div className="aspect-square bg-trade-muted rounded-lg mb-4" />
                    <div className="h-4 bg-trade-muted rounded w-3/4 mb-2" />
                    <div className="h-3 bg-trade-muted rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : filteredCatalog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Package className="h-16 w-16 text-trade-navy/20 mb-4" />
                <h3 className="font-display text-xl font-semibold text-trade-navy mb-2">
                  No products found
                </h3>
                <p className="text-trade-navy/60 max-w-sm">
                  {showFavoritesOnly
                    ? "You haven't added any favorites yet. Star products to save them here."
                    : "Try adjusting your search or category filter."}
                </p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredCatalog.map(item => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    isFavorite={favorites.has(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                    onAdd={() => handleAddToJob(item)}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredCatalog.map(item => (
                  <ProductListItem
                    key={item.id}
                    item={item}
                    isFavorite={favorites.has(item.id)}
                    onToggleFavorite={() => toggleFavorite(item.id)}
                    onAdd={() => handleAddToJob(item)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </TradeLayout>
  );
}

// Product Card Component
interface ProductCardProps {
  item: ExtendedCatalogItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onAdd: () => void;
}

function ProductCard({ item, isFavorite, onToggleFavorite, onAdd }: ProductCardProps) {
  return (
    <div className="group bg-white rounded-xl border border-trade-border hover:border-trade-amber/50 hover:shadow-lg transition-all overflow-hidden">
      {/* Thumbnail */}
      <div className="relative aspect-square bg-gradient-to-br from-trade-muted to-trade-surface p-6">
        {/* Cabinet SVG Preview */}
        <CabinetThumbnail item={item} />
        
        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          className={cn(
            "absolute top-3 right-3 p-2 rounded-full transition-all",
            isFavorite
              ? "bg-trade-amber text-white"
              : "bg-white/80 text-trade-navy/40 hover:text-trade-amber opacity-0 group-hover:opacity-100"
          )}
        >
          {isFavorite ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
        </button>

        {/* Category Badge */}
        <Badge 
          className="absolute top-3 left-3 bg-trade-navy/80 text-white"
        >
          {item.category || 'Cabinet'}
        </Badge>
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <div>
          <h3 className="font-medium text-trade-navy line-clamp-1">{item.name}</h3>
          <p className="text-sm text-trade-navy/50">{item.sku}</p>
        </div>

        {/* Dimensions */}
        <div className="flex items-center gap-2 text-xs text-trade-navy/60">
          <Ruler className="h-3.5 w-3.5" />
          <span>{item.defaultWidth} × {item.defaultDepth} × {item.defaultHeight}mm</span>
        </div>

        {/* Add Button */}
        <Button 
          onClick={onAdd}
          className="w-full bg-trade-navy hover:bg-trade-navy/90 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add to Job
        </Button>
      </div>
    </div>
  );
}

// Product List Item Component
function ProductListItem({ item, isFavorite, onToggleFavorite, onAdd }: ProductCardProps) {
  return (
    <div className="group bg-white rounded-lg border border-trade-border hover:border-trade-amber/50 hover:shadow-md transition-all p-4 flex items-center gap-4">
      {/* Thumbnail */}
      <div className="w-20 h-20 bg-gradient-to-br from-trade-muted to-trade-surface rounded-lg flex-shrink-0 p-2">
        <CabinetThumbnail item={item} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-trade-navy truncate">{item.name}</h3>
          <Badge variant="secondary" className="bg-trade-muted text-trade-navy/60 flex-shrink-0">
            {item.category}
          </Badge>
        </div>
        <p className="text-sm text-trade-navy/50">{item.sku}</p>
        <div className="flex items-center gap-2 text-xs text-trade-navy/60 mt-1">
          <Ruler className="h-3 w-3" />
          <span>{item.defaultWidth} × {item.defaultDepth} × {item.defaultHeight}mm</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleFavorite}
          className={cn(
            "p-2 rounded-lg transition-all",
            isFavorite
              ? "text-trade-amber"
              : "text-trade-navy/30 hover:text-trade-amber"
          )}
        >
          <Star className={cn("h-5 w-5", isFavorite && "fill-current")} />
        </button>
        <Button 
          onClick={onAdd}
          className="bg-trade-navy hover:bg-trade-navy/90 text-white"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
        <ChevronRight className="h-5 w-5 text-trade-navy/30" />
      </div>
    </div>
  );
}

// Cabinet SVG Thumbnail
function CabinetThumbnail({ item }: { item: ExtendedCatalogItem }) {
  const config = item.renderConfig;
  
  // Simple cabinet representation based on category and config
  const isWall = item.category === 'Wall';
  const isTall = item.category === 'Tall';
  const hasDrawers = config?.drawerCount > 0;
  const doorCount = config?.doorCount || 1;

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Cabinet body */}
      <rect 
        x="10" 
        y={isWall ? "20" : "10"} 
        width="80" 
        height={isTall ? "85" : isWall ? "60" : "75"} 
        fill="hsl(var(--trade-muted))"
        stroke="hsl(var(--trade-navy))"
        strokeWidth="1.5"
        rx="2"
      />
      
      {/* Doors */}
      {hasDrawers ? (
        // Drawer configuration
        <>
          {[...Array(Math.min(config.drawerCount, 4))].map((_, i) => (
            <g key={i}>
              <rect
                x="14"
                y={15 + i * 18}
                width="72"
                height="15"
                fill="hsl(var(--trade-surface))"
                stroke="hsl(var(--trade-navy))"
                strokeWidth="1"
                rx="1"
              />
              {/* Handle */}
              <rect
                x="44"
                y={20 + i * 18}
                width="12"
                height="2"
                fill="hsl(var(--trade-amber))"
                rx="1"
              />
            </g>
          ))}
        </>
      ) : doorCount === 2 ? (
        // Double door
        <>
          <rect
            x="14"
            y={isWall ? "24" : "14"}
            width="34"
            height={isTall ? "77" : isWall ? "52" : "67"}
            fill="hsl(var(--trade-surface))"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="1"
            rx="1"
          />
          <rect
            x="52"
            y={isWall ? "24" : "14"}
            width="34"
            height={isTall ? "77" : isWall ? "52" : "67"}
            fill="hsl(var(--trade-surface))"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="1"
            rx="1"
          />
          {/* Handles */}
          <rect x="44" y={isWall ? "46" : "44"} width="3" height="10" fill="hsl(var(--trade-amber))" rx="1" />
          <rect x="53" y={isWall ? "46" : "44"} width="3" height="10" fill="hsl(var(--trade-amber))" rx="1" />
        </>
      ) : (
        // Single door
        <>
          <rect
            x="14"
            y={isWall ? "24" : "14"}
            width="72"
            height={isTall ? "77" : isWall ? "52" : "67"}
            fill="hsl(var(--trade-surface))"
            stroke="hsl(var(--trade-navy))"
            strokeWidth="1"
            rx="1"
          />
          {/* Handle */}
          <rect x="78" y={isWall ? "46" : "44"} width="3" height="10" fill="hsl(var(--trade-amber))" rx="1" />
        </>
      )}
      
      {/* Kickboard for base/tall */}
      {!isWall && (
        <rect
          x="12"
          y={isTall ? "95" : "85"}
          width="76"
          height="5"
          fill="hsl(var(--trade-navy))"
          opacity="0.3"
          rx="1"
        />
      )}
    </svg>
  );
}
