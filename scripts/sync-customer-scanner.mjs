// Copies the customer room scanner into public/scan/. The source of truth is
// the room-scanner repository (bower-room-scanner): its `npm run
// build:customer` writes customer-build/scan/ with the corner scan
// (/scan/corners/) and floor plan (/scan/plan/). Those pages run only in the
// browser and hand the room to /wizard through sessionStorage
// 'bower.pendingScan'. Usage: npm run scanner:sync-customer [-- <customer-build/scan dir>]
import { cp, readFile, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = resolve(process.argv[2] ?? '../bower-room-scanner/customer-build/scan');
const target = resolve('public/scan');
for (const file of ['BUILD.json', 'corners/index.html', 'corners/app.js', 'plan/index.html', 'plan/app.js']) {
  await stat(`${source}/${file}`).catch(() => {
    throw new Error(`${source}/${file} is missing. Run "npm run build:customer" in the room-scanner repository first.`);
  });
}
const build = JSON.parse(await readFile(`${source}/BUILD.json`, 'utf8'));
if (build.source !== 'bower-room-scanner') throw new Error(`${source} is not a room-scanner customer build.`);
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
console.log(`customer scanner ${build.version} from room-scanner ${String(build.commit).slice(0, 7)} copied to public/scan/`);
