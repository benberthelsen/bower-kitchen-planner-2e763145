export function createRoom(state, room) {
  return { ...state, rooms: [...state.rooms, room] };
}

export function addCabinet(state, roomId, cabinet) {
  return {
    ...state,
    rooms: state.rooms.map((room) =>
      room.id === roomId ? { ...room, cabinets: [...room.cabinets, cabinet] } : room,
    ),
  };
}

export function clampPosition(room, cabinet, position) {
  const maxX = Math.max(0, room.config.width - cabinet.dimensions.width);
  const maxZ = Math.max(0, room.config.depth - cabinet.dimensions.depth);
  return {
    ...position,
    x: Math.min(Math.max(position.x, 0), maxX),
    z: Math.min(Math.max(position.z, 0), maxZ),
  };
}

export function moveCabinet(state, roomId, instanceId, position) {
  return {
    ...state,
    rooms: state.rooms.map((room) => {
      if (room.id !== roomId) return room;
      return {
        ...room,
        cabinets: room.cabinets.map((cabinet) =>
          cabinet.instanceId === instanceId
            ? { ...cabinet, position: clampPosition(room, cabinet, position), isPlaced: true }
            : cabinet,
        ),
      };
    }),
  };
}

export function editCabinet(state, roomId, instanceId, patch) {
  return {
    ...state,
    rooms: state.rooms.map((room) =>
      room.id === roomId
        ? {
            ...room,
            cabinets: room.cabinets.map((cabinet) =>
              cabinet.instanceId === instanceId ? { ...cabinet, ...patch } : cabinet,
            ),
          }
        : room,
    ),
  };
}

export function duplicateCabinet(state, roomId, instanceId) {
  return {
    ...state,
    rooms: state.rooms.map((room) => {
      if (room.id !== roomId) return room;
      const source = room.cabinets.find((cabinet) => cabinet.instanceId === instanceId);
      if (!source) return room;
      const duplicate = {
        ...source,
        instanceId: `${source.instanceId}-copy`,
        cabinetNumber: `${source.cabinetNumber}D`,
        position: { ...source.position, x: source.position.x + 10, z: source.position.z + 10 },
      };
      return { ...room, cabinets: [...room.cabinets, duplicate] };
    }),
  };
}

export function deleteCabinet(state, roomId, instanceId) {
  return {
    ...state,
    rooms: state.rooms.map((room) =>
      room.id === roomId ? { ...room, cabinets: room.cabinets.filter((cabinet) => cabinet.instanceId !== instanceId) } : room,
    ),
  };
}

export function saveAndReload(state) {
  return JSON.parse(JSON.stringify(state));
}

export function computeQuoteTotals(state) {
  let subtotal = 0;
  for (const room of state.rooms) {
    for (const cabinet of room.cabinets) {
      subtotal += Math.max(0, cabinet.dimensions.width * cabinet.dimensions.depth * 0.0008);
    }
  }

  const roundedSubtotal = Number(subtotal.toFixed(2));
  const tax = Number((roundedSubtotal * 0.1).toFixed(2));
  const total = Number((roundedSubtotal + tax).toFixed(2));

  return { subtotal: roundedSubtotal, tax, total };
}

export function quotePdfPayloadShape(state) {
  return {
    rooms: state.rooms.length,
    cabinets: state.rooms.reduce((acc, room) => acc + room.cabinets.length, 0),
    totals: computeQuoteTotals(state),
  };
}

export function xmlTradeRoomShape(state) {
  return state.rooms.map((room) => ({
    id: room.id,
    cabinets: room.cabinets.map((cabinet) => ({
      definitionId: cabinet.definitionId,
      cabinetNumber: cabinet.cabinetNumber,
      dimensions: cabinet.dimensions,
    })),
  }));
}
