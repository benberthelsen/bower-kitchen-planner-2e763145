// Labor cost calculator
//
// Rates are calibrated against real Microvellum "Cost Based Estimating"
// reports from completed, well-priced jobs (82 line items across 3 jobs;
// median fit error ~15% on cabinets). The model:
//
//   labor = base + perDoor·doors + perDrawer·drawers
//         + tallExtra (tall cabinets) + perMetreWidth·width
//
// Rates can be overridden from the labor_rates table (admin → Pricing →
// Labor Rates) by name; the constants below are the calibrated fallbacks.

import { CabinetConfig } from './types';

export interface LaborRateRow {
  name: string;
  rate: number | null;
  rate_type?: string | null;
}

export interface LaborRates {
  basePerCabinet: number;
  perDoor: number;
  perDrawer: number;
  tallExtra: number;
  perMetreWidth: number;
  panelOrFiller: number;
  toeKickPerCabinet: number;
}

/** Calibrated from MV cost reports (Jan–Jun 2026 jobs) */
export const DEFAULT_LABOR_RATES: LaborRates = {
  basePerCabinet: 235,
  perDoor: 36,
  perDrawer: 102,
  tallExtra: 162,
  perMetreWidth: 86,
  panelOrFiller: 158,
  toeKickPerCabinet: 0, // kicks priced separately when modelled as products
};

const RATE_NAME_MAP: Record<string, keyof LaborRates> = {
  'labor base per cabinet': 'basePerCabinet',
  'labor per door': 'perDoor',
  'labor per drawer': 'perDrawer',
  'labor tall extra': 'tallExtra',
  'labor per metre width': 'perMetreWidth',
  'labor panel or filler': 'panelOrFiller',
  'labor toe kick': 'toeKickPerCabinet',
};

/** Merge DB labor_rates rows over the calibrated defaults */
export function resolveLaborRates(rows: LaborRateRow[] | undefined): LaborRates {
  const rates = { ...DEFAULT_LABOR_RATES };
  (rows ?? []).forEach((row) => {
    const key = RATE_NAME_MAP[(row.name || '').trim().toLowerCase()];
    if (key && typeof row.rate === 'number' && Number.isFinite(row.rate)) {
      rates[key] = row.rate;
    }
  });
  return rates;
}

export function calculateLaborCost(
  config: CabinetConfig,
  cabinetWidthMm: number,
  isTall: boolean,
  rates: LaborRates = DEFAULT_LABOR_RATES,
): number {
  const widthM = Math.max(0, cabinetWidthMm) / 1000;
  return (
    rates.basePerCabinet +
    rates.perDoor * Math.max(0, config.numDoors) +
    rates.perDrawer * Math.max(0, config.numDrawers) +
    (isTall ? rates.tallExtra : 0) +
    rates.perMetreWidth * widthM
  );
}
