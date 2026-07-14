/**
 * Shared select/move gesture for scene items (refine: selection frustration).
 *
 * Rule: a press on an UNSELECTED item only selects it — it can never start a
 * move. Only a press on the already-selected item arms dragging (the 5px
 * DragManager threshold still applies, so a plain click never nudges it).
 * You cannot move something you haven't first seen highlighted.
 *
 * Alt+press dives through overlapping items (e.g. a wall cabinet drawn over
 * the base run in plan view) and selects the item beneath the top hit.
 */

interface PointerDownArgs {
  e: {
    stopPropagation: () => void;
    altKey?: boolean;
    nativeEvent?: { altKey?: boolean };
    intersections?: Array<{ object: { userData?: Record<string, unknown>; parent: unknown } }>;
  };
  itemId: string;
  isSelected: boolean;
  x: number;
  z: number;
  onSelect?: (id: string) => void;
  onDragStart?: (id: string, x: number, z: number) => void;
}

/** Distinct item ids under the pointer, nearest first. Groups must carry
 *  `userData.itemId` (CabinetMesh / ApplianceMesh / StructureMesh do). */
export function itemStackFromEvent(e: PointerDownArgs['e']): string[] {
  const ids: string[] = [];
  for (const hit of e.intersections ?? []) {
    let obj: { userData?: Record<string, unknown>; parent: unknown } | null = hit.object;
    while (obj && !obj.userData?.itemId) {
      obj = obj.parent as typeof obj | null;
    }
    const id = obj?.userData?.itemId as string | undefined;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function handleItemPointerDown({ e, itemId, isSelected, x, z, onSelect, onDragStart }: PointerDownArgs): void {
  e.stopPropagation();

  const alt = e.altKey ?? e.nativeEvent?.altKey ?? false;
  if (alt) {
    const stack = itemStackFromEvent(e);
    const beneath = stack.length > 1 ? stack[1] : stack[0] ?? itemId;
    onSelect?.(beneath);
    return; // never arm a drag from an alt-dive
  }

  if (!isSelected) {
    onSelect?.(itemId); // select-then-move: first press selects only
    return;
  }

  onSelect?.(itemId);
  onDragStart?.(itemId, x, z);
}
