import assert from 'node:assert/strict';
import {
  allocateQuotedTotal,
  getPersistedRoomTotal,
  mergePersistedPricingState,
  normalizePricingTotals,
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

const allocated = allocateQuotedTotal({ c01: 767.72, c02: 519.08, c03: 655.38, c04: 611.41, c05: 782.35 }, 6186.97);
assert.equal(
  Math.round(Object.values(allocated).reduce((sum, value) => sum + value, 0) * 100),
  618697,
  'cabinet quoted totals reconcile exactly to the room grand total',
);
assert.deepEqual(allocateQuotedTotal({}, 6186.97), {});

assert.deepEqual(
  normalizePricingTotals({ total: 6186.97 }),
  { subtotal: 5624.52, tax: 562.45, total: 6186.97 },
  'a legacy total-only quote derives subtotal/GST without adding GST twice',
);
assert.deepEqual(
  normalizePricingTotals({ subtotal: 5624.52, tax: 562.44, total: 6186.97 }),
  { subtotal: 5624.52, tax: 562.45, total: 6186.97 },
  'the approved total is authoritative and GST balances to it exactly',
);

console.log('Trade pricing persistence smoke checks passed');
