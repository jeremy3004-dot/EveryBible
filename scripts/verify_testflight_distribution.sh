#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  verify_testflight_distribution.sh --app APP_ID --build-version BUILD_VERSION [options]

Required:
  --app APP_ID                     App Store Connect app ID
  --build-version BUILD_VERSION    TestFlight build version / CFBundleVersion

Optional:
  --tester-email EMAIL             Beta tester email to verify
  --tester-id TESTER_ID            Beta tester ID to verify (used instead of email if provided)
  --group-id GROUP_ID              Beta group ID to verify
  --group-name NAME                Beta group name to resolve and verify
  --attach-tester-if-missing       Directly attach the build to the tester if absent

Behavior:
  - Verifies the requested build exists in App Store Connect and is VALID
  - Verifies requested tester/group distribution state
  - Can directly attach the build to the tester as a fallback
  - Exits non-zero if the build is not ready for the requested distribution target
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

APP_ID=""
BUILD_VERSION=""
TESTER_EMAIL=""
TESTER_ID=""
GROUP_ID=""
GROUP_NAME=""
ATTACH_TESTER_IF_MISSING="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      APP_ID="${2:-}"
      shift 2
      ;;
    --build-version)
      BUILD_VERSION="${2:-}"
      shift 2
      ;;
    --tester-email)
      TESTER_EMAIL="${2:-}"
      shift 2
      ;;
    --tester-id)
      TESTER_ID="${2:-}"
      shift 2
      ;;
    --group-id)
      GROUP_ID="${2:-}"
      shift 2
      ;;
    --group-name)
      GROUP_NAME="${2:-}"
      shift 2
      ;;
    --attach-tester-if-missing)
      ATTACH_TESTER_IF_MISSING="true"
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ -z "$APP_ID" || -z "$BUILD_VERSION" ]]; then
  usage >&2
  exit 1
fi

if [[ "$ATTACH_TESTER_IF_MISSING" == "true" && -z "$TESTER_EMAIL" && -z "$TESTER_ID" ]]; then
  echo "--attach-tester-if-missing requires --tester-email or --tester-id" >&2
  exit 1
fi

require_command asc
require_command python3

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

BUILD_JSON="$TMP_DIR/builds.json"
asc builds list --app "$APP_ID" --sort -uploadedDate --limit 50 --output json > "$BUILD_JSON"

BUILD_RESULT="$(
  BUILD_VERSION_ENV="$BUILD_VERSION" python3 - "$BUILD_JSON" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
target = os.environ["BUILD_VERSION_ENV"]
matches = [item for item in payload.get("data", []) if item.get("attributes", {}).get("version") == target]

if not matches:
    sys.exit(2)

build = matches[0]
attrs = build.get("attributes", {})
print(build["id"])
print(attrs.get("processingState", ""))
print(attrs.get("uploadedDate", ""))
PY
)" || {
  echo "Build version $BUILD_VERSION was not found for app $APP_ID" >&2
  exit 1
}

BUILD_ID="$(echo "$BUILD_RESULT" | sed -n '1p')"
BUILD_PROCESSING_STATE="$(echo "$BUILD_RESULT" | sed -n '2p')"
BUILD_UPLOADED_DATE="$(echo "$BUILD_RESULT" | sed -n '3p')"

echo "build_id=$BUILD_ID"
echo "build_version=$BUILD_VERSION"
echo "build_processing_state=$BUILD_PROCESSING_STATE"
echo "build_uploaded_date=$BUILD_UPLOADED_DATE"

if [[ "$BUILD_PROCESSING_STATE" != "VALID" ]]; then
  echo "distribution_ready=false" >&2
  echo "Build $BUILD_VERSION is not yet VALID in App Store Connect" >&2
  exit 1
fi

if [[ -z "$GROUP_ID" && -n "$GROUP_NAME" ]]; then
  GROUPS_JSON="$TMP_DIR/groups.json"
  asc testflight beta-groups list --app "$APP_ID" --output json > "$GROUPS_JSON"
  GROUP_ID="$(
    GROUP_NAME_ENV="$GROUP_NAME" python3 - "$GROUPS_JSON" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
