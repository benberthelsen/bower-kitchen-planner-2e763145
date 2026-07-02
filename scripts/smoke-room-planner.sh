#!/usr/bin/env bash
set -euo pipefail

echo "[smoke] running functional workflow checks"
node --test src/lib/trade/__tests__/workflowModel.test.mjs

echo "[smoke] linting"
npm run -s lint

echo "[smoke] building app"
npm run -s build

echo "[smoke] functional + lint + build checks passed"
