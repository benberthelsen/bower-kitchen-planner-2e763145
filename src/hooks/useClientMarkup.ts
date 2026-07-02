// Loads the logged-in client's markup profile (client_markup_settings) and
// shapes it into CommercialOptions for the pricing engine. Admin-managed in
// Admin → Pricing → Client Markups; applied here so quotes show sell prices.

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CommercialOptions } from '@/lib/pricing';

// Markups are stored per markup_type. For 'percentage' the numbers are whole
// percents (e.g. 30 = 30%); convert to fractions for the engine.
function toFraction(value: number | null | undefined, type: string | null | undefined): number {
  const n = Number(value) || 0;
  if (n === 0) return 0;
  return (type ?? 'percentage') === 'percentage' ? n / 100 : n;
}

export function useClientMarkup(profileId?: string): {
  commercial: CommercialOptions;
  isLoading: boolean;
  profileName: string | null;
} {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['client-markup', user?.id ?? 'anon', profileId ?? 'default'],
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let query = supabase
        .from('client_markup_settings')
        .select('*')
        .eq('client_id', user!.id);
      query = profileId ? query.eq('id', profileId) : query.eq('is_default', true);
      const { data: rows } = await query.limit(1);
      // Fall back to any profile for this client if no default/selected match.
      if (!rows || rows.length === 0) {
        const { data: anyRow } = await supabase
          .from('client_markup_settings')
          .select('*')
          .eq('client_id', user!.id)
          .limit(1);
        return anyRow?.[0] ?? null;
      }
      return rows[0];
    },
  });

  if (!data) {
    return { commercial: {}, isLoading, profileName: null };
  }

  const t = data.markup_type as string | null;
  const commercial: CommercialOptions = {
    gstPct: 0.1,
    categoryMarkups: {
      material: toFraction(data.material_markup, t),
      hardware: toFraction(data.hardware_markup, t),
      labor: toFraction(data.labor_markup, t),
      parts: toFraction(data.parts_markup, t),
      edge: toFraction(data.edge_markup, t),
      doorDrawer: toFraction(data.door_drawer_markup, t),
      stone: toFraction(data.stone_markup, t),
      delivery: toFraction(data.delivery_markup, t),
    },
  };

  return { commercial, isLoading, profileName: (data.name as string) ?? null };
}
