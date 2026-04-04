#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash scripts/testflight_submit_and_verify.sh --ipa /absolute/path/to/app.ipa

Environment:
  TESTFLIGHT_TESTER_EMAIL            Exact tester email to verify
  TESTFLIGHT_GROUP_NAME              Beta group to verify and attach (default: Internal Testers)
  TESTFLIGHT_APP_ID                  App Store Connect app id (default: 6758254335)
  TESTFLIGHT_ATTACH_GROUP_IF_MISSING Attach the build to the beta group if missing (default: true)
  TESTFLIGHT_VERIFY_TIMEOUT_SECONDS  Max seconds to wait for App Store Connect processing (default: 1800)

Behavior:
  - Runs scripts/testflight_precheck.sh on the IPA
  - Submits the IPA with eas submit --path
  - Waits for the uploaded build to become VALID in App Store Connect
  - Verifies the requested tester and group distribution state
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

IPA_PATH="${IPA_PATH:-}"
APP_ID="${TESTFLIGHT_APP_ID:-6758254335}"
TESTER_EMAIL="${TESTFLIGHT_TESTER_EMAIL:-}"
GROUP_NAME="${TESTFLIGHT_GROUP_NAME:-Internal Testers}"
VERIFY_TIMEOUT_SECONDS="${TESTFLIGHT_VERIFY_TIMEOUT_SECONDS:-1800}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ipa)
      IPA_PATH="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "$IPA_PATH" ]]; then
  usage >&2
  exit 1
fi

if [[ -z "$TESTER_EMAIL" ]]; then
  echo "Missing TESTFLIGHT_TESTER_EMAIL" >&2
  exit 1
fi

require_command bash
require_command eas
require_command asc
require_command python3

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

PRECHECK_OUTPUT="$(
  bash "$(dirname "$0")/testflight_precheck.sh" "$IPA_PATH"
)"
echo "$PRECHECK_OUTPUT"

BUILD_VERSION="$(
  PRECHECK_OUTPUT_ENV="$PRECHECK_OUTPUT" python3 - <<'PY'
import os
import sys

for line in os.environ["PRECHECK_OUTPUT_ENV"].splitlines():
    if line.startswith("build_number="):
        print(line.split("=", 1)[1].strip())
        raise SystemExit(0)

raise SystemExit(1)
PY
)"

echo "testflight_build_version=$BUILD_VERSION"

eas submit --platform ios --profile production --path "$IPA_PATH" --non-interactive --no-wait

deadline=$((SECONDS + VERIFY_TIMEOUT_SECONDS))
build_ready="false"
last_reported_state=""

while (( SECONDS < deadline )); do
  BUILD_JSON="$TMP_DIR/builds.json"
  asc builds list --app "$APP_ID" --sort -uploadedDate --limit 50 --output json > "$BUILD_JSON"

  BUILD_INFO=""
  if BUILD_INFO="$(
    BUILD_VERSION_ENV="$BUILD_VERSION" python3 - "$BUILD_JSON" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
target = os.environ["BUILD_VERSION_ENV"]

for item in payload.get("data", []):
    attrs = item.get("attributes", {})
    if attrs.get("version") == target:
        print(item["id"])
        print(attrs.get("processingState", ""))
        raise SystemExit(0)

raise SystemExit(1)
PY
  )"; then
    BUILD_ID="$(echo "$BUILD_INFO" | sed -n '1p')"
    BUILD_STATE="$(echo "$BUILD_INFO" | sed -n '2p')"
  else
    BUILD_ID=""
    BUILD_STATE=""
  fi

  CURRENT_REPORT_STATE="${BUILD_STATE:-NOT_FOUND}"
  if [[ "$CURRENT_REPORT_STATE" != "$last_reported_state" ]]; then
    echo "testflight_processing_state=$CURRENT_REPORT_STATE"
    last_reported_state="$CURRENT_REPORT_STATE"
  fi

  if [[ -n "$BUILD_ID" && "$BUILD_STATE" == "VALID" ]]; then
    build_ready="true"
    break
  fi

  sleep 30
done

if [[ "$build_ready" != "true" ]]; then
  echo "Timed out waiting for App Store Connect to process build $BUILD_VERSION" >&2
  exit 1
fi

TESTFLIGHT_BUILD_VERSION="$BUILD_VERSION" \
TESTFLIGHT_TESTER_EMAIL="$TESTER_EMAIL" \
TESTFLIGHT_GROUP_NAME="$GROUP_NAME" \
bash "$(dirname "$0")/testflight_verify_distribution.sh"
