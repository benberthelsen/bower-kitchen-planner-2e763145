import { MaterialOption, HandleDefinition, GlobalDimensions, TapDefinition, ApplianceModel } from './types';

export const WALL_THICKNESS = 200;
export const SNAP_INCREMENT = 50;

// Static catalog removed - now using Microvellum products exclusively from database
// See src/hooks/useCatalog.ts for dynamic catalog loading

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
  wallGap: 10,
  
  // Construction parameters (Microvellum-style defaults)
  boardThickness: 18,        // Standard 18mm board
  backPanelSetback: 16,      // 16mm setback for hanging rails
  topReveal: 3,              // 3mm gap above doors
  sideReveal: 2,             // 2mm gap beside doors
  handleDrillSpacing: 32,    // 32mm system
  
  // Corner cabinet defaults
  cornerFillerWidth: 75,     // 75mm filler for blind corners
  cornerStileWidth: 45,      // 45mm face frame stile
};
