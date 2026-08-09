export type ApplianceGroupOrigin = 'centred' | 'base-origin';

/**
 * Return the local Y coordinate that places an under-bench appliance's slab
 * on the cabinet run's datum. Appliance geometry is allowed to have a
 * supplier-specific height; that must never lift or drop the benchtop.
 */
export function underBenchTopLocalY(
  applianceHeightM: number,
  cabinetBenchHeightM: number,
  groupOrigin: ApplianceGroupOrigin,
): number {
  return groupOrigin === 'centred'
    ? cabinetBenchHeightM - applianceHeightM / 2
    : cabinetBenchHeightM;
}
