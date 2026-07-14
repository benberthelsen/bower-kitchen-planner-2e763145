import { z } from 'zod';
import {
  openingSchema,
  proposedRoomPatchSchema,
  roomSpecSchema,
  servicePointSchema,
} from '@/lib/layout/schemas';

export const requirementStrengthSchema = z.enum(['required', 'preferred', 'open']);
export const layoutStrategySchema = z.enum(['single-wall', 'l-shape', 'u-shape', 'galley']);
export const australianJurisdictionSchema = z.enum([
  'AU-ACT', 'AU-NSW', 'AU-NT', 'AU-QLD', 'AU-SA', 'AU-TAS', 'AU-VIC', 'AU-WA',
]);
export const kitchenProjectScopeSchema = z.enum([
  'new-kitchen',
  'full-kitchen-renovation',
  'cabinet-or-rangehood-renewal',
  'appliance-only-changeover',
]);

export const catalogItemIdentityV2Schema = z.object({
  sourceSystem: z.enum(['bower-planner', 'website-flatlay', 'supplier', 'manufacturer']),
  catalogVersion: z.string().trim().min(1).max(120),
  itemId: z.string().trim().min(1).max(160),
  supplierSourceId: z.string().trim().min(1).max(160).nullable(),
}).strict();

export const productIdentityV2Schema = z.object({
  catalogRef: catalogItemIdentityV2Schema.nullable(),
  brand: z.string().trim().min(1).max(120).nullable(),
  modelNumber: z.string().trim().min(1).max(120).nullable(),
  name: z.string().trim().min(1).max(200),
}).strict();

export const productDataStatusV2Schema = z.enum(['exact-model', 'customer-measured', 'bower-provisional']);
export const applianceKindV2Schema = z.enum([
  'dishwasher', 'cooktop', 'oven', 'freestanding-cooker', 'rangehood',
  'fridge', 'microwave', 'coffee-machine', 'wine-fridge',
]);

const applianceEnvelopeV2Schema = z.object({
  applianceWidthMm: z.number().int().positive(),
  applianceHeightMm: z.number().int().positive(),
  applianceDepthMm: z.number().int().positive(),
  openingWidthMm: z.number().int().positive(),
  openingHeightMm: z.number().int().positive(),
  openingDepthMm: z.number().int().positive(),
  clearanceLeftMm: z.number().int().nonnegative(),
  clearanceRightMm: z.number().int().nonnegative(),
  clearanceTopMm: z.number().int().nonnegative(),
  clearanceRearMm: z.number().int().nonnegative(),
  clearanceFrontMm: z.number().int().nonnegative(),
  doorSwingClearanceMm: z.number().int().nonnegative(),
}).strict();

export const applianceRequirementV2Schema = z.object({
  requirementId: z.string().trim().min(1).max(120),
  kind: applianceKindV2Schema,
  strength: requirementStrengthSchema,
  product: productIdentityV2Schema.nullable(),
  dataStatus: productDataStatusV2Schema,
  quantity: z.number().int().positive().max(8),
  envelope: applianceEnvelopeV2Schema,
  installation: z.enum(['freestanding', 'built-in', 'integrated', 'underbench']),
  services: z.array(z.enum(['water-supply', 'drain', 'gpo', 'gas', 'hood-duct'])),
  sourceReference: z.string().trim().min(1).max(500).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.dataStatus === 'exact-model' && (!value.product || !value.sourceReference)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'exact-model appliances require product identity and sourceReference',
    });
  }
});

export const sinkRequirementV2Schema = z.object({
  requirementId: z.string().trim().min(1).max(120),
  strength: requirementStrengthSchema,
  product: productIdentityV2Schema.nullable(),
  dataStatus: productDataStatusV2Schema,
  installation: z.enum(['top-mount', 'undermount', 'flush-mount', 'farmhouse']),
  bowlCount: z.number().int().positive().max(4),
  overallWidthMm: z.number().int().positive(),
  overallDepthMm: z.number().int().positive(),
  bowlDepthMm: z.number().int().positive(),
  cutoutWidthMm: z.number().int().positive().nullable(),
  cutoutDepthMm: z.number().int().positive().nullable(),
  minimumBaseInternalWidthMm: z.number().int().positive().nullable(),
  clipAndRailClearanceMm: z.number().int().nonnegative().nullable(),
  wasteOutletFromLeftMm: z.number().int().nonnegative().nullable(),
  sourceReference: z.string().trim().min(1).max(500).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.dataStatus === 'exact-model') {
    const missing = !value.product || !value.sourceReference
      || value.cutoutWidthMm === null || value.cutoutDepthMm === null
      || value.minimumBaseInternalWidthMm === null;
    if (missing) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'exact-model sinks require product, source, cutout and minimum-base data',
      });
    }
  }
});

