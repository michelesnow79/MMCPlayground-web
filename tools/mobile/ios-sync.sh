#!/usr/bin/env bash
set -euo pipefail

if [ ! -d "node_modules" ] || [ ! -d "dist" ]; then
  echo "You are offline / deps missing. Run npm install + npm run build when online."
  exit 1
fi

npx cap sync ios
