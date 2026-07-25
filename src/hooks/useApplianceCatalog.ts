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
import { supabase } from '@/integrations/supabase/client';
import type { ApplianceProductRecord } from '@/lib/pricing/types';

const APPLIANCE_QUERY_KEY = ['appliance-products'] as const;

async function fetchAppliances(activeOnly: boolean): Promise<ApplianceProductRecord[]> {
  let query = (supabase as any)
    .from('appliance_products')
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ApplianceProductRecord[];
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
