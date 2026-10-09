import assert from 'node:assert/strict';
import { captureScannerSession, linkScannerRoom, readScannerSession } from '../src/lib/roomScan/scannerSession';

const captureId = 'f30a8568-3e5d-420a-a4a9-90a592403937';
const linkToken = 'a'.repeat(48), evidenceToken = 'b'.repeat(48);
const store = new Map<string, string>();
Object.assign(globalThis, {
  sessionStorage: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
  },
  window: {
    location: { pathname: '/trade/job/new', search: '?handoff=123',
      hash: `#handoffToken=${'h'.repeat(48)}&scannerCaptureId=${captureId}&scannerLinkToken=${linkToken}&scannerEvidenceToken=${evidenceToken}` },
    history: { replaceState: () => undefined },
  },
});
const session = captureScannerSession();
assert.equal(session?.captureId, captureId);
assert.equal(session?.linkToken, linkToken);
assert.equal(readScannerSession(captureId)?.evidenceToken, evidenceToken);
assert.equal(readScannerSession('bad-id'), null);

await linkScannerRoom(session!, 'job-1', 'room-1', 'etag-2', async input => {
  assert.deepEqual(input, { action: 'link', jobId: 'job-1', roomId: 'room-1',
    captureId, sourceRevision: 'etag-2', token: linkToken });
  return new Response('{"linked":true}', { status: 200 });
});
assert.equal(readScannerSession(captureId)?.linkToken, undefined);
assert.equal(readScannerSession(captureId)?.evidenceToken, evidenceToken);
console.log('scanner session: scoped fragment capture and durable link passed');
