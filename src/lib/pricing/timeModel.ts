// Production time model (P2)
//
// Build hours per cabinet from the shop's process constants (extracted from
// the LM pricing workbook): sheet cutting, edge-banding, assembly. Produces
// machine vs labour hours so the job yields real build-hours for scheduling,
// and an hours-derived cost that cross-checks the MV-calibrated labor model.

import { BuildHours, CabinetConfig, EdgeTapeAllocation, SheetAllocation } from './types';

export interface TimeRates {
  cutHoursPerCarcaseSheet: number; // 0.25h to cut a carcase sheet
  cutHoursPerDoorSheet: number;    // 0.5h to cut a CNC door sheet
  edgeHoursPerLm: number;          // 0.033h per LM edge-banded
  assemblyBase: number;            // 0.55h base cabinet
  assemblyTall: number;            // 0.75h tall cabinet
  assemblyMicrowave: number;       // 1.25h microwave/appliance tower
  assemblyPerDrawer: number;       // +0.125h per drawer
  machineRate: number;             // $/h machine time
  labourRate: number;              // $/h labour time
}

export const DEFAULT_TIME_RATES: TimeRates = {
  cutHoursPerCarcaseSheet: 0.25,
  cutHoursPerDoorSheet: 0.5,
  edgeHoursPerLm: 0.033,
  assemblyBase: 0.55,
  assemblyTall: 0.75,
  assemblyMicrowave: 1.25,
  assemblyPerDrawer: 0.125,
  machineRate: 120,
  labourRate: 95,
};

const round = (n: number) => Math.round(n * 1000) / 1000;

export function calculateBuildHours(
  sheets: SheetAllocation[],
  edgeTape: EdgeTapeAllocation[],
  config: CabinetConfig,
  isTall: boolean,
  definitionId: string,
  rates: TimeRates = DEFAULT_TIME_RATES
): BuildHours {
  // Cut hours scale with material actually used (fractional sheets), by board role.
  let cut = 0;
  for (const sh of sheets) {
    const fractional = sh.sheetArea > 0 && sh.yieldFactor > 0
      ? (sh.totalPartArea / sh.yieldFactor) / sh.sheetArea
      : 0;
    const perSheet = sh.materialRole === 'exterior'
      ? rates.cutHoursPerDoorSheet
      : rates.cutHoursPerCarcaseSheet;
    cut += fractional * perSheet;
  }

  const lm = edgeTape.reduce((s, e) => s + e.linearMeters, 0);
  const edge = lm * rates.edgeHoursPerLm;

  const isMicrowave = /microwave|appliance/i.test(definitionId ?? '');
  const assemblyBase = isMicrowave
    ? rates.assemblyMicrowave
    : isTall
      ? rates.assemblyTall
      : rates.assemblyBase;
  const assembly = assemblyBase + rates.assemblyPerDrawer * Math.max(0, config.numDrawers);

  const total = cut + edge + assembly;
  const machineCost = (cut + edge) * rates.machineRate;
  const labourCost = assembly * rates.labourRate;

  return {
    cut: round(cut),
    edge: round(edge),
    assembly: round(assembly),
    total: round(total),
    machineCost: round(machineCost),
    labourCost: round(labourCost),
    cost: round(machineCost + labourCost),
  };
}
