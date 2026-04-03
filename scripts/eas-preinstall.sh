#!/usr/bin/env bash
set -euo pipefail

echo "[eas-preinstall] PATH=$PATH"

if [[ "${EAS_BUILD_PLATFORM:-}" != "ios" ]]; then
  echo "[eas-preinstall] Skipping CocoaPods bootstrap for ${EAS_BUILD_PLATFORM:-unknown} build"
  exit 0
fi

if command -v pod >/dev/null 2>&1; then
  echo "[eas-preinstall] CocoaPods available: $(pod --version)"
  exit 0
fi

echo "[eas-preinstall] 'pod' not found; attempting gem install cocoapods..."
gem install cocoapods --no-document

hash -r || true

if ! command -v pod >/dev/null 2>&1; then
  for candidate in "$HOME"/.gem/ruby/*/bin; do
    if [[ -x "$candidate/pod" ]]; then
      export PATH="$candidate:$PATH"
      break
    fi
  done
fi

if ! command -v pod >/dev/null 2>&1; then
  echo "[eas-preinstall] ERROR: CocoaPods still unavailable after install." >&2
  exit 1
fi

echo "[eas-preinstall] CocoaPods installed: $(pod --version)"
