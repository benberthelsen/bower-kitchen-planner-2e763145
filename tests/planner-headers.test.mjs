// Planner security headers (public/_headers, Cloudflare Pages). Parses the
// file the way Pages applies it: every rule whose path matches contributes
// its headers, in file order, and a header set by two rules is joined with
// ", ". Checks the headers each route gets, that /wizard/scan keeps camera
// and WebXR, that the report-only CSP admits every origin the app loads, and
// that its violation reports reach the csp-report function.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = read('public/_headers');

function parseHeaders(text) {
  const rules = [];
  for (const [index, line] of text.split('\n').entries()) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    assert.ok(rules.length, `line ${index + 1}: header before any path`);
    const detach = line.trim().match(/^!\s+(\S+)$/);
    const header = line.trim().match(/^([A-Za-z0-9-]+):\s*(.+)$/);
    assert.ok(detach || header, `line ${index + 1}: not "Name: value" or "! Name"`);
    rules.at(-1).headers.push(detach ? { name: detach[1].toLowerCase(), detach: true }
      : { name: header[1].toLowerCase(), value: header[2].trim() });
  }
  return rules;
}

const rules = parseHeaders(source);
const matches = (pattern, path) => {
  const regex = new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  return regex.test(path);
};
/** The headers Pages would send for a path. */
function headersFor(path) {
  const result = new Map();
  for (const rule of rules.filter(({ pattern }) => matches(pattern, path))) {
    for (const header of rule.headers) {
      if (header.detach) result.delete(header.name);
      else result.set(header.name, result.has(header.name) ? `${result.get(header.name)}, ${header.value}` : header.value);
    }
  }
  return result;
}
/** Browsers apply the last referrer policy they recognise in the list. */
const effectiveReferrerPolicy = (value) => value.split(',').map((token) => token.trim()).filter(Boolean).at(-1);
const directives = (csp) => new Map(csp.split(';').map((part) => part.trim()).filter(Boolean)
  .map((part) => { const [name, ...values] = part.split(/\s+/); return [name, values]; }));
const permissions = (policy) => new Map(policy.split(',').map((part) => part.trim().split('=')));

const routes = ['/', '/index.html', '/wizard', '/wizard/scan', '/wizard/view-ar', '/trade/job/new', '/admin/leads',
  '/quote/11111111-1111-4111-8111-111111111111', '/assets/index-abc123.js', '/data/bower-supplier-catalog/manifest.json'];

test('the planner is static: no Pages Functions would bypass _headers', () => {
  assert.equal(existsSync(new URL('../functions', import.meta.url)), false);
});

test('_headers stays within Pages limits and keeps the cache rules', () => {
  assert.ok(rules.length <= 100, 'Pages allows at most 100 header rules');
  for (const [index, line] of source.split('\n').entries()) {
    assert.ok(line.length <= 2000, `line ${index + 1} is over Pages' 2,000 character limit`);
  }
  assert.equal(headersFor('/index.html').get('cache-control'), 'no-cache');
  assert.equal(headersFor('/').get('cache-control'), 'no-cache');
  assert.equal(headersFor('/assets/index-abc123.js').get('cache-control'), 'public, max-age=31536000, immutable');
});

test('every route gets nosniff, the referrer policy and the permissions policy', () => {
  for (const path of routes) {
    const headers = headersFor(path);
    assert.equal(headers.get('x-content-type-options'), 'nosniff', path);
    const expected = path.startsWith('/quote/') ? 'no-referrer' : 'strict-origin-when-cross-origin';
    assert.equal(effectiveReferrerPolicy(headers.get('referrer-policy')), expected, path);
    assert.deepEqual(permissions(headers.get('permissions-policy')), new Map([
      ['camera', '(self)'], ['xr-spatial-tracking', '(self)'], ['screen-wake-lock', '(self)'],
      ['geolocation', '()'], ['microphone', '()'],
    ]), path);
    assert.ok(headers.has('content-security-policy-report-only'), path);
    assert.equal(headers.has('content-security-policy'), false, `${path}: the CSP stays report-only for now`);
  }
});

