/**
 * resolveApplianceModelUrl — single source of truth for looking up an
 * appliance's GLB URL. Snapshot first (never silently swap a customer's
 * captured model), catalog row second so items placed before an upload
 * still upgrade in the planner / AR once the GLB is uploaded.
 *
 * Used by both `ApplianceModel` (planner scene) and `ViewInRoomAr` (Android
 * WebXR) so the two paths can't drift.
 */
import type { PlacedItem } from '../../types';
import type { ApplianceProductRecord } from '@/lib/pricing/types';

export function resolveApplianceModelUrl(
  item: PlacedItem,
  products: ApplianceProductRecord[] | null | undefined,
): string | null {
  const snap = item.applianceSnapshot?.modelUrl ?? null;
  if (snap) return snap;
  const pid = item.applianceProductId;
  if (!pid || !products?.length) return null;
  const row = products.find((p) => p.id === pid);
  return row?.model_url ?? null;
}
