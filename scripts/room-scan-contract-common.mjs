// Shared logic for the room-scan contract sync/check scripts.
// Canonical source: src/lib/roomScan/contract.ts (master plan §5.5).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const CANONICAL_PATH = 'src/lib/roomScan/contract.ts';
export const DENO_PATH = 'supabase/functions/_shared/roomScan/contract.ts';
// The planner is normally nested directly inside the website repository, so the
// sibling default is the parent directory. An earlier version of this default
// appended the website folder name twice, which made CI skip the real contract
// and report a false green; the fix below must not reintroduce that.
export const WEBSITE_REPO_DEFAULT = resolve('..');
export const WEBSITE_CONTRACT_REL = 'src/lib/roomScan/contract.ts';
export const WEBSITE_LOCK_REL = 'src/lib/roomScan/contract.lock.json';

/**
 * Resolve where the website contract consumer lives.
 *
 * Three cases must all behave correctly:
 *  - CI sets WEBSITE_REPO explicitly -> always enforce (a missing contract is
 *    real drift and must fail; this is what prevents the old false green).
 *  - The planner is checked out inside the website repo -> the parent has a
 *    package.json, so enforce.
 *  - A standalone clone anywhere else -> the parent is just a directory, not a
 *    repo, so skip. Testing `existsSync(siteRepo)` alone can never skip,
 *    because a parent directory always exists.
 */
export function resolveWebsiteRepo() {
  const explicit = process.env.WEBSITE_REPO;
  const siteRepo = explicit || WEBSITE_REPO_DEFAULT;
  return {
    siteRepo,
    explicit: Boolean(explicit),
    looksLikeRepo: existsSync(join(siteRepo, 'package.json')),
  };
}

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
