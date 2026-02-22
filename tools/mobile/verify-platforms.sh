#!/usr/bin/env bash
set -euo pipefail

npm run build
npm run ios:sync

if [ -d "android" ]; then
  (
    cd android
    ./gradlew assembleDebug
  )
fi
