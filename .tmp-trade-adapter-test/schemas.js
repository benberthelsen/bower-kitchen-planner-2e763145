"use strict";
/**
 * Zod schemas mirroring src/lib/layout/types.ts.
 * Used to validate AI tool payloads (edge function) and URL/session hydration.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizeSelectionSchema = exports.aiDesignerRequestSchema = exports.kitchenSpecSchema = exports.styleSpecSchema = exports.runSchema = exports.segmentSchema = exports.segmentRoleSchema = exports.designBriefSchema = exports.proposedRoomPatchSchema = exports.roomSpecSchema = exports.servicePointSchema = exports.openingSchema = exports.wallSchema = void 0;
const zod_1 = require("zod");
exports.wallSchema = zod_1.z.enum(['N', 'E', 'S', 'W']);
exports.openingSchema = zod_1.z.object({
    id: zod_1.z.string(),
    wall: exports.wallSchema,
    type: zod_1.z.enum(['door', 'window', 'walkway']),
    offsetMm: zod_1.z.number().min(0),
    widthMm: zod_1.z.number().min(200).max(6000),
    heightMm: zod_1.z.number().min(200).max(3000).optional(),
    sillHeightMm: zod_1.z.number().min(0).max(2000).optional(),
    swing: zod_1.z.enum(['in-left', 'in-right', 'out', 'slider']).optional(),
});
exports.servicePointSchema = zod_1.z.object({
    id: zod_1.z.string(),
    wall: exports.wallSchema,
    type: zod_1.z.enum(['water-supply', 'drain', 'gpo', 'gas', 'hood-duct']),
    offsetMm: zod_1.z.number().min(0),
    heightMm: zod_1.z.number().min(0).max(3000).optional(),
});
exports.roomSpecSchema = zod_1.z.object({
    width: zod_1.z.number().min(1200).max(12000),
    depth: zod_1.z.number().min(1200).max(12000),
    height: zod_1.z.number().min(2100).max(4000),
    shape: zod_1.z.enum(['Rectangle', 'LShape']),
    cutoutWidth: zod_1.z.number().min(0),
    cutoutDepth: zod_1.z.number().min(0),
    openings: zod_1.z.array(exports.openingSchema),
    services: zod_1.z.array(exports.servicePointSchema),
}).strict().superRefine((room, context) => {
    if (room.shape === 'Rectangle' && (room.cutoutWidth !== 0 || room.cutoutDepth !== 0)) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['shape'], message: 'Rectangular rooms cannot have a cutout' });
    }
    if (room.shape === 'LShape' && (room.cutoutWidth <= 0 || room.cutoutDepth <= 0
        || room.cutoutWidth >= room.width || room.cutoutDepth >= room.depth)) {
        context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['shape'], message: 'L-shaped rooms require a cutout smaller than the room' });
    }
    for (const [index, opening] of room.openings.entries()) {
        const wallLength = opening.wall === 'N' || opening.wall === 'S' ? room.width : room.depth;
        if (opening.offsetMm + opening.widthMm > wallLength) {
            context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['openings', index], message: 'Opening extends beyond its wall' });
        }
    }
    for (const [index, service] of room.services.entries()) {
        const wallLength = service.wall === 'N' || service.wall === 'S' ? room.width : room.depth;
        if (service.offsetMm > wallLength) {
            context.addIssue({ code: zod_1.z.ZodIssueCode.custom, path: ['services', index], message: 'Service point is beyond its wall' });
        }
    }
});
exports.proposedRoomPatchSchema = zod_1.z.object({
    width: zod_1.z.number().min(1200).max(12000).optional(),
    depth: zod_1.z.number().min(1200).max(12000).optional(),
    height: zod_1.z.number().min(2100).max(4000).optional(),
    shape: zod_1.z.enum(['Rectangle', 'LShape']).optional(),
    cutoutWidth: zod_1.z.number().min(0).max(12000).optional(),
    cutoutDepth: zod_1.z.number().min(0).max(12000).optional(),
    openings: zod_1.z.array(exports.openingSchema).optional(),
    services: zod_1.z.array(exports.servicePointSchema).optional(),
}).strict().refine(patch => Object.keys(patch).length > 0, { message: 'At least one room change is required' });
exports.designBriefSchema = zod_1.z.object({
    room: exports.roomSpecSchema,
    household: zod_1.z.object({
        size: zod_1.z.number().int().min(1).max(12).optional(),
        cooks: zod_1.z.enum(['rare', 'daily', 'entertainer']).optional(),
    }),
    priorities: zod_1.z.array(zod_1.z.enum(['storage', 'bench-space', 'entertaining', 'baking', 'budget'])),
    appliances: zod_1.z.object({
        oven: zod_1.z.enum(['600', '900']).optional(),
        cooktop: zod_1.z.enum(['gas', 'induction']).optional(),
        dishwasher: zod_1.z.boolean(),
        fridgeWidthMm: zod_1.z.number().min(500).max(1400).optional(),
        microwave: zod_1.z.enum(['built-in', 'benchtop', 'none']).optional(),
    }),
    island: zod_1.z.enum(['want', 'no', 'if-it-fits']),
    styleWords: zod_1.z.string().max(500).optional(),
    budgetBand: zod_1.z.enum(['value', 'mid', 'premium']).optional(),
    // Wizard wall picker — without this line zod strips the field and the
    // edge function would silently ignore the customer's wall choices.
    allowedWalls: zod_1.z.array(exports.wallSchema).max(4).optional(),
});
exports.segmentRoleSchema = zod_1.z.enum([
    'sink', 'cooktop', 'dishwasher', 'drawers', 'doors',
    'pantry', 'oven-tower', 'fridge-gap', 'corner',
]);
exports.segmentSchema = zod_1.z.discriminatedUnion('kind', [
    zod_1.z.object({ kind: zod_1.z.literal('cabinet'), role: exports.segmentRoleSchema, widthMm: zod_1.z.number().min(150).max(1400).optional() }),
    zod_1.z.object({ kind: zod_1.z.literal('filler'), widthMm: zod_1.z.number().min(10).max(200) }),
    zod_1.z.object({ kind: zod_1.z.literal('gap'), reason: zod_1.z.string().max(200), widthMm: zod_1.z.number().min(50).max(2000) }),
]);
exports.runSchema = zod_1.z.object({
    wall: exports.wallSchema,
    segments: zod_1.z.array(exports.segmentSchema).min(1).max(24),
    wallCabinets: zod_1.z.boolean(),
    fromEnd: zod_1.z.boolean().optional(),
});
exports.styleSpecSchema = zod_1.z.object({
    finishId: zod_1.z.string(),
    benchtopId: zod_1.z.string(),
    handleId: zod_1.z.string(),
    kickId: zod_1.z.string().optional(),
    tapId: zod_1.z.string().optional(),
});
exports.kitchenSpecSchema = zod_1.z.object({
    runs: zod_1.z.array(exports.runSchema).min(1).max(4),
    island: zod_1.z.object({
        lengthMm: zod_1.z.number().min(1200).max(4000),
        depthMm: zod_1.z.number().min(600).max(1500),
        features: zod_1.z.array(zod_1.z.enum(['seating', 'sink', 'storage'])),
    }).optional(),
    style: exports.styleSpecSchema,
    rationale: zod_1.z.string().max(2000),
});
exports.aiDesignerRequestSchema = zod_1.z.object({
    mode: zod_1.z.enum(['generate', 'refine', 'style']).default('generate'),
    brief: exports.designBriefSchema,
    shape: zod_1.z.enum(['single-wall', 'l-shape', 'u-shape', 'galley']).default('l-shape'),
    currentSpec: exports.kitchenSpecSchema.optional(),
    currentProposalId: zod_1.z.string().uuid().optional(),
    session: zod_1.z.object({
        id: zod_1.z.string().uuid(),
        token: zod_1.z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
        designRevision: zod_1.z.number().int().nonnegative(),
    }).strict().optional(),
    message: zod_1.z.string().trim().max(2000).optional(),
    history: zod_1.z.array(zod_1.z.object({
        role: zod_1.z.enum(['user', 'assistant']),
        content: zod_1.z.string().max(2000),
    }).strict()).max(12).default([]),
}).strict().superRefine((request, context) => {
    if (request.mode !== 'generate' && !request.currentSpec) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['currentSpec'],
            message: `${request.mode} mode requires a current design`,
        });
    }
    if (request.mode !== 'generate' && !request.session) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['session'],
            message: `${request.mode} mode requires an authorized design session`,
        });
    }
    if (request.mode !== 'generate' && !request.currentProposalId) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            path: ['currentProposalId'],
            message: `${request.mode} mode requires the current persisted proposal`,
        });
    }
    if (request.mode === 'generate' && (request.session || request.currentProposalId)) {
        context.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'generate mode starts a new design session',
        });
    }
});
exports.finalizeSelectionSchema = zod_1.z.object({
    options: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().trim().min(1).max(120),
        proposalId: zod_1.z.string().min(10).max(160),
    }).strict()).min(1).max(3),
    changeSummary: zod_1.z.string().max(1000).optional(),
    unchanged: zod_1.z.boolean().optional(),
}).strict();
