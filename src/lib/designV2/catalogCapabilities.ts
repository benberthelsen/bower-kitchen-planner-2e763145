import { ROLE_PRODUCTS } from '@/lib/layout/catalogRoles';
import type { SegmentRole } from '@/lib/layout/types';
import type { CatalogCapabilityV2 } from './contracts';

export const V1_CAPABILITY_MAP_VERSION = 'static-role-map@1.0.0';

const ROLE_MAP: Record<SegmentRole, CatalogCapabilityV2['designerRoles'][number]> = {
  sink: 'sink-base',
  cooktop: 'cooktop-base',
  dishwasher: 'dishwasher-opening',
  drawers: 'drawer-base',
  doors: 'door-base',
  pantry: 'pantry-tall',
  'oven-tower': 'oven-tower',
  'fridge-gap': 'fridge-opening',
  corner: 'corner-base',
};

const MOUNTING_MAP: Record<SegmentRole, CatalogCapabilityV2['mountingClass']> = {
  sink: 'base',
  cooktop: 'base',
  dishwasher: 'opening',
  drawers: 'base',
  doors: 'base',
  pantry: 'tall',
  'oven-tower': 'tall',
  'fridge-gap': 'opening',
  corner: 'base',
};

/**
 * Current V1 products are usable for concept generation, but their detailed
 * internal, corner and installation envelopes have not been curated yet.
 * They therefore remain provisional and cannot make a proposal quote-ready.
 */
export const V1_CATALOG_CAPABILITIES: CatalogCapabilityV2[] = Object.entries(ROLE_PRODUCTS)
  .map(([roleValue, product], index) => {
    const role = roleValue as SegmentRole;
    return {
      identity: {
        sourceSystem: 'bower-planner' as const,
        catalogVersion: V1_CAPABILITY_MAP_VERSION,
        itemId: product.definitionId,
        supplierSourceId: null,
      },
      definitionId: product.definitionId,
      designerRoles: [ROLE_MAP[role]],
      category: product.kind,
      mountingClass: MOUNTING_MAP[role],
      width: {
        mode: product.widths.length === 1 ? 'fixed' as const : 'allowed-list' as const,
        allowedMm: [...product.widths],
        preferredMm: [...product.widths],
      },
      dataStatus: 'provisional' as const,
      renderable: true,
      priceable: true,
      customerVisible: true,
      tradeVisible: true,
      priority: index,
    };
  });

export interface CapabilityResolution {
  capability: CatalogCapabilityV2;
  resolvedWidthMm: number;
  exactWidth: boolean;
  quoteReady: boolean;
}

export function resolveV1Capability(role: SegmentRole, requestedWidthMm?: number): CapabilityResolution | null {
  const designerRole = ROLE_MAP[role];
  const capability = V1_CATALOG_CAPABILITIES.find(item => item.designerRoles.includes(designerRole));
  if (!capability) return null;
  const widths = capability.width.allowedMm ?? [];
  if (widths.length === 0) return null;
  const requested = requestedWidthMm ?? widths[0];
  const resolvedWidthMm = widths.reduce((best, width) =>
    Math.abs(width - requested) < Math.abs(best - requested) ? width : best,
  );
  return {
    capability,
    resolvedWidthMm,
    exactWidth: resolvedWidthMm === requested,
    quoteReady: capability.dataStatus === 'approved',
  };
}
