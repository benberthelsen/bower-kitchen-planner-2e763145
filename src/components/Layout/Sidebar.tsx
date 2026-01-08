import React, { useState } from 'react';
import { usePlanner } from '../../store/PlannerContext';
import { useCatalog, UserType, ExtendedCatalogItem } from '../../hooks/useCatalog';
import { ChevronDown, ChevronRight, Search, MousePointer, FolderOpen, Loader2, Droplets, CornerDownRight, LayoutGrid, DoorOpen, PanelTop, Square } from 'lucide-react';
import { CatalogItemDefinition } from '../../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { sortSpecGroups } from '@/constants/catalogGroups';

interface SidebarProps {
  onClose?: () => void;
  userType?: UserType;
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
const CabinetTypeIndicators = ({ item }: { item: ExtendedCatalogItem }) => {
  const { isSink, isCorner, isBlind, hasDrawers, drawerCount } = getCabinetTypeInfo(item);
  
  return (
    <div className="flex gap-0.5 flex-wrap justify-center mt-1">
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
};

const CabinetThumbnail = ({ item }: { item: ExtendedCatalogItem }) => {
  const isWall = item.category === 'Wall';
  const { isSink, isCorner, hasDrawers, hasDoors, doorCount, drawerCount } = getCabinetTypeInfo(item);

  const stroke = isWall ? "#9ca3af" : "#6b7280";
  const fill = isWall ? "#f3f4f6" : "#e5e7eb";
  const accentColor = isSink ? "#3b82f6" : isCorner ? "#f59e0b" : "#6b7280";

  // Sink cabinet with basin icons
  if (isSink) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <rect x="4" y="8" width="32" height="24" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
        <ellipse cx="14" cy="18" rx="5" ry="4" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" />
        <ellipse cx="26" cy="18" rx="5" ry="4" fill="#dbeafe" stroke="#3b82f6" strokeWidth="1" />
        <circle cx="20" cy="10" r="1.5" fill="#3b82f6" />
        <line x1="20" y1="12" x2="20" y2="14" stroke="#3b82f6" strokeWidth="1" />
      </svg>
    );
  }

  // Corner cabinet with L-shape
  if (isCorner) {
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <path d="M4 4 H36 V18 H18 V36 H4 Z" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" />
        <circle cx="10" cy="20" r="2" fill="#f59e0b" />
        <circle cx="26" cy="10" r="2" fill="#f59e0b" />
      </svg>
    );
  }

  // Drawer cabinet
  if (hasDrawers && drawerCount > 0) {
    const drawerHeight = 24 / Math.min(drawerCount, 4);
    return (
      <svg width="40" height="40" viewBox="0 0 40 40">
        <rect x="4" y="4" width="32" height="32" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
        {Array.from({ length: Math.min(drawerCount, 4) }).map((_, i) => (
          <g key={i}>
            <rect x="6" y={6 + i * drawerHeight} width="28" height={drawerHeight - 2} rx="1" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="0.5" />
            <line x1="16" y1={6 + i * drawerHeight + drawerHeight / 2} x2="24" y2={6 + i * drawerHeight + drawerHeight / 2} stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    );
  }

  // Door cabinet (1 or 2 doors)
  const is2Door = doorCount >= 2;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40">
      <rect x="4" y="4" width="32" height="32" rx="2" fill={fill} stroke={stroke} strokeWidth="1.5" />
      {is2Door && <line x1="20" y1="6" x2="20" y2="34" stroke={stroke} strokeWidth="1" />}
      <circle cx={is2Door ? 12 : 30} cy="20" r="2" fill={stroke} />
      {is2Door && <circle cx="28" cy="20" r="2" fill={stroke} />}
    </svg>
  );
};

const Sidebar: React.FC<SidebarProps> = ({ onClose, userType = 'standard' }) => {
  const { setPlacementItem, placementItemId, loadSampleKitchen, sampleKitchens } = usePlanner();
  const { catalog, isLoading, isDynamic } = useCatalog(userType);
  const [search, setSearch] = useState('');

  const isTrade = userType === 'trade' || userType === 'admin';

  // Expanded sections (keys are either Base/Wall/Tall... OR spec group names)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    isTrade
      ? { 'Base Cabinets': true, 'Upper Cabinets': true, 'Tall Cabinets': true, Appliances: true }
      : { Base: true, Wall: true, Tall: true, Appliance: true, Structure: true }
  );

  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));

  const filteredCatalog = catalog.filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase()));

  const categories = ['Base', 'Wall', 'Tall', 'Appliance', 'Structure'];
  const specGroups = sortSpecGroups(Array.from(new Set(filteredCatalog.map(i => i.specGroup || 'Other'))));
  const sections = isTrade ? specGroups : categories;

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
        
        {/* Show catalog info */}
        {isDynamic && !isLoading && (
          <div className="mb-2 px-2 py-1 text-xs text-muted-foreground bg-muted/50 rounded">
            {catalog.length} products {userType === 'standard' ? '(curated)' : 'available'}
          </div>
        )}
        
        {!isDynamic && !isLoading && userType === 'standard' && (
          <div className="mb-2 px-2 py-1 text-xs text-muted-foreground bg-blue-50 rounded border border-blue-100">
            Showing popular selections
          </div>
        )}
        
        {!isLoading && sections.map(sectionKey => {
          const items = isTrade
            ? filteredCatalog.filter(item => (item.specGroup || 'Other') === sectionKey)
            : filteredCatalog.filter(item => {
                if (sectionKey === 'Appliance') return item.itemType === 'Appliance';
                if (sectionKey === 'Structure') return item.itemType === 'Structure' || item.itemType === 'Wall';
                return item.category === sectionKey;
              });

          if (items.length === 0) return null;

          const title = isTrade ? sectionKey : `${sectionKey} Cabinets`;
          const isOpen = !!expandedSections[sectionKey];

          return (
            <div key={sectionKey} className="mb-2">
              <button onClick={() => toggleSection(sectionKey)} className="w-full flex items-center justify-between px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded">
                <span className="truncate">{title}</span>
                {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>

              {isOpen && (
                <div className="grid grid-cols-2 gap-1 mt-1">
                  {items.map(item => {
                    const isSelected = placementItemId === item.id;
                    const extendedItem = item as ExtendedCatalogItem;
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
                        <CabinetThumbnail item={extendedItem} />
                        <span className="text-[10px] font-medium text-gray-600 mt-1 text-center leading-tight">{item.sku}</span>
                        <CabinetTypeIndicators item={extendedItem} />
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
