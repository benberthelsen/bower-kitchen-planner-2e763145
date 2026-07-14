/**
 * useWizardPricing — homeowner price band backed by the REAL BOM engine.
 *
 * Uses the same `generateQuoteBOM` + Supabase pricing tables as the trade
 * planner (shared react-query key 'pricing-data', so trade and wizard share
 * one cache). The trade cost is converted to a homeowner-safe band:
 *
 *   trade total (ex GST) × commercial layer × GST → ±12% band → $500 rounding
 *
 * WS10 HARD RULE: only the rounded band leaves this hook — never the BOM,
 * cost components, or warnings text (logged to console for devs only).
 *
 * Fallback chain: while pricing tables load — or if the BOM totals $0
 * (e.g. tables not seeded) — the deterministic estimator from
 * src/lib/layout/priceDesign keeps the wizard responsive.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { generateQuoteBOM, type PricingData } from '@/lib/pricing';
import { priceDesign } from '@/lib/layout';
import type { PriceBand, StyleSpec } from '@/lib/layout';
import type { HardwareOptions, PlacedItem } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS, DRAWER_OPTIONS, HINGE_OPTIONS } from '@/constants';

/** commercial layer over trade cost (matches plan §4; tune in admin later) */
const COMMERCIAL_MULT = 1.35;
const GST = 1.1;
const BAND = 0.12;
const ROUND_TO = 500;

async function fetchPricingData(): Promise<PricingData> {
  const [parts, materials, edges, hardware, labor, doorDrawer, benchtop] = await Promise.all([
    supabase.from('parts_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('material_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('edge_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('hardware_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('labor_rates').select('*'),
    supabase.from('door_drawer_pricing').select('*').eq('visibility_status', 'Available'),
    supabase.from('benchtop_pricing').select('*'),
  ]);
  return {
    parts: (parts.data ?? []) as PricingData['parts'],
    materials: (materials.data ?? []) as PricingData['materials'],
    edges: (edges.data ?? []) as PricingData['edges'],
    hardware: (hardware.data ?? []) as PricingData['hardware'],
    labor: (labor.data ?? []) as PricingData['labor'],
    doorDrawer: (doorDrawer.data ?? []) as PricingData['doorDrawer'],
    benchtop: (benchtop.data ?? []) as PricingData['benchtop'],
  };
}

const WIZARD_HARDWARE: HardwareOptions = {
  hingeType: HINGE_OPTIONS[0],
  drawerType: DRAWER_OPTIONS[0],
  cabinetTop: 'Rail On Flat',
  supplyHardware: true,
  adjustableLegs: true,
  handleId: 'handle-bar-ss',
};

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export interface WizardPriceBand extends PriceBand {
  /** true once the band comes from the real BOM engine */
  isBomBacked: boolean;
}

export function useWizardPricing(items: PlacedItem[], style: StyleSpec): WizardPriceBand {
  const { data: pricingData } = useQuery({
    queryKey: ['pricing-data'],      // shared with the trade planner cache
    queryFn: fetchPricingData,
    staleTime: 5 * 60 * 1000,
  });

  return useMemo<WizardPriceBand>(() => {
    if (pricingData && items.length > 0) {
      try {
        const quote = generateQuoteBOM(
          items,
          DEFAULT_GLOBAL_DIMENSIONS,
          { ...WIZARD_HARDWARE, handleId: style.handleId },
          pricingData,
        );
        const tradeTotal = quote.grandTotal.total;
        if (Number.isFinite(tradeTotal) && tradeTotal > 0) {
          if (quote.warnings.length > 0) {
            // dev-only: never surface pricing-trust warnings to homeowners
            console.warn('[useWizardPricing] BOM warnings:', quote.warnings);
          }
          const sell = tradeTotal * COMMERCIAL_MULT * GST;
          const low = roundTo(sell * (1 - BAND), ROUND_TO);
          const high = Math.max(roundTo(sell * (1 + BAND), ROUND_TO), low + ROUND_TO);
          return { lowAud: low, highAud: high, estimateSource: 'engine', isBomBacked: true };
        }
      } catch (e) {
        console.warn('[useWizardPricing] BOM path failed, using estimator:', e);
      }
    }
    // fallback: deterministic estimator (loading, empty tables, or error)
    return { ...priceDesign(items, style), isBomBacked: false };
  }, [pricingData, items, style]);
}
