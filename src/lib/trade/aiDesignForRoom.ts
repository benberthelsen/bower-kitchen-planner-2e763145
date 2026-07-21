/**
 * aiDesignForRoom — the trade-side bridge between the AI designer and an
 * existing TradeRoom (code review §2 "Trade-side AI designer — NOT built").
 *
 * The homeowner wizard builds a DesignBrief from wizard state; the trade
 * planner instead already has a configured TradeRoom (geometry, materials,
 * hardware). These helpers turn that room — plus a few quick trade inputs —
 * into the same DesignBrief the ai-designer edge function consumes, and turn a
 * chosen AiDesignOption back into a merge patch for the room.
 *
 * Pure and deterministic (inject `now` in tests). The conversion of the
 * proposal's server-compiled PlacedItems into ConfiguredCabinets is delegated
 * to proposalToTradeRoom — this module never invents geometry; it only builds
 * the brief and splices the AI's cabinets/style back onto the existing room,
 * preserving the room's id, config, shape and dimensions.
 */

import type {
  BudgetBand,
  DesignBrief,
  LayoutShape,
  Priority,
  RoomSpec,
  Wall,
} from '@/lib/layout';
import type { AiDesignOption } from '@/hooks/useAiDesigner';
import type { TradeRoom } from '@/types/trade';
import { proposalToTradeRoom, type TradeRoomDefaults } from './proposalToTradeRoom';

/** Quick brief inputs collected by the trade Design-with-AI dialog. Everything
 *  the room can't tell us (habits, appliances, priorities) lives here. */
export interface TradeAiInputs {
  /** cabinet layout strategy — defaults from the room's geometry */
  shape: LayoutShape;
  cooktop?: 'gas' | 'induction';
  oven?: '600' | '900';
  dishwasher: boolean;
  fridgeWidthMm?: number;
  microwave?: 'built-in' | 'benchtop' | 'none';
  island: 'want' | 'no' | 'if-it-fits';
  priorities: Priority[];
  budgetBand?: BudgetBand;
  /** free-text style direction → brief.styleWords */
  styleWords?: string;
  /** walls the pro wants cabinetry on; empty = engine decides */
  allowedWalls?: Wall[];
}

/** The engine wants openings/services guaranteed present; a TradeRoom's config
 *  leaves them optional. This is the one place that reconciles the two. */
export function roomSpecFromTradeRoom(room: TradeRoom): RoomSpec {
  const c = room.config;
  return {
    ...c,
    openings: c.openings ?? [],
    services: c.services ?? [],
  };
}

/** Sensible default layout for a room: an L-shaped room defaults to an L run,
 *  everything else to a U (the most common full-kitchen strategy). The pro can
 *  override in the dialog. */
export function defaultShapeForRoom(room: TradeRoom): LayoutShape {
  return room.config.shape === 'LShape' ? 'l-shape' : 'u-shape';
}

/** Reasonable starting inputs derived from the room, so the dialog opens ready
 *  to generate without forcing the pro to fill everything in. */
export function defaultTradeAiInputs(room: TradeRoom): TradeAiInputs {
  return {
    shape: defaultShapeForRoom(room),
    cooktop: 'induction',
    oven: '600',
    dishwasher: true,
    microwave: 'none',
    island: 'if-it-fits',
    priorities: ['storage', 'bench-space'],
    budgetBand: 'mid',
    styleWords: room.description?.trim() || undefined,
  };
}

/** Build the DesignBrief the ai-designer consumes from an existing trade room
 *  plus the dialog inputs. */
export function buildBriefForRoom(room: TradeRoom, inputs: TradeAiInputs): DesignBrief {
  const styleWords = inputs.styleWords?.trim() || room.description?.trim() || undefined;
  return {
    room: roomSpecFromTradeRoom(room),
    household: {},
    priorities: inputs.priorities,
    appliances: {
      oven: inputs.oven,
      cooktop: inputs.cooktop,
      dishwasher: inputs.dishwasher,
      fridgeWidthMm: inputs.fridgeWidthMm,
      microwave: inputs.microwave,
    },
    island: inputs.island,
    styleWords,
    budgetBand: inputs.budgetBand,
    allowedWalls: inputs.allowedWalls?.length ? inputs.allowedWalls : undefined,
  };
}

/**
 * Turn a chosen AI option into a merge patch for the existing room. The room's
 * identity — id, config, shape, dimensions — is preserved; only the cabinets
 * and the style-derived defaults are replaced. `roomSpec` MUST be the same one
 * used to build the brief (the option's PlacedItems were compiled against it).
 */
export function applyAiOptionToRoom(
  room: TradeRoom,
  option: AiDesignOption,
  roomSpec: RoomSpec,
  opts: { now?: Date } = {},
): Partial<TradeRoom> {
  const defaults: TradeRoomDefaults = {
    dimensions: room.dimensions,
    materialDefaults: room.materialDefaults,
    hardwareDefaults: room.hardwareDefaults,
  };
  const aiRoom = proposalToTradeRoom(
    {
      name: room.name,
      spec: option.spec,
      items: option.items,
      room: roomSpec,
      lineage: { proposalId: option.proposalId },
    },
    defaults,
    { now: opts.now, roomId: room.id },
  );
  return {
    cabinets: aiRoom.cabinets,
    materialDefaults: aiRoom.materialDefaults,
    hardwareDefaults: aiRoom.hardwareDefaults,
    updatedAt: aiRoom.updatedAt,
  };
}
