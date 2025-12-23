import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback } from 'react';
import { PlacedItem, RoomConfig, MaterialOption, ProjectSettings, GlobalDimensions, HardwareOptions } from '../types';
import { FINISH_OPTIONS, BENCHTOP_OPTIONS, KICK_OPTIONS, CATALOG, HINGE_OPTIONS, DRAWER_OPTIONS, HANDLE_OPTIONS, DEFAULT_GLOBAL_DIMENSIONS } from '../constants';

interface DragState {
  itemId: string | null;
  startPosition: { x: number; z: number } | null;
  isDragging: boolean; // true once threshold exceeded
}

interface PlannerContextType {
  room: RoomConfig;
  items: PlacedItem[];
  selectedItemId: string | null;
  draggedItemId: string | null;
  placementItemId: string | null;
  dragState: DragState;
  selectedFinish: MaterialOption;
  selectedBenchtop: MaterialOption;
  selectedKick: MaterialOption;
  projectSettings: ProjectSettings;
  globalDimensions: GlobalDimensions;
  hardwareOptions: HardwareOptions;
  viewMode: '2d' | '3d';
  setViewMode: (mode: '2d' | '3d') => void;
  setRoom: (room: RoomConfig) => void;
  addItem: (definitionId: string, x?: number, z?: number) => void;
  updateItem: (id: string, updates: Partial<PlacedItem>, recordHistory?: boolean) => void;
  removeItem: (id: string) => void;
  selectItem: (id: string | null) => void;
  setDraggedItem: (id: string | null) => void;
  setPlacementItem: (id: string | null) => void;
  startDrag: (itemId: string, x: number, z: number) => void;
  confirmDrag: () => void;
  cancelDrag: () => void;
  endDrag: () => void;
  setFinish: (m: MaterialOption) => void;
  setBenchtop: (m: MaterialOption) => void;
  setKick: (m: MaterialOption) => void;
  setProjectSettings: (s: ProjectSettings) => void;
  setGlobalDimensions: (d: GlobalDimensions) => void;
  setHardwareOptions: (h: HardwareOptions) => void;
  totalPrice: number;
  placeOrder: () => any;
  undo: () => void;
  redo: () => void;
  recordHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  duplicateItem: (id: string) => void;
}

const PlannerContext = createContext<PlannerContextType | undefined>(undefined);

function nextCabinetNumber(items: PlacedItem[]) {
  let max = 0;
  for (const it of items) {
    const v = it.cabinetNumber;
    if (!v) continue;
    const m = /^C(\d+)$/.exec(v);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) max = Math.max(max, n);
  }
  return `C${String(max + 1).padStart(2, '0')}`;
}

