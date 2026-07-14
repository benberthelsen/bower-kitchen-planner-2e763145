"use strict";
/**
 * proposalToTradeRoom — the single route from a validated AI design proposal
 * to editable trade data (implementation plan §11.1 / Phase D6).
 *
 * Pure and deterministic: given the same proposal, room, defaults and clock,
 * it produces the same TradeRoom. It never invents geometry — every cabinet
 * comes from the proposal's server-compiled PlacedItems. The reverse mapping
 * (ConfiguredCabinet → PlacedItem) lives in cabinetPlacedItem.ts; round-trip
 * tests keep the two directions aligned.
 *
 * Staff promotion (a future promote-ai-design function) must recompile and
 * validate server-side before calling this; browsers never supply TradeRooms.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposalToTradeRoom = proposalToTradeRoom;
const cabinetPlacedItem_1 = require("./cabinetPlacedItem");
const CONVERTIBLE_TYPES = new Set(['Cabinet', 'Appliance']);
function cabinetNumber(index) {
    return `C${String(index + 1).padStart(2, '0')}`;
}
function productNameFor(definitionId) {
    return definitionId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}
function proposalToTradeRoom(input, defaults, options = {}) {
    const now = options.now ?? new Date();
    const { spec, items, room, lineage } = input;
    const materialDefaults = {
        ...defaults.materialDefaults,
        exteriorFinish: spec.style.finishId || defaults.materialDefaults.exteriorFinish,
    };
    const hardwareDefaults = {
        ...defaults.hardwareDefaults,
        handleType: spec.style.handleId || defaults.hardwareDefaults.handleType,
    };
    // Deterministic cabinet order: wall rotation groups first by rotation, then
    // by position along the run, then instanceId as the stable tiebreaker.
    const convertible = items
        .filter(item => CONVERTIBLE_TYPES.has(item.itemType))
        .slice()
        .sort((a, b) => a.rotation - b.rotation
        || a.x - b.x
        || a.z - b.z
        || a.instanceId.localeCompare(b.instanceId));
    const cabinets = convertible.map((item, index) => {
        // The engine's own classification wins (e.g. wall_rangehood is an
        // Appliance); the definition-based classifier covers the rest and the
        // reverse direction.
        const category = item.itemType === 'Appliance'
            ? 'Appliance'
            : (0, cabinetPlacedItem_1.categoryForDefinition)(item.definitionId);
        return {
            instanceId: item.instanceId,
            definitionId: item.definitionId,
            // Promotion always assigns fresh sequential numbers — incoming numbers
            // may be absent or collide across walls.
            cabinetNumber: cabinetNumber(index),
            productName: productNameFor(item.definitionId),
            category,
            dimensions: { width: item.width, height: item.height, depth: item.depth },
            materials: {
                exteriorFinish: item.exteriorMaterialId ?? materialDefaults.exteriorFinish,
                carcaseFinish: item.carcaseMaterialId ?? materialDefaults.carcaseFinish,
                doorStyle: materialDefaults.doorStyle,
                edgeBanding: item.edgeId ?? materialDefaults.edgeBanding,
            },
            hardware: {
                handleType: item.handleType ?? hardwareDefaults.handleType,
                handleColor: hardwareDefaults.handleColor,
                hingeType: hardwareDefaults.hingeType,
                drawerType: hardwareDefaults.drawerType,
                softClose: hardwareDefaults.softClose,
            },
            accessories: {
                shelfCount: category === 'Wall' ? 2 : category === 'Tall' ? 4 : 1,
                adjustableShelves: true,
                dividers: false,
                softCloseUpgrade: false,
                specialFittings: [],
            },
            ...(category === 'Appliance' ? { construction: { topRail: true } } : {}),
            position: { x: item.x, y: item.y, z: item.z, rotation: item.rotation },
            isPlaced: true,
            createdAt: now,
            updatedAt: now,
        };
    });
    const config = {
        width: room.width,
        depth: room.depth,
        height: room.height,
        shape: room.shape,
        cutoutWidth: room.cutoutWidth,
        cutoutDepth: room.cutoutDepth,
        openings: room.openings,
        services: room.services,
    };
    const lineageBits = [
        `AI proposal ${lineage.proposalId}`,
        lineage.proposalFingerprint ? `fingerprint ${lineage.proposalFingerprint}` : null,
        lineage.sessionId ? `session ${lineage.sessionId}` : null,
        lineage.roomRevision !== undefined ? `room revision ${lineage.roomRevision}` : null,
        lineage.engineVersion ? `engine ${lineage.engineVersion}` : null,
        lineage.catalogVersion ? `catalog ${lineage.catalogVersion}` : null,
    ].filter(Boolean);
    return {
        id: options.roomId ?? crypto.randomUUID(),
        name: input.name,
        description: lineageBits.join(' · '),
        shape: 'rectangular',
        config,
        dimensions: defaults.dimensions,
        materialDefaults,
        hardwareDefaults,
        cabinets,
        createdAt: now,
        updatedAt: now,
    };
}
