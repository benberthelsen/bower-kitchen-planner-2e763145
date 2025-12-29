// React hook for BOM-based pricing

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlanner } from '@/store/PlannerContext';
import { generateQuoteBOM, QuoteBOM, PricingData } from '@/lib/pricing';

async function fetchPricingData(): Promise<PricingData> {
  const [parts, materials, edges, hardware, labor, doorDrawer, stone] = await Promise.all([
    supabase.from('parts_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('material_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('edge_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('hardware_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('labor_rates').select('*'),
    supabase.from('door_drawer_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('stone_pricing').select('*'),
  ]);
  
  return {
    parts: (parts.data ?? []) as PricingData['parts'],
    materials: (materials.data ?? []) as PricingData['materials'],
    edges: (edges.data ?? []) as PricingData['edges'],
    hardware: (hardware.data ?? []) as PricingData['hardware'],
    labor: (labor.data ?? []) as PricingData['labor'],
    doorDrawer: (doorDrawer.data ?? []) as PricingData['doorDrawer'],
    stone: (stone.data ?? []) as PricingData['stone'],
  };
}

export function useBOMPricing() {
  const { items, globalDimensions, hardwareOptions } = usePlanner();
  
  const { data: pricingData, isLoading: isPricingLoading } = useQuery({
    queryKey: ['pricing-data'],
    queryFn: fetchPricingData,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
  
  const quoteBOM = useMemo<QuoteBOM | null>(() => {
    if (!pricingData) return null;
    return generateQuoteBOM(items, globalDimensions, hardwareOptions, pricingData);
  }, [items, globalDimensions, hardwareOptions, pricingData]);
  
  return {
    quoteBOM,
    pricingData,
    isLoading: isPricingLoading,
    totalPrice: quoteBOM?.grandTotal.total ?? 0,
  };
}
