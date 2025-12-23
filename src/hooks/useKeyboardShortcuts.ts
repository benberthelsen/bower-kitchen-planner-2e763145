import { useEffect, useCallback } from 'react';
import { usePlanner } from '../store/PlannerContext';
import { CATALOG } from '../constants';

const MOVE_STEP = 10; // mm
const MOVE_STEP_SHIFT = 100; // mm with shift

export function useKeyboardShortcuts() {
  const {
    selectedItemId,
    items,
    updateItem,
    removeItem,
    addItem,
    selectItem,
    undo,
    redo,
    recordHistory,
    placementItemId,
    setPlacementItem,
  } = usePlanner();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if typing in an input
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    // Escape - cancel placement mode or deselect
    if (key === 'escape') {
      e.preventDefault();
      if (placementItemId) {
        setPlacementItem(null);
      } else if (selectedItemId) {
        selectItem(null);
      }
      return;
    }

    // Undo: Ctrl+Z
    if (ctrl && key === 'z' && !shift) {
      e.preventDefault();
      undo();
      return;
    }

    // Redo: Ctrl+Shift+Z or Ctrl+Y
    if ((ctrl && shift && key === 'z') || (ctrl && key === 'y')) {
      e.preventDefault();
      redo();
      return;
    }

    // Below shortcuts require a selected item
    if (!selectedItemId) return;

    const selectedItem = items.find(i => i.instanceId === selectedItemId);
    if (!selectedItem) return;

    // Delete: Delete or Backspace
    if (key === 'delete' || key === 'backspace') {
      e.preventDefault();
      removeItem(selectedItemId);
      return;
    }

    // Rotate: R
    if (key === 'r' && !ctrl) {
      e.preventDefault();
      recordHistory();
      const newRotation = (selectedItem.rotation + 90) % 360;
      updateItem(selectedItemId, { rotation: newRotation });
      return;
    }

    // Duplicate: Ctrl+D
    if (ctrl && key === 'd') {
      e.preventDefault();
      // Add the same item offset by a bit
      addItem(selectedItem.definitionId, selectedItem.x + 100, selectedItem.z + 100);
      return;
    }

    // Arrow key movement
    const moveStep = shift ? MOVE_STEP_SHIFT : MOVE_STEP;
    let dx = 0;
    let dz = 0;

    if (key === 'arrowleft') {
      dx = -moveStep;
    } else if (key === 'arrowright') {
      dx = moveStep;
    } else if (key === 'arrowup') {
      dz = -moveStep;
    } else if (key === 'arrowdown') {
      dz = moveStep;
    }

    if (dx !== 0 || dz !== 0) {
      e.preventDefault();
      recordHistory();
      updateItem(selectedItemId, {
        x: selectedItem.x + dx,
        z: selectedItem.z + dz,
      });
    }
  }, [
    selectedItemId,
    items,
    updateItem,
    removeItem,
    addItem,
    selectItem,
    undo,
    redo,
    recordHistory,
    placementItemId,
    setPlacementItem,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
