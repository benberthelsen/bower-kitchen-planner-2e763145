/**
 * Offline security checks for send-email templates. Remote Deno imports and
 * the serve registration are replaced with no-op declarations; the real
 * template/helper source is then transpiled and executed in Node.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = process.cwd();
const out = path.join(root, '.tmp-snap-test', 'email-security');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'package.json'), '{"type":"commonjs"}');

const sourcePath = path.join(root, 'supabase/functions/send-email/index.ts');
const source = readFileSync(sourcePath, 'utf8')
  .replace(/^import \{ serve \} from .*;$/m, 'const serve = () => {};')
  .replace(/^import \{ createClient \} from .*;$/m, 'const createClient = () => ({});')
  .replace(/^import \{ gate, jsonResponse, readJsonBody \} from .*;$/m,
    'const gate = () => null; const jsonResponse = () => new Response(); const readJsonBody = async () => ({});');

const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: sourcePath,
});
const outputPath = path.join(out, 'send-email.js');
writeFileSync(outputPath, outputText);

const env = {
  PLANNER_ADMIN_URL: 'https://planner.bowercabinets.com/admin/leads',
};
globalThis.Deno = { env: { get: (key) => env[key] } };

const { tplNewLead, safeUrl } = require(outputPath);

const injected = tplNewLead({
  contact_name: '<img src=x onerror=alert(1)>\r\nFake subject',
  contact_email: 'bad@example.com\"><a href="https://evil.example">click</a>',
  contact_phone: '<script>alert(1)</script>',
  admin_url: 'https://evil.example/phish',
});

assert.ok(injected.html.includes('&lt;img'), 'customer HTML was not escaped');
assert.ok(injected.html.includes('&lt;script&gt;'), 'script markup was not escaped');
assert.ok(!injected.html.includes('<img'), 'raw image tag reached the email HTML');
assert.ok(!injected.html.includes('<a href="https://evil.example">'), 'injected anchor reached the email HTML');
assert.ok(!injected.html.includes('evil.example/phish'), 'payload admin_url changed the staff link');
assert.ok(injected.html.includes('https://planner.bowercabinets.com/admin/leads'), 'canonical admin URL missing');
assert.ok(!/[\r\n]/.test(injected.subject), 'subject retained a newline');

env.PLANNER_ADMIN_URL = 'https://evil.example/phish';
const badEnv = tplNewLead({ contact_name: 'Test' });
assert.ok(!badEnv.html.includes('evil.example'), 'invalid configured host reached the email');
assert.ok(badEnv.html.includes('https://planner.bowercabinets.com/admin/leads'), 'invalid configured host did not fall back safely');

assert.equal(safeUrl('http://planner.bowercabinets.com/admin/leads', '#'), '#', 'HTTP URL was accepted');
assert.equal(safeUrl('javascript:alert(1)', '#'), '#', 'javascript URL was accepted');
assert.equal(safeUrl('https://example.com/phish', '#'), '#', 'external host was accepted');

console.log('email security smoke: 12 assertions passed');
