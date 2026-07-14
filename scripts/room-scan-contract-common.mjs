// Shared logic for the room-scan contract sync/check scripts.
// Canonical source: src/lib/roomScan/contract.ts (master plan §5.5).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CANONICAL_PATH = 'src/lib/roomScan/contract.ts';
export const DENO_PATH = 'supabase/functions/_shared/roomScan/contract.ts';
export const WEBSITE_REPO_DEFAULT = 'C:/Users/bench/OneDrive/Projects-Code/Codex/bower-cabinet-web-site';
export const WEBSITE_CONTRACT_REL = 'src/lib/roomScan/contract.ts';
export const WEBSITE_LOCK_REL = 'src/lib/roomScan/contract.lock.json';

export const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

export function readCanonical() {
  return readFileSync(resolve(CANONICAL_PATH), 'utf8');
}

/** Pinned zod version derived from package.json (strip range operators). */
export function zodPin() {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
  const range = pkg.dependencies?.zod ?? pkg.devDependencies?.zod;
  if (!range) throw new Error('zod not found in package.json');
  return range.replace(/^[\^~>=]+/, '');
}

const DENO_BANNER = (pin) =>
  `// GENERATED FILE — DO NOT EDIT.\n// Source: ${CANONICAL_PATH} · regenerate with \`npm run roomscan:sync\`.\n// zod import rewritten to npm:zod@${pin} for the Deno runtime.\n`;

/** Deno mirror = banner + canonical with the zod import rewritten. */
export function denoOutput(canonicalText, pin = zodPin()) {
  const rewritten = canonicalText.replace(
    /from 'zod';/,
    `from 'npm:zod@${pin}';`,
  );
  if (rewritten === canonicalText) throw new Error("could not find `from 'zod';` import to rewrite");
  return DENO_BANNER(pin) + rewritten;
}
