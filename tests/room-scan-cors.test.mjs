import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transform } from 'esbuild';

const source = await readFile(new URL('../supabase/functions/_shared/roomScan/security.ts', import.meta.url), 'utf8');
const { code } = await transform(source, { loader: 'ts', format: 'esm' });
const { corsHeaders } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

const production = 'https://bower-kitchen-planner.pages.dev';
const preview = 'https://codex-shared-room-geometry.bower-kitchen-planner.pages.dev';

function headersFor(origin, configuredOrigins) {
  globalThis.Deno = {
    env: { get: (key) => key === 'SCANNER_ALLOWED_ORIGINS' ? configuredOrigins : undefined },
  };
  return corsHeaders(new Request('https://example.supabase.co/functions/v1/get-planner-handoff', {
    method: 'OPTIONS',
    headers: { Origin: origin },
  }));
}

test('exact planner preview origin remains allowed beside configured production origins', () => {
  assert.equal(headersFor(production, production)['Access-Control-Allow-Origin'], production);
  const previewHeaders = headersFor(preview, production);
  assert.equal(previewHeaders['Access-Control-Allow-Origin'], preview);
  assert.equal(previewHeaders['Vary'], 'Origin');
  assert.equal(previewHeaders['Cache-Control'], 'no-store');
});

test('preview origin is allowed when no origin list is configured', () => {
  assert.equal(headersFor(preview, undefined)['Access-Control-Allow-Origin'], preview);
  assert.equal(headersFor('http://localhost:5173', undefined)['Access-Control-Allow-Origin'], 'http://localhost:5173');
});

test('similar or unrelated origins remain denied', () => {
  for (const origin of [
    `${preview}.evil.invalid`,
    'https://another-branch.bower-kitchen-planner.pages.dev',
    'https://bower-room-scanner-test-20260912.bowerbuilding.chatgpt.site',
  ]) {
    assert.equal(headersFor(origin, production)['Access-Control-Allow-Origin'], undefined);
  }
});
