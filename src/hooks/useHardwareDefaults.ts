import { useCallback, useEffect, useState } from 'react';
import { fetchAllPricingRows } from '@/lib/pricing/fetchAllPricingRows';

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
    try {
      const data = await fetchAllPricingRows<{
        id: string;
        item_code: string;
        name: string;
        hardware_type: string | null;
        unit_cost: number | null;
      }>('hardware_pricing', { visibility_status: 'Available' });

      setHardware(
        data
          .map((row) => ({
            id: row.id,
            sku: row.item_code,
            name: row.name,
            type: row.hardware_type ?? 'General',
            unitCost: row.unit_cost ?? 0,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    } catch {
      setHardware([]);
    }
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
