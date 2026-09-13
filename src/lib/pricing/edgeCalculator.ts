// Edge tape calculator - sums linear meters of edge banding

import { PartDimension, EdgeTapeAllocation, EdgePricingRecord } from './types';

/**
 * Edge tape comes in a 20 m minimum length; past that it is bought by the metre. Bower charges what it has to buy
 * (Ben, 14 Sep 2026): max(20 m, the metres used rounded up to a whole metre), per edge type, per job.
 */
export const EDGE_MIN_ORDER_M = 20;
/** @deprecated kept for older imports - edge tape is not bought in fixed rolls; see EDGE_MIN_ORDER_M */
export const EDGE_ROLL_LENGTH_M = EDGE_MIN_ORDER_M;

/** Metres of one edge type to buy for a job. */
export const edgeOrderMetres = (linearMeters: number) =>
  linearMeters > 0 ? Math.max(EDGE_MIN_ORDER_M, Math.ceil(linearMeters - 1e-9)) : 0;

/**
 * Calculate edge tape requirements from parts
 */
export function calculateEdgeTape(
  parts: PartDimension[],
  edgePricing: EdgePricingRecord[],
  /** User-selected edge banding (id / item_code / name) from the cabinet's
   *  materials. When supplied, edges price against that real edge row instead
   *  of the hardcoded 'standard' fallback (review #7). */
  selectedEdge?: string
): EdgeTapeAllocation[] {
  // Resolve the selected edge to a pricing row once (id, item_code or name
  // fragment). Everything edges to the same tape, so key runs by its id.
  const resolvedEdge = selectedEdge
    ? edgePricing.find((e) => {
        const sel = String(selectedEdge).toLowerCase();
        return e.id === selectedEdge || e.item_code === selectedEdge
          || (e.name ?? '').toLowerCase().includes(sel)
          || (e.edge_type ?? '').toLowerCase() === sel;
      })
    : undefined;
  const edgeType = resolvedEdge?.item_code ?? resolvedEdge?.edge_type ?? 'standard';

  // Sum edge lengths (all parts share the cabinet's selected edge).
  const edgeRuns = new Map<string, number>();

  for (const part of parts) {
    const { edging, length, width, quantity } = part;

    let totalLength = 0;
    
    // Add length edges
    if (edging.len1) totalLength += length;
    if (edging.len2) totalLength += length;
    
    // Add width edges  
    if (edging.wid1) totalLength += width;
    if (edging.wid2) totalLength += width;
    
    // Multiply by quantity
    totalLength *= quantity;
    
    if (totalLength > 0) {
      const existing = edgeRuns.get(edgeType) || 0;
      edgeRuns.set(edgeType, existing + totalLength);
    }
  }
  
  // Convert to allocations with pricing
  const allocations: EdgeTapeAllocation[] = [];
  
  for (const [edgeType, lengthMm] of edgeRuns) {
    // Use the pre-resolved selected edge when it matches this run's key,
    // otherwise fall back to matching by the key itself.
    const pricing = (resolvedEdge && (resolvedEdge.item_code === edgeType || resolvedEdge.edge_type === edgeType))
      ? resolvedEdge
      : edgePricing.find(e => e.edge_type === edgeType || e.item_code === edgeType);

    const linearMeters = lengthMm / 1000;
    const hasCatalogPrice = Number.isFinite(pricing?.length_cost) && (pricing?.length_cost ?? 0) > 0;
    const costPerMeter = hasCatalogPrice ? pricing!.length_cost : 2.50; // calibrated fallback cost/m
    const handlingCost = pricing?.handling_cost ?? 0;
    const applicationCost = (pricing?.application_cost ?? 0) * linearMeters;
    
    allocations.push({
      edgeType,
      edgeName: pricing?.name ?? 'Standard Edge Tape',
      thickness: pricing?.thickness ?? 0.4,
      linearMeters,
      costPerMeter,
      handlingCost,
      applicationCost,
      totalCost: (linearMeters * costPerMeter) + handlingCost + applicationCost,
      isFallbackPrice: !hasCatalogPrice,
    });
  }
  
  return allocations;
}

/**
 * Consolidate edge tape requirements across multiple cabinets
 */
export function consolidateEdgeTape(
  cabinetEdges: EdgeTapeAllocation[][]
): EdgeTapeAllocation[] {
  const byType = new Map<string, EdgeTapeAllocation[]>();
  
  for (const edges of cabinetEdges) {
    for (const edge of edges) {
      if (!byType.has(edge.edgeType)) {
        byType.set(edge.edgeType, []);
      }
      byType.get(edge.edgeType)!.push(edge);
    }
  }
  
  const consolidated: EdgeTapeAllocation[] = [];
  
  for (const [edgeType, allocations] of byType) {
    const template = allocations[0];
    const totalLinearMeters = allocations.reduce((sum, a) => sum + a.linearMeters, 0);
    const totalHandlingCost = allocations.reduce((sum, a) => sum + a.handlingCost, 0);
    const totalApplicationCost = allocations.reduce((sum, a) => sum + a.applicationCost, 0);
    
    const orderMetres = edgeOrderMetres(totalLinearMeters);

    consolidated.push({
      edgeType,
      edgeName: template.edgeName,
      thickness: template.thickness,
      // one order of orderMetres (a 20 m minimum, then by the metre)
      rollsRequired: orderMetres > 0 ? 1 : 0,
      rollLengthM: orderMetres,
      linearMeters: totalLinearMeters,
      costPerMeter: template.costPerMeter,
      handlingCost: totalHandlingCost,
      applicationCost: totalApplicationCost,
      // Application is charged only on the metres actually edged, but the material
      // cost covers every metre that has to be bought.
      totalCost: (orderMetres * template.costPerMeter)
        + totalHandlingCost
        + totalApplicationCost,
      isFallbackPrice: allocations.some(a => a.isFallbackPrice),
    });
  }
  
  return consolidated;
}
