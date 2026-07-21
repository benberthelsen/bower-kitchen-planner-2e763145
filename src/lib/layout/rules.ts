/**
 * rules — the kitchen rules engine (relational tier).
 *
 * Every design check is a declarative Rule object with a TIER and a SCOPE.
 * `validate()` (validate.ts) runs this registry and maps findings back to the
 * legacy Violation contract, so the registry is now the single source of truth
 * for "is this design any good" without changing any caller.
 *
 * TIERS (the taxonomy the product roadmap asks for):
 *   - 'hard'   → the design is invalid; the candidate is rejected (→ Violation
 *                severity 'error'). These are the checks that were errors before.
 *   - 'safety' → the design works but has a real problem a person should fix or
 *                accept (→ 'warn', surfaced prominently). "Require correction."
 *   - 'soft'   → a preference/quality signal that influences ranking, never
 *                blocks (→ 'warn'). designScore.ts consumes the soft signals.
 *
 * SCOPE tags each rule 'relational' (role/topology — valid on today's model and
 * across the coming polygon-geometry change) or 'spatial' (queries coordinates;
 * to be re-implemented against the room polygon in the geometry phase). The tag
 * exists so the geometry migration knows exactly which rules to revisit.
 *
 * Each rule also carries a plain-language `why` — the intent, reused by the
 * "explain this design" feature. Add a rule here, and it is automatically
 * enforced, sweep-enumerated (RULE_INDEX) and explainable.
 */

import type { PlacedItem } from '@/types';
import { dist, itemRect, rectsOverlap, wallPointWorld, WALL_ROTATION } from './geometry';
import type { CompiledDesign } from './compileSpec';
import type { DesignBrief, RoomSpec, Wall } from './types';

export type RuleTier = 'hard' | 'safety' | 'soft';
export type RuleScope = 'relational' | 'spatial';

export interface RuleFinding {
  ruleId: string;
  tier: RuleTier;
  /** customer/staff-facing description of the specific problem instance */
  message: string;
  itemIds?: string[];
}

export interface RuleContext {
  design: CompiledDesign;
  room: RoomSpec;
  brief?: DesignBrief;
  /** y===0 items (base/tall); computed once for every rule */
  floorItems: PlacedItem[];
  /** island cabinets (free-standing rows), computed once */
  islandItems: PlacedItem[];
}

export interface Rule {
  id: string;
  tier: RuleTier;
  scope: RuleScope;
  title: string;
  /** plain-language reason this rule exists — reused by design explanations */
  why: string;
  /** empty array = pass */
  evaluate(ctx: RuleContext): RuleFinding[];
}

// thresholds (mm) — shared with the legacy checks they replace
const MIN_AISLE = 1000;
const MIN_FACING_AISLE = 1200;
const TRIANGLE_MIN = 3600;
const TRIANGLE_MAX = 8000;
const LEG_MIN = 1200;
const LEG_MAX = 2700;
const SINK_DRAIN_MAX = 1500;
const GAS_MAX = 600;

function finding(ruleId: string, tier: RuleTier, message: string, itemIds?: string[]): RuleFinding {
  return { ruleId, tier, message, ...(itemIds ? { itemIds } : {}) };
}

// ─── The registry ───────────────────────────────────────────────────────────
// Order is stable and deterministic (the sweep and de-dup rely on it).

