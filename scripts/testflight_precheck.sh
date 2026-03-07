#!/usr/bin/env bash
set -euo pipefail

IPA_PATH="${1:-}"

if [[ -z "$IPA_PATH" ]]; then
  echo "Usage: bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa" >&2
  exit 1
fi

if [[ ! -f "$IPA_PATH" ]]; then
  echo "IPA not found: $IPA_PATH" >&2
  exit 1
fi

if [[ "${IPA_PATH:0:1}" != "/" ]]; then
  echo "IPA path must be absolute: $IPA_PATH" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

APP_PLIST_RELATIVE_PATH="$(zipinfo -1 "$IPA_PATH" | grep '^Payload/[^/]\+\.app/Info.plist$' | head -n 1 || true)"

if [[ -z "$APP_PLIST_RELATIVE_PATH" ]]; then
  echo "Could not locate Info.plist inside IPA: $IPA_PATH" >&2
  exit 1
fi

unzip -p "$IPA_PATH" "$APP_PLIST_RELATIVE_PATH" > "$TMP_DIR/Info.plist"

read_plist_value() {
  /usr/libexec/PlistBuddy -c "Print :$1" "$TMP_DIR/Info.plist" 2>/dev/null || true
}

BUNDLE_ID="$(read_plist_value CFBundleIdentifier)"
SHORT_VERSION="$(read_plist_value CFBundleShortVersionString)"
BUILD_NUMBER="$(read_plist_value CFBundleVersion)"
CURRENT_SHA="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse origin/main 2>/dev/null || true)"

if [[ -z "$BUNDLE_ID" || -z "$SHORT_VERSION" || -z "$BUILD_NUMBER" ]]; then
  echo "Missing required bundle metadata in IPA." >&2
  exit 1
fi

if [[ "$BUNDLE_ID" != "com.everybible.app" ]]; then
  echo "Unexpected bundle identifier: $BUNDLE_ID" >&2
  exit 1
fi

HEAD_MATCHES_ORIGIN_MAIN="unknown"
if [[ -n "$ORIGIN_MAIN_SHA" ]]; then
  if [[ "$CURRENT_SHA" == "$ORIGIN_MAIN_SHA" ]]; then
    HEAD_MATCHES_ORIGIN_MAIN="true"
  else
    HEAD_MATCHES_ORIGIN_MAIN="false"
  fi
fi

echo "ipa_path=$IPA_PATH"
echo "bundle_id=$BUNDLE_ID"
echo "short_version=$SHORT_VERSION"
echo "build_number=$BUILD_NUMBER"
echo "git_sha=$CURRENT_SHA"
echo "origin_main_sha=${ORIGIN_MAIN_SHA:-missing}"
echo "head_matches_origin_main=$HEAD_MATCHES_ORIGIN_MAIN"

if [[ "$HEAD_MATCHES_ORIGIN_MAIN" == "false" ]]; then
  echo "HEAD does not match origin/main. Sync origin/main, rebuild, and rerun precheck." >&2
  exit 1
fi
