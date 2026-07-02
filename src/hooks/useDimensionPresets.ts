/**
 * #17 — Admin-editable dimension presets.
 *
 * Loads size presets for the room setup wizard from the `dimension_presets`
 * table. Falls back to the hardcoded shop standards when the table is empty
 * or unreachable, so the wizard always has working presets.
 */

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DimensionPreset {
  id: string;
  name: string;
  sortOrder: number;
  isDefault: boolean;
  /** Partial<RoomConfig> — mm values keyed by RoomConfig field name */
  dimensions: Record<string, number>;
}

export const FALLBACK_DIMENSION_PRESETS: DimensionPreset[] = [
  {
    id: 'standard1',
    name: 'Standard 1 (2100 overheads)',
    sortOrder: 0,
    isDefault: true,
    dimensions: { toeKickHeight: 135, baseHeight: 732, baseDepth: 575, wallHeight: 600, wallDepth: 300, wallMountHeight: 1350, tallHeight: 2100, tallDepth: 600 },
  },
  {
    id: 'standard2',
    name: 'Standard 2 (2400 overheads)',
    sortOrder: 1,
    isDefault: false,
    dimensions: { toeKickHeight: 135, baseHeight: 732, baseDepth: 575, wallHeight: 900, wallDepth: 300, wallMountHeight: 1350, tallHeight: 2400, tallDepth: 600 },
  },
];

function rowToPreset(r: {
  id: string;
  name: string;
  sort_order: number;
  is_default: boolean;
  dimensions: unknown;
}): DimensionPreset {
  return {
    id: r.id,
    name: r.name,
    sortOrder: r.sort_order,
    isDefault: r.is_default,
    dimensions: (r.dimensions ?? {}) as Record<string, number>,
  };
}

export function useDimensionPresets() {
  const [presets, setPresets] = useState<DimensionPreset[]>(FALLBACK_DIMENSION_PRESETS);
  const [loading, setLoading] = useState(true);
  const [fromDb, setFromDb] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('dimension_presets')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      if (data && data.length > 0) {
        setPresets(data.map(rowToPreset));
        setFromDb(true);
      }
    } catch {
      // keep fallback presets — wizard must always work
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** Insert or update a preset (admin only — RLS enforced server-side). */
  const save = useCallback(async (preset: Partial<DimensionPreset> & { name: string }) => {
    const payload = {
      name: preset.name,
      sort_order: preset.sortOrder ?? 0,
      is_default: preset.isDefault ?? false,
      dimensions: preset.dimensions ?? {},
    };
    const query = preset.id && !preset.id.startsWith('standard')
      ? supabase.from('dimension_presets').update(payload).eq('id', preset.id)
      : supabase.from('dimension_presets').insert(payload);
    const { error } = await query;
    if (error) throw error;
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from('dimension_presets').delete().eq('id', id);
    if (error) throw error;
    await refresh();
  }, [refresh]);

  return { presets, loading, fromDb, refresh, save, remove };
}
