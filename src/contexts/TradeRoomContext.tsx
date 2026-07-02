import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode, useEffect } from 'react';
import { FINISH_OPTIONS, HANDLE_OPTIONS } from '@/constants';
import {
  CabinetInstancePosition,
  ConfiguredCabinet,
  RoomHardwareDefaults,
  RoomMaterialDefaults,
  TradeRoom,
} from '@/types/trade';

const STORAGE_KEY = 'trade-room-data';

interface TradeRoomContextType {
  currentRoom: TradeRoom | null;
  setCurrentRoom: (room: TradeRoom | null) => void;

  rooms: TradeRoom[];
  hydrateRooms: (nextRooms: TradeRoom[]) => void;
  addRoom: (room: Omit<TradeRoom, 'id' | 'cabinets' | 'createdAt' | 'updatedAt'>) => TradeRoom;
  updateRoom: (roomId: string, updates: Partial<TradeRoom>) => void;
  deleteRoom: (roomId: string) => void;

  addCabinet: (roomId: string, cabinet: Omit<ConfiguredCabinet, 'instanceId' | 'cabinetNumber' | 'createdAt' | 'updatedAt'>) => ConfiguredCabinet;
  updateCabinet: (roomId: string, instanceId: string, updates: Partial<ConfiguredCabinet>) => void;
  replaceCabinet: (roomId: string, cabinet: ConfiguredCabinet) => void;
  removeCabinet: (roomId: string, instanceId: string) => void;
  duplicateCabinet: (roomId: string, instanceId: string) => ConfiguredCabinet | null;

  placeCabinet: (roomId: string, instanceId: string, position: CabinetInstancePosition) => void;
  unplaceCabinet: (roomId: string, instanceId: string) => void;

  selectedCabinetId: string | null;
  selectCabinet: (instanceId: string | null) => void;
  getSelectedCabinet: () => ConfiguredCabinet | null;

  getRoomById: (roomId: string) => TradeRoom | null;
  getCabinetById: (roomId: string, instanceId: string) => ConfiguredCabinet | null;
  getCabinetsByRoom: (roomId: string) => ConfiguredCabinet[];
  getPlacedCabinets: (roomId: string) => ConfiguredCabinet[];
  getUnplacedCabinets: (roomId: string) => ConfiguredCabinet[];
  getRoomTotals: (roomId: string) => { count: number; placed: number; unplaced: number };
}

const TradeRoomContext = createContext<TradeRoomContextType | null>(null);

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function generateCabinetNumber(existingCabinets: ConfiguredCabinet[]): string {
  const numbers = existingCabinets
    .map((c) => Number.parseInt(c.cabinetNumber.replace('C', ''), 10))
    .filter((n) => !Number.isNaN(n));
  const maxNumber = numbers.length > 0 ? Math.max(...numbers) : 0;
  return `C${String(maxNumber + 1).padStart(2, '0')}`;
}

function normalizeRoomsForHydration(rooms: TradeRoom[]): TradeRoom[] {
  return rooms.map((room) => ({
    ...room,
    createdAt: new Date(room.createdAt),
    updatedAt: new Date(room.updatedAt),
    cabinets: room.cabinets.map((cab) => ({
      ...cab,
      createdAt: new Date(cab.createdAt),
      updatedAt: new Date(cab.updatedAt),
    })),
  }));
}

function patchRoom(rooms: TradeRoom[], roomId: string, patch: (room: TradeRoom) => TradeRoom): TradeRoom[] {
  return rooms.map((room) => (room.id === roomId ? patch(room) : room));
}

export const defaultMaterialDefaults: RoomMaterialDefaults = {
  exteriorFinish: FINISH_OPTIONS[0]?.id || 'white-matt',
  carcaseFinish: 'white-melamine',
  doorStyle: 'slab',
  edgeBanding: 'matching',
};

export const defaultHardwareDefaults: RoomHardwareDefaults = {
  handleType: HANDLE_OPTIONS[0]?.id || 'bar-handle',
  handleColor: '#1a1a1a',
  hingeType: 'soft-close',
  drawerType: 'standard',
  softClose: true,
  supplyHardware: true,
  adjustableLegs: true,
};