target = os.environ["GROUP_NAME_ENV"]

for item in payload.get("data", []):
    if item.get("attributes", {}).get("name") == target:
        print(item["id"])
        break
PY
  )"
  if [[ -z "$GROUP_ID" ]]; then
    echo "Could not resolve beta group named '$GROUP_NAME'" >&2
    exit 1
  fi
fi

GROUP_HAS_BUILD="unknown"
if [[ -n "$GROUP_ID" ]]; then
  GROUP_BUILDS_JSON="$TMP_DIR/group-builds.json"
  asc testflight beta-groups relationships get --group-id "$GROUP_ID" --type builds --output json > "$GROUP_BUILDS_JSON"
  GROUP_HAS_BUILD="$(
    BUILD_ID_ENV="$BUILD_ID" python3 - "$GROUP_BUILDS_JSON" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
target = os.environ["BUILD_ID_ENV"]
ids = {item.get("id") for item in payload.get("data", [])}
print("true" if target in ids else "false")
PY
  )"
  echo "group_id=$GROUP_ID"
  echo "group_has_build=$GROUP_HAS_BUILD"
fi

if [[ -z "$TESTER_ID" && -n "$TESTER_EMAIL" ]]; then
  TESTERS_JSON="$TMP_DIR/testers.json"
  asc testflight beta-testers list --app "$APP_ID" --output json > "$TESTERS_JSON"
  TESTER_ID="$(
    TESTER_EMAIL_ENV="$TESTER_EMAIL" python3 - "$TESTERS_JSON" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
target = os.environ["TESTER_EMAIL_ENV"].lower()

for item in payload.get("data", []):
    email = item.get("attributes", {}).get("email", "").lower()
    if email == target:
        print(item["id"])
        break
PY
  )"
  if [[ -z "$TESTER_ID" ]]; then
    echo "Could not resolve beta tester with email '$TESTER_EMAIL'" >&2
    exit 1
  fi
fi

TESTER_HAS_BUILD="unknown"
if [[ -n "$TESTER_ID" ]]; then
  TESTER_BUILDS_JSON="$TMP_DIR/tester-builds.json"
  asc testflight beta-testers builds list --tester-id "$TESTER_ID" --output json > "$TESTER_BUILDS_JSON"
  TESTER_HAS_BUILD="$(
    BUILD_ID_ENV="$BUILD_ID" python3 - "$TESTER_BUILDS_JSON" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
target = os.environ["BUILD_ID_ENV"]
ids = {item.get("id") for item in payload.get("data", [])}
print("true" if target in ids else "false")
PY
  )"

  if [[ "$TESTER_HAS_BUILD" != "true" && "$ATTACH_TESTER_IF_MISSING" == "true" ]]; then
    asc testflight beta-testers add-builds --id "$TESTER_ID" --build "$BUILD_ID" >/dev/null
    asc testflight beta-testers builds list --tester-id "$TESTER_ID" --output json > "$TESTER_BUILDS_JSON"
    TESTER_HAS_BUILD="$(
      BUILD_ID_ENV="$BUILD_ID" python3 - "$TESTER_BUILDS_JSON" <<'PY'
import json
import os
import sys

payload = json.load(open(sys.argv[1], "r", encoding="utf-8"))
target = os.environ["BUILD_ID_ENV"]
ids = {item.get("id") for item in payload.get("data", [])}
print("true" if target in ids else "false")
PY
    )"
    echo "tester_build_attached=true"
  fi

  echo "tester_id=$TESTER_ID"
  echo "tester_has_build=$TESTER_HAS_BUILD"
fi

DISTRIBUTION_READY="true"

if [[ -n "$TESTER_ID" && "$TESTER_HAS_BUILD" != "true" ]]; then
  DISTRIBUTION_READY="false"
fi

if [[ -n "$GROUP_ID" && "$GROUP_HAS_BUILD" != "true" ]]; then
  DISTRIBUTION_READY="false"
fi

echo "distribution_ready=$DISTRIBUTION_READY"

if [[ "$DISTRIBUTION_READY" != "true" ]]; then
  echo "Requested TestFlight distribution target is not ready for build $BUILD_VERSION" >&2
  exit 1
fi