export const PlannerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [room, _setRoom] = useState<RoomConfig>({ width: 4000, depth: 3000, height: 2400, shape: 'Rectangle', cutoutWidth: 1500, cutoutDepth: 1500 });
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({ userRole: 'standard', jobName: 'New Kitchen Job', jobReference: '', contactNumber: '', description: '', deliveryMethod: 'pickup' });
  const [globalDimensions, _setGlobalDimensions] = useState<GlobalDimensions>(DEFAULT_GLOBAL_DIMENSIONS);
  const [hardwareOptions, setHardwareOptions] = useState<HardwareOptions>({ hingeType: HINGE_OPTIONS[0], drawerType: DRAWER_OPTIONS[0], cabinetTop: 'Rail On Flat', supplyHardware: true, adjustableLegs: true, handleId: HANDLE_OPTIONS[0].id });
  const [items, setItems] = useState<PlacedItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [placementItemId, setPlacementItemId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>({ itemId: null, startPosition: null, isDragging: false });
  const [selectedFinish, setFinish] = useState<MaterialOption>(FINISH_OPTIONS[0]);
  const [selectedBenchtop, setBenchtop] = useState<MaterialOption>(BENCHTOP_OPTIONS[0]);
  const [selectedKick, setKick] = useState<MaterialOption>(KICK_OPTIONS[0]);
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('3d');
  const [past, setPast] = useState<{ items: PlacedItem[]; room: RoomConfig }[]>([]);
  const [future, setFuture] = useState<{ items: PlacedItem[]; room: RoomConfig }[]>([]);

  const recordHistory = useCallback(() => {
    setPast(prev => [...prev, { items, room }]);
    setFuture([]);
  }, [items, room]);

  const undo = useCallback(() => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setFuture(prev => [{ items, room }, ...prev]);
    setItems(previous.items);
    _setRoom(previous.room);
    setPast(past.slice(0, -1));
  }, [past, items, room]);

  const redo = useCallback(() => {
    if (future.length === 0) return;
    const next = future[0];
    setPast(prev => [...prev, { items, room }]);
    setItems(next.items);
    _setRoom(next.room);
    setFuture(future.slice(1));
  }, [future, items, room]);

  const setRoom = (newRoom: RoomConfig) => { recordHistory(); _setRoom(newRoom); };
  const setGlobalDimensions = (d: GlobalDimensions) => { recordHistory(); _setGlobalDimensions(d); };

  const addItem = (definitionId: string, x?: number, z?: number) => {
    const def = CATALOG.find(c => c.id === definitionId);
    if (!def) return;
    recordHistory();
    let width = def.defaultWidth, depth = def.defaultDepth, height = def.defaultHeight, posY = 0;
    if (def.itemType === 'Cabinet') {
      if (def.category === 'Base') { height = globalDimensions.baseHeight + globalDimensions.toeKickHeight; depth = globalDimensions.baseDepth; }
      else if (def.category === 'Wall') { height = globalDimensions.wallHeight; depth = globalDimensions.wallDepth; posY = globalDimensions.toeKickHeight + globalDimensions.baseHeight + globalDimensions.benchtopThickness + globalDimensions.splashbackHeight; }
      else if (def.category === 'Tall') { height = globalDimensions.tallHeight; depth = globalDimensions.tallDepth; }
    }
    const spawnX = x ?? 1000, spawnZ = z ?? 1000;
    const newItem: PlacedItem = { instanceId: Math.random().toString(36).substr(2, 9), definitionId: def.id, itemType: def.itemType, cabinetNumber: def.itemType === 'Cabinet' ? nextCabinetNumber(items) : undefined, x: spawnX, y: posY, z: spawnZ, rotation: 0, width, depth, height, hinge: 'Left' };
    setItems(prev => [...prev, newItem]);
    setSelectedItemId(newItem.instanceId);
  };

  const updateItem = (id: string, updates: Partial<PlacedItem>) => { setItems(prev => prev.map(item => (item.instanceId === id ? { ...item, ...updates } : item))); };
  const removeItem = (id: string) => { recordHistory(); setItems(prev => prev.filter(item => item.instanceId !== id)); if (selectedItemId === id) setSelectedItemId(null); };
  const selectItem = (id: string | null) => setSelectedItemId(id);
  const setDraggedItem = (id: string | null) => setDraggedItemId(id);
  const setPlacementItem = (id: string | null) => setPlacementItemId(id);

  // Drag state management with threshold
  const startDrag = useCallback((itemId: string, x: number, z: number) => {
    setDragState({ itemId, startPosition: { x, z }, isDragging: false });
    setDraggedItemId(itemId);
  }, []);

  const confirmDrag = useCallback(() => {
    if (dragState.itemId && !dragState.isDragging) {
      recordHistory();
      setDragState(prev => ({ ...prev, isDragging: true }));
    }
  }, [dragState.itemId, dragState.isDragging, recordHistory]);

  const cancelDrag = useCallback(() => {
    // Restore original position
    if (dragState.itemId && dragState.startPosition && !dragState.isDragging) {
      const item = items.find(i => i.instanceId === dragState.itemId);
      if (item) {
        setItems(prev => prev.map(i => 
          i.instanceId === dragState.itemId 
            ? { ...i, x: dragState.startPosition!.x, z: dragState.startPosition!.z }
            : i
        ));
      }
    }
    setDragState({ itemId: null, startPosition: null, isDragging: false });
    setDraggedItemId(null);
  }, [dragState, items]);

  const endDrag = useCallback(() => {
    setDragState({ itemId: null, startPosition: null, isDragging: false });
    setDraggedItemId(null);
  }, []);

  const duplicateItem = useCallback((id: string) => {
    const item = items.find(i => i.instanceId === id);
    if (!item) return;
    addItem(item.definitionId, item.x + 100, item.z + 100);
  }, [items, addItem]);

  const totalPrice = useMemo(() => items.reduce((total, item) => { const def = CATALOG.find(c => c.id === item.definitionId); if (item.itemType === 'Structure' || item.itemType === 'Wall') return total; return total + (def?.price || 0); }, 0), [items]);

  const placeOrder = useCallback(() => {
    const snapshot = { id: `ord_${Date.now()}`, createdAt: new Date().toISOString(), room, items, selectedFinish, selectedBenchtop, selectedKick, projectSettings, globalDimensions, hardwareOptions, totalPrice };
    const existing = JSON.parse(localStorage.getItem('planner_orders') || '[]');
    localStorage.setItem('planner_orders', JSON.stringify([...existing, snapshot]));
    return snapshot;
  }, [room, items, selectedFinish, selectedBenchtop, selectedKick, projectSettings, globalDimensions, hardwareOptions, totalPrice]);

  return (
    <PlannerContext.Provider value={{ room, items, selectedItemId, draggedItemId, placementItemId, dragState, selectedFinish, selectedBenchtop, selectedKick, projectSettings, globalDimensions, hardwareOptions, viewMode, setViewMode, setRoom, addItem, updateItem, removeItem, selectItem, setDraggedItem, setPlacementItem, startDrag, confirmDrag, cancelDrag, endDrag, setFinish, setBenchtop, setKick, setProjectSettings, setGlobalDimensions, setHardwareOptions, totalPrice, placeOrder, undo, redo, recordHistory, canUndo: past.length > 0, canRedo: future.length > 0, duplicateItem }}>
      {children}
    </PlannerContext.Provider>
  );
};

export const usePlanner = () => {
  const context = useContext(PlannerContext);
  if (!context) throw new Error('usePlanner must be used within a PlannerProvider');
  return context;
};
