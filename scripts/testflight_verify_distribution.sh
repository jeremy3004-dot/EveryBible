#!/usr/bin/env bash
set -euo pipefail

APP_ID="${TESTFLIGHT_APP_ID:-6758254335}"
BUILD_VERSION="${BUILD_VERSION:-${TESTFLIGHT_BUILD_VERSION:-}}"
TESTER_EMAIL="${TESTFLIGHT_TESTER_EMAIL:-}"
GROUP_NAME="${TESTFLIGHT_GROUP_NAME:-Internal Testers}"
ATTACH_TESTER_IF_MISSING="${TESTFLIGHT_ATTACH_TESTER_IF_MISSING:-true}"

if [[ -z "$BUILD_VERSION" ]]; then
  echo "Missing BUILD_VERSION or TESTFLIGHT_BUILD_VERSION" >&2
  exit 1
fi

if [[ -z "$TESTER_EMAIL" ]]; then
  echo "Missing TESTFLIGHT_TESTER_EMAIL" >&2
  exit 1
fi

args=(
  --app "$APP_ID"
  --build-version "$BUILD_VERSION"
  --tester-email "$TESTER_EMAIL"
  --group-name "$GROUP_NAME"
)

if [[ "$ATTACH_TESTER_IF_MISSING" == "true" ]]; then
  args+=(--attach-tester-if-missing)
fi

bash "$(dirname "$0")/verify_testflight_distribution.sh" "${args[@]}"
