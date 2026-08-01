/**
 * useApplianceCatalog — Stage 1 appliance product catalog.
 *
 * Reads `appliance_products` and groups by category. Consumers:
 *  - UnifiedCatalog (via useCatalog which injects these into the planner sidebar)
 *  - Admin CRUD page
 *
 * Kept purely additive: when the table is empty or the query is loading, the
 * hook returns an empty list and existing planner/pricing behaviour is
 * unchanged.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ApplianceProductRecord } from '@/lib/pricing/types';
import { fetchAllPricingRows } from '@/lib/pricing/fetchAllPricingRows';

const APPLIANCE_QUERY_KEY = ['appliance-products'] as const;

async function fetchAppliances(activeOnly: boolean): Promise<ApplianceProductRecord[]> {
  try {
    const data = await fetchAllPricingRows<ApplianceProductRecord>(
      'appliance_products',
      activeOnly ? { is_active: true } : {},
    );
    return data.sort((a, b) =>
      ((a.sort_order ?? Number.MAX_SAFE_INTEGER) - (b.sort_order ?? Number.MAX_SAFE_INTEGER))
      || a.name.localeCompare(b.name),
    );
  } catch (error) {
    // Surface the real PostgREST failure so misconfigured RLS/grants/columns
    // are diagnosable instead of hidden behind a generic "couldn't load"
    // message in the wizard.
    // eslint-disable-next-line no-console
    console.error('[useApplianceCatalog] load failed', {
      message: (error as any).message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
      status: (error as any).status,
    });
    throw error;
  }
}

export function useApplianceCatalog(options: { activeOnly?: boolean } = {}) {
  const activeOnly = options.activeOnly ?? true;
  const query = useQuery({
    queryKey: [...APPLIANCE_QUERY_KEY, activeOnly],
    queryFn: () => fetchAppliances(activeOnly),
    staleTime: 5 * 60 * 1000,
  });

  const products = query.data ?? [];
  const byCategory = useMemo(() => {
    const map: Record<string, ApplianceProductRecord[]> = {};
    for (const p of products) {
      const key = p.category || 'other';
      (map[key] ??= []).push(p);
    }
    return map;
  }, [products]);

  return {
    products,
    byCategory,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

export type { ApplianceProductRecord };
