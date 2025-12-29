import { CatalogItemDefinition, MaterialOption, HandleDefinition, GlobalDimensions, TapDefinition, ApplianceModel } from './types';

export const WALL_THICKNESS = 200;
export const SNAP_INCREMENT = 50;

export const CATALOG: CatalogItemDefinition[] = [
  // --- BASE CABINETS ---
  { id: 'base-150-po', sku: 'B150-PO', name: 'Base Pullout 150', itemType: 'Cabinet', category: 'Base', defaultWidth: 150, defaultDepth: 575, defaultHeight: 870, price: 200 },
  { id: 'base-300-1d', sku: 'B300-1D', name: 'Base 1 Door 300', itemType: 'Cabinet', category: 'Base', defaultWidth: 300, defaultDepth: 575, defaultHeight: 870, price: 180 },
  { id: 'base-450-1d', sku: 'B450-1D', name: 'Base 1 Door 450', itemType: 'Cabinet', category: 'Base', defaultWidth: 450, defaultDepth: 575, defaultHeight: 870, price: 210 },
  { id: 'base-600-1d', sku: 'B600-1D', name: 'Base 1 Door 600', itemType: 'Cabinet', category: 'Base', defaultWidth: 600, defaultDepth: 575, defaultHeight: 870, price: 150 },
  { id: 'base-800-2d', sku: 'B800-2D', name: 'Base 2 Door 800', itemType: 'Cabinet', category: 'Base', defaultWidth: 800, defaultDepth: 575, defaultHeight: 870, price: 280 },
  { id: 'base-900-2d', sku: 'B900-2D', name: 'Base 2 Door 900', itemType: 'Cabinet', category: 'Base', defaultWidth: 900, defaultDepth: 575, defaultHeight: 870, price: 220 },

  // Drawers
  { id: 'base-450-4dr', sku: 'B450-4Dr', name: 'Base 4 Drawers 450', itemType: 'Cabinet', category: 'Base', defaultWidth: 450, defaultDepth: 575, defaultHeight: 870, price: 420 },
  { id: 'base-600-2dr', sku: 'B600-2Dr', name: 'Base 2 Pot Drawers 600', itemType: 'Cabinet', category: 'Base', defaultWidth: 600, defaultDepth: 575, defaultHeight: 870, price: 400 },
  { id: 'base-600-3dr', sku: 'B600-3Dr', name: 'Base 3 Drawers 600', itemType: 'Cabinet', category: 'Base', defaultWidth: 600, defaultDepth: 575, defaultHeight: 870, price: 350 },
  { id: 'base-900-3dr', sku: 'B900-3Dr', name: 'Base 3 Drawers 900', itemType: 'Cabinet', category: 'Base', defaultWidth: 900, defaultDepth: 575, defaultHeight: 870, price: 550 },

  // Special / Corner
  { id: 'base-600-ov', sku: 'B600-OV', name: 'Base Oven Housing 600', itemType: 'Cabinet', category: 'Base', defaultWidth: 600, defaultDepth: 575, defaultHeight: 870, price: 300 },
  { id: 'base-1000-bc', sku: 'BC1000', name: 'Corner Blind 1000', itemType: 'Cabinet', category: 'Base', defaultWidth: 1000, defaultDepth: 575, defaultHeight: 870, price: 400 },
  { id: 'base-900-lc', sku: 'BC900L', name: 'Corner L-Shape 900', itemType: 'Cabinet', category: 'Base', defaultWidth: 900, defaultDepth: 900, defaultHeight: 870, price: 600 },

  // Sink Cabinets
  { id: 'base-600-sink', sku: 'B600-SINK', name: 'Sink Base 600', itemType: 'Cabinet', category: 'Base', defaultWidth: 600, defaultDepth: 575, defaultHeight: 870, price: 150 },
  { id: 'base-900-sink', sku: 'B900-SINK', name: 'Sink Base 900', itemType: 'Cabinet', category: 'Base', defaultWidth: 900, defaultDepth: 575, defaultHeight: 870, price: 200 },

  // --- APPLIANCES ---
  { id: 'app-dw-600', sku: 'AP-DW-600', name: 'Hafele Freestanding DW (SS)', itemType: 'Appliance', defaultWidth: 600, defaultDepth: 600, defaultHeight: 850, price: 800 },
  { id: 'app-dw-blk', sku: 'AP-DW-BLK', name: 'Hafele Freestanding DW (Black)', itemType: 'Appliance', defaultWidth: 600, defaultDepth: 600, defaultHeight: 850, price: 850 },
  { id: 'sink-haf-db', sku: 'SINK-HAF-DB', name: 'Hafele Squareline Double', itemType: 'Appliance', defaultWidth: 800, defaultDepth: 450, defaultHeight: 200, price: 950 },
  { id: 'sink-haf-sb', sku: 'SINK-HAF-SB', name: 'Hafele Squareline Single', itemType: 'Appliance', defaultWidth: 450, defaultDepth: 450, defaultHeight: 200, price: 750 },
  { id: 'cooktop-600-ind', sku: 'CT-600-IND', name: 'Induction Cooktop 600', itemType: 'Appliance', defaultWidth: 600, defaultDepth: 520, defaultHeight: 50, price: 700 },
  { id: 'cooktop-900-gas', sku: 'CT-900-GAS', name: 'Gas Cooktop 900', itemType: 'Appliance', defaultWidth: 900, defaultDepth: 520, defaultHeight: 50, price: 900 },

  // --- WALL CABINETS ---
  { id: 'wall-300-1d', sku: 'W300-1D', name: 'Wall 1 Door 300', itemType: 'Cabinet', category: 'Wall', defaultWidth: 300, defaultDepth: 350, defaultHeight: 720, price: 120 },
  { id: 'wall-450-1d', sku: 'W450-1D', name: 'Wall 1 Door 450', itemType: 'Cabinet', category: 'Wall', defaultWidth: 450, defaultDepth: 350, defaultHeight: 720, price: 140 },
  { id: 'wall-600-1d', sku: 'W600-1D', name: 'Wall 1 Door 600', itemType: 'Cabinet', category: 'Wall', defaultWidth: 600, defaultDepth: 350, defaultHeight: 720, price: 100 },
  { id: 'wall-600-2d', sku: 'W600-2D', name: 'Wall 2 Door 600', itemType: 'Cabinet', category: 'Wall', defaultWidth: 600, defaultDepth: 350, defaultHeight: 720, price: 150 },
  { id: 'wall-800-2d', sku: 'W800-2D', name: 'Wall 2 Door 800', itemType: 'Cabinet', category: 'Wall', defaultWidth: 800, defaultDepth: 350, defaultHeight: 720, price: 180 },
  { id: 'wall-900-2d', sku: 'W900-2D', name: 'Wall 2 Door 900', itemType: 'Cabinet', category: 'Wall', defaultWidth: 900, defaultDepth: 350, defaultHeight: 720, price: 160 },
  { id: 'wall-600-rh', sku: 'W600-RH-2D', name: 'Wall Rangehood 600', itemType: 'Cabinet', category: 'Wall', defaultWidth: 600, defaultDepth: 350, defaultHeight: 400, price: 150 },
  { id: 'wall-900-rh', sku: 'W900-RH-2D', name: 'Wall Rangehood 900', itemType: 'Cabinet', category: 'Wall', defaultWidth: 900, defaultDepth: 350, defaultHeight: 400, price: 200 },

  // --- TALL CABINETS ---
  { id: 'tall-450-1d', sku: 'T450-1D', name: 'Pantry 1 Door 450', itemType: 'Cabinet', category: 'Tall', defaultWidth: 450, defaultDepth: 600, defaultHeight: 2200, price: 450 },
  { id: 'tall-600-2d', sku: 'T600-2D', name: 'Pantry 2 Door 600', itemType: 'Cabinet', category: 'Tall', defaultWidth: 600, defaultDepth: 600, defaultHeight: 2200, price: 500 },
  { id: 'tall-600-ov', sku: 'T600-OV', name: 'Oven Tower 600', itemType: 'Cabinet', category: 'Tall', defaultWidth: 600, defaultDepth: 600, defaultHeight: 2200, price: 700 },
  { id: 'tall-1000-ref', sku: 'T1000-REF', name: 'Fridge Space 1000', itemType: 'Cabinet', category: 'Tall', defaultWidth: 1000, defaultDepth: 600, defaultHeight: 2200, price: 400 },

  // --- STRUCTURES ---
  { id: 'door-std', sku: 'DR-820', name: 'Internal Door', itemType: 'Structure', defaultWidth: 820, defaultDepth: 100, defaultHeight: 2100, price: 150 },
  { id: 'win-1200', sku: 'WIN-1200', name: 'Window 1200w', itemType: 'Structure', defaultWidth: 1200, defaultDepth: 0, defaultHeight: 1000, price: 400 },
  { id: 'wall-part', sku: 'WALL-INT', name: 'Internal Wall', itemType: 'Wall', defaultWidth: 1000, defaultDepth: 100, defaultHeight: 2400, price: 80 }
];

