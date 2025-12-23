import React, { useState } from 'react';
import { CATALOG } from '../../constants';
import { usePlanner } from '../../store/PlannerContext';
import { Plus, ChevronDown, ChevronRight, Search, Box } from 'lucide-react';
import { CatalogItemDefinition } from '../../types';

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
  const { addItem } = usePlanner();
  const [search, setSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ 'Base': true, 'Wall': true, 'Tall': true, 'Appliance': true, 'Structure': true });

  const toggleCategory = (cat: string) => setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));

  const filteredCatalog = CATALOG.filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.sku.toLowerCase().includes(search.toLowerCase()));

  const categories = ['Base', 'Wall', 'Tall', 'Appliance', 'Structure'];

  const handleDragStart = (e: React.DragEvent, item: CatalogItemDefinition) => {
    e.dataTransfer.setData('definitionId', item.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search cabinets..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {categories.map(category => {
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
                  {items.map(item => (
                    <div key={item.id} draggable onDragStart={e => handleDragStart(e, item)} onClick={() => addItem(item.id)} className="flex flex-col items-center p-2 border rounded cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors">
                      <CabinetThumbnail item={item} />
                      <span className="text-[10px] font-medium text-gray-600 mt-1 text-center leading-tight">{item.sku}</span>
                      <span className="text-[9px] text-gray-400">${item.price}</span>
                    </div>
                  ))}
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
