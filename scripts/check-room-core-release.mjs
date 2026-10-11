// RoomDocument geometry is authored by the planner and copied into scanner
// releases. Check the source hashes in CI so no editor/placement change silently
// drifts away from the version consumed by the scanner.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const releasePath = resolve('room-core.release.json');
const sourceRoot = 'src/lib/roomDocument';
const names = ['core.ts', 'types.ts', 'geometry.ts', 'validate.ts', 'edit.ts'];
const hash = (contents) => createHash('sha256').update(contents.replace(/\r\n/g, '\n')).digest('hex');
const expectedFiles = Object.fromEntries(names.map((name) => {
  const path = `${sourceRoot}/${name}`;
  return [path, hash(readFileSync(resolve(path), 'utf8'))];
}));

if (process.argv.includes('--write')) {
  const current = JSON.parse(readFileSync(releasePath, 'utf8'));
  const release = {
    schemaVersion: 1,
    release: current.release,
    entry: `${sourceRoot}/core.ts`,
    hashNormalization: 'lf',
    files: expectedFiles,
  };
  writeFileSync(releasePath, `${JSON.stringify(release, null, 2)}\n`);
  console.log(`Wrote planner room-core ${release.release} source hashes.`);
  process.exit(0);
}

const release = JSON.parse(readFileSync(releasePath, 'utf8'));
if (release.schemaVersion !== 1 || release.entry !== `${sourceRoot}/core.ts` || release.hashNormalization !== 'lf'
  || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[-\w.]+)?$/.test(release.release)
  || JSON.stringify(release.files) !== JSON.stringify(expectedFiles)) {
  console.error('Planner room-core source differs from room-core.release.json; publish a new versioned release.');
  process.exit(1);
}
console.log(`Planner room-core ${release.release} source hashes match.`);
