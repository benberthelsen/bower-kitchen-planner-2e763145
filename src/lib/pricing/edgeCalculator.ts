// Edge tape calculator - sums linear meters of edge banding

import { PartDimension, EdgeTapeAllocation, EdgePricingRecord } from './types';

/**
 * Calculate edge tape requirements from parts
 */
export function calculateEdgeTape(
  parts: PartDimension[],
  edgePricing: EdgePricingRecord[]
): EdgeTapeAllocation[] {
  // Sum edge lengths by type
  const edgeRuns = new Map<string, number>();
  
  for (const part of parts) {
    const { edging, length, width, quantity } = part;
    
    // Get edge type from part or use default
    const edgeType = 'standard'; // In real implementation, get from part definition
    
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
    const pricing = edgePricing.find(e => 
      e.edge_type === edgeType || e.item_code === edgeType
    );
    
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
    
    consolidated.push({
      edgeType,
      edgeName: template.edgeName,
      thickness: template.thickness,
      linearMeters: totalLinearMeters,
      costPerMeter: template.costPerMeter,
      handlingCost: totalHandlingCost,
      applicationCost: totalApplicationCost,
      totalCost: (totalLinearMeters * template.costPerMeter) + totalHandlingCost + totalApplicationCost
    });
  }
  
  return consolidated;
}
