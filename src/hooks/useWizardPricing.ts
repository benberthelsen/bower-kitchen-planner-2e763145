/**
 * Canonical homeowner indicative price band.
 *
 * The same deterministic `priceDesign` function runs in the browser, the AI
 * Edge Function, candidate generation, review, and submission. Trade BOM
 * pricing remains a later staff operation; mixing its live database totals
 * into only one customer screen made the displayed range change mid-journey.
 */

import { useMemo } from 'react';
import { priceDesign } from '@/lib/layout';
import type { PriceBand, StyleSpec } from '@/lib/layout';
import type { PlacedItem } from '@/types';

export interface WizardPriceBand extends PriceBand {
  /** Reserved compatibility field; homeowner bands are proposal-engine backed. */
  isBomBacked: boolean;
}

export function useWizardPricing(items: PlacedItem[], style: StyleSpec): WizardPriceBand {
  return useMemo<WizardPriceBand>(
    () => ({ ...priceDesign(items, style), isBomBacked: false }),
    [items, style],
  );
}
