// Bundle entry for the pricing smoke tests
export { generateQuoteBOM, generateCabinetBOM } from '../src/lib/pricing/bomGenerator';
export { calculateWorkshopCost, DEFAULT_WORKSHOP_RATES } from '../src/lib/pricing/workshopModel';
export {
  calculateDelivery, estimateRoadDistanceKm, findBand,
  WORKSHOP_ORIGIN, DEFAULT_DELIVERY_BANDS,
} from '../src/lib/pricing/deliveryCalculator';
