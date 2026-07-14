/**
 * Zod schemas mirroring src/lib/layout/types.ts.
 * Used to validate AI tool payloads (edge function) and URL/session hydration.
 */

import { z } from 'zod';

export const wallSchema = z.enum(['N', 'E', 'S', 'W']);

export const openingSchema = z.object({
  id: z.string(),
  wall: wallSchema,
  type: z.enum(['door', 'window', 'walkway']),
  offsetMm: z.number().min(0),
  widthMm: z.number().min(200).max(6000),
  heightMm: z.number().min(200).max(3000).optional(),
  sillHeightMm: z.number().min(0).max(2000).optional(),
  swing: z.enum(['in-left', 'in-right', 'out', 'slider']).optional(),
});

export const servicePointSchema = z.object({
  id: z.string(),
  wall: wallSchema,
  type: z.enum(['water-supply', 'drain', 'gpo', 'gas', 'hood-duct']),
  offsetMm: z.number().min(0),
  heightMm: z.number().min(0).max(3000).optional(),
});

export const roomSpecSchema = z.object({
  width: z.number().min(1200).max(12000),
  depth: z.number().min(1200).max(12000),
  height: z.number().min(2100).max(4000),
  shape: z.enum(['Rectangle', 'LShape']),
  cutoutWidth: z.number().min(0),
  cutoutDepth: z.number().min(0),
  openings: z.array(openingSchema),
  services: z.array(servicePointSchema),
});

export const designBriefSchema = z.object({
  room: roomSpecSchema,
  household: z.object({
    size: z.number().int().min(1).max(12).optional(),
    cooks: z.enum(['rare', 'daily', 'entertainer']).optional(),
  }),
  priorities: z.array(z.enum(['storage', 'bench-space', 'entertaining', 'baking', 'budget'])),
  appliances: z.object({
    oven: z.enum(['600', '900']).optional(),
    cooktop: z.enum(['gas', 'induction']).optional(),
    dishwasher: z.boolean(),
    fridgeWidthMm: z.number().min(500).max(1400).optional(),
    microwave: z.enum(['built-in', 'benchtop', 'none']).optional(),
  }),
  island: z.enum(['want', 'no', 'if-it-fits']),
  styleWords: z.string().max(500).optional(),
  budgetBand: z.enum(['value', 'mid', 'premium']).optional(),
});

export const segmentRoleSchema = z.enum([
  'sink', 'cooktop', 'dishwasher', 'drawers', 'doors',
  'pantry', 'oven-tower', 'fridge-gap', 'corner',
]);

export const segmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cabinet'), role: segmentRoleSchema, widthMm: z.number().min(150).max(1400).optional() }),
  z.object({ kind: z.literal('filler'), widthMm: z.number().min(10).max(200) }),
  z.object({ kind: z.literal('gap'), reason: z.string().max(200), widthMm: z.number().min(50).max(2000) }),
]);

export const runSchema = z.object({
  wall: wallSchema,
  segments: z.array(segmentSchema).min(1).max(24),
  wallCabinets: z.boolean(),
  fromEnd: z.boolean().optional(),
});

export const styleSpecSchema = z.object({
  finishId: z.string(),
  benchtopId: z.string(),
  handleId: z.string(),
  kickId: z.string().optional(),
  tapId: z.string().optional(),
});

export const kitchenSpecSchema = z.object({
  runs: z.array(runSchema).min(1).max(4),
  island: z.object({
    lengthMm: z.number().min(1200).max(4000),
    depthMm: z.number().min(600).max(1500),
    features: z.array(z.enum(['seating', 'sink', 'storage'])),
  }).optional(),
  style: styleSpecSchema,
  rationale: z.string().max(2000),
});

export type KitchenSpecInput = z.infer<typeof kitchenSpecSchema>;
