"use strict";
/**
 * Adapters between the homeowner wizard's simple state and the engine's
 * DesignBrief/RoomSpec.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toRoomSpec = toRoomSpec;
exports.briefFromWizard = briefFromWizard;
/** Fill the optional arrays so the engine always sees a complete RoomSpec. */
function toRoomSpec(room) {
    return { ...room, openings: room.openings ?? [], services: room.services ?? [] };
}
/** Map today's wizard fields to a DesignBrief (richer wizard steps can extend this). */
function briefFromWizard(input, room) {
    const roomSpec = toRoomSpec({
        width: input.roomWidth,
        depth: input.roomDepth,
        height: 2700,
        shape: 'Rectangle',
        cutoutWidth: 0,
        cutoutDepth: 0,
        ...room,
    });
    return {
        room: roomSpec,
        household: {},
        priorities: input.layoutStyle === 'full-storage' ? ['storage'] : input.layoutStyle === 'minimal' ? ['bench-space'] : [],
        appliances: { dishwasher: input.layoutStyle !== 'minimal', fridgeWidthMm: 940 },
        island: 'no',
    };
}
