import React, { useState } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { useCatalog } from '../../hooks/useCatalog';
import { Plus, ChevronDown, ChevronRight, Search, Box, MousePointer, FolderOpen, Loader2, Download } from 'lucide-react';
import { CatalogItemDefinition } from '../../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
interface SidebarProps {
  onClose?: () => void;
}

const CabinetThumbnail = ({ item }: { item: CatalogItemDefinition }) => {
  const isBase = item.category === 'Base';
  const isWall = item.category === 'Wall';
  const is2Door = item.sku.includes('2D');
  const isCorner = item.sku.includes('Corner') || item.sku.includes('BC') || item.sku.includes('LC');
  const isSink = item.sku.includes('SINK');

  const stroke = isWall ? "#9ca3af" : "#6b7280";
  const fill = isWall ? "#f3f4f6" : "#e5e7eb";

  if (isSink) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <rect x="4" y="8" width="32" height="24" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <ellipse cx="14" cy="20" rx="6" ry="5" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1" />
        <ellipse cx="26" cy="20" rx="6" ry="5" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1" />
      </svg>
    );
  }

  if (isCorner) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <path d="M4 4 H36 V20 H20 V36 H4 Z" fill={fill} stroke={stroke} strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <rect x="4" y="4" width="32" height="32" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {is2Door && <line x1="20" y1="6" x2="20" y2="34" stroke={stroke} strokeWidth="1" />}
      <circle cx={is2Door ? 12 : 30} cy="20" r="2" fill={stroke} />
      {is2Door && <circle cx="28" cy="20" r="2" fill={stroke} />}
    </svg>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { setPlacementItem, placementItemId, loadSampleKitchen, sampleKitchens } = usePlanner();
  const { catalog, isLoading, isDynamic, refetch } = useCatalog();
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ 'Base': true, 'Wall': true, 'Tall': true, 'Appliance': true, 'Structure': true });
  const [importing, setImporting] = useState(false);

  const handleImportProducts = async () => {
    setImporting(true);
    try {
      // Fetch the bundled XML file
      const response = await fetch('/data/microvellum-products.xml');
      if (!response.ok) throw new Error('Failed to load product data');
      const xmlContent = await response.text();
      
      const { data, error } = await supabase.functions.invoke('import-microvellum', {
        body: { xmlContent }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Imported ${data.imported} products`);
        refetch();
      } else {
        throw new Error(data?.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || 'Failed to import products');
    } finally {
      setImporting(false);
    }
  };
  const toggleCategory = (cat: string) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const filteredCatalog = catalog.filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase()));

  const categories = ['Base', 'Wall', 'Tall', 'Appliance', 'Structure'];

  const handleDragStart = (e: React.DragEvent, item: CatalogItemDefinition) => {
    e.dataTransfer.setData('definitionId', item.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleItemClick = (item: CatalogItemDefinition) => {
    // Toggle placement mode - if same item clicked, cancel placement
    if (placementItemId === item.id) {
      setPlacementItem(null);
    } else {
      setPlacementItem(item.id);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-3 border-b space-y-2">
        {/* Load Sample Kitchen Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2">
              <FolderOpen size={14} />
              Load Sample Kitchen
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {Object.entries(sampleKitchens).map(([id, preset]) => (
              <DropdownMenuItem 
                key={id} 
                onClick={() => loadSampleKitchen(id)}
                className="flex flex-col items-start"
              >
                <span className="font-medium">{preset.name}</span>
                <span className="text-xs text-muted-foreground">{preset.cabinetCount} cabinets</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search cabinets..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        
        {/* Placement mode indicator */}
        {placementItemId && (
          <div className="mt-2 flex items-center gap-2 px-2 py-1.5 bg-green-50 border border-green-200 rounded-lg">
            <MousePointer size={14} className="text-green-600" />
            <span className="text-xs text-green-700 font-medium">Click in the scene to place</span>
            <button 
              onClick={() => setPlacementItem(null)}
              className="ml-auto text-xs text-green-600 hover:text-green-800 font-medium"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        
        {/* Import Products Button - show when no dynamic catalog */}
        {!isLoading && !isDynamic && (
          <div className="mb-3 p-3 border border-dashed rounded-lg bg-muted/30">
            <p className="text-xs text-muted-foreground mb-2">
              Import your Microvellum product library to see all cabinets
            </p>
            <Button 
              size="sm" 
              variant="secondary" 
              className="w-full"
              onClick={handleImportProducts}
              disabled={importing}
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Import Product Library
                </>
              )}
            </Button>
          </div>
        )}
        
        {isDynamic && !isLoading && (
          <div className="mb-2 px-2 py-1 text-xs text-muted-foreground bg-muted/50 rounded">
            {catalog.length} products from Microvellum
          </div>
        )}
        
        {!isLoading && categories.map(category => {
          const items = filteredCatalog.filter(item => {
            if (category === 'Appliance') return item.itemType === 'Appliance';
            if (category === 'Structure') return item.itemType === 'Structure' || item.itemType === 'Wall';
            return item.category === category;
          });

          if (items.length === 0) return null;

          return (
            <div key={category} className="mb-2">
              <button onClick={() => toggleCategory(category)} className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded">
                <span>{category} Cabinets</span>
                {expandedCategories[category] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {expandedCategories[category] && (
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {items.map(item => {
                    const isSelected = placementItemId === item.id;
                    return (
                      <div 
                        key={item.id} 
                        draggable 
                        onDragStart={e => handleDragStart(e, item)} 
                        onClick={() => handleItemClick(item)} 
                        className={`flex flex-col items-center p-2 border rounded cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-green-50 border-green-400 ring-2 ring-green-200' 
                            : 'hover:bg-blue-50 hover:border-blue-300'
                        }`}
                      >
                        <CabinetThumbnail item={item} />
                        <span className="text-[10px] font-medium text-gray-600 mt-1 text-center leading-tight">{item.sku}</span>
                        <span className="text-[9px] text-gray-400">${item.price}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Sidebar;