export function TradeRoomProvider({ children }: { children: ReactNode }) {
  const [rooms, setRooms] = useState<TradeRoom[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      return normalizeRoomsForHydration(JSON.parse(saved));
    } catch (e) {
      console.warn('Failed to load rooms from localStorage:', e);
      return [];
    }
  });
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);

  const currentRoom = useMemo(
    () => (currentRoomId ? rooms.find((room) => room.id === currentRoomId) || null : null),
    [currentRoomId, rooms],
  );

  const setCurrentRoom = useCallback((room: TradeRoom | null) => {
    setCurrentRoomId(room?.id ?? null);
  }, []);

  const hydrateRooms = useCallback((nextRooms: TradeRoom[]) => {
    const normalized = normalizeRoomsForHydration(nextRooms);
    setRooms(normalized);
    setCurrentRoomId((prev) => (prev && normalized.some((room) => room.id === prev) ? prev : null));
  }, []);

  // NOTE: localStorage is now treated as offline cache for planner UX only.
  // Server persistence via useTradeJobPersistence remains canonical truth for /trade/*.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rooms));
    } catch (e) {
      console.warn('Failed to save rooms to localStorage:', e);
    }
  }, [rooms]);

  const addRoom = useCallback((roomData: Omit<TradeRoom, 'id' | 'cabinets' | 'createdAt' | 'updatedAt'>): TradeRoom => {
    const now = new Date();
    const newRoom: TradeRoom = { ...roomData, id: generateId(), cabinets: [], createdAt: now, updatedAt: now };
    setRooms((prev) => [...prev, newRoom]);
    return newRoom;
  }, []);

  const updateRoom = useCallback((roomId: string, updates: Partial<TradeRoom>) => {
    setRooms((prev) =>
      patchRoom(prev, roomId, (room) => ({
        ...room,
        ...updates,
        updatedAt: new Date(),
      })),
    );
  }, []);

  const deleteRoom = useCallback((roomId: string) => {
    setRooms((prev) => prev.filter((room) => room.id !== roomId));
    setCurrentRoomId((prev) => (prev === roomId ? null : prev));
  }, []);

  const addCabinet = useCallback(
    (roomId: string, cabinetData: Omit<ConfiguredCabinet, 'instanceId' | 'cabinetNumber' | 'createdAt' | 'updatedAt'>): ConfiguredCabinet => {
      const now = new Date();
      const room = rooms.find((r) => r.id === roomId);
      const newCabinet: ConfiguredCabinet = {
        ...cabinetData,
        instanceId: generateId(),
        cabinetNumber: generateCabinetNumber(room?.cabinets || []),
        createdAt: now,
        updatedAt: now,
      };

      setRooms((prev) =>
        patchRoom(prev, roomId, (targetRoom) => ({
          ...targetRoom,
          cabinets: [...targetRoom.cabinets, newCabinet],
          updatedAt: now,
        })),
      );

      return newCabinet;
    },
    [rooms],
  );

  const updateCabinet = useCallback((roomId: string, instanceId: string, updates: Partial<ConfiguredCabinet>) => {
    const now = new Date();
    setRooms((prev) =>
      patchRoom(prev, roomId, (room) => ({
        ...room,
        cabinets: room.cabinets.map((cab) => (cab.instanceId === instanceId ? { ...cab, ...updates, updatedAt: now } : cab)),
        updatedAt: now,
      })),
    );
  }, []);

  const replaceCabinet = useCallback((roomId: string, cabinet: ConfiguredCabinet) => {
    const now = new Date();
    setRooms((prev) =>
      patchRoom(prev, roomId, (room) => {
        const exists = room.cabinets.some((c) => c.instanceId === cabinet.instanceId);
        return {
          ...room,
          cabinets: exists
            ? room.cabinets.map((c) => (c.instanceId === cabinet.instanceId ? { ...cabinet, updatedAt: now } : c))
            : [...room.cabinets, { ...cabinet, updatedAt: now }],
          updatedAt: now,
        };
      }),
    );
  }, []);

  const removeCabinet = useCallback((roomId: string, instanceId: string) => {
    const now = new Date();
    setRooms((prev) =>
      patchRoom(prev, roomId, (room) => ({
        ...room,
        cabinets: room.cabinets.filter((cab) => cab.instanceId !== instanceId),
        updatedAt: now,
      })),
    );
    setSelectedCabinetId((prev) => (prev === instanceId ? null : prev));
  }, []);

  const duplicateCabinet = useCallback(
    (roomId: string, instanceId: string): ConfiguredCabinet | null => {
      const originalCabinet = rooms.find((r) => r.id === roomId)?.cabinets.find((c) => c.instanceId === instanceId);
      if (!originalCabinet) return null;
      const { instanceId: _, cabinetNumber: __, createdAt: ___, updatedAt: ____, position: _____, ...cabinetData } = originalCabinet;
      return addCabinet(roomId, { ...cabinetData, isPlaced: false, position: undefined });
    },
    [addCabinet, rooms],
  );

  const placeCabinet = useCallback(
    (roomId: string, instanceId: string, position: CabinetInstancePosition) => {
      updateCabinet(roomId, instanceId, { position, isPlaced: true });
    },
    [updateCabinet],
  );

  const unplaceCabinet = useCallback(
    (roomId: string, instanceId: string) => {
      updateCabinet(roomId, instanceId, { position: undefined, isPlaced: false });
    },
    [updateCabinet],
  );

  const selectCabinet = useCallback((instanceId: string | null) => {
    setSelectedCabinetId(instanceId);
  }, []);

  const getRoomById = useCallback((roomId: string): TradeRoom | null => rooms.find((room) => room.id === roomId) || null, [rooms]);

  const getCabinetById = useCallback(
    (roomId: string, instanceId: string): ConfiguredCabinet | null => {
      const room = rooms.find((r) => r.id === roomId);
      return room?.cabinets.find((cab) => cab.instanceId === instanceId) || null;
    },
    [rooms],
  );

  const getSelectedCabinet = useCallback((): ConfiguredCabinet | null => {
    if (!selectedCabinetId || !currentRoom) return null;
    return currentRoom.cabinets.find((c) => c.instanceId === selectedCabinetId) || null;
  }, [selectedCabinetId, currentRoom]);

  const getCabinetsByRoom = useCallback((roomId: string): ConfiguredCabinet[] => getRoomById(roomId)?.cabinets || [], [getRoomById]);

  const getPlacedCabinets = useCallback((roomId: string): ConfiguredCabinet[] => getCabinetsByRoom(roomId).filter((c) => c.isPlaced), [getCabinetsByRoom]);
  const getUnplacedCabinets = useCallback((roomId: string): ConfiguredCabinet[] => getCabinetsByRoom(roomId).filter((c) => !c.isPlaced), [getCabinetsByRoom]);

  const getRoomTotals = useCallback(
    (roomId: string) => {
      const cabinets = getCabinetsByRoom(roomId);
      return {
        count: cabinets.length,
        placed: cabinets.filter((c) => c.isPlaced).length,
        unplaced: cabinets.filter((c) => !c.isPlaced).length,
      };
    },
    [getCabinetsByRoom],
  );

  const value = useMemo(
    () => ({
      currentRoom,
      setCurrentRoom,
      rooms,
      hydrateRooms,
      addRoom,
      updateRoom,
      deleteRoom,
      addCabinet,
      updateCabinet,
      replaceCabinet,
      removeCabinet,
      duplicateCabinet,
      placeCabinet,
      unplaceCabinet,
      selectedCabinetId,
      selectCabinet,
      getSelectedCabinet,
      getRoomById,
      getCabinetById,
      getCabinetsByRoom,
      getPlacedCabinets,
      getUnplacedCabinets,
      getRoomTotals,
    }),
    [
      currentRoom,
      setCurrentRoom,
      rooms,
      hydrateRooms,
      addRoom,
      updateRoom,
      deleteRoom,
      addCabinet,
      updateCabinet,
      replaceCabinet,
      removeCabinet,
      duplicateCabinet,
      placeCabinet,
      unplaceCabinet,
      selectedCabinetId,
      selectCabinet,
      getSelectedCabinet,
      getRoomById,
      getCabinetById,
      getCabinetsByRoom,
      getPlacedCabinets,
      getUnplacedCabinets,
      getRoomTotals,
    ],
  );

  return <TradeRoomContext.Provider value={value}>{children}</TradeRoomContext.Provider>;
}

export function useTradeRoom() {
  const context = useContext(TradeRoomContext);
  if (!context) {
    throw new Error('useTradeRoom must be used within a TradeRoomProvider');
  }
  return context;
}

export type { CabinetAccessories, CabinetConstruction, CabinetDimensions, CabinetHardware, CabinetMaterials, CabinetInstancePosition, ConfiguredCabinet, RoomHardwareDefaults, RoomMaterialDefaults, TradeRoom } from "@/types/trade";
