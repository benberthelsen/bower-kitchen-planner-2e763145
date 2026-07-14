/**
 * buildBrief — assemble a full DesignBrief from wizard state.
 * Richer than briefFromWizard (which serves the legacy bridge): includes
 * household, priorities, appliances, and island preference from the
 * "How you cook" step.
 */

import type { Opening, ServicePoint } from '@/types';
import { toRoomSpec } from '@/lib/layout';
import type { DesignBrief, KitchenSpec, Priority } from '@/lib/layout';
import type { LayoutShape } from '@/lib/layout';

export interface WizardBriefFields {
  roomShape: LayoutShape;
  roomWidth: number;
  roomDepth: number;
  layoutStyle: 'minimal' | 'standard' | 'full-storage';
  openings: Opening[];
  services: ServicePoint[];
  householdSize?: number;
  cooks?: 'rare' | 'daily' | 'entertainer';
  priorities: Priority[];
  oven?: '600' | '900';
  cooktop?: 'gas' | 'induction';
  dishwasher: boolean;
  fridgeWidthMm: number;
  microwave?: 'built-in' | 'benchtop' | 'none';
  island: 'want' | 'no' | 'if-it-fits';
  /** Inspiration + client-chosen finishes (e.g. from a website flat-lay handoff).
   *  The AI designer treats this as a strong style preference. */
  styleWords?: string;
}

/** A chosen design in wizard state: the spec is the source of truth; items,
 *  price and warnings are derived on render via the engine. */
export interface WizardDesign {
  name: string;
  spec: KitchenSpec;
  aiGenerated: boolean;
}

export function buildBrief(f: WizardBriefFields): DesignBrief {
  const depth = f.roomShape === 'single-wall'
    ? Math.max(Math.round(f.roomWidth * 0.7), 2400)
    : f.roomDepth;

  const priorities: Priority[] = f.priorities.length > 0
    ? f.priorities
    : f.layoutStyle === 'full-storage' ? ['storage']
    : f.layoutStyle === 'minimal' ? ['bench-space']
    : [];

  return {
    room: toRoomSpec({
      width: f.roomWidth,
      depth,
      height: 2700,
      shape: 'Rectangle',
      cutoutWidth: 0,
      cutoutDepth: 0,
      openings: f.openings,
      services: f.services,
    }),
    household: { size: f.householdSize, cooks: f.cooks },
    priorities,
    appliances: {
      oven: f.oven,
      cooktop: f.cooktop,
      dishwasher: f.dishwasher,
      fridgeWidthMm: f.fridgeWidthMm,
      microwave: f.microwave,
    },
    island: f.island,
    ...(f.styleWords ? { styleWords: f.styleWords } : {}),
  };
}
