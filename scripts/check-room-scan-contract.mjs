// Drift check for generated room-scan contract targets (master plan §12.4).
// Regenerates expected output IN MEMORY and compares against what is on disk.
// Exits 1 on any drift. Website absence is tolerated (separate repo checkout);
// website presence is checked byte-for-byte.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  DENO_PATH,
  WEBSITE_CONTRACT_REL,
  WEBSITE_LOCK_REL,
  WEBSITE_REPO_DEFAULT,
  denoOutput,
  readCanonical,
  sha256,
} from './room-scan-contract-common.mjs';

let failed = false;
const canonical = readCanonical();

// Deno mirror
if (!existsSync(resolve(DENO_PATH))) {
  console.error(`DRIFT: ${DENO_PATH} missing — run npm run roomscan:sync`);
  failed = true;
} else {
  const onDisk = readFileSync(resolve(DENO_PATH), 'utf8');
  if (onDisk !== denoOutput(canonical)) {
    console.error(`DRIFT: ${DENO_PATH} does not match generated output — run npm run roomscan:sync`);
    failed = true;
  } else {
    console.log('deno mirror: in sync');
  }
}

// Website copy (only when the sibling repo is available)
const siteRepo = process.env.WEBSITE_REPO || WEBSITE_REPO_DEFAULT;
const sitePath = join(siteRepo, WEBSITE_CONTRACT_REL);
if (!existsSync(siteRepo)) {
  console.log(`website repo not present at ${siteRepo} — skipped (website CI checks its lock hash)`);
} else if (!existsSync(sitePath)) {
  console.log('website copy not generated yet — skipped (created in the website integration run)');
} else {
  const siteText = readFileSync(sitePath, 'utf8');
  if (siteText !== canonical) {
    console.error('DRIFT: website contract copy differs from canonical — run npm run roomscan:sync -- --website');
    failed = true;
  } else {
    console.log('website copy: in sync');
  }
  const lockPath = join(siteRepo, WEBSITE_LOCK_REL);
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (lock.canonicalSha256 !== sha256(canonical)) {
      console.error('DRIFT: contract.lock.json hash no longer matches canonical — regenerate the lock');
      failed = true;
    } else {
      console.log('lock file: hash matches canonical');
    }
  }
}

process.exit(failed ? 1 : 0);
