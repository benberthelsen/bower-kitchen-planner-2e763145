/**
 * Copy the Häfele product elevations into Supabase Storage.
 *
 * WHY THIS HAS TO EXIST
 *
 * The 3D renderer maps each appliance's product elevation onto the face you
 * actually look at (see src/components/3d/materials/applianceImage.ts). WebGL
 * refuses to upload a cross-origin image as a texture unless the host sends
 * CORS headers, and Häfele's CDN sends none — verified in the browser: a
 * `<img crossOrigin="anonymous">` pointed at hafele.com.au does not merely lose
 * pixel access, it fails to load at all. So while `image_url` still points at
 * hafele.com.au, the appliance-look feature renders nothing and every appliance
 * falls back to a flat coloured box. The picker cards are fine — a plain DOM
 * `<img>` has no such restriction — which is why this is easy to miss.
 *
 * Supabase Storage does send CORS headers, and `appliance-assets` is already
 * public-read with an admin-only insert policy. Copying the images there is what
 * switches the feature on. Nothing in the app changes.
 *
 * WHY A NODE SCRIPT AND NOT A BROWSER TOOL
 *
 * The copy is a cross-origin read of hafele.com.au, so it cannot happen in the
 * app's own page. Server-side there is no CORS at all, and the service-role key
 * bypasses the storage RLS policy without anyone minting a user token.
 *
 * RUN
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... npm run assets:import-appliance-images
 *
 * The key is the `service_role` secret from
 * Supabase → Project Settings → API. It is a full-access key: keep it out of
 * the repo, out of the browser, and out of any chat window. Put it in a local
 * `.env` (already gitignored) if you would rather not paste it each time.
 *
 * Safe to re-run. Rows already pointing at Supabase are skipped, and uploads
 * use upsert, so a half-finished run just continues.
 *
 * Pass --dry-run to see what it would do without writing anything.
 */
import { readFileSync, existsSync } from 'node:fs';

const BUCKET = 'appliance-assets';
const PREFIX = 'products';
const CONCURRENCY = 4;
const DRY_RUN = process.argv.includes('--dry-run');

/* ── config ─────────────────────────────────────────────────────────────── */

// Read .env files the same way Vite does, so the script works with the repo's
// existing local setup instead of needing its own.
function loadEnvFiles() {
  for (const file of ['.env', '.env.local']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      const [, k, raw] = m;
      if (process.env[k]) continue; // real env wins
      process.env[k] = raw.replace(/^["']|["']$/g, '');
    }
  }
}
loadEnvFiles();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Missing config.\n' +
      '  SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set,\n' +
      '  either in the environment or in a local .env file.\n' +
      '  The service_role key is in Supabase -> Project Settings -> API.',
  );
  process.exit(1);
}

const api = SUPABASE_URL.replace(/\/+$/, '');
const authHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

/* ── helpers ────────────────────────────────────────────────────────────── */

async function rest(path, init = {}) {
  const r = await fetch(`${api}/rest/v1/${path}`, {
    ...init,
    headers: { ...authHeaders, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

/** `.../huge/ppic-04978540.jpg` -> `ppic-04978540.jpg`. */
function fileNameFor(row) {
  const base = (row.image_url.split('/').pop() || '').split('?')[0];
  const safe = base.replace(/[^a-zA-Z0-9._-]/g, '-');
  // The ppic id is Häfele's own asset id, so it is unique and the original URL
  // stays reconstructible from the stored filename.
  return safe || `${row.id}.jpg`;
}

const PUBLIC_ROOT = `${api}/storage/v1/object/public/${BUCKET}/`;

function publicUrlFor(name) {
  return `${PUBLIC_ROOT}${PREFIX}/${name}`;
}

// Match the bucket path, not just the project host — a supplier URL that merely
// shared the host prefix would otherwise be skipped as "already copied".
function isAlreadyCopied(url) {
  return url.startsWith(PUBLIC_ROOT);
}

async function download(url) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`download ${r.status}`);
  const type = r.headers.get('content-type') || '';
  if (!/^image\//.test(type)) throw new Error(`not an image (${type || 'no content-type'})`);
  const buf = Buffer.from(await r.arrayBuffer());
  // A CDN placeholder or an error page dressed as an image would sail through
  // the content-type check and render as a grey smudge on an oven door.
  if (buf.byteLength < 2048) throw new Error(`suspiciously small (${buf.byteLength} bytes)`);
  return { buf, type };
}

async function upload(name, buf, type) {
  const r = await fetch(`${api}/storage/v1/object/${BUCKET}/${PREFIX}/${name}`, {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': type, 'x-upsert': 'true' },
    body: buf,
  });
  if (!r.ok) throw new Error(`upload ${r.status} ${await r.text()}`);
}

/* ── run ────────────────────────────────────────────────────────────────── */

const rows = await rest(
  'appliance_products?select=id,item_code,name,image_url&image_url=not.is.null&order=category,sort_order',
);

const alreadyLocal = rows.filter(r => isAlreadyCopied(r.image_url));
const todo = rows.filter(r => !isAlreadyCopied(r.image_url));

console.log(`${rows.length} products carry an image.`);
console.log(`${alreadyLocal.length} already served from Supabase — skipping.`);
console.log(`${todo.length} to copy.${DRY_RUN ? '  (dry run — nothing will be written)' : ''}\n`);

const done = [];
const failed = [];

async function handle(row) {
  const name = fileNameFor(row);
  const target = publicUrlFor(name);
  const label = `${row.item_code ?? row.id.slice(0, 8)}  ${row.name}`;
  try {
    if (DRY_RUN) {
      console.log(`WOULD COPY  ${label}\n            -> ${PREFIX}/${name}`);
      done.push(row.id);
      return;
    }
    const { buf, type } = await download(row.image_url);
    await upload(name, buf, type);
    await rest(`appliance_products?id=eq.${row.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ image_url: target, image_is_elevation: true }),
    });
    console.log(`OK    ${label}  (${Math.round(buf.byteLength / 1024)} kB)`);
    done.push(row.id);
  } catch (err) {
    console.log(`FAIL  ${label}  — ${err.message}`);
    failed.push({ label, reason: err.message });
  }
}

// Plain worker pool. Häfele's CDN is not the problem; hammering someone else's
// server 86 times at once is rude and gets you rate-limited.
const queue = [...todo];
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length) await handle(queue.shift());
  }),
);

console.log(`\ncopied ${done.length}, failed ${failed.length}`);
if (failed.length) {
  console.log('\nFailures — re-running the script retries only these:');
  for (const f of failed) console.log(`  ${f.label}: ${f.reason}`);
}
if (!DRY_RUN && done.length) {
  console.log(
    '\nThe 3D preview now has pixel access to the elevations, so appliance faces\n' +
      'will show the real product instead of a coloured box. Hard-refresh the\n' +
      'planner to clear the old texture cache.',
  );
}
process.exit(failed.length ? 1 : 0);
