import type { CabinetRenderConfig } from '@/types/cabinetConfig';
import type { GlobalDimensions } from '@/types';

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

/** Open display units expose their complete box and shelves as the visible
 * finish, so they carry the selected door colour. Closed overhead cabinets
 * retain the normal white melamine carcass behind their decorative fronts. */
export function cabinetBodyMaterialForRole<T>(
  category: CabinetRenderConfig['category'],
  layoutRole: string | undefined,
  configuredMaterial: T,
  decorativeMaterial: T,
  whiteMelamineMaterial: T,
): T {
  if (layoutRole === 'open-shelf') return decorativeMaterial;
  return carcassMaterialForCategory(category, configuredMaterial, whiteMelamineMaterial);
}

/**
 * Generated corner roles are authoritative construction intent. Catalogue
 * records can briefly be missing while the local library loads, or a fuzzy
 * Microvellum match can report the wrong cabinet category. A floor corner must
 * retain base construction (including its kick), while an upper corner must
 * retain wall construction (closed top, shallow arms, and no kick/benchtop).
 */
export function cabinetCategoryForLayoutRole(
  category: CabinetRenderConfig['category'],
  layoutRole?: string,
): CabinetRenderConfig['category'] {
  if (layoutRole === 'corner') return 'Base';
  if (layoutRole === 'wall-corner' || layoutRole === 'fridge-overhead') return 'Wall';
  return category;
}

/**
 * Generated corner roles retain their intended construction, while the
 * definition id still controls the customer's selected corner style. The
 * normal upper is a linked bi-fold/pie-cut unit; a diagonal face is an
 * explicit catalogue choice rather than an automatic consequence of being an
 * upper corner.
 */
export function cabinetCornerTypeForLayoutRole(
  cornerType: CabinetRenderConfig['cornerType'],
  definitionId: string,
  layoutRole?: string,
): CabinetRenderConfig['cornerType'] {
  if (layoutRole === 'wall-corner') {
    if (definitionId.includes('diagonal')) return 'diagonal';
    if (definitionId.includes('blind')) return 'blind';
    return 'l-shape';
  }
  if (layoutRole === 'corner') return cornerType === 'blind' ? 'blind' : 'l-shape';
  return cornerType;
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

/**
 * L-shaped pie-cut cabinets draw two kick faces around their notch, so that
 * component is centred on the cabinet origin. Blind and diagonal cabinets
 * use a normal front kick face and must be moved to the front of the carcase.
 */
export function kickboardFrontOffsetM(
  footprintDepthM: number,
  isCorner: boolean,
  cornerType: 'l-shape' | 'blind' | 'diagonal',
): number {
  return isCorner && cornerType === 'l-shape'
    ? 0
    : footprintDepthM / 2 - 0.04;
}

/**
 * A decorative end panel starts at the carcass back but finishes flush with
 * the outside face of the door. Using carcass depth alone leaves wall-unit
 * end panels visibly short by the complete door thickness.
 */
export function finishedEndPanelGeometry(
  carcassDepthM: number,
  doorThicknessM: number,
  frontShadowGapM = 0.002,
): { depthM: number; centerOffsetZM: number } {
  const frontExtensionM = Math.max(0, doorThicknessM) + Math.max(0, frontShadowGapM);
  return {
    depthM: Math.max(0, carcassDepthM) + frontExtensionM,
    centerOffsetZM: frontExtensionM / 2,
  };
}

/**
 * Keep every slab in one cabinet run on the same construction thickness.
 * Microvellum recipes are authoritative when present; the room-wide setting
 * remains the fallback for catalogue records without a mapped recipe.
 */
export function resolvedBenchtopThicknessM(
  globalDimensions: Pick<GlobalDimensions, 'benchtopThickness'> | undefined,
  recipeThicknessMm?: number,
): number {
  // The ROOM's setting wins; the recipe is only the fallback. This was the
  // other way round, so a job specified at 20mm rendered at the recipe's
  // thickness regardless — while the reveals in CabinetAssembler already
  // (correctly) let globalDimensions win. Same inconsistency, opposite answer.
  const thicknessMm = globalDimensions?.benchtopThickness
    ?? (recipeThicknessMm && recipeThicknessMm > 0 ? recipeThicknessMm : 33);
  return thicknessMm / 1000;
}