export const RULES: Rule[] = [
  {
    id: 'out-of-room', tier: 'hard', scope: 'spatial',
    title: 'Cabinet inside the room',
    why: 'Every cabinet must physically fit within the room outline.',
    evaluate: ({ design, room }) => design.items.flatMap(item => {
      const r = itemRect(item);
      return (r.minX < -1 || r.maxX > room.width + 1 || r.minZ < -1 || r.maxZ > room.depth + 1)
        ? [finding('out-of-room', 'hard', `${item.definitionId} extends outside the room`, [item.instanceId])]
        : [];
    }),
  },
  {
    id: 'overlap', tier: 'hard', scope: 'spatial',
    title: 'No overlapping cabinets',
    why: 'Two cabinets cannot occupy the same floor space.',
    evaluate: ({ floorItems }) => {
      const out: RuleFinding[] = [];
      for (let i = 0; i < floorItems.length; i++) {
        for (let j = i + 1; j < floorItems.length; j++) {
          if (rectsOverlap(itemRect(floorItems[i]), itemRect(floorItems[j]))) {
            out.push(finding('overlap', 'hard',
              `${floorItems[i].definitionId} overlaps ${floorItems[j].definitionId}`,
              [floorItems[i].instanceId, floorItems[j].instanceId]));
          }
        }
      }
      return out;
    },
  },
  {
    id: 'allowed-wall', tier: 'hard', scope: 'relational',
    title: 'Customer-selected cabinet walls',
    why: 'A design must use only the walls the customer nominated for cabinetry.',
    evaluate: ({ design, brief }) => {
      const allowed = brief?.allowedWalls?.length ? new Set(brief.allowedWalls) : null;
      if (!allowed) return [];
      return design.runWalls
        .filter(wall => !allowed.has(wall))
        .map(wall => finding(
          'allowed-wall',
          'hard',
          `The design places cabinets on wall ${wall}, which was not selected for cabinetry`,
        ));
    },
  },
  {
    id: 'duplicate-run-wall', tier: 'hard', scope: 'relational',
    title: 'One run definition per wall',
    why: 'A wall is solved as one openings-aware run; duplicate run definitions can overlap or bypass layout-shape checks.',
    evaluate: ({ design }) => {
      const seen = new Set<Wall>();
      const duplicates = new Set<Wall>();
      for (const wall of design.runWalls) {
        if (seen.has(wall)) duplicates.add(wall);
        seen.add(wall);
      }
      return [...duplicates].map(wall => finding(
        'duplicate-run-wall',
        'hard',
        `Wall ${wall} is defined more than once`,
      ));
    },
  },
  {
    id: 'faces-wall', tier: 'hard', scope: 'relational',
    title: 'Cabinets face the room',
    why: 'A cabinet against a wall must open into the room, not into the wall — the rotation must match the wall it sits on.',
    evaluate: ({ floorItems, room }) => floorItems.flatMap(item => {
      if (item.definitionId.includes('corner')) return [];
      const r = itemRect(item);
      const touching: Wall[] = [];
      if (r.minZ <= 30) touching.push('N');
      if (r.maxX >= room.width - 30) touching.push('E');
      if (r.maxZ >= room.depth - 30) touching.push('S');
      if (r.minX <= 30) touching.push('W');
      if (touching.length === 0) return [];
      const rot = ((Math.round(item.rotation) % 360) + 360) % 360;
      return touching.some(w => rot === WALL_ROTATION[w])
        ? []
        : [finding('faces-wall', 'hard',
            `${item.definitionId} touches wall(s) ${touching.join('/')} with rotation ${rot} — it faces a wall, not the room`,
            [item.instanceId])];
    }),
  },
  {
    id: 'doorway-tight', tier: 'safety', scope: 'spatial',
    title: 'Scribe gap at doorways',
    why: 'A cabinet built hard against a door or walkway architrave has no scribe/clearance — leave a filler.',
    evaluate: ({ floorItems, room }) => {
      const out: RuleFinding[] = [];
      for (const o of room.openings) {
        if (o.type !== 'door' && o.type !== 'walkway') continue;
        const span = { start: o.offsetMm, end: o.offsetMm + o.widthMm };
        for (const item of floorItems) {
          const r = itemRect(item);
          let t: { start: number; end: number } | null = null;
          let againstWall = false;
          if (o.wall === 'N') { againstWall = r.minZ <= 30; t = { start: r.minX, end: r.maxX }; }
          if (o.wall === 'S') { againstWall = r.maxZ >= room.depth - 30; t = { start: room.width - r.maxX, end: room.width - r.minX }; }
          if (o.wall === 'E') { againstWall = r.maxX >= room.width - 30; t = { start: r.minZ, end: r.maxZ }; }
          if (o.wall === 'W') { againstWall = r.minX <= 30; t = { start: room.depth - r.maxZ, end: room.depth - r.minZ }; }
          if (!againstWall || !t) continue;
          const gap = Math.max(span.start - t.end, t.start - span.end);
          if (gap > -1 && gap < 25 && !item.fillerLeft && !item.fillerRight) {
            out.push(finding('doorway-tight', 'safety',
              `${item.definitionId} is ${Math.max(0, Math.round(gap))}mm from the ${o.type} on wall ${o.wall} with no filler`,
              [item.instanceId]));
          }
        }
      }
      return out;
    },
  },
  {
    id: 'door-swing', tier: 'safety', scope: 'spatial',
    title: 'Door swing clearance',
    why: 'An in-swinging door needs floor space to open — a cabinet in its arc will foul it.',
    evaluate: ({ floorItems, room }) => {
      const out: RuleFinding[] = [];
      for (const o of room.openings) {
        if (o.type !== 'door' || o.swing === 'out' || o.swing === 'slider') continue;
        const c = wallPointWorld(o.wall, o.offsetMm + o.widthMm / 2, room);
        const half = o.widthMm / 2;
        const arc = { minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half };
        for (const item of floorItems) {
          if (rectsOverlap(itemRect(item), arc)) {
            out.push(finding('door-swing', 'safety', `${item.definitionId} may block the door swing on wall ${o.wall}`, [item.instanceId]));
          }
        }
      }
      return out;
    },
  },
  {
    id: 'narrow-aisle', tier: 'hard', scope: 'spatial',
    title: 'Island aisle width',
    why: `An aisle beside an island narrower than ${MIN_AISLE}mm is not usable.`,
    evaluate: ({ floorItems, islandItems }) => {
      const out: RuleFinding[] = [];
      for (const isl of islandItems) {
        for (const other of floorItems) {
          if (islandItems.includes(other)) continue;
          const a = itemRect(isl), b = itemRect(other);
          if (a.minX < b.maxX && a.maxX > b.minX) {
            const gap = Math.max(b.minZ - a.maxZ, a.minZ - b.maxZ);
            if (gap > 0 && gap < MIN_AISLE) {
              out.push(finding('narrow-aisle', 'hard',
                `Aisle ${Math.round(gap)}mm between island and run (min ${MIN_AISLE}mm)`,
                [isl.instanceId, other.instanceId]));
            }
          }
        }
      }
      return out;
    },
  },
  {
    id: 'narrow-galley', tier: 'hard', scope: 'spatial',
    title: 'Galley aisle width',
    why: `Two facing runs need at least ${MIN_FACING_AISLE}mm between them to work in.`,
    evaluate: ({ floorItems, islandItems }) => {
      const nRun = floorItems.filter(i => i.rotation === 0);
      const sRun = floorItems.filter(i => i.rotation === 180 && !islandItems.includes(i));
      if (!nRun.length || !sRun.length) return [];
      const gap = Math.min(...sRun.map(i => itemRect(i).minZ)) - Math.max(...nRun.map(i => itemRect(i).maxZ));
      return gap < MIN_FACING_AISLE
        ? [finding('narrow-galley', 'hard', `Galley aisle ${Math.round(gap)}mm (min ${MIN_FACING_AISLE}mm)`)]
        : [];
    },
  },
  {
    id: 'no-sink', tier: 'hard', scope: 'relational',
    title: 'Has a sink',
    why: 'A kitchen must have a sink.',
    evaluate: ({ design }) => design.rolePositions.sink ? [] : [finding('no-sink', 'hard', 'Design has no sink cabinet')],
  },
  {
    id: 'no-cooktop', tier: 'hard', scope: 'relational',
    title: 'Has a cooktop',
    why: 'A kitchen must have a cooktop.',
    evaluate: ({ design }) => design.rolePositions.cooktop ? [] : [finding('no-cooktop', 'hard', 'Design has no cooktop cabinet')],
  },
  {
    id: 'no-fridge', tier: 'hard', scope: 'relational',
    title: 'Has a fridge space',
    why: 'A kitchen must have somewhere for the fridge.',
    evaluate: ({ design }) => design.rolePositions['fridge-gap'] ? [] : [finding('no-fridge', 'hard', 'Design has no fridge space')],
  },
  {
    id: 'no-dishwasher', tier: 'hard', scope: 'relational',
    title: 'Dishwasher placed when requested',
    why: 'If the customer asked for a dishwasher, the design must include its opening.',
    evaluate: ({ design, brief }) =>
      brief?.appliances.dishwasher && !design.rolePositions.dishwasher
        ? [finding('no-dishwasher', 'hard', 'Dishwasher requested but not placed')]
        : [],
  },
  {
    id: 'dishwasher-not-adjacent', tier: 'hard', scope: 'relational',
    title: 'Dishwasher beside the sink',
    why: 'The dishwasher shares the sink’s plumbing, so it must sit immediately next to the sink cabinet.',
    evaluate: ({ design, brief }) => {
      const sink = design.rolePositions.sink;
      const dishwasher = design.rolePositions.dishwasher;
      if (!brief?.appliances.dishwasher || !sink || !dishwasher) return [];
      const adjacent = sink.wall === dishwasher.wall && (
        Math.abs((sink.startMm + sink.widthMm) - dishwasher.startMm) <= 1
        || Math.abs((dishwasher.startMm + dishwasher.widthMm) - sink.startMm) <= 1
      );
      return adjacent ? [] : [finding('dishwasher-not-adjacent', 'hard',
        'Dishwasher must be immediately beside the sink cabinet',
        [sink.item.instanceId, dishwasher.item.instanceId])];
    },
  },
  {
    id: 'corner-integrity', tier: 'safety', scope: 'relational',
    title: 'Corner cabinets resolve correctly',
    why: 'A corner position must use a real blind/pie-cut corner cabinet with its blind side facing the corner, or its doors jam against the adjoining run.',
    evaluate: ({ floorItems }) => floorItems.flatMap(item =>
      item.definitionId.includes('corner') && !item.blindSide
        ? [finding('corner-integrity', 'safety', `${item.definitionId} is a corner cabinet with no blind side set`, [item.instanceId])]
        : []),
  },
  {
    id: 'appliance-gap-fit', tier: 'safety', scope: 'relational',
    title: 'Appliance openings fit the appliance',
    why: 'The fridge space and dishwasher opening must be wide enough for the actual appliance.',
    evaluate: ({ design, brief }) => {
      const out: RuleFinding[] = [];
      const fridge = design.rolePositions['fridge-gap'];
      const nominated = brief?.appliances.fridgeWidthMm ?? 940;
      if (fridge && fridge.widthMm + 20 < nominated) {
        out.push(finding('appliance-gap-fit', 'safety',
          `Fridge space is ${fridge.widthMm}mm but the nominated fridge needs ${nominated}mm`,
          [fridge.item.instanceId]));
      }
      const dw = design.rolePositions.dishwasher;
      if (dw && dw.widthMm < 600) {
        out.push(finding('appliance-gap-fit', 'safety',
          `Dishwasher opening is ${dw.widthMm}mm (a standard dishwasher needs 600mm)`,
          [dw.item.instanceId]));
      }
      return out;
    },
  },
  {
    id: 'replumb', tier: 'safety', scope: 'spatial',
    title: 'Sink near existing plumbing',
    why: 'A sink far from the existing drain means re-plumbing — extra cost the customer should know about.',
    evaluate: ({ design, room }) => {
      const sink = design.rolePositions.sink;
      const drain = room.services.find(s => s.type === 'drain') ?? room.services.find(s => s.type === 'water-supply');
      if (!sink || !drain) return [];
      const d = dist({ x: sink.item.x, z: sink.item.z }, wallPointWorld(drain.wall, drain.offsetMm, room));
      return d > SINK_DRAIN_MAX
        ? [finding('replumb', 'safety', `Sink is ${(d / 1000).toFixed(1)}m from existing plumbing — re-plumbing will be required`)]
        : [];
    },
  },
  {
    id: 'gas-move', tier: 'safety', scope: 'spatial',
    title: 'Gas cooktop near the gas point',
    why: 'A gas cooktop far from the gas point means gas work — extra cost to flag.',
    evaluate: ({ design, room, brief }) => {
      const cooktop = design.rolePositions.cooktop;
      const gas = room.services.find(s => s.type === 'gas');
      if (!cooktop || brief?.appliances.cooktop !== 'gas' || !gas) return [];
      const d = dist({ x: cooktop.item.x, z: cooktop.item.z }, wallPointWorld(gas.wall, gas.offsetMm, room));
      return d > GAS_MAX
        ? [finding('gas-move', 'safety', `Gas cooktop is ${(d / 1000).toFixed(1)}m from the gas point — gas work required`)]
        : [];
    },
  },
  {
    id: 'cooktop-landing', tier: 'safety', scope: 'relational',
    title: 'Cooktop landing zones',
    why: 'A cooktop needs bench space either side to safely set down hot pans.',
    evaluate: ({ design, floorItems }) => {
      const cooktop = design.rolePositions.cooktop;
      if (!cooktop || cooktop.wall === 'island') return [];
      const sameWall = floorItems.filter(i => i !== cooktop.item && i.itemType === 'Cabinet' && i.rotation === cooktop.item.rotation);
      const cr = itemRect(cooktop.item);
      const hasSide = (side: 'left' | 'right') => sameWall.some(i => {
        const r = itemRect(i);
        const horizontal = cooktop.item.rotation === 0 || cooktop.item.rotation === 180;
        if (horizontal) {
          return side === 'left' ? Math.abs(r.maxX - cr.minX) < 50 : Math.abs(r.minX - cr.maxX) < 50;
        }
        return side === 'left' ? Math.abs(r.maxZ - cr.minZ) < 50 : Math.abs(r.minZ - cr.maxZ) < 50;
      });
      return (!hasSide('left') || !hasSide('right'))
        ? [finding('cooktop-landing', 'safety', 'Cooktop should have bench space on both sides', [cooktop.item.instanceId])]
        : [];
    },
  },
  {
    id: 'island-exposed', tier: 'safety', scope: 'relational',
    title: 'Island ends finished',
    why: 'An island is seen from all sides, so its exposed ends need finished panels, not bare carcase.',
    evaluate: ({ islandItems }) => {
      if (islandItems.length === 0) return [];
      const hasLeft = islandItems.some(i => i.endPanelLeft);
      const hasRight = islandItems.some(i => i.endPanelRight);
      return (!hasLeft || !hasRight)
        ? [finding('island-exposed', 'safety', 'Island has an exposed carcase end with no finished panel')]
        : [];
    },
  },
  {
    id: 'triangle-size', tier: 'soft', scope: 'spatial',
    title: 'Work-triangle perimeter',
    why: 'The sink–cooktop–fridge triangle works best between 3.6m and 8m total.',
    evaluate: ({ design }) => {
      const { sink, cooktop } = design.rolePositions;
      const fridge = design.rolePositions['fridge-gap'];
      if (!sink || !cooktop || !fridge) return [];
      const pts = [sink.item, cooktop.item, fridge.item].map(i => ({ x: i.x, z: i.z }));
      const perimeter = dist(pts[0], pts[1]) + dist(pts[1], pts[2]) + dist(pts[2], pts[0]);
      return (perimeter < TRIANGLE_MIN || perimeter > TRIANGLE_MAX)
        ? [finding('triangle-size', 'soft', `Work triangle ${(perimeter / 1000).toFixed(1)}m (ideal 3.6–8m)`)]
        : [];
    },
  },
  {
    id: 'triangle-leg', tier: 'soft', scope: 'spatial',
    title: 'Work-triangle legs',
    why: 'Each leg of the work triangle should be neither cramped nor a long walk.',
    evaluate: ({ design }) => {
      const { sink, cooktop } = design.rolePositions;
      const fridge = design.rolePositions['fridge-gap'];
      if (!sink || !cooktop || !fridge) return [];
      const pts = [sink.item, cooktop.item, fridge.item].map(i => ({ x: i.x, z: i.z }));
      const legs = [dist(pts[0], pts[1]), dist(pts[1], pts[2]), dist(pts[2], pts[0])];
      for (const leg of legs) {
        if (leg < LEG_MIN) return [finding('triangle-leg', 'soft', 'Two work zones are very close together')];
        if (leg > LEG_MAX) return [finding('triangle-leg', 'soft', 'Two work zones are far apart — expect extra walking')];
      }
      return [];
    },
  },
  {
    id: 'prep-space', tier: 'soft', scope: 'relational',
    title: 'Continuous prep bench',
    why: 'A usable kitchen wants at least 900mm of uninterrupted bench to prepare food.',
    evaluate: ({ design, floorItems }) => {
      const { sink, cooktop } = design.rolePositions;
      const prepRun = floorItems.filter(i => i.height <= 800 && i.itemType === 'Cabinet'
        && !(sink && i === sink.item) && !(cooktop && i === cooktop.item));
      const hasPrep = prepRun.some(i => i.width >= 900)
        || prepRun.some(a => prepRun.some(b => a !== b && a.rotation === b.rotation
          && Math.abs(a.z - b.z) < 10 && Math.abs(Math.abs(a.x - b.x) - (a.width + b.width) / 2) < 20
          && a.width + b.width >= 900));
      return (prepRun.length > 0 && !hasPrep)
        ? [finding('prep-space', 'soft', 'Less than 900mm of continuous prep bench')]
        : [];
    },
  },
];

