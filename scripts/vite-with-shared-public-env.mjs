import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

// The website and planner share public Supabase settings in the parent
// project's .env.local. Load VITE_* values only; private server credentials
// continue to live in this planner's gitignored .env.<mode>.local file.
const sharedEnvPath = path.resolve(process.cwd(), '..', '.env.local');
const childEnv = { ...process.env };
if (existsSync(sharedEnvPath)) {
  for (const line of readFileSync(sharedEnvPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(VITE_[A-Z0-9_]+)=(.*)$/);
    if (!match || childEnv[match[1]]) continue;
    childEnv[match[1]] = unquote(match[2]);
  }
}

const viteBin = path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [viteBin, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: childEnv,
  stdio: 'inherit',
});

child.on('error', error => {
  console.error(`Could not start Vite: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
