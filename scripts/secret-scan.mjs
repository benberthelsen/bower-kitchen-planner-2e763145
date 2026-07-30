import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

const patterns = [
  { name: 'OpenAI API key', regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'GitHub personal token', regex: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { name: 'AWS access key', regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'private key block', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Supabase service JWT', regex: /\beyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
];

const findings = [];
for (const file of tracked) {
  let size;
  try {
    size = statSync(file).size;
  } catch {
    continue;
  }
  if (size > 2_000_000) continue;

  const buffer = readFileSync(file);
  if (buffer.includes(0)) continue;
  const text = buffer.toString('utf8');
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) findings.push(`${file}: ${pattern.name}`);
  }
}

if (findings.length > 0) {
  console.error('Potential tracked secrets found:');
  for (const finding of findings) console.error(`  ${finding}`);
  process.exit(1);
}

console.log(`secret scan: ${tracked.length} tracked files checked, no credential patterns found`);
