#!/usr/bin/env bash
set -euo pipefail

SIMULATOR_NAME="${IOS_SIMULATOR_NAME:-iPhone 17 Pro}"
METRO_PORT="${RCT_METRO_PORT:-${EXPO_DEV_CLIENT_METRO_PORT:-8081}}"
WORKSPACE_PATH="ios/EveryBible.xcworkspace"
SCHEME_NAME="EveryBible"
CONFIGURATION_NAME="Debug"
DERIVED_DATA_PATH="/tmp/EveryBibleDerived"
BUNDLE_IDENTIFIER="com.everybible.app"
INITIAL_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --simulator)
      SIMULATOR_NAME="${2:?missing simulator name}"
      shift 2
      ;;
    --metro-port)
      METRO_PORT="${2:?missing metro port}"
      shift 2
      ;;
    --derived-data)
      DERIVED_DATA_PATH="${2:?missing derived data path}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

INITIAL_URL="http://127.0.0.1:${METRO_PORT}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
cd "$REPO_ROOT"

DEVICE_LINE="$(
  xcrun simctl list devices available |
    grep -F "${SIMULATOR_NAME} (" |
    head -n 1 || true
)"

if [[ -z "$DEVICE_LINE" ]]; then
  echo "Could not find available simulator named '${SIMULATOR_NAME}'." >&2
  exit 1
fi

DEVICE_ID="$(echo "$DEVICE_LINE" | sed -E 's/.*\(([A-F0-9-]+)\) \((Booted|Shutdown)\).*/\1/')"

if [[ -z "$DEVICE_ID" ]]; then
  echo "Failed to resolve simulator UDID for '${SIMULATOR_NAME}'." >&2
  exit 1
fi

if ! echo "$DEVICE_LINE" | grep -q "(Booted)"; then
  xcrun simctl boot "$DEVICE_ID" >/dev/null 2>&1 || true
fi

xcrun simctl bootstatus "$DEVICE_ID" -b
open -a Simulator --args -CurrentDeviceUDID "$DEVICE_ID" >/dev/null 2>&1 || true

echo "Building ${SCHEME_NAME} for ${SIMULATOR_NAME} with Metro on port ${METRO_PORT}..."
xcodebuild \
  -workspace "$WORKSPACE_PATH" \
  -scheme "$SCHEME_NAME" \
  -configuration "$CONFIGURATION_NAME" \
  -destination "id=${DEVICE_ID}" \
  -derivedDataPath "$DERIVED_DATA_PATH" \
  "RCT_METRO_PORT=${METRO_PORT}" \
  build

APP_PATH="${DERIVED_DATA_PATH}/Build/Products/${CONFIGURATION_NAME}-iphonesimulator/${SCHEME_NAME}.app"

if [[ ! -d "$APP_PATH" ]]; then
  echo "Expected built app at ${APP_PATH} but it was not found." >&2
  exit 1
fi

xcrun simctl terminate "$DEVICE_ID" "$BUNDLE_IDENTIFIER" >/dev/null 2>&1 || true
xcrun simctl install "$DEVICE_ID" "$APP_PATH"
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_IDENTIFIER" --initialUrl "$INITIAL_URL"

echo "Launched ${BUNDLE_IDENTIFIER} on ${SIMULATOR_NAME} (${DEVICE_ID}) using Metro port ${METRO_PORT} via ${INITIAL_URL}."
