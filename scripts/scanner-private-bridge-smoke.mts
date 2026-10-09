import assert from 'node:assert/strict';
import {
  bridgeOrigins, parseScannerBridgeInput, readBoundedBytes, savedRoomMatchesCapture,
  scannerBridgePath, scannerUpstreamFailure, validScannerManifest,
  validScannerPhotoBytes,
} from '../supabase/functions/_shared/roomScan/scannerPrivateBridge';

const captureId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const roomId = '1234567890-roomabc';
const base = { action: 'manifest', jobId, roomId, captureId,
  sourceRevision: 'revision-1', token: 'a'.repeat(43) };
const input = parseScannerBridgeInput(base);
assert.ok(input);
assert.equal(scannerBridgePath(input), `/api/room-capture/jobs/${captureId}/planner-evidence`);
const saved = { tradeRooms: [{ id: roomId, roomDocument: {
  capture: { captureId, sourceRevision: 'revision-1' },
} }] };
assert.equal(savedRoomMatchesCapture(saved, input), true);
assert.equal(savedRoomMatchesCapture(saved, { ...input, roomId: 'other-room' }), false);
assert.equal(savedRoomMatchesCapture(saved, { ...input, captureId: '00000000-0000-0000-0000-000000000001' }), false);
assert.equal(savedRoomMatchesCapture(saved, { ...input, sourceRevision: 'old' }), false);
assert.equal(savedRoomMatchesCapture({ tradeRooms: [{ id: roomId }] }, input), false);
assert.equal(parseScannerBridgeInput({ ...base, roomId: '../other-room' }), null);
assert.equal(parseScannerBridgeInput({ ...base, token: 'short' }), null);
assert.equal(parseScannerBridgeInput({ ...base, action: 'photo', photoId: '0160' }), null);
assert.equal(parseScannerBridgeInput({ ...base, action: 'photo', photoId: '0001/../' }), null);

const photoInput = parseScannerBridgeInput({ ...base, action: 'photo', photoId: '0001' });
assert.ok(photoInput);
assert.equal(scannerBridgePath(photoInput), `/api/room-capture/jobs/${captureId}/planner-evidence/photos/0001`);
assert.equal(validScannerManifest({ captureId, sourceRevision: 'revision-1',
  photos: [{ id: '0001', bytes: 1024 }] }, input), true);
assert.equal(validScannerManifest({ captureId, sourceRevision: 'revision-2', photos: [] }, input), true,
  'photos belong to the capture, so a newer scanner revision still serves them');
assert.equal(validScannerManifest({ captureId, sourceRevision: '', photos: [] }, input), false);
assert.equal(validScannerManifest({ captureId: '00000000-0000-0000-0000-000000000001',
  sourceRevision: 'revision-1', photos: [] }, input), false);
assert.equal(validScannerManifest({ captureId, sourceRevision: 'revision-1',
  photos: [{ id: '0160', bytes: 1 }] }, input), false);
assert.equal(validScannerPhotoBytes(new Uint8Array([255, 216, 1, 255, 217])), true);
assert.equal(validScannerPhotoBytes(new Uint8Array([255, 216, 1])), false);
assert.deepEqual(scannerUpstreamFailure(401), { status: 401, code: 'scanner_access_denied' });
assert.deepEqual(scannerUpstreamFailure(409), { status: 409, code: 'scanner_revision_conflict' });
assert.deepEqual(scannerUpstreamFailure(403), { status: 502, code: 'scanner_origin_rejected' });
assert.deepEqual(scannerUpstreamFailure(404), { status: 404, code: 'scanner_not_found' });
assert.deepEqual(scannerUpstreamFailure(302), { status: 502, code: 'scanner_unavailable' });
assert.equal(scannerUpstreamFailure(200), null);

const env = (values: Record<string, string>) => (name: string) => values[name];
assert.equal(bridgeOrigins(env({})), null, 'unset secrets have no default host');
assert.equal(bridgeOrigins(env({ SCANNER_ORIGIN: 'https://scanner.example.com' })), null,
  'an unset PLANNER_ORIGIN has no default');
assert.equal(bridgeOrigins(env({ PLANNER_ORIGIN: 'https://planner.bowercabinets.com' })), null,
  'an unset SCANNER_ORIGIN has no default');
assert.equal(bridgeOrigins(env({ SCANNER_ORIGIN: ' ', PLANNER_ORIGIN: 'https://planner.bowercabinets.com' })), null,
  'a blank secret counts as unset');
assert.deepEqual(bridgeOrigins(env({
  SCANNER_ORIGIN: ' https://scanner.example.com/ ', PLANNER_ORIGIN: 'https://planner.bowercabinets.com',
})), { scanner: 'https://scanner.example.com', planner: 'https://planner.bowercabinets.com' });
for (const bad of ['http://scanner.example.com', 'https://scanner.example.com/api',
  'https://user:pw@scanner.example.com', 'https://scanner.example.com/?x=1', 'not a url']) {
  assert.equal(bridgeOrigins(env({ SCANNER_ORIGIN: bad, PLANNER_ORIGIN: 'https://planner.bowercabinets.com' })),
    null, `rejects ${bad}`);
  assert.equal(bridgeOrigins(env({ SCANNER_ORIGIN: 'https://scanner.example.com', PLANNER_ORIGIN: bad })),
    null, `rejects ${bad}`);
}

const bytes = await readBoundedBytes(new Request('https://example.invalid', {
  method: 'POST', body: new Uint8Array([1, 2, 3, 4]),
}), 4);
assert.deepEqual([...bytes!], [1, 2, 3, 4]);
const tooLarge = await readBoundedBytes(new Request('https://example.invalid', {
  method: 'POST', body: new Uint8Array([1, 2, 3, 4, 5]),
  headers: { 'content-length': '1' },
}), 4);
assert.equal(tooLarge, null, 'forged Content-Length must not bypass the stream cap');
const chunks = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new Uint8Array([1, 2, 3]));
    controller.enqueue(new Uint8Array([4, 5]));
    controller.close();
  },
});
assert.equal(await readBoundedBytes(new Response(chunks), 4), null,
  'multiple chunks must share one byte budget');
console.log('scanner private bridge: scoped capture, validated routes, MIME data and byte caps passed');
