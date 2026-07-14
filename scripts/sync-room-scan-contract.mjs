// Regenerate the room-scan contract's generated targets (master plan §5.5).
//   node scripts/sync-room-scan-contract.mjs            → Deno mirror only
//   node scripts/sync-room-scan-contract.mjs --website  → + website copy & contract.lock.json
// The website copy/lock require the canonical contract to be COMMITTED first
// (the lock records the canonical commit SHA).
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  CANONICAL_PATH,
  DENO_PATH,
  WEBSITE_CONTRACT_REL,
  WEBSITE_LOCK_REL,
  WEBSITE_REPO_DEFAULT,
  denoOutput,
  readCanonical,
  sha256,
  zodPin,
} from './room-scan-contract-common.mjs';

const canonical = readCanonical();
const pin = zodPin();
const deno = denoOutput(canonical, pin);

mkdirSync(dirname(resolve(DENO_PATH)), { recursive: true });
writeFileSync(resolve(DENO_PATH), deno, 'utf8');
console.log(`wrote ${DENO_PATH} (zod pinned @${pin})`);

if (process.argv.includes('--website')) {
  const siteRepo = process.env.WEBSITE_REPO || WEBSITE_REPO_DEFAULT;
  if (!existsSync(siteRepo)) {
    console.error(`website repo not found at ${siteRepo} (set WEBSITE_REPO)`);
    process.exit(1);
  }

  const dirty = execSync(`git status --porcelain -- ${CANONICAL_PATH}`, { encoding: 'utf8' }).trim();
  if (dirty) {
    console.error('canonical contract has uncommitted changes — commit before generating the website lock file');
    process.exit(1);
  }
  const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();

  const sitePath = join(siteRepo, WEBSITE_CONTRACT_REL);
  mkdirSync(dirname(sitePath), { recursive: true });
  writeFileSync(sitePath, canonical, 'utf8'); // byte-identical

  const lock = {
    canonicalRepo: 'bower-kitchen-planner',
    canonicalPath: CANONICAL_PATH,
    canonicalCommit: commit,
    schemaVersion: 1,
    canonicalSha256: sha256(canonical),
    denoSha256: sha256(deno),
    zodPin: pin,
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(siteRepo, WEBSITE_LOCK_REL), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
  console.log(`wrote website copy + contract.lock.json (commit ${commit.slice(0, 9)})`);
}
