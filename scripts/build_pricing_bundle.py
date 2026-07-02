"""
Bundle the pricing engine for smoke tests.

Usage (from repo root):
  npx tsc -p /tmp/tsconfig-emit.json   # emit JS to /tmp/ts-out/lib/pricing/
  python3 scripts/build_pricing_bundle.py
  node scripts/pricing-smoke.mjs
"""
import os, re

TS_OUT = '/tmp/ts-out/lib/pricing'
BUNDLE = '.tmp-snap-test/pricing.mjs'

# Dependency order (leaves first so each symbol is defined before use)
ORDER = [
    'types.js', 'formulaParser.js', 'cabinetPartMapping.js',
    'sheetOptimizer.js', 'edgeCalculator.js', 'hardwareCalculator.js',
    'laborCalculator.js', 'timeModel.js', 'benchtopCalculator.js',
    'bomGenerator.js', 'index.js',
]

def clean(src):
    # Strip inter-module import lines
    src = re.sub(r'^import\b[^\n]*\n', '', src, flags=re.MULTILINE)
    # Strip re-export-from: export * from '...' and export { ... } from '...'
    src = re.sub(r'^export\s*(?:\*|\{[^}]*\})\s*from\s*[\'"][^\'"]+[\'"];?\s*\n', '', src, flags=re.MULTILINE)
    # Strip bare re-export blocks: export { foo, bar };
    src = re.sub(r'^export\s*\{[^}]*\}\s*;?\s*\n', '', src, flags=re.MULTILINE)
    # Strip 'export' keyword before declarations
    src = re.sub(r'^export\s+(?=(?:async\s+)?(?:function|const|class|let|var)\b)', '', src, flags=re.MULTILINE)
    return src

chunks = []
all_exports = set()

for fname in ORDER:
    path = os.path.join(TS_OUT, fname)
    if not os.path.exists(path):
        print(f'SKIP (missing): {fname}')
        continue
    src = open(path).read()
    for m in re.finditer(r'^export\s+(?:async\s+)?(?:function|const|class|let|var)\s+(\w+)', src, re.MULTILINE):
        all_exports.add(m.group(1))
    chunks.append(f'// -- {fname} --\n')
    chunks.append(clean(src))
    chunks.append('\n')

chunks.append(f'\n// Exports\nexport {{ {", ".join(sorted(all_exports))} }};\n')

os.makedirs(os.path.dirname(BUNDLE), exist_ok=True)
with open(BUNDLE, 'w') as f:
    f.writelines(chunks)
print(f'Bundle: {os.path.getsize(BUNDLE):,} bytes, {sum(1 for c in chunks if c.startswith("// --"))} files')