test('/wizard/scan keeps the camera and immersive-ar (xr-spatial-tracking)', () => {
  const policy = permissions(headersFor('/wizard/scan').get('permissions-policy'));
  assert.equal(policy.get('camera'), '(self)');
  assert.equal(policy.get('xr-spatial-tracking'), '(self)');
  // The scanner and AR viewer request these WebXR sessions from the planner origin.
  for (const page of ['src/pages/homeowner/ScanRoom.tsx', 'src/pages/homeowner/ViewInRoomAr.tsx']) {
    assert.match(read(page), /requestSession\('immersive-ar'/, page);
  }
});

test('the report-only CSP has the planned directives', () => {
  const csp = directives(headersFor('/wizard').get('content-security-policy-report-only'));
  assert.deepEqual(csp.get('default-src'), ["'self'"]);
  assert.deepEqual(csp.get('frame-ancestors'), ["'none'"]);
  assert.deepEqual(csp.get('frame-src'), ['https://challenges.cloudflare.com']);
  for (const value of ["'self'", 'https://challenges.cloudflare.com']) assert.ok(csp.get('script-src').includes(value), value);
  for (const value of ["'unsafe-inline'", "'unsafe-eval'", 'https:', '*']) {
    assert.ok(!csp.get('script-src').includes(value), `script-src must not allow ${value}`);
  }
  for (const value of ["'self'", 'https://ehtwywctledgkxexztbh.supabase.co']) {
    assert.ok(csp.get('connect-src').includes(value), value);
  }
  assert.ok(!csp.get('connect-src').includes('https:') && !csp.get('connect-src').includes('*'),
    'connect-src lists origins, not a wildcard');
});

test('connect-src and the other directives admit every origin the app loads', () => {
  const csp = directives(headersFor('/wizard').get('content-security-policy-report-only'));
  const origin = (url) => new URL(url).origin;
  // The deployed Supabase project.
  assert.ok(read('supabase/config.toml').includes('project_id = "ehtwywctledgkxexztbh"'));
  // Draco decoder for appliance GLBs.
  const draco = read('src/components/3d/ApplianceModel.tsx').match(/setDecoderPath\('([^']+)'\)/)[1];
  assert.ok(csp.get('connect-src').includes(origin(draco)), draco);
  // drei's environment presets (UnifiedScene uses one in the wizard).
  assert.match(read('src/components/3d/UnifiedScene.tsx'), /<Environment preset=/);
  const cubemaps = read('node_modules/@react-three/drei/core/useEnvironment.js').match(/CUBEMAP_ROOT = '([^']+)'/)[1];
  assert.ok(csp.get('connect-src').includes(origin(cubemaps)), cubemaps);
  // troika's default font data for drei <Text> (SnapIndicators).
  const troika = read('node_modules/troika-three-text/dist/troika-three-text.esm.js')
    .match(/"(https:\/\/cdn\.jsdelivr\.net\/gh\/lojjic\/unicode-font-resolver[^"]*)"/)[1];
  assert.ok(csp.get('connect-src').includes(origin(troika)), troika);
  // Google Fonts stylesheet and font files from index.html.
  const html = read('index.html');
  for (const href of html.match(/https:\/\/fonts\.googleapis\.com\/css2[^"]+/g)) {
    assert.ok(csp.get('style-src').includes(origin(href)), href);
  }
  assert.ok(html.includes('https://fonts.gstatic.com'));
  assert.ok(csp.get('font-src').includes('https://fonts.gstatic.com'));
  // No other script origin than ours in index.html.
  for (const [, src] of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) assert.ok(src.startsWith('/'), src);
  // Decoders and troika run in blob: workers; Draco and meshopt need WebAssembly.
  assert.ok(csp.get('worker-src').includes('blob:'));
  assert.ok(csp.get('script-src').includes("'wasm-unsafe-eval'"));
});

test('CSP violations are reported to the csp-report function, through report-uri and report-to', () => {
  const endpoint = 'https://ehtwywctledgkxexztbh.supabase.co/functions/v1/csp-report';
  for (const path of routes) {
    const headers = headersFor(path);
    const csp = directives(headers.get('content-security-policy-report-only'));
    assert.deepEqual(csp.get('report-uri'), [endpoint], `${path}: report-uri`);
    const [group, ...extra] = csp.get('report-to') ?? [];
    assert.ok(group && !extra.length, `${path}: report-to names one endpoint group`);
    const declared = new Map((headers.get('reporting-endpoints') ?? '').split(',').map((entry) => entry.trim())
      .filter(Boolean).map((entry) => {
        const match = entry.match(/^([a-z0-9_-]+)="([^"]+)"$/i);
        assert.ok(match, `${path}: Reporting-Endpoints entry ${entry}`);
        return [match[1], match[2]];
      }));
    assert.equal(declared.get(group), endpoint, `${path}: Reporting-Endpoints declares ${group}`);
  }
  // The endpoint is a function in this repository that browsers can reach without a JWT.
  assert.ok(existsSync(new URL('../supabase/functions/csp-report/index.ts', import.meta.url)));
  assert.match(read('supabase/config.toml'), /\[functions\.csp-report\]\s+verify_jwt = false/);
});
