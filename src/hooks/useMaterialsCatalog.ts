import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Loads the real materials / edges / hardware lists from the pricing tables
 * (populated via the admin import pages). Used by the room wizard so the
 * material and hardware pickers offer the actual database range instead of
 * hardcoded samples.
 */

export interface MaterialOptionRow {
  id: string;
  name: string;
  brand: string | null;
  finish: string | null;
  materialType: string | null;
}

export interface EdgeOptionRow {
  id: string;
  name: string;
}

export interface HardwareOptionRow {
  id: string;
  name: string;
  brand: string | null;
  hardwareType: string | null;
  series: string | null;
}

export function useMaterialsCatalog() {
  const materialsQuery = useQuery({
    queryKey: ['wizard-material-pricing'],
    queryFn: async (): Promise<MaterialOptionRow[]> => {
      const { data, error } = await supabase
        .from('material_pricing')
        .select('id, name, brand, finish, material_type, visibility_status')
        .eq('visibility_status', 'Available')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        finish: row.finish,
        materialType: row.material_type,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const edgesQuery = useQuery({
    queryKey: ['wizard-edge-pricing'],
    queryFn: async (): Promise<EdgeOptionRow[]> => {
      const { data, error } = await supabase
        .from('edge_pricing')
        .select('id, name, visibility_status')
        .eq('visibility_status', 'Available')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, name: row.name }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const hardwareQuery = useQuery({
    queryKey: ['wizard-hardware-pricing'],
    queryFn: async (): Promise<HardwareOptionRow[]> => {
      const { data, error } = await supabase
        .from('hardware_pricing')
        .select('id, name, brand, hardware_type, series, visibility_status')
        .eq('visibility_status', 'Available')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        brand: row.brand,
        hardwareType: row.hardware_type,
        series: row.series,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const hardware = hardwareQuery.data ?? [];
  const hinges = hardware.filter((h) => /hinge/i.test(`${h.hardwareType} ${h.name}`));
  const drawerRunners = hardware.filter((h) => /drawer|runner|slide/i.test(`${h.hardwareType} ${h.name}`));

  return {
    materials: materialsQuery.data ?? [],
    edges: edgesQuery.data ?? [],
    hinges,
    drawerRunners,
    isLoading: materialsQuery.isLoading || edgesQuery.isLoading || hardwareQuery.isLoading,
  };
}
