// Shared constants for catalog spec groups (Microvellum-style categories)

import { 
  Box, 
  CornerDownRight, 
  Layers, 
  Archive,
  Grid2X2,
  LayoutGrid,
  Refrigerator,
  Wrench,
  Puzzle,
  Columns3,
  Square,
  PanelTop,
  type LucideIcon
} from 'lucide-react';

// Order for displaying spec groups in sidebar/catalog
export const SPEC_GROUP_ORDER = [
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
] as const;

export type SpecGroupName = typeof SPEC_GROUP_ORDER[number] | 'Other';

// Icons for each spec group
export const SPEC_GROUP_ICONS: Record<string, LucideIcon> = {
  'Base Cabinets': Box,
  'Base Corner Cabinets': CornerDownRight,
  'Base Door-Drawer Cabinets': Layers,
  'Base Drawer Bank Cabinets': Archive,
  'Sink Cabinets': Grid2X2,
  'Upper Cabinets': PanelTop,
  'Upper Corner Cabinets': Square,
  'Tall Cabinets': Columns3,
  'Tall Corner Cabinets': CornerDownRight,
  'Appliances': Refrigerator,
  'Accessories': Wrench,
  'Parts': Puzzle,
  'Other': LayoutGrid,
};

// Color classes for category badges
export const SPEC_GROUP_COLORS: Record<string, string> = {
  'Base Cabinets': 'bg-blue-500',
  'Base Corner Cabinets': 'bg-blue-400',
  'Base Door-Drawer Cabinets': 'bg-blue-600',
  'Base Drawer Bank Cabinets': 'bg-blue-700',
  'Sink Cabinets': 'bg-cyan-500',
  'Upper Cabinets': 'bg-green-500',
  'Upper Corner Cabinets': 'bg-green-400',
  'Tall Cabinets': 'bg-purple-500',
  'Tall Corner Cabinets': 'bg-purple-400',
  'Appliances': 'bg-orange-500',
  'Accessories': 'bg-amber-500',
  'Parts': 'bg-gray-500',
  'Other': 'bg-gray-400',
};

// Helper to sort spec groups in correct order
export function sortSpecGroups(groups: string[]): string[] {
  const orderMap = new Map<string, number>(SPEC_GROUP_ORDER.map((g, i) => [g, i]));
  
  return [...groups].sort((a, b) => {
    const aIndex = orderMap.get(a) ?? 999;
    const bIndex = orderMap.get(b) ?? 999;
    if (aIndex !== bIndex) return aIndex - bIndex;
    // Alphabetical fallback for unknown groups
    return a.localeCompare(b);
  });
}

// Helper to get the cabinet category from a spec group
export function getCategoryFromSpecGroup(specGroup: string | null | undefined): 'Base' | 'Wall' | 'Tall' | 'Appliance' {
  if (!specGroup) return 'Base';
  
  const lower = specGroup.toLowerCase();
  
  if (lower.includes('appliance')) return 'Appliance';
  if (lower.includes('upper') || lower.includes('wall')) return 'Wall';
  if (lower.includes('tall')) return 'Tall';
  
  // Base, Sink, Accessories, Parts default to Base
  return 'Base';
}
