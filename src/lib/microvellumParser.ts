// Microvellum Excel XML parser utility

export interface MicrovellumProduct {
  microvellumLinkId: string;
  name: string;
  category: 'Base' | 'Wall' | 'Tall' | 'Accessory';
  cabinetType: string;
  defaultWidth: number;
  defaultDepth: number;
  defaultHeight: number;
  doorCount: number;
  drawerCount: number;
  isCorner: boolean;
  isSink: boolean;
  isBlind: boolean;
  specGroup: string;
  roomComponentType: string;
  rawMetadata: Record<string, string>;
}

// Category detection based on naming patterns
export function detectCategory(name: string): 'Base' | 'Wall' | 'Tall' | 'Accessory' {
  const lowerName = name.toLowerCase();
  
  // Tall cabinets
  if (lowerName.includes('tall') || lowerName.includes('pantry') || 
      lowerName.includes('oven tower') || lowerName.includes('broom')) {
    return 'Tall';
  }
  
  // Wall cabinets
  if (lowerName.includes('upper') || lowerName.includes('wall') || 
      lowerName.includes('rangehood') || lowerName.includes('microwave')) {
    return 'Wall';
  }
  
  // Accessories
  if (lowerName.includes('panel') || lowerName.includes('filler') || 
      lowerName.includes('spacer') || lowerName.includes('kick') ||
      lowerName.includes('scribe') || lowerName.includes('moulding')) {
    return 'Accessory';
  }
  
  // Default to Base
  return 'Base';
}

// Detect cabinet sub-type
export function detectCabinetType(name: string): string {
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('drawer')) return 'Drawer';
  if (lowerName.includes('corner')) return 'Corner';
  if (lowerName.includes('sink')) return 'Sink';
  if (lowerName.includes('blind')) return 'Blind';
  if (lowerName.includes('appliance') || lowerName.includes('oven')) return 'Appliance';
  if (lowerName.includes('pantry')) return 'Pantry';
  if (lowerName.includes('rangehood')) return 'Rangehood';
  
  return 'Standard';
}

// Extract door/drawer counts from name
export function extractCounts(name: string): { doors: number; drawers: number } {
  const lowerName = name.toLowerCase();
  
  // Match patterns like "4 Drawer", "2 Door", etc.
  const drawerMatch = lowerName.match(/(\d+)\s*drawer/);
  const doorMatch = lowerName.match(/(\d+)\s*door/);
  
  let drawers = drawerMatch ? parseInt(drawerMatch[1], 10) : 0;
  let doors = doorMatch ? parseInt(doorMatch[1], 10) : 0;
  
  // If no explicit count but has "drawer" or "door" in name, assume 1
  if (!drawerMatch && lowerName.includes('drawer')) drawers = 1;
  if (!doorMatch && !drawerMatch && !lowerName.includes('drawer')) {
    // Most cabinets have doors if not drawers
    if (lowerName.includes('door') || detectCabinetType(name) === 'Standard') {
      doors = lowerName.includes('double') ? 2 : 1;
    }
  }
  
  return { doors, drawers };
}

// Get default dimensions based on category
export function getDefaultDimensions(category: 'Base' | 'Wall' | 'Tall' | 'Accessory', name: string): {
  width: number;
  depth: number;
  height: number;
} {
  const lowerName = name.toLowerCase();
  
  switch (category) {
    case 'Base':
      return {
        width: lowerName.includes('corner') ? 900 : 600,
        depth: 575,
        height: 870
      };
    case 'Wall':
      return {
        width: lowerName.includes('corner') ? 600 : 600,
        depth: 350,
        height: 720
      };
    case 'Tall':
      return {
        width: 600,
        depth: 580,
        height: 2100
      };
    case 'Accessory':
      return {
        width: 50,
        depth: 580,
        height: 870
      };
    default:
      return { width: 600, depth: 575, height: 870 };
  }
}

// Check boolean properties from name
export function detectBooleanProperties(name: string): {
  isCorner: boolean;
  isSink: boolean;
  isBlind: boolean;
} {
  const lowerName = name.toLowerCase();
  
  return {
    isCorner: lowerName.includes('corner'),
    isSink: lowerName.includes('sink'),
    isBlind: lowerName.includes('blind')
  };
}

// Parse a single row from the XML into a MicrovellumProduct
export function parseRow(row: Record<string, string>): MicrovellumProduct | null {
  const name = row['Name'] || '';
  const linkId = row['LinkID'] || row['ID'] || '';
  
  if (!name || !linkId) return null;
  
  const category = detectCategory(name);
  const cabinetType = detectCabinetType(name);
  const { doors, drawers } = extractCounts(name);
  const boolProps = detectBooleanProperties(name);
  
  // Use dimensions from XML if available and non-zero, otherwise use defaults
  const xmlWidth = parseFloat(row['Width'] || '0');
  const xmlDepth = parseFloat(row['Depth'] || '0');
  const xmlHeight = parseFloat(row['Height'] || '0');
  
  const defaults = getDefaultDimensions(category, name);
  
  return {
    microvellumLinkId: linkId,
    name,
    category,
    cabinetType,
    defaultWidth: xmlWidth > 0 ? xmlWidth : defaults.width,
    defaultDepth: xmlDepth > 0 ? xmlDepth : defaults.depth,
    defaultHeight: xmlHeight > 0 ? xmlHeight : defaults.height,
    doorCount: doors,
    drawerCount: drawers,
    isCorner: boolProps.isCorner,
    isSink: boolProps.isSink,
    isBlind: boolProps.isBlind,
    specGroup: row['ProductSpecGroupName'] || '',
    roomComponentType: row['RoomComponentType'] || '',
    rawMetadata: row
  };
}
