import type { CabinetRenderConfig } from '@/types/cabinetConfig';

interface KickboardEligibility {
  category: CabinetRenderConfig['category'];
  productType: CabinetRenderConfig['productType'];
  productName: string;
  itemY: number;
  recipeEnabled?: boolean;
}

/**
 * Overhead cabinet boxes are white melamine even when their doors use a
 * decorative timber finish. Base and tall cabinet structure keeps the
 * configured carcass material.
 */
export function carcassMaterialForCategory<T>(
  category: CabinetRenderConfig['category'],
  configuredMaterial: T,
  whiteMelamineMaterial: T,
): T {
  return category === 'Wall' ? whiteMelamineMaterial : configuredMaterial;
}

/**
 * A standard base cabinet placed on the floor must continue the kickboard run.
 *
 * Catalogue names are fuzzy-matched to Microvellum recipes, so an ordinary
 * base unit can occasionally inherit a suspended unit's `toeKick: false`.
 * Physical placement wins for floor-standing base cabinets, while explicitly
 * suspended/floating products and non-cabinet panels keep their recipe rule.
 */
export function shouldRenderKickboard({
  category,
  productType,
  productName,
  itemY,
  recipeEnabled,
}: KickboardEligibility): boolean {
  if (category === 'Wall' || productType === 'panel') return false;

  const explicitlySuspended = /\b(suspended|floating|wall[\s-]?hung)\b/i.test(productName);
  if (
    category === 'Base'
    && productType === 'cabinet'
    && itemY <= 1
    && !explicitlySuspended
  ) {
    return true;
  }

  return recipeEnabled ?? (category === 'Base' || category === 'Tall');
}
