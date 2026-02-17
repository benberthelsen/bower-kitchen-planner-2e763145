#!/usr/bin/env bash
set -euo pipefail

echo "[smoke] building app"
npm run build

echo "[smoke] build passed"
