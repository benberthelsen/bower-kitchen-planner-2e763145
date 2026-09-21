// Bundle entry for the pricing smoke tests
export { generateQuoteBOM, generateCabinetBOM, itemKickMm, carcaseFamily, ladderKickCutList, pickKickPlyMaterial, calculateKickboardRuns, FRONT_EDGE_REVEAL_MM, BASE_FRONT_TOP_REVEAL_MM, KICK_FACING_WASTE, LADDER_PLY_THICKNESS_MM, ladderSubBackInsetMm } from '../src/lib/pricing/bomGenerator';
export { inferFrontCounts, FLAT_PANEL_RE, isFacesOnlyProduct, isRobeDoorProduct, hasSlidingDoors, buildGenericCabinetMapping, facesOnlyDoorCount, boardThinAxis, flatBoardCutSize } from '../src/lib/pricing/cabinetPartMapping';
export { partFitsSheet, splitOversizeParts, isUnjoinableFace } from '../src/lib/pricing/sheetOptimizer';
export { calculateLaborCost, resolveLaborRates, DEFAULT_LABOR_RATES } from '../src/lib/pricing/laborCalculator';
export { calculateBenchtops } from '../src/lib/pricing/benchtopCalculator';
export { calculateWorkshopCost, DEFAULT_WORKSHOP_RATES, HARDWARE_FIT_MINUTES, hardwareFitMinutes } from '../src/lib/pricing/workshopModel';
export { EDGE_MIN_ORDER_M, edgeOrderMetres } from '../src/lib/pricing/edgeCalculator';
export { quoteFromSchedule, robeNotPricedWarning, robeBlockedWarning, hasRobeSpec, DEFAULT_DIMENSIONS, scheduleKickHeights } from '../src/lib/pricing/quoteFromSchedule';
export {
  sliderScGeometry, sliderScKitLength, hafelePrintedDoorWidth, sliderScLeafMassKg, sliderScValidationStatus, sliderScTrackForLeaf,
  SLIDER_SC_PROFILE_ALLOWANCE_MM, SLIDER_SC_MASS_DEFAULTS,
} from '../src/lib/pricing/robeGeometry';
export { priceRobeOpenings, selectRobeKit, isRobeKitRow, glassMeasureSqm, GLASSTECH_MIRROR_ITEM_CODE, ROBE_NEST_SPACING_MM, ROBE_DAMPERS_PER_LEAF } from '../src/lib/pricing/robeSliderDoors';
export {
  priceLaminatedBenchtops, isBenchtopBlankSheet, resolveBenchtopKind,
  DEFAULT_BLANK_TRIM_MM,
} from '../src/lib/pricing/benchtopLaminate';
export {
  calculateDelivery, estimateRoadDistanceKm, findBand,
  WORKSHOP_ORIGIN, DEFAULT_DELIVERY_BANDS,
} from '../src/lib/pricing/deliveryCalculator';
