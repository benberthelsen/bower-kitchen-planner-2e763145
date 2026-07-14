"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.servicePointSchema = exports.openingSchema = exports.regulatoryProfileV1Schema = exports.catalogCapabilityV2Schema = exports.kitchenRuleResultV1Schema = exports.designOperationV2Schema = exports.cabinetIntentV2Schema = exports.fillerIntentV2Schema = exports.cornerIntentV2Schema = exports.cabinetRoleV2Schema = exports.designBriefV2Schema = exports.projectContextV2Schema = exports.styleSelectionV2Schema = exports.catalogMaterialRefV2Schema = exports.sinkRequirementV2Schema = exports.applianceRequirementV2Schema = exports.applianceKindV2Schema = exports.productDataStatusV2Schema = exports.productIdentityV2Schema = exports.catalogItemIdentityV2Schema = exports.kitchenProjectScopeSchema = exports.australianJurisdictionSchema = exports.layoutStrategySchema = exports.requirementStrengthSchema = void 0;
const zod_1 = require("zod");
const schemas_1 = require("./schemas");
Object.defineProperty(exports, "openingSchema", { enumerable: true, get: function () { return schemas_1.openingSchema; } });
Object.defineProperty(exports, "servicePointSchema", { enumerable: true, get: function () { return schemas_1.servicePointSchema; } });
exports.requirementStrengthSchema = zod_1.z.enum(['required', 'preferred', 'open']);
exports.layoutStrategySchema = zod_1.z.enum(['single-wall', 'l-shape', 'u-shape', 'galley']);
exports.australianJurisdictionSchema = zod_1.z.enum([
    'AU-ACT', 'AU-NSW', 'AU-NT', 'AU-QLD', 'AU-SA', 'AU-TAS', 'AU-VIC', 'AU-WA',
]);
exports.kitchenProjectScopeSchema = zod_1.z.enum([
    'new-kitchen',
    'full-kitchen-renovation',
    'cabinet-or-rangehood-renewal',
    'appliance-only-changeover',
]);
exports.catalogItemIdentityV2Schema = zod_1.z.object({
    sourceSystem: zod_1.z.enum(['bower-planner', 'website-flatlay', 'supplier', 'manufacturer']),
    catalogVersion: zod_1.z.string().trim().min(1).max(120),
    itemId: zod_1.z.string().trim().min(1).max(160),
    supplierSourceId: zod_1.z.string().trim().min(1).max(160).nullable(),
}).strict();
exports.productIdentityV2Schema = zod_1.z.object({
    catalogRef: exports.catalogItemIdentityV2Schema.nullable(),
    brand: zod_1.z.string().trim().min(1).max(120).nullable(),
    modelNumber: zod_1.z.string().trim().min(1).max(120).nullable(),
    name: zod_1.z.string().trim().min(1).max(200),
}).strict();
exports.productDataStatusV2Schema = zod_1.z.enum(['exact-model', 'customer-measured', 'bower-provisional']);
exports.applianceKindV2Schema = zod_1.z.enum([
    'dishwasher', 'cooktop', 'oven', 'freestanding-cooker', 'rangehood',
    'fridge', 'microwave', 'coffee-machine', 'wine-fridge',
]);
const applianceEnvelopeV2Schema = zod_1.z.object({
    applianceWidthMm: zod_1.z.number().int().positive(),
    applianceHeightMm: zod_1.z.number().int().positive(),
    applianceDepthMm: zod_1.z.number().int().positive(),
    openingWidthMm: zod_1.z.number().int().positive(),
    openingHeightMm: zod_1.z.number().int().positive(),
    openingDepthMm: zod_1.z.number().int().positive(),
    clearanceLeftMm: zod_1.z.number().int().nonnegative(),
    clearanceRightMm: zod_1.z.number().int().nonnegative(),
    clearanceTopMm: zod_1.z.number().int().nonnegative(),
    clearanceRearMm: zod_1.z.number().int().nonnegative(),
    clearanceFrontMm: zod_1.z.number().int().nonnegative(),
    doorSwingClearanceMm: zod_1.z.number().int().nonnegative(),
}).strict();
exports.applianceRequirementV2Schema = zod_1.z.object({
    requirementId: zod_1.z.string().trim().min(1).max(120),
    kind: exports.applianceKindV2Schema,
    strength: exports.requirementStrengthSchema,
    product: exports.productIdentityV2Schema.nullable(),
    dataStatus: exports.productDataStatusV2Schema,
    quantity: zod_1.z.number().int().positive().max(8),
    envelope: applianceEnvelopeV2Schema,
    installation: zod_1.z.enum(['freestanding', 'built-in', 'integrated', 'underbench']),
    services: zod_1.z.array(zod_1.z.enum(['water-supply', 'drain', 'gpo', 'gas', 'hood-duct'])),
    sourceReference: zod_1.z.string().trim().min(1).max(500).nullable(),
}).strict().superRefine((value, ctx) => {
    if (value.dataStatus === 'exact-model' && (!value.product || !value.sourceReference)) {
        ctx.addIssue({
            code: zod_1.z.ZodIssueCode.custom,
            message: 'exact-model appliances require product identity and sourceReference',
        });
    }
});
exports.sinkRequirementV2Schema = zod_1.z.object({
    requirementId: zod_1.z.string().trim().min(1).max(120),
    strength: exports.requirementStrengthSchema,
    product: exports.productIdentityV2Schema.nullable(),
    dataStatus: exports.productDataStatusV2Schema,
    installation: zod_1.z.enum(['top-mount', 'undermount', 'flush-mount', 'farmhouse']),
    bowlCount: zod_1.z.number().int().positive().max(4),
    overallWidthMm: zod_1.z.number().int().positive(),
    overallDepthMm: zod_1.z.number().int().positive(),
    bowlDepthMm: zod_1.z.number().int().positive(),
    cutoutWidthMm: zod_1.z.number().int().positive().nullable(),
    cutoutDepthMm: zod_1.z.number().int().positive().nullable(),
    minimumBaseInternalWidthMm: zod_1.z.number().int().positive().nullable(),
    clipAndRailClearanceMm: zod_1.z.number().int().nonnegative().nullable(),
    wasteOutletFromLeftMm: zod_1.z.number().int().nonnegative().nullable(),
    sourceReference: zod_1.z.string().trim().min(1).max(500).nullable(),
}).strict().superRefine((value, ctx) => {
    if (value.dataStatus === 'exact-model') {
        const missing = !value.product || !value.sourceReference
            || value.cutoutWidthMm === null || value.cutoutDepthMm === null
            || value.minimumBaseInternalWidthMm === null;
        if (missing) {
            ctx.addIssue({
                code: zod_1.z.ZodIssueCode.custom,
                message: 'exact-model sinks require product, source, cutout and minimum-base data',
            });
        }
    }
});
exports.catalogMaterialRefV2Schema = zod_1.z.object({
    identity: exports.catalogItemIdentityV2Schema,
    itemCode: zod_1.z.string().trim().min(1).max(120).optional(),
    brand: zod_1.z.string().trim().min(1).max(120).optional(),
    name: zod_1.z.string().trim().min(1).max(200),
    role: zod_1.z.enum([
        'primary-front', 'secondary-front', 'carcase', 'benchtop',
        'splashback', 'handle', 'kick', 'tap',
    ]),
    strength: exports.requirementStrengthSchema,
    substitutionPolicy: zod_1.z.enum(['exact-only', 'same-range', 'closest-approved']),
}).strict();
exports.styleSelectionV2Schema = zod_1.z.object({
    presetId: zod_1.z.string().trim().min(1).max(120).optional(),
    styleTags: zod_1.z.array(zod_1.z.string().trim().min(1).max(80)).max(24),
    doorProfileId: zod_1.z.string().trim().min(1).max(120).optional(),
    materials: zod_1.z.array(exports.catalogMaterialRefV2Schema).max(24),
    notes: zod_1.z.string().max(1000).optional(),
}).strict();
exports.projectContextV2Schema = zod_1.z.object({
    jurisdiction: exports.australianJurisdictionSchema.nullable(),
    projectScope: exports.kitchenProjectScopeSchema.nullable(),
    effectiveOn: zod_1.z.string().date(),
    regulatoryProfileId: zod_1.z.string().trim().min(1).max(160).nullable(),
}).strict();
exports.designBriefV2Schema = zod_1.z.object({
    schemaVersion: zod_1.z.literal(2),
    projectContext: exports.projectContextV2Schema,
    roomInput: schemas_1.roomSpecSchema,
    household: zod_1.z.object({
        size: zod_1.z.number().int().min(1).max(20).optional(),
        cooks: zod_1.z.enum(['rare', 'daily', 'entertainer']).optional(),
        accessibilityNotes: zod_1.z.string().max(1000).optional(),
    }).strict(),
    priorities: zod_1.z.array(zod_1.z.object({
        value: zod_1.z.enum(['storage', 'bench-space', 'entertaining', 'baking', 'budget']),
        strength: exports.requirementStrengthSchema,
    }).strict()).max(10),
    appliances: zod_1.z.array(exports.applianceRequirementV2Schema).max(24),
    sink: exports.sinkRequirementV2Schema,
    layoutPreference: zod_1.z.object({
        strength: exports.requirementStrengthSchema,
        preferred: exports.layoutStrategySchema.optional(),
        allowed: zod_1.z.array(exports.layoutStrategySchema).min(1),
        island: zod_1.z.object({
            strength: exports.requirementStrengthSchema,
            value: zod_1.z.enum(['want', 'no', 'if-it-fits']),
        }).strict(),
    }).strict(),
    style: exports.styleSelectionV2Schema,
    budgetBand: zod_1.z.enum(['value', 'mid', 'premium']).optional(),
    notes: zod_1.z.string().max(2000).optional(),
    briefRevision: zod_1.z.number().int().positive(),
}).strict();
exports.cabinetRoleV2Schema = zod_1.z.enum([
    'sink-base', 'cooktop-base', 'dishwasher-opening', 'drawer-base', 'door-base',
    'bin-base', 'corner-base', 'wall-storage', 'rangehood-wall', 'open-shelf',
    'pantry-tall', 'oven-tower', 'appliance-tower', 'fridge-opening', 'filler', 'end-panel',
]);
exports.cornerIntentV2Schema = zod_1.z.object({
    treatment: zod_1.z.enum(['standard-corner', 'blind-corner', 'dead-corner']),
    hand: zod_1.z.enum(['left', 'right']),
    returnDepthMm: zod_1.z.number().int().positive(),
    minimumOpeningMm: zod_1.z.number().int().positive().optional(),
    adjacentClearanceMm: zod_1.z.number().int().nonnegative().optional(),
}).strict();
exports.fillerIntentV2Schema = zod_1.z.object({
    widthMm: zod_1.z.number().int().min(10).max(500),
    purpose: zod_1.z.enum(['wall-scribe', 'corner-clearance', 'handle-clearance', 'appliance-clearance']),
}).strict();
exports.cabinetIntentV2Schema = zod_1.z.object({
    intentId: zod_1.z.string().trim().min(1).max(120),
    role: exports.cabinetRoleV2Schema,
    wall: zod_1.z.enum(['N', 'E', 'S', 'W', 'island']),
    sequence: zod_1.z.number().int().nonnegative(),
    targetWidthMm: zod_1.z.number().int().positive().optional(),
    strength: exports.requirementStrengthSchema,
    storageFunction: zod_1.z.enum(['cutlery', 'pots', 'pantry', 'bins', 'general']).optional(),
    applianceRef: zod_1.z.string().trim().min(1).max(120).optional(),
    productVariantId: zod_1.z.string().trim().min(1).max(160).optional(),
    corner: exports.cornerIntentV2Schema.optional(),
    filler: exports.fillerIntentV2Schema.optional(),
    locked: zod_1.z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
    if (value.role === 'corner-base' && !value.corner) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'corner-base intent requires corner geometry' });
    }
    if (value.role === 'filler' && !value.filler) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'filler intent requires filler geometry' });
    }
});
exports.designOperationV2Schema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('move_role'), intentId: zod_1.z.string(), wall: zod_1.z.enum(['N', 'E', 'S', 'W', 'island']), sequence: zod_1.z.number().int().nonnegative() }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('add_role'), intent: exports.cabinetIntentV2Schema }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('remove_role'), intentId: zod_1.z.string() }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('set_role_width'), intentId: zod_1.z.string(), widthMm: zod_1.z.number().int().positive() }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('set_product_variant'), intentId: zod_1.z.string(), productVariantId: zod_1.z.string().nullable() }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('set_corner_treatment'), intentId: zod_1.z.string(), corner: exports.cornerIntentV2Schema }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('set_filler_geometry'), intentId: zod_1.z.string(), filler: exports.fillerIntentV2Schema }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('set_layout_strategy'), strategy: exports.layoutStrategySchema }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('set_material'), material: exports.catalogMaterialRefV2Schema }).strict(),
    zod_1.z.object({ operationId: zod_1.z.string(), type: zod_1.z.literal('propose_room_patch'), patch: schemas_1.proposedRoomPatchSchema }).strict(),
]);
const ruleValueSchema = zod_1.z.union([zod_1.z.number(), zod_1.z.string(), zod_1.z.boolean()]);
exports.kitchenRuleResultV1Schema = zod_1.z.object({
    ruleId: zod_1.z.string().trim().min(1).max(120),
    rulePackVersion: zod_1.z.string().trim().min(1).max(160),
    stage: zod_1.z.enum(['concept', 'quote', 'production']),
    severity: zod_1.z.enum(['blocker', 'warning', 'advisory']),
    status: zod_1.z.enum(['pass', 'fail', 'excepted', 'pending', 'not-applicable']),
    messageKey: zod_1.z.string().trim().min(1).max(160),
    entityIds: zod_1.z.array(zod_1.z.string().max(160)),
    measured: zod_1.z.record(ruleValueSchema).optional(),
    required: zod_1.z.record(ruleValueSchema).optional(),
    repairOptions: zod_1.z.array(zod_1.z.object({
        operation: exports.designOperationV2Schema,
        cost: zod_1.z.number().nonnegative(),
        reason: zod_1.z.string().max(500),
    }).strict()),
    exception: zod_1.z.object({
        staffUserId: zod_1.z.string().min(1).max(160),
        reason: zod_1.z.string().min(1).max(1000),
        acceptedAt: zod_1.z.string().datetime(),
        policyCode: zod_1.z.string().min(1).max(120),
    }).strict().optional(),
}).strict();
exports.catalogCapabilityV2Schema = zod_1.z.object({
    identity: exports.catalogItemIdentityV2Schema,
    definitionId: zod_1.z.string().trim().min(1).max(160),
    designerRoles: zod_1.z.array(exports.cabinetRoleV2Schema).min(1),
    category: zod_1.z.string().trim().min(1).max(120),
    mountingClass: zod_1.z.enum(['base', 'wall', 'tall', 'opening', 'panel', 'filler']),
    width: zod_1.z.object({
        mode: zod_1.z.enum(['fixed', 'allowed-list', 'resizable-range']),
        allowedMm: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
        minimumMm: zod_1.z.number().int().positive().optional(),
        maximumMm: zod_1.z.number().int().positive().optional(),
        stepMm: zod_1.z.number().int().positive().optional(),
        preferredMm: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
    }).strict(),
    externalEnvelopeMm: zod_1.z.object({ width: zod_1.z.number().int().positive(), height: zod_1.z.number().int().positive(), depth: zod_1.z.number().int().positive() }).strict().optional(),
    internalClearEnvelopeMm: zod_1.z.object({ width: zod_1.z.number().int().positive(), height: zod_1.z.number().int().positive(), depth: zod_1.z.number().int().positive() }).strict().optional(),
    dataStatus: zod_1.z.enum(['provisional', 'approved']),
    renderable: zod_1.z.boolean(),
    priceable: zod_1.z.boolean(),
    customerVisible: zod_1.z.boolean(),
    tradeVisible: zod_1.z.boolean(),
    priority: zod_1.z.number().int(),
}).strict();
exports.regulatoryProfileV1Schema = zod_1.z.object({
    profileId: zod_1.z.string().trim().min(1).max(160),
    version: zod_1.z.string().trim().min(1).max(80),
    jurisdiction: exports.australianJurisdictionSchema,
    effectiveFrom: zod_1.z.string().date(),
    effectiveTo: zod_1.z.string().date().nullable(),
    projectScopes: zod_1.z.array(exports.kitchenProjectScopeSchema).min(1),
    standardsEditions: zod_1.z.record(zod_1.z.string().min(1)),
    qualifiedApprover: zod_1.z.string().trim().min(1).max(200),
    approvalDate: zod_1.z.string().date(),
    contentHash: zod_1.z.string().regex(/^[0-9a-f]{64}$/i),
}).strict();