export const FINISH_OPTIONS: MaterialOption[] = [
  { id: 'do-designer-white', name: 'Designer White', hex: '#fcfcfc', priceMultiplier: 1.0, textureType: 'none', roughness: 0.2, metalness: 0.0 },
  { id: 'do-classic-white', name: 'Classic White', hex: '#f4f4f4', priceMultiplier: 1.0, textureType: 'none', roughness: 0.2, metalness: 0.0 },
  { id: 'do-stone-grey', name: 'Stone Grey', hex: '#8c8c8c', priceMultiplier: 1.0, textureType: 'none', roughness: 0.4, metalness: 0.0 },
  { id: 'do-charcoal', name: 'Charcoal', hex: '#363636', priceMultiplier: 1.0, textureType: 'none', roughness: 0.5, metalness: 0.0 },
  { id: 'do-black', name: 'Black', hex: '#1a1a1a', priceMultiplier: 1.1, textureType: 'none', roughness: 0.5, metalness: 0.0 },
  { id: 'do-natural-oak', name: 'Natural Oak', hex: '#d4c2a5', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.6, metalness: 0.0 },
  { id: 'do-spotted-gum', name: 'Spotted Gum', hex: '#ac8868', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.6, metalness: 0.0 },
  { id: 'do-natural-walnut', name: 'Natural Walnut', hex: '#5d4037', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.6, metalness: 0.0 },
];

