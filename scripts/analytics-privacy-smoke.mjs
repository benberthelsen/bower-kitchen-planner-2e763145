import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const privacy = await import(pathToFileURL(resolve('.tmp-snap-test/analytics-privacy.mjs')).href);

const clean = privacy.sanitizeAnalyticsMetadata({
  stage: 'design-gate',
  shape: 'l-shape',
  name: 'Test Customer',
  email: 'customer@example.com',
  phone: '0400000000',
  contact: {
    full_name: 'Nested Customer',
    email_address: 'nested@example.com',
    postcode: '4000',
  },
  options: [{ id: 'one', contact_phone: '0400000001' }],
});

assert.deepEqual(clean, {
  stage: 'design-gate',
  shape: 'l-shape',
  options: [{ id: 'one' }],
});

const longValue = 'x'.repeat(400);
assert.equal(privacy.sanitizeAnalyticsMetadata({ reason: longValue }).reason.length, 256);

console.log('analytics privacy smoke: contact fields stripped and values bounded');
