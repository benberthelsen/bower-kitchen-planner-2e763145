import assert from 'node:assert/strict';
import { createRoomSaveQueue } from '../src/lib/trade/roomSaveQueue';

const enqueue = createRoomSaveQueue();
let releaseFirst: (() => void) | undefined;
const firstResponse = new Promise<void>(resolve => { releaseFirst = resolve; });
let serverRevision = 0;
const writes: Array<{ draft: string; expectedRevision: number }> = [];

const first = enqueue(async () => {
  writes.push({ draft: 'first edit', expectedRevision: serverRevision });
  await firstResponse;
  serverRevision = 1;
  return 'first saved';
});
const second = enqueue(async () => {
  // A second edit was made and its debounce fired before the first response.
  // Its expected revision must be read here, after the first write completed.
  writes.push({ draft: 'first and second edit', expectedRevision: serverRevision });
  assert.equal(serverRevision, 1);
  serverRevision = 2;
  return 'latest saved';
});
await Promise.resolve();
assert.deepEqual(writes, [{ draft: 'first edit', expectedRevision: 0 }]);
releaseFirst!();
assert.deepEqual(await Promise.all([first, second]), ['first saved', 'latest saved']);
assert.deepEqual(writes, [
  { draft: 'first edit', expectedRevision: 0 },
  { draft: 'first and second edit', expectedRevision: 1 },
]);
assert.equal(serverRevision, 2);

await assert.rejects(enqueue(async () => { throw new Error('offline'); }), /offline/);
assert.equal(await enqueue(async () => 'retry saved'), 'retry saved');
console.log('room save queue: delayed response, latest draft and retry passed');
