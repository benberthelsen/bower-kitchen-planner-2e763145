"use strict";
/**
 * Role → catalog product mapping.
 * v1 maps to the STATIC_LIBRARY_TEMPLATES ids in useCatalog.ts (these always
 * render in UnifiedScene). A DB-backed resolver can override per role later —
 * keep this the single place role→SKU knowledge lives.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FIXED_WIDTH_ROLES = exports.FRIDGE_TOP_ID = exports.RANGEHOOD_ID = exports.WALL_CAB = exports.ROLE_PRODUCTS = void 0;
exports.resolveDefinition = resolveDefinition;
exports.resolveCornerVariant = resolveCornerVariant;
exports.ROLE_PRODUCTS = {
    sink: { definitionId: 'sink_base_2_door', widths: [900, 800, 600], kind: 'base', priceWeight: 620 },
    cooktop: { definitionId: 'base_2_door', widths: [900, 600], kind: 'base', priceWeight: 560 },
    dishwasher: { definitionId: 'dishwasher_opening', widths: [600], kind: 'appliance', priceWeight: 160 },
    drawers: { definitionId: 'base_3_drawer', widths: [900, 600, 450], kind: 'base', priceWeight: 890 },
    doors: { definitionId: 'base_2_door', widths: [900, 600, 450, 300], kind: 'base', priceWeight: 520 },
    pantry: { definitionId: 'tall_2_door_pantry', widths: [900, 600, 450], kind: 'tall', priceWeight: 1150 },
    'oven-tower': { definitionId: 'tall_oven', widths: [600], kind: 'tall', priceWeight: 980 },
    'fridge-gap': { definitionId: 'fridge_opening', widths: [940, 920, 860], kind: 'appliance', priceWeight: 220 },
    corner: { definitionId: 'base_corner_blind_left', widths: [900, 1000], kind: 'base', priceWeight: 950 },
};
/** Single-door variant when a narrow width is used. */
function resolveDefinition(role, widthMm) {
    if (role === 'doors' && widthMm <= 600)
        return 'base_1_door';
    if (role === 'sink' && widthMm <= 600)
        return 'sink_base_1_door';
    if (role === 'drawers' && widthMm <= 450)
        return 'base_3_drawer';
    return exports.ROLE_PRODUCTS[role].definitionId;
}
/**
 * Blind-corner variant by which side of the cabinet (as seen from the room,
 * i.e. in wall-offset terms: low-t = Left) faces the corner. The blind panel
 * must be on the corner side so the doors open clear of the adjacent run.
 */
function resolveCornerVariant(blindSide) {
    return blindSide === 'Left' ? 'base_corner_blind_left' : 'base_corner_blind_right';
}
/** Wall-cabinet fill products (above base runs). */
exports.WALL_CAB = { definitionId: 'wall_2_door', narrowId: 'wall_1_door', widths: [900, 600, 450, 300] };
exports.RANGEHOOD_ID = 'wall_rangehood';
exports.FRIDGE_TOP_ID = 'fridge_top_cabinet';
/** Fixed appliance/role widths that must not be resized to fit. */
exports.FIXED_WIDTH_ROLES = ['dishwasher', 'oven-tower'];