export const BENCHTOP_OPTIONS: MaterialOption[] = [
  { id: 'egger-premium-white', name: 'Premium White (W1000)', hex: '#ffffff', priceMultiplier: 1.0, textureType: 'none', roughness: 0.1, metalness: 0.0 },
  { id: 'egger-white-carrara', name: 'White Carrara Marble (F204)', hex: '#ebebeb', priceMultiplier: 1.1, textureType: 'marble', roughness: 0.1, metalness: 0.1 },
  { id: 'egger-concrete-chicago-light', name: 'Light Chicago Concrete (F186)', hex: '#b0b0b0', priceMultiplier: 1.1, textureType: 'concrete', roughness: 0.8, metalness: 0.0 },
  { id: 'egger-concrete-chicago-dark', name: 'Dark Chicago Concrete (F187)', hex: '#595959', priceMultiplier: 1.1, textureType: 'concrete', roughness: 0.8, metalness: 0.0 },
  { id: 'egger-halifax-oak-nat', name: 'Natural Halifax Oak (H1180)', hex: '#d6c5a6', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.6, metalness: 0.0 },
  { id: 'egger-black', name: 'Black (U999)', hex: '#1a1a1a', priceMultiplier: 1.1, textureType: 'none', roughness: 0.2, metalness: 0.0 },
];

