import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from 'react';
import { RoomConfig, GlobalDimensions, HardwareOptions } from '@/types';
import { DEFAULT_GLOBAL_DIMENSIONS, FINISH_OPTIONS, HANDLE_OPTIONS } from '@/constants';

const STORAGE_KEY = 'trade-room-data';

export interface CabinetMaterials {
  exteriorFinish: string;
  carcaseFinish: string;
  doorStyle: string;
  edgeBanding: string;
}

export interface CabinetHardware {
  handleType: string;
  handleColor: string;
  hingeType: string;
  drawerType: string;
  softClose: boolean;
}

export interface CabinetAccessories {
  shelfCount: number;
  adjustableShelves: boolean;
  dividers: boolean;
  softCloseUpgrade: boolean;
  specialFittings: string[];
}

export interface CabinetDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface ConfiguredCabinet {
  instanceId: string;
  definitionId: string;
  cabinetNumber: string;
  productName: string;
  category: 'Base' | 'Wall' | 'Tall' | 'Appliance';
  dimensions: CabinetDimensions;
  materials: CabinetMaterials;
  hardware: CabinetHardware;
  accessories: CabinetAccessories;
  position?: {
    x: number;
    y: number;
    z: number;
    rotation: number;
  };
  isPlaced: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoomMaterialDefaults {
  exteriorFinish: string;
  carcaseFinish: string;
  doorStyle: string;
  edgeBanding: string;
}

export interface RoomHardwareDefaults {
  handleType: string;
  handleColor: string;
  hingeType: string;
  drawerType: string;
  softClose: boolean;
  supplyHardware: boolean;
  adjustableLegs: boolean;
}

export interface TradeRoom {
  id: string;
  name: string;
  description: string;
  shape: 'rectangular' | 'l-shaped';
  config: RoomConfig;
  dimensions: GlobalDimensions;
  materialDefaults: RoomMaterialDefaults;
  hardwareDefaults: RoomHardwareDefaults;
  cabinets: ConfiguredCabinet[];
  createdAt: Date;
  updatedAt: Date;
}

interface TradeRoomContextType {
  // Current room
  currentRoom: TradeRoom | null;
  setCurrentRoom: (room: TradeRoom | null) => void;
  
  // Room management
  rooms: TradeRoom[];
  addRoom: (room: Omit<TradeRoom, 'id' | 'cabinets' | 'createdAt' | 'updatedAt'>) => TradeRoom;
  updateRoom: (roomId: string, updates: Partial<TradeRoom>) => void;
  deleteRoom: (roomId: string) => void;
  
  // Cabinet management
  addCabinet: (roomId: string, cabinet: Omit<ConfiguredCabinet, 'instanceId' | 'cabinetNumber' | 'createdAt' | 'updatedAt'>) => ConfiguredCabinet;
  updateCabinet: (roomId: string, instanceId: string, updates: Partial<ConfiguredCabinet>) => void;
  removeCabinet: (roomId: string, instanceId: string) => void;
  duplicateCabinet: (roomId: string, instanceId: string) => ConfiguredCabinet | null;
  
  // Cabinet positioning
  placeCabinet: (roomId: string, instanceId: string, position: ConfiguredCabinet['position']) => void;
  unplaceCabinet: (roomId: string, instanceId: string) => void;
  
  // Selection
  selectedCabinetId: string | null;
  selectCabinet: (instanceId: string | null) => void;
  getSelectedCabinet: () => ConfiguredCabinet | null;
  
