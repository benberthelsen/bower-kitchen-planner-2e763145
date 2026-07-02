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
  itemCode: string;
  name: string;
  brand: string | null;
  finish: string | null;
  materialType: string | null;
  sampleImageUrl: string | null;
  thumbnailUrl: string | null;
  textureImageUrl: string | null;
  sourceUrl: string | null;
  priceStatus: string | null;
  areaCost: number | null;
  thickness: number | null;
  sheetLength: number | null;
  sheetWidth: number | null;
}

export interface EdgeOptionRow {
  id: string;
  name: string;
  lengthCost: number | null;     // $ per linear metre
  applicationCost: number | null; // $ per metre to apply
  handlingCost: number | null;
}

export interface HardwareOptionRow {
  id: string;
  name: string;
  brand: string | null;
  hardwareType: string | null;
  series: string | null;
  unitCost: number | null;
  handlingCost: number | null;
}

export function useMaterialsCatalog() {
  const materialsQuery = useQuery({
    queryKey: ['wizard-material-pricing'],
    queryFn: async (): Promise<MaterialOptionRow[]> => {
      const mapRow = (r: Record<string, unknown>): MaterialOptionRow => ({
        id: r.id as string,
        itemCode: r.item_code as string,
        name: r.name as string,
        brand: (r.brand as string) ?? null,
        finish: (r.finish as string) ?? null,
        materialType: (r.material_type as string) ?? null,
        sampleImageUrl: (r.sample_image_url as string) ?? null,
        thumbnailUrl: (r.thumbnail_url as string) ?? null,
        textureImageUrl: (r.texture_image_url as string) ?? null,
        sourceUrl: (r.source_url as string) ?? null,
        priceStatus: (r.price_status as string) ?? null,
        areaCost: (r.area_cost as number) ?? null,
        thickness: (r.thickness as number) ?? null,
        sheetLength: (r.sheet_length as number) ?? null,
        sheetWidth: (r.sheet_width as number) ?? null,
      });
      // Primary source: the generated supplier bundle (full range + swatch images
      // + prices, copied into public/data). This is the data-feed the planner is
      // designed to read, and it works without waiting for a Supabase re-import.
      try {
        const res = await fetch('/data/bower-supplier-catalog/planner-materials.json');
        if (res.ok) {
          const j = await res.json();
          const rows = (Array.isArray(j) ? j : j.materials) as Record<string, unknown>[] | undefined;
          if (rows && rows.length) {
            return rows
              .filter((r) => (r.visibility_status ?? 'Available') !== 'Hidden')
              .map(mapRow)
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          }
        }
      } catch { /* fall through to Supabase */ }
      // Fallback: Supabase material_pricing.
      const { data, error } = await supabase
        .from('material_pricing')
        .select('*')
        .eq('visibility_status', 'Available')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
    },
    staleTime: 5 * 60 * 1000,
  });

  const edgesQuery = useQuery({
    queryKey: ['wizard-edge-pricing'],
    queryFn: async (): Promise<EdgeOptionRow[]> => {
      const { data, error } = await supabase
        .from('edge_pricing')
        .select('*')
        .eq('visibility_status', 'Available')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as string,
          name: row.name as string,
          lengthCost: (row.length_cost as number) ?? null,
          applicationCost: (row.application_cost as number) ?? null,
          handlingCost: (row.handling_cost as number) ?? null,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  const hardwareQuery = useQuery({
    queryKey: ['wizard-hardware-pricing'],
    queryFn: async (): Promise<HardwareOptionRow[]> => {
      const { data, error } = await supabase
        .from('hardware_pricing')
        .select('*')
        .eq('visibility_status', 'Available')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => {
        const row = r as Record<string, unknown>;
        return {
          id: row.id as string,
          name: row.name as string,
          brand: (row.brand as string) ?? null,
          hardwareType: (row.hardware_type as string) ?? null,
          series: (row.series as string) ?? null,
          unitCost: (row.unit_cost as number) ?? null,
          handlingCost: (row.handling_cost as number) ?? null,
        };
      });
    },
    staleTime: 5 * 60 * 1000,
  });

  const laborQuery = useQuery({
    queryKey: ['wizard-labor-rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('labor_rates').select('*');
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const laborRates = laborQuery.data ?? [];
  // Per-cabinet assembly labour ($ per unit) from the rates table.
  const laborPerCabinet = (() => {
    const assembly = laborRates.find((r) => /assembly|cabinet/i.test(String(r.name)) && r.rate_type === 'per_unit');
    const anyPerUnit = laborRates.find((r) => r.rate_type === 'per_unit');
    return (assembly?.rate as number) ?? (anyPerUnit?.rate as number) ?? 0;
  })();

  const hardware = hardwareQuery.data ?? [];
  // Group by the (clean) hardware_type field so "Inner Drawer ..." (type Other)
  // isn't mis-filed as a runner, etc.
  const byType = (re: RegExp) => hardware.filter((h) => re.test(h.hardwareType || ''));
  const hinges = byType(/hinge/i);
  const drawerRunners = byType(/drawer\s*runner|runner|slide/i);
  const handles = byType(/handle|pull|knob/i);
  const legs = byType(/\bleg\b/i);
  const shelfPins = byType(/shelf\s*pin|pin/i);

  // Split cabinet boards (doors/carcase) from benchtop materials. Benchtops are
  // solid-surface / benchtop-typed rows, plus the EGGER & MEGANITE ranges which
  // are benchtop suppliers — they should not appear in the door/carcase picker.
  const allMaterials = materialsQuery.data ?? [];
  const isBenchtopMaterial = (m: MaterialOptionRow) => {
    const t = (m.materialType || '').toLowerCase();
    return m.brand === 'EGGER' || m.brand === 'MEGANITE'
      || t.includes('benchtop') || t.includes('solid_surface') || t.includes('solid surface');
  };
  const boardMaterials = allMaterials.filter((m) => !isBenchtopMaterial(m));
  const benchtopMaterials = allMaterials.filter(isBenchtopMaterial);

  // The Polytec "Carcass" range is the standard internal carcase board. Default
  // the carcase to it, preferring the 162412 Matt (the shop default).
  const carcassMaterials = boardMaterials.filter((m) => /carcass/i.test(m.name || ''));
  const carcassScore = (m: MaterialOptionRow) => {
    const n = (m.name || '').toLowerCase();
    return (n.includes('162412') ? 4 : 0) + (n.includes('matt') ? 2 : 0) + (n.includes('particle') ? 1 : 0);
  };
  const defaultCarcass = carcassMaterials.length
    ? [...carcassMaterials].sort((a, b) => carcassScore(b) - carcassScore(a))[0]
    : (boardMaterials[0] ?? null);

  return {
    materials: allMaterials,
    boardMaterials,
    benchtopMaterials,
    carcassMaterials,
    defaultCarcass,
    edges: edgesQuery.data ?? [],
    laborPerCabinet,
    hardware,
    hinges,
    drawerRunners,
    handles,
    legs,
    shelfPins,
    isLoading: materialsQuery.isLoading || edgesQuery.isLoading || hardwareQuery.isLoading,
  };
}