export const catalogMaterialRefV2Schema = z.object({
  identity: catalogItemIdentityV2Schema,
  itemCode: z.string().trim().min(1).max(120).optional(),
  brand: z.string().trim().min(1).max(120).optional(),
  name: z.string().trim().min(1).max(200),
  role: z.enum([
    'primary-front', 'secondary-front', 'carcase', 'benchtop',
    'splashback', 'handle', 'kick', 'tap',
  ]),
  strength: requirementStrengthSchema,
  substitutionPolicy: z.enum(['exact-only', 'same-range', 'closest-approved']),
}).strict();

export const styleSelectionV2Schema = z.object({
  presetId: z.string().trim().min(1).max(120).optional(),
  styleTags: z.array(z.string().trim().min(1).max(80)).max(24),
  doorProfileId: z.string().trim().min(1).max(120).optional(),
  materials: z.array(catalogMaterialRefV2Schema).max(24),
  notes: z.string().max(1000).optional(),
}).strict();

export const projectContextV2Schema = z.object({
  jurisdiction: australianJurisdictionSchema.nullable(),
  projectScope: kitchenProjectScopeSchema.nullable(),
  effectiveOn: z.string().date(),
  regulatoryProfileId: z.string().trim().min(1).max(160).nullable(),
}).strict();

export const designBriefV2Schema = z.object({
  schemaVersion: z.literal(2),
  projectContext: projectContextV2Schema,
  roomInput: roomSpecSchema,
  household: z.object({
    size: z.number().int().min(1).max(20).optional(),
    cooks: z.enum(['rare', 'daily', 'entertainer']).optional(),
    accessibilityNotes: z.string().max(1000).optional(),
  }).strict(),
  priorities: z.array(z.object({
    value: z.enum(['storage', 'bench-space', 'entertaining', 'baking', 'budget']),
    strength: requirementStrengthSchema,
  }).strict()).max(10),
  appliances: z.array(applianceRequirementV2Schema).max(24),
  sink: sinkRequirementV2Schema,
  layoutPreference: z.object({
    strength: requirementStrengthSchema,
    preferred: layoutStrategySchema.optional(),
    allowed: z.array(layoutStrategySchema).min(1),
    island: z.object({
      strength: requirementStrengthSchema,
      value: z.enum(['want', 'no', 'if-it-fits']),
    }).strict(),
  }).strict(),
  style: styleSelectionV2Schema,
  budgetBand: z.enum(['value', 'mid', 'premium']).optional(),
  notes: z.string().max(2000).optional(),
  briefRevision: z.number().int().positive(),
}).strict();

export const cabinetRoleV2Schema = z.enum([
  'sink-base', 'cooktop-base', 'dishwasher-opening', 'drawer-base', 'door-base',
  'bin-base', 'corner-base', 'wall-storage', 'rangehood-wall', 'open-shelf',
  'pantry-tall', 'oven-tower', 'appliance-tower', 'fridge-opening', 'filler', 'end-panel',
]);

export const cornerIntentV2Schema = z.object({
  treatment: z.enum(['standard-corner', 'blind-corner', 'dead-corner']),
  hand: z.enum(['left', 'right']),
  returnDepthMm: z.number().int().positive(),
  minimumOpeningMm: z.number().int().positive().optional(),
  adjacentClearanceMm: z.number().int().nonnegative().optional(),
}).strict();

export const fillerIntentV2Schema = z.object({
  widthMm: z.number().int().min(10).max(500),
  purpose: z.enum(['wall-scribe', 'corner-clearance', 'handle-clearance', 'appliance-clearance']),
}).strict();

export const cabinetIntentV2Schema = z.object({
  intentId: z.string().trim().min(1).max(120),
  role: cabinetRoleV2Schema,
  wall: z.enum(['N', 'E', 'S', 'W', 'island']),
  sequence: z.number().int().nonnegative(),
  targetWidthMm: z.number().int().positive().optional(),
  strength: requirementStrengthSchema,
  storageFunction: z.enum(['cutlery', 'pots', 'pantry', 'bins', 'general']).optional(),
  applianceRef: z.string().trim().min(1).max(120).optional(),
  productVariantId: z.string().trim().min(1).max(160).optional(),
  corner: cornerIntentV2Schema.optional(),
  filler: fillerIntentV2Schema.optional(),
  locked: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.role === 'corner-base' && !value.corner) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'corner-base intent requires corner geometry' });
  }
  if (value.role === 'filler' && !value.filler) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'filler intent requires filler geometry' });
  }
});

