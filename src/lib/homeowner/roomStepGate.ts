/** Whether the wizard's Room step can continue. Captured walls continue on
 * their own (they are designed, not quoted, here). Typed sizes need a sensible
 * room, and a capture draft must have been set aside for the typed sizes so
 * the quote is priced from them: the person chooses that for a scanner draft,
 * and a customer's photo walk that could not size the room starts that way. */
export function roomStepReady(state: {
  roomDocument?: unknown;
  useManualRoomInstead?: boolean;
  incomingCaptureDraft?: unknown;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
}, sizesInvalid: boolean): boolean {
  if (state.roomDocument && !state.useManualRoomInstead) return true;
  return state.roomWidth >= 1200 && state.roomDepth >= 1200 && state.roomHeight >= 2100 && !sizesInvalid
    && (!state.incomingCaptureDraft || state.useManualRoomInstead === true);
}
