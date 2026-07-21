/**
 * handoffBrief — turn a website flat-lay / design-scope handoff into inputs the
 * AI designer understands. The client's inspiration tags and the exact finishes
 * they chose on the website become `brief.styleWords`, which the ai-designer
 * prompt treats as a STRONG preference (nearest catalog match). Shared by both
 * AI entry points: the homeowner wizard and the trade planner.
 */

interface HandoffStyleInput {
  styleTags?: string[];
  materials?: {
    mainCabinet?: string;
    secondaryFinish?: string;
    benchtop?: string;
    splashback?: string;
    hardware?: string;
  };
  notes?: string;
  dimensions?: { widthMm?: number; depthMm?: number; heightMm?: number };
}

/** Condense the handoff's style tags + chosen materials + notes into a single
 *  descriptive string (<=500 chars, matching designBriefSchema.styleWords). */
export function handoffToStyleWords(payload: HandoffStyleInput): string {
  const parts: string[] = [];

  if (payload.styleTags?.length) {
    parts.push(`Style: ${payload.styleTags.join(', ')}`);
  }

  const m = payload.materials ?? {};
  const mat: string[] = [];
  if (m.mainCabinet) mat.push(`cabinets ${m.mainCabinet}`);
  if (m.secondaryFinish) mat.push(`secondary ${m.secondaryFinish}`);
  if (m.benchtop) mat.push(`benchtop ${m.benchtop}`);
  if (m.splashback) mat.push(`splashback ${m.splashback}`);
  if (m.hardware) mat.push(`hardware ${m.hardware}`);
  if (mat.length) parts.push(`Client selected — ${mat.join('; ')}`);

  if (payload.notes) parts.push(`Notes: ${payload.notes}`);

  return parts.join('. ').slice(0, 500);
}

/** Room dimensions from the handoff, if the client gave them. */
export function handoffDimensions(payload: HandoffStyleInput): { widthMm?: number; depthMm?: number; heightMm?: number } {
  return {
    widthMm: payload.dimensions?.widthMm,
    depthMm: payload.dimensions?.depthMm,
    heightMm: payload.dimensions?.heightMm,
  };
}
