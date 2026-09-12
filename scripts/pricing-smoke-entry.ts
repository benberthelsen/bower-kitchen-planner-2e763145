// Bundle entry for the pricing smoke tests
export { generateQuoteBOM, generateCabinetBOM } from '../src/lib/pricing/bomGenerator';
export { inferFrontCounts, FLAT_PANEL_RE } from '../src/lib/pricing/cabinetPartMapping';
export { calculateLaborCost, resolveLaborRates, DEFAULT_LABOR_RATES } from '../src/lib/pricing/laborCalculator';
export { calculateBenchtops } from '../src/lib/pricing/benchtopCalculator';
export { calculateWorkshopCost, DEFAULT_WORKSHOP_RATES } from '../src/lib/pricing/workshopModel';
export { quoteFromSchedule, DEFAULT_DIMENSIONS } from '../src/lib/pricing/quoteFromSchedule';
export { priceLaminatedBenchtops } from '../src/lib/pricing/benchtopLaminate';
export {
  calculateDelivery, estimateRoadDistanceKm, findBand,
  WORKSHOP_ORIGIN, DEFAULT_DELIVERY_BANDS,
} from '../src/lib/pricing/deliveryCalculator';
