import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const STORAGE_KEY = 'trade.hardware.selectedSku';

export type HardwareSku = {
  id: string;
  sku: string;
  name: string;
  type: string;
  unitCost: number;
};

export function useHardwareDefaults() {
  const [hardware, setHardware] = useState<HardwareSku[]>([]);
  const [selectedSku, setSelectedSku] = useState<string>(() => localStorage.getItem(STORAGE_KEY) ?? '');
  const [loading, setLoading] = useState(true);

  const loadHardware = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hardware_pricing')
      .select('id, item_code, name, hardware_type, unit_cost, visibility_status')
      .eq('visibility_status', 'Available')
      .order('name', { ascending: true });

    if (error) {
      setHardware([]);
      setLoading(false);
      return;
    }

    setHardware(
      (data ?? []).map((row) => ({
        id: row.id,
        sku: row.item_code,
        name: row.name,
        type: row.hardware_type ?? 'General',
        unitCost: row.unit_cost ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadHardware();
  }, [loadHardware]);

  const selectSku = useCallback((sku: string) => {
    setSelectedSku(sku);
    localStorage.setItem(STORAGE_KEY, sku);
  }, []);

  return { hardware, selectedSku, selectSku, loading, reload: loadHardware };
}