  // Utilities
  getCabinetsByRoom: (roomId: string) => ConfiguredCabinet[];
  getPlacedCabinets: (roomId: string) => ConfiguredCabinet[];
  getUnplacedCabinets: (roomId: string) => ConfiguredCabinet[];
  getRoomTotals: (roomId: string) => { count: number; placed: number; unplaced: number };
}

const TradeRoomContext = createContext<TradeRoomContextType | null>(null);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateCabinetNumber(existingCabinets: ConfiguredCabinet[]): string {
  const numbers = existingCabinets
    .map(c => parseInt(c.cabinetNumber.replace('C', ''), 10))
    .filter(n => !isNaN(n));
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `C${String(maxNumber + 1).padStart(2, '0')}`;
}

const defaultMaterialDefaults: RoomMaterialDefaults = {
  exteriorFinish: FINISH_OPTIONS[0]?.id || 'white-matt',
  carcaseFinish: 'white-melamine',
  doorStyle: 'slab',
  edgeBanding: 'matching',
};

const defaultHardwareDefaults: RoomHardwareDefaults = {
  handleType: HANDLE_OPTIONS[0]?.id || 'bar-handle',
  handleColor: '#1a1a1a',
  hingeType: 'soft-close',
  drawerType: 'standard',
  softClose: true,
  supplyHardware: true,
  adjustableLegs: true,
};

export function TradeRoomProvider({ children }: { children: ReactNode }) {
  // Load initial state from localStorage
  const [rooms, setRooms] = useState<TradeRoom[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Convert date strings back to Date objects
        return parsed.map((room: any) => ({
          ...room,
          createdAt: new Date(room.createdAt),
          updatedAt: new Date(room.updatedAt),
          cabinets: room.cabinets.map((cab: any) => ({
            ...cab,
            createdAt: new Date(cab.createdAt),
            updatedAt: new Date(cab.updatedAt),
          })),
        }));
      }
    } catch (e) {
      console.warn('Failed to load rooms from localStorage:', e);
    }
    return [];
  });
  const [currentRoom, setCurrentRoom] = useState<TradeRoom | null>(null);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);

  // Persist rooms to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    } catch (e) {
      console.warn('Failed to save rooms to localStorage:', e);
    }
  }, [rooms]);

  const addRoom = useCallback((roomData: Omit<TradeRoom, 'id' | 'cabinets' | 'createdAt' | 'updatedAt'>): TradeRoom => {
    const newRoom: TradeRoom = {
      ...roomData,
      id: generateId(),
      cabinets: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setRooms(prev => [...prev, newRoom]);
    return newRoom;
  }, []);

  const updateRoom = useCallback((roomId: string, updates: Partial<TradeRoom>) => {
    setRooms(prev => prev.map(room => 
      room.id === roomId 
        ? { ...room, ...updates, updatedAt: new Date() }
        : room
    ));
    if (currentRoom?.id === roomId) {
      setCurrentRoom(prev => prev ? { ...prev, ...updates, updatedAt: new Date() } : null);
    }
  }, [currentRoom?.id]);

  const deleteRoom = useCallback((roomId: string) => {
    setRooms(prev => prev.filter(room => room.id !== roomId));
    if (currentRoom?.id === roomId) {
      setCurrentRoom(null);
    }
  }, [currentRoom?.id]);

  const addCabinet = useCallback((
    roomId: string, 
    cabinetData: Omit<ConfiguredCabinet, 'instanceId' | 'cabinetNumber' | 'createdAt' | 'updatedAt'>
  ): ConfiguredCabinet => {
    const room = rooms.find(r => r.id === roomId);
    const existingCabinets = room?.cabinets || [];
    
    const newCabinet: ConfiguredCabinet = {
      ...cabinetData,
      instanceId: generateId(),
      cabinetNumber: generateCabinetNumber(existingCabinets),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    setRooms(prev => prev.map(room => 
      room.id === roomId 
        ? { ...room, cabinets: [...room.cabinets, newCabinet], updatedAt: new Date() }
        : room
    ));

    if (currentRoom?.id === roomId) {
      setCurrentRoom(prev => prev 
        ? { ...prev, cabinets: [...prev.cabinets, newCabinet], updatedAt: new Date() }
        : null
      );
    }

    return newCabinet;
  }, [rooms, currentRoom?.id]);

  const updateCabinet = useCallback((roomId: string, instanceId: string, updates: Partial<ConfiguredCabinet>) => {
    const updateCabinets = (cabinets: ConfiguredCabinet[]) => 
      cabinets.map(cab => 
        cab.instanceId === instanceId 
          ? { ...cab, ...updates, updatedAt: new Date() }
          : cab
      );

    setRooms(prev => prev.map(room => 
      room.id === roomId 
        ? { ...room, cabinets: updateCabinets(room.cabinets), updatedAt: new Date() }
        : room
    ));

    if (currentRoom?.id === roomId) {
      setCurrentRoom(prev => prev 
        ? { ...prev, cabinets: updateCabinets(prev.cabinets), updatedAt: new Date() }
        : null
      );
    }
  }, [currentRoom?.id]);

  const removeCabinet = useCallback((roomId: string, instanceId: string) => {
    const filterCabinets = (cabinets: ConfiguredCabinet[]) => 
      cabinets.filter(cab => cab.instanceId !== instanceId);

    setRooms(prev => prev.map(room => 
      room.id === roomId 
        ? { ...room, cabinets: filterCabinets(room.cabinets), updatedAt: new Date() }
        : room
    ));

    if (currentRoom?.id === roomId) {
      setCurrentRoom(prev => prev 
        ? { ...prev, cabinets: filterCabinets(prev.cabinets), updatedAt: new Date() }
        : null
      );
    }

    if (selectedCabinetId === instanceId) {
      setSelectedCabinetId(null);
    }
  }, [currentRoom?.id, selectedCabinetId]);

  const duplicateCabinet = useCallback((roomId: string, instanceId: string): ConfiguredCabinet | null => {
    const room = rooms.find(r => r.id === roomId);
    const originalCabinet = room?.cabinets.find(c => c.instanceId === instanceId);
    
    if (!originalCabinet) return null;

    const { instanceId: _, cabinetNumber: __, createdAt: ___, updatedAt: ____, position: _____, ...cabinetData } = originalCabinet;
    
    return addCabinet(roomId, { ...cabinetData, isPlaced: false });
  }, [rooms, addCabinet]);

  const placeCabinet = useCallback((roomId: string, instanceId: string, position: ConfiguredCabinet['position']) => {
    updateCabinet(roomId, instanceId, { position, isPlaced: true });
  }, [updateCabinet]);

  const unplaceCabinet = useCallback((roomId: string, instanceId: string) => {
    updateCabinet(roomId, instanceId, { position: undefined, isPlaced: false });
  }, [updateCabinet]);

  const selectCabinet = useCallback((instanceId: string | null) => {
    setSelectedCabinetId(instanceId);
  }, []);

  const getSelectedCabinet = useCallback((): ConfiguredCabinet | null => {
    if (!selectedCabinetId || !currentRoom) return null;
    return currentRoom.cabinets.find(c => c.instanceId === selectedCabinetId) || null;
  }, [selectedCabinetId, currentRoom]);

  const getCabinetsByRoom = useCallback((roomId: string): ConfiguredCabinet[] => {
    const room = rooms.find(r => r.id === roomId);
    return room?.cabinets || [];
  }, [rooms]);

  const getPlacedCabinets = useCallback((roomId: string): ConfiguredCabinet[] => {
    return getCabinetsByRoom(roomId).filter(c => c.isPlaced);
  }, [getCabinetsByRoom]);

  const getUnplacedCabinets = useCallback((roomId: string): ConfiguredCabinet[] => {
    return getCabinetsByRoom(roomId).filter(c => !c.isPlaced);
  }, [getCabinetsByRoom]);

  const getRoomTotals = useCallback((roomId: string) => {
    const cabinets = getCabinetsByRoom(roomId);
    return {
      count: cabinets.length,
      placed: cabinets.filter(c => c.isPlaced).length,
      unplaced: cabinets.filter(c => !c.isPlaced).length,
    };
  }, [getCabinetsByRoom]);

  const value = useMemo(() => ({
    currentRoom,
    setCurrentRoom,
    rooms,
    addRoom,
    updateRoom,
    deleteRoom,
    addCabinet,
    updateCabinet,
    removeCabinet,
    duplicateCabinet,
    placeCabinet,
    unplaceCabinet,
    selectedCabinetId,
    selectCabinet,
    getSelectedCabinet,
    getCabinetsByRoom,
    getPlacedCabinets,
    getUnplacedCabinets,
    getRoomTotals,
  }), [
    currentRoom,
    rooms,
    addRoom,
    updateRoom,
    deleteRoom,
    addCabinet,
    updateCabinet,
    removeCabinet,
    duplicateCabinet,
    placeCabinet,
    unplaceCabinet,
    selectedCabinetId,
    selectCabinet,
    getSelectedCabinet,
    getCabinetsByRoom,
    getPlacedCabinets,
    getUnplacedCabinets,
    getRoomTotals,
  ]);

  return (
    <TradeRoomContext.Provider value={value}>
      {children}
    </TradeRoomContext.Provider>
  );
}

export function useTradeRoom() {
  const context = useContext(TradeRoomContext);
  if (!context) {
    throw new Error('useTradeRoom must be used within a TradeRoomProvider');
  }
  return context;
}

export { defaultMaterialDefaults, defaultHardwareDefaults };