export const designOperationV2Schema = z.discriminatedUnion('type', [
  z.object({ operationId: z.string(), type: z.literal('move_role'), intentId: z.string(), wall: z.enum(['N', 'E', 'S', 'W', 'island']), sequence: z.number().int().nonnegative() }).strict(),
  z.object({ operationId: z.string(), type: z.literal('add_role'), intent: cabinetIntentV2Schema }).strict(),
  z.object({ operationId: z.string(), type: z.literal('remove_role'), intentId: z.string() }).strict(),
  z.object({ operationId: z.string(), type: z.literal('set_role_width'), intentId: z.string(), widthMm: z.number().int().positive() }).strict(),
  z.object({ operationId: z.string(), type: z.literal('set_product_variant'), intentId: z.string(), productVariantId: z.string().nullable() }).strict(),
  z.object({ operationId: z.string(), type: z.literal('set_corner_treatment'), intentId: z.string(), corner: cornerIntentV2Schema }).strict(),
  z.object({ operationId: z.string(), type: z.literal('set_filler_geometry'), intentId: z.string(), filler: fillerIntentV2Schema }).strict(),
  z.object({ operationId: z.string(), type: z.literal('set_layout_strategy'), strategy: layoutStrategySchema }).strict(),
  z.object({ operationId: z.string(), type: z.literal('set_material'), material: catalogMaterialRefV2Schema }).strict(),
  z.object({ operationId: z.string(), type: z.literal('propose_room_patch'), patch: proposedRoomPatchSchema }).strict(),
]);

const ruleValueSchema = z.union([z.number(), z.string(), z.boolean()]);
export const kitchenRuleResultV1Schema = z.object({
  ruleId: z.string().trim().min(1).max(120),
  rulePackVersion: z.string().trim().min(1).max(160),
  stage: z.enum(['concept', 'quote', 'production']),
  severity: z.enum(['blocker', 'warning', 'advisory']),
  status: z.enum(['pass', 'fail', 'excepted', 'pending', 'not-applicable']),
  messageKey: z.string().trim().min(1).max(160),
  entityIds: z.array(z.string().max(160)),
  measured: z.record(ruleValueSchema).optional(),
  required: z.record(ruleValueSchema).optional(),
  repairOptions: z.array(z.object({
    operation: designOperationV2Schema,
    cost: z.number().nonnegative(),
    reason: z.string().max(500),
  }).strict()),
  exception: z.object({
    staffUserId: z.string().min(1).max(160),
    reason: z.string().min(1).max(1000),
    acceptedAt: z.string().datetime(),
    policyCode: z.string().min(1).max(120),
  }).strict().optional(),
}).strict();

export const catalogCapabilityV2Schema = z.object({
  identity: catalogItemIdentityV2Schema,
  definitionId: z.string().trim().min(1).max(160),
  designerRoles: z.array(cabinetRoleV2Schema).min(1),
  category: z.string().trim().min(1).max(120),
  mountingClass: z.enum(['base', 'wall', 'tall', 'opening', 'panel', 'filler']),
  width: z.object({
    mode: z.enum(['fixed', 'allowed-list', 'resizable-range']),
    allowedMm: z.array(z.number().int().positive()).optional(),
    minimumMm: z.number().int().positive().optional(),
    maximumMm: z.number().int().positive().optional(),
    stepMm: z.number().int().positive().optional(),
    preferredMm: z.array(z.number().int().positive()).optional(),
  }).strict(),
  externalEnvelopeMm: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), depth: z.number().int().positive() }).strict().optional(),
  internalClearEnvelopeMm: z.object({ width: z.number().int().positive(), height: z.number().int().positive(), depth: z.number().int().positive() }).strict().optional(),
  dataStatus: z.enum(['provisional', 'approved']),
  renderable: z.boolean(),
  priceable: z.boolean(),
  customerVisible: z.boolean(),
  tradeVisible: z.boolean(),
  priority: z.number().int(),
}).strict();

export const regulatoryProfileV1Schema = z.object({
  profileId: z.string().trim().min(1).max(160),
  version: z.string().trim().min(1).max(80),
  jurisdiction: australianJurisdictionSchema,
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable(),
  projectScopes: z.array(kitchenProjectScopeSchema).min(1),
  standardsEditions: z.record(z.string().min(1)),
  qualifiedApprover: z.string().trim().min(1).max(200),
  approvalDate: z.string().date(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/i),
}).strict();

export type RequirementStrength = z.infer<typeof requirementStrengthSchema>;
export type CatalogItemIdentityV2 = z.infer<typeof catalogItemIdentityV2Schema>;
export type ApplianceRequirementV2 = z.infer<typeof applianceRequirementV2Schema>;
export type SinkRequirementV2 = z.infer<typeof sinkRequirementV2Schema>;
export type CatalogMaterialRefV2 = z.infer<typeof catalogMaterialRefV2Schema>;
export type DesignBriefV2 = z.infer<typeof designBriefV2Schema>;
export type CabinetIntentV2 = z.infer<typeof cabinetIntentV2Schema>;
export type DesignOperationV2 = z.infer<typeof designOperationV2Schema>;
export type KitchenRuleResultV1 = z.infer<typeof kitchenRuleResultV1Schema>;
export type CatalogCapabilityV2 = z.infer<typeof catalogCapabilityV2Schema>;
export type RegulatoryProfileV1 = z.infer<typeof regulatoryProfileV1Schema>;

export { openingSchema, servicePointSchema };