/** Reserved rule ids that need catalogue data (SKU/sink-bowl/appliance dims) or
 *  the resolved-segment stream, to be implemented in later phases. Documented
 *  here so the gap is visible rather than silent. */
export const RESERVED_RULE_IDS = ['sink-bowl-fit', 'run-end-panel', 'filler-complete', 'cutout-intersection'] as const;

/** Build the shared context once, then run every rule. Deterministic order. */
export function evaluateRules(design: CompiledDesign, room: RoomSpec, brief?: DesignBrief): RuleFinding[] {
  const floorItems = design.items.filter(i => i.y === 0);
  const islandItems = floorItems.filter(i => i.instanceId.startsWith('ai-') && i.rotation === 180 && i.z > 700 && i.z < room.depth - 700);
  const ctx: RuleContext = { design, room, brief, floorItems, islandItems };
  return RULES.flatMap(rule => rule.evaluate(ctx));
}

/** Sweep/coverage view — every rule's id, tier and scope. The placement sweep
 *  can print this so rule coverage is visible (the 20-July defects hid because
 *  no rule existed for them; silent gaps must be countable). */
export const RULE_INDEX: { id: string; tier: RuleTier; scope: RuleScope; title: string }[] =
  RULES.map(({ id, tier, scope, title }) => ({ id, tier, scope, title }));

/** Plain-language "why" for a rule id — used by the design-explanation feature. */
export function ruleWhy(ruleId: string): string | undefined {
  return RULES.find(r => r.id === ruleId)?.why;
}
