import assert from 'node:assert/strict';
import {
  getPersistedRoomTotal,
  mergePersistedPricingState,
} from '../src/lib/trade/pricingPersistence';

const previousRoom = {
  roomId: 'room-b',
  roomTotal: 2200,
  perCabinetTotals: { b1: 2000 },
  capturedAt: '2026-07-30T00:00:00.000Z',
};

const currentRoom = {
  roomId: 'room-a',
  roomTotal: 6186.97,
  perCabinetTotals: { a1: 3000, a2: 2100 },
  perCabinetSell: { a1: 3639.39, a2: 2547.58 },
  bomSummary: {
    grandTotal: {
      subtotalExGst: 5624.52,
      gst: 562.45,
      total: 6186.97,
    },
  },
  capturedAt: '2026-08-01T03:45:43.000Z',
};

const merged = mergePersistedPricingState(
  {
    quoteSnapshot: previousRoom,
    quoteSnapshotsByRoom: { 'room-b': previousRoom },
    jobTotals: { subtotal: 2000, tax: 200, total: 2200, updatedAt: previousRoom.capturedAt },
  },
  currentRoom,
  {
    subtotal: 5624.52,
    tax: 562.45,
    total: 6186.97,
    updatedAt: currentRoom.capturedAt,
  },
);

assert.equal(merged.quoteSnapshot, currentRoom, 'latest room snapshot becomes the compatibility snapshot');
assert.equal(merged.quoteSnapshotsByRoom?.['room-a'], currentRoom, 'current room snapshot is persisted');
assert.equal(merged.quoteSnapshotsByRoom?.['room-b'], previousRoom, 'other room snapshots survive the merge');
assert.deepEqual(merged.jobTotals, {
  subtotal: 5624.52,
  tax: 562.45,
  total: 6186.97,
  updatedAt: currentRoom.capturedAt,
});
assert.equal(getPersistedRoomTotal(currentRoom), 6186.97, 'locked planner reads the persisted grand total');
assert.equal(getPersistedRoomTotal({ ...currentRoom, bomSummary: null, roomTotal: 1234.56 }), 1234.56, 'legacy snapshots fall back to roomTotal');
assert.equal(getPersistedRoomTotal(null), null);

console.log('Trade pricing persistence smoke checks passed');