export const KICK_OPTIONS: MaterialOption[] = [
  { id: 'kick-stainless', name: 'Brushed Stainless', hex: '#e5e7eb', priceMultiplier: 0, roughness: 0.3, metalness: 0.9, textureType: 'none' },
  { id: 'kick-brass', name: 'Brushed Brass', hex: '#fcd34d', priceMultiplier: 0, roughness: 0.3, metalness: 0.8, textureType: 'none' },
  { id: 'kick-black', name: 'Matte Black', hex: '#111827', priceMultiplier: 0, roughness: 0.8, metalness: 0.0, textureType: 'none' },
  { id: 'kick-white', name: 'White Satin', hex: '#ffffff', priceMultiplier: 0, roughness: 0.3, metalness: 0.0, textureType: 'none' },
];

export const TAP_OPTIONS: TapDefinition[] = [
  { id: 'tap-chrome', name: 'Chrome Mixer', type: 'Mixer', hex: '#e5e7eb' },
  { id: 'tap-goose-bk', name: 'Black Gooseneck', type: 'Gooseneck', hex: '#1a1a1a' },
  { id: 'tap-goose-ss', name: 'Brushed Gooseneck', type: 'Gooseneck', hex: '#9ca3af' },
];

export const APPLIANCE_MODELS: ApplianceModel[] = [
  { id: 'oven-hafele-600-ss', name: 'Hafele 600mm Oven (SS)', type: 'Oven', hex: '#d1d5db' },
  { id: 'oven-hafele-600-blk', name: 'Hafele 600mm Oven (Black)', type: 'Oven', hex: '#1a1a1a' },
  { id: 'mw-hafele-600-ss', name: 'Hafele Built-in Microwave (SS)', type: 'Microwave', hex: '#d1d5db' },
];

export const HANDLE_OPTIONS: HandleDefinition[] = [
  { id: 'handle-bar-ss', name: 'Stainless Bar', type: 'Bar', hex: '#d1d5db', price: 15 },
  { id: 'handle-bar-bk', name: 'Matte Black Bar', type: 'Bar', hex: '#1f2937', price: 15 },
  { id: 'handle-bar-go', name: 'Brushed Gold Bar', type: 'Bar', hex: '#d4af37', price: 25 },
  { id: 'handle-knob-ss', name: 'Stainless Knob', type: 'Knob', hex: '#d1d5db', price: 10 },
  { id: 'handle-lip-ss', name: 'Lip Pull Silver', type: 'Lip', hex: '#e5e7eb', price: 12 },
  { id: 'handle-none', name: 'Push to Open', type: 'None', hex: 'transparent', price: 0 },
];

export const HINGE_OPTIONS = ['Blum Inserta Soft Close', 'Blum Standard', 'Hettich Sensys', 'Generic Soft Close'];
export const DRAWER_OPTIONS = ['Hafele Alto Slim', 'Blum Antaro', 'Hettich InnoTech', 'Generic Metal Box'];

export const DEFAULT_GLOBAL_DIMENSIONS: GlobalDimensions = {
  toeKickHeight: 135,
  shelfSetback: 5,
  baseHeight: 730,
  baseDepth: 575,
  wallHeight: 720,
  wallDepth: 350,
  tallHeight: 2100,
  tallDepth: 580,
  benchtopThickness: 33,
  benchtopOverhang: 25,
  splashbackHeight: 600,
  doorGap: 2,
  drawerGap: 2,
  leftGap: 1.5,
  rightGap: 1.5,
  topMargin: 0,
  bottomMargin: 0,
  wallGap: 10, // 10mm gap between cabinet back and wall for installation tolerance
};
