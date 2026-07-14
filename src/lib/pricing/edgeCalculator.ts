// Edge tape calculator - sums linear meters of edge banding

import { PartDimension, EdgeTapeAllocation, EdgePricingRecord } from './types';

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
    const costPerMeter = pricing?.length_cost ?? 2.50; // Default cost/m
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
      totalCost: (linearMeters * costPerMeter) + handlingCost + applicationCost
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
    
    // Edge tape orders in multiples of 25m rolls
    const ROLL_LENGTH_M = 25;
    const rollsRequired = Math.ceil(totalLinearMeters / ROLL_LENGTH_M);

    consolidated.push({
      edgeType,
      edgeName: template.edgeName,
      thickness: template.thickness,
      rollsRequired,
      rollLengthM: ROLL_LENGTH_M,
      linearMeters: totalLinearMeters,
      costPerMeter: template.costPerMeter,
      handlingCost: totalHandlingCost,
      applicationCost: totalApplicationCost,
      totalCost: (totalLinearMeters * template.costPerMeter) + totalHandlingCost + totalApplicationCost
    });
  }
  
  return consolidated;
}
