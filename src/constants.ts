import { MaterialOption, HandleDefinition, GlobalDimensions, TapDefinition, ApplianceModel } from './types';

export const WALL_THICKNESS = 200;
export const SNAP_INCREMENT = 50;

// Static catalog removed - now using Microvellum products exclusively from database
// See src/hooks/useCatalog.ts for dynamic catalog loading

export const FINISH_OPTIONS: MaterialOption[] = [
  { id: 'do-designer-white', name: 'Polar White Matt', hex: '#f5f4ef', priceMultiplier: 1.0, textureType: 'none', roughness: 0.45, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY25776', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/polar-white/showroom/polar-white.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/polar-white/fullsheet/polar-white.jpg', surface: 'door', grainDirection: 'none', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-classic-white', name: 'Classic White Matt', hex: '#f2f1eb', priceMultiplier: 1.0, textureType: 'none', roughness: 0.45, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY940', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/classic-white/showroom/classic-white-ashgrain.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/classic-white/fullsheet/classic-white.jpg', surface: 'door', grainDirection: 'none', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-stone-grey', name: 'Stone Grey Matt', hex: '#8f8d86', priceMultiplier: 1.0, textureType: 'none', roughness: 0.5, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY25622', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/stone-grey/showroom/stone-grey.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/stone-grey/fullsheet/stone-grey.jpg', surface: 'door', grainDirection: 'none', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-charcoal', name: 'Cinder Woodmatt', hex: '#595754', priceMultiplier: 1.05, textureType: 'wood', roughness: 0.62, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY51161', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/cinder/showroom/cinder.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/cinder/fullsheet/cinder.jpg', surface: 'door', grainDirection: 'vertical', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-black', name: 'Black Woodmatt', hex: '#171717', priceMultiplier: 1.1, textureType: 'wood', roughness: 0.62, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY47250', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/black/showroom/black.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/black/fullsheet/black.jpg', surface: 'door', grainDirection: 'vertical', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-natural-oak', name: 'Prime Oak Woodmatt', hex: '#b89a72', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.62, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY46822', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/prime-oak/showroom/prime-oak.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/prime-oak/fullsheet/prime-oak.jpg', surface: 'door', grainDirection: 'vertical', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-spotted-gum', name: 'Coastal Oak Woodmatt', hex: '#b19578', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.62, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY46824', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/coastal-oak/showroom/coastal-oak.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/coastal-oak/fullsheet/coastal-oak-woodmatt.jpg', surface: 'door', grainDirection: 'vertical', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-natural-walnut', name: 'Notaio Walnut Woodmatt', hex: '#6b4a35', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.62, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY46647', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/notaio-walnut/showroom/notaio-walnut.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/notaio-walnut/fullsheet/notaio-walnut.jpg', surface: 'door', grainDirection: 'vertical', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-boston-oak', name: 'Boston Oak Woodmatt', hex: '#9a6f4d', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.62, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY51913', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/boston-oak/showroom/boston-oak.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/boston-oak/fullsheet/boston-oak.jpg', surface: 'door', grainDirection: 'vertical', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
  { id: 'do-bottega-oak', name: 'Bottega Oak Woodmatt', hex: '#c5aa84', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.62, metalness: 0, supplier: 'Polytec', supplierCode: 'POLY46826', swatchUrl: '/data/bower-supplier-catalog/assets/polytec/colours/bottega-oak/showroom/bottega-oak.jpg', textureUrl: '/data/bower-supplier-catalog/assets/polytec/colours/bottega-oak/fullsheet/bottega-oak-woodmatt.jpg', surface: 'door', grainDirection: 'vertical', textureRepeatMm: { width: 1200, height: 2400 }, availability: 'available' },
];

export const BENCHTOP_OPTIONS: MaterialOption[] = [
  { id: 'egger-premium-white', name: 'Premium White W1000 ST9', hex: '#f4f2ec', priceMultiplier: 1.0, textureType: 'stone', roughness: 0.42, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGPPRWS3609', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/premium-white-w1000-st9.jpg', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/premium-white-w1000-st9.jpg', surface: 'benchtop', grainDirection: 'none', textureRepeatMm: { width: 920, height: 3650 }, availability: 'available' },
  { id: 'egger-white-carrara', name: 'Crystal Marble F800 ST9', hex: '#e8e5df', priceMultiplier: 1.1, textureType: 'marble', roughness: 0.38, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGPCLMS3609', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/crystal-marble-f800-st9.jpg', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/crystal-marble-f800-st9.jpg', surface: 'benchtop', grainDirection: 'none', textureRepeatMm: { width: 920, height: 3650 }, availability: 'available' },
  { id: 'egger-concrete-chicago-light', name: 'Light Grey Chicago Concrete F186 ST9', hex: '#aaa8a2', priceMultiplier: 1.1, textureType: 'concrete', roughness: 0.68, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGPLGCS3606', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/light-grey-chicago-concrete-f186-st9.jpg', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/light-grey-chicago-concrete-f186-st9.jpg', surface: 'benchtop', grainDirection: 'none', textureRepeatMm: { width: 600, height: 3650 }, availability: 'available' },
  { id: 'egger-concrete-chicago-dark', name: 'Dark Grey Chicago Concrete F187 ST9', hex: '#595a58', priceMultiplier: 1.1, textureType: 'concrete', roughness: 0.68, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGPDGCS3609', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/dark-grey-chicago-concrete-f187-st9.jpg', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/dark-grey-chicago-concrete-f187-st9.jpg', surface: 'benchtop', grainDirection: 'none', textureRepeatMm: { width: 920, height: 3650 }, availability: 'available' },
  { id: 'egger-halifax-oak-nat', name: 'Natural Halifax Oak H1180 ST37', hex: '#c5aa82', priceMultiplier: 1.2, textureType: 'wood', roughness: 0.58, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGPNHOI3609', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/natural-halifax-oak-h1180-st37.jpg', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/natural-halifax-oak-h1180-st37.jpg', surface: 'benchtop', grainDirection: 'horizontal', textureRepeatMm: { width: 920, height: 3650 }, availability: 'available' },
  { id: 'egger-black', name: 'Black Pietra Grigia F206 ST9', hex: '#242424', priceMultiplier: 1.15, textureType: 'stone', roughness: 0.44, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGPBPGT3609', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/black-pietra-grigia-f206-st9.png', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/black-pietra-grigia-f206-st9.png', surface: 'benchtop', grainDirection: 'none', textureRepeatMm: { width: 920, height: 3650 }, availability: 'available' },
  { id: 'egger-cremona-marble', name: 'Cremona Marble F229 ST75', hex: '#ddd7ce', priceMultiplier: 1.15, textureType: 'marble', roughness: 0.4, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGPCRML3609', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/cremona-marble-f229-st75.jpg', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/cremona-marble-f229-st75.jpg', surface: 'benchtop', grainDirection: 'none', textureRepeatMm: { width: 920, height: 3650 }, availability: 'available' },
  { id: 'egger-anthracite-jura', name: 'Anthracite Jura Slate F242 ST10', hex: '#4b4b49', priceMultiplier: 1.15, textureType: 'stone', roughness: 0.62, metalness: 0, supplier: 'EGGER', supplierCode: 'EGGH38AJSR3609', swatchUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/anthracite-jura-slate-f242-st10.jpg', textureUrl: '/data/bower-supplier-catalog/assets/forest-one/finishes/egger-worktops/anthracite-jura-slate-f242-st10.jpg', surface: 'benchtop', grainDirection: 'none', textureRepeatMm: { width: 920, height: 3650 }, availability: 'available' },
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
  wallMountHeight: 1350,       // Standard floor-to-underside of wall cabinet
  doorGap: 2,
  drawerGap: 2,
  leftGap: 1.5,
  rightGap: 1.5,
  topMargin: 0,
  bottomMargin: 0,
  wallGap: 10,
  
  // Construction parameters (Microvellum-style defaults)
  boardThickness: 16,        // MV-verified 16mm board
  backPanelSetback: 16,      // 16mm setback for hanging rails
  topReveal: 1,              // MV-verified (door height = carcass − 2)
  sideReveal: 1,             // MV-verified (door/front width = cabinet − 2)
  handleDrillSpacing: 32,    // 32mm system
  
  // Corner cabinet defaults
  cornerFillerWidth: 75,     // 75mm filler for blind corners
  cornerStileWidth: 45,      // 45mm face frame stile
};
