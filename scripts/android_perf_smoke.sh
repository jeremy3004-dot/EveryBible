#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
ADB="${ADB:-$ANDROID_SDK/platform-tools/adb}"
EMULATOR="${EMULATOR:-$ANDROID_SDK/emulator/emulator}"
PACKAGE_NAME="${PACKAGE_NAME:-com.everybible.app}"
ACTIVITY="${ACTIVITY:-com.everybible.app/.MainActivity}"
APK_PATH="${APK_PATH:-$ROOT_DIR/android/app/build/outputs/apk/release/app-release.apk}"
RUNS="${RUNS:-5}"
CONTENT_RUNS="${CONTENT_RUNS:-3}"
UI_DUMP_TIMEOUT_SECONDS="${UI_DUMP_TIMEOUT_SECONDS:-4}"
UI_POLL_ATTEMPTS="${UI_POLL_ATTEMPTS:-20}"
FLOW_FILTER="${FLOW_FILTER:-}"
SERIAL="${SERIAL:-}"
TMP_AVD_NAME="${TMP_AVD_NAME:-EveryBiblePerfLow}"
TMP_AVD_DIR="$HOME/.android/avd/${TMP_AVD_NAME}.avd"
TMP_AVD_INI="$HOME/.android/avd/${TMP_AVD_NAME}.ini"
STARTED_EMULATOR_PID=""
CREATED_TEMP_AVD="false"

usage() {
  cat <<USAGE
Usage: scripts/android_perf_smoke.sh [--serial emulator-5554] [--apk path/to/app-release.apk]

Environment overrides:
  ANDROID_HOME / ANDROID_SDK_ROOT  Android SDK path
  RUNS                            am start samples, default 5
  CONTENT_RUNS                    content-ready samples, default 3
  UI_DUMP_TIMEOUT_SECONDS         per-uiautomator timeout, default 4
  UI_POLL_ATTEMPTS                UI poll attempts per sample, default 20
  FLOW_FILTER                     comma-separated flow names to run, default all
  PACKAGE_NAME                    app id, default com.everybible.app
  ACTIVITY                        launch activity, default com.everybible.app/.MainActivity

When --serial is omitted and no device is attached, the script creates a temporary
headless AVD from the installed Android 36.1 Google Play ARM64 image, then removes it.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --serial)
      SERIAL="${2:?missing --serial value}"
      shift 2
      ;;
    --apk)
      APK_PATH="${2:?missing --apk value}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_file() {
  if [[ ! -e "$1" ]]; then
    echo "Required path not found: $1" >&2
    exit 1
  fi
}

now_ms() {
  python3 -c 'import time; print(int(time.time() * 1000))'
}

run_with_timeout() {
  local timeout_seconds="$1"
  shift
  "$@" &
  local pid="$!"
  local elapsed=0

  while kill -0 "$pid" 2>/dev/null; do
    if (( elapsed >= timeout_seconds )); then
      kill "$pid" 2>/dev/null || true
      wait "$pid" 2>/dev/null || true
      return 124
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  wait "$pid"
}

adb_shell() {
  "$ADB" -s "$SERIAL" shell "$@"
}

should_run_flow() {
  local flow_name="$1"
  [[ -z "$FLOW_FILTER" || ",$FLOW_FILTER," == *",$flow_name,"* ]]
}

run_flow() {
  local flow_name="$1"
  shift
  if should_run_flow "$flow_name"; then
    "$@"
  fi
}

cleanup() {
  if [[ -n "$STARTED_EMULATOR_PID" ]]; then
    "$ADB" -s "$SERIAL" emu kill >/dev/null 2>&1 || true
    wait "$STARTED_EMULATOR_PID" 2>/dev/null || true
  fi

  if [[ "$CREATED_TEMP_AVD" == "true" ]]; then
    rm -rf "$TMP_AVD_DIR" "$TMP_AVD_INI"
  fi
}
trap cleanup EXIT

choose_attached_device() {
  "$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }'
}

create_temp_avd() {
  local sysdir="$ANDROID_SDK/system-images/android-36.1/google_apis_playstore/arm64-v8a"
  require_file "$sysdir/system.img"
  mkdir -p "$TMP_AVD_DIR"

  cat > "$TMP_AVD_INI" <<EOF
avd.ini.encoding=UTF-8
path=$TMP_AVD_DIR
path.rel=avd/${TMP_AVD_NAME}.avd
target=android-36.1
EOF

  cat > "$TMP_AVD_DIR/config.ini" <<EOF
AvdId=$TMP_AVD_NAME
PlayStore.enabled=true
abi.type=arm64-v8a
avd.ini.displayname=$TMP_AVD_NAME
disk.dataPartition.size=2048M
fastboot.forceColdBoot=yes
hw.audioInput=no
hw.camera.back=none
hw.camera.front=none
hw.cpu.arch=arm64
hw.cpu.ncore=2
hw.gpu.enabled=yes
hw.gpu.mode=swiftshader_indirect
hw.keyboard=yes
hw.lcd.density=320
hw.lcd.height=1280
hw.lcd.width=720
hw.ramSize=1536
image.sysdir.1=system-images/android-36.1/google_apis_playstore/arm64-v8a/
runtime.network.latency=none
runtime.network.speed=full
showDeviceFrame=no
tag.display=Google Play
tag.id=google_apis_playstore
vm.heapSize=256
EOF

  CREATED_TEMP_AVD="true"
}

boot_temp_emulator() {
  SERIAL="emulator-5580"
  "$EMULATOR" @"$TMP_AVD_NAME" \
    -no-window \
    -no-audio \
    -no-boot-anim \
    -no-snapshot \
    -wipe-data \
    -memory 1536 \
    -cores 2 \
    -gpu swiftshader_indirect \
    -no-metrics \
    -ports 5580,5581 \
    >/tmp/everybible-android-perf-emulator.log 2>&1 &
  STARTED_EMULATOR_PID="$!"

  for _ in $(seq 1 90); do
    local booted
    booted="$("$ADB" -s "$SERIAL" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)"
    if [[ "$booted" == "1" ]]; then
      adb_shell input keyevent 82 >/dev/null 2>&1 || true
      return
    fi
    sleep 2
  done

  echo "Timed out waiting for emulator boot. See /tmp/everybible-android-perf-emulator.log" >&2
  exit 1
}

dump_ui_xml() {
  local output="$1"
  run_with_timeout "$UI_DUMP_TIMEOUT_SECONDS" "$ADB" -s "$SERIAL" shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || return 1
  run_with_timeout "$UI_DUMP_TIMEOUT_SECONDS" "$ADB" -s "$SERIAL" shell cat /sdcard/window.xml > "$output" 2>/dev/null || return 1
}

poll_content() {
  local pattern="$1"
  local start
  start="$(now_ms)"
  for _ in $(seq 1 "$UI_POLL_ATTEMPTS"); do
    if dump_ui_xml /tmp/everybible-android-perf-window.xml; then
      if rg -q "$pattern" /tmp/everybible-android-perf-window.xml; then
        local end
        end="$(now_ms)"
        echo "$((end - start))"
        return 0
      fi
    fi
    sleep 0.2
  done
  return 1
}

poll_content_without() {
  local include_pattern="$1"
  local exclude_pattern="$2"
  local start
  start="$(now_ms)"
  for _ in $(seq 1 "$UI_POLL_ATTEMPTS"); do
    if dump_ui_xml /tmp/everybible-android-perf-window.xml; then
      if rg -q "$include_pattern" /tmp/everybible-android-perf-window.xml &&
        ! rg -q "$exclude_pattern" /tmp/everybible-android-perf-window.xml; then
        local end
        end="$(now_ms)"
        echo "$((end - start))"
        return 0
      fi
    fi
    sleep 0.2
  done
  return 1
}

tap_matching_ui() {
  local pattern="$1"
  local fallback_x="$2"
  local fallback_y="$3"
  local window_xml="/tmp/everybible-android-perf-window.xml"
  local center=""

  if dump_ui_xml "$window_xml"; then
    center="$(
      python3 - "$window_xml" "$pattern" <<'PY'
import html
import re
import sys

path, pattern = sys.argv[1], sys.argv[2]
source = open(path, encoding="utf-8", errors="ignore").read()
matcher = re.compile(pattern, re.I)
candidates = []

for index, node in enumerate(re.findall(r"<node\b[^>]*>", source)):
    text_match = re.search(r'text="([^"]*)"', node)
    desc_match = re.search(r'content-desc="([^"]*)"', node)
    label = " ".join(
        html.unescape(match.group(1))
        for match in (text_match, desc_match)
        if match and match.group(1)
    )
    if not label or not matcher.search(label):
        continue

    bounds_match = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', node)
    if not bounds_match:
        continue

    x1, y1, x2, y2 = map(int, bounds_match.groups())
    if x2 <= x1 or y2 <= y1:
        continue

    clickable = 'clickable="true"' in node
    area = (x2 - x1) * (y2 - y1)
    candidates.append((0 if clickable else 1, -area, index, x1, y1, x2, y2))

if candidates:
    _, _, _, x1, y1, x2, y2 = sorted(candidates)[0]
    print(f"{(x1 + x2) // 2} {(y1 + y2) // 2}")
PY
    )"
  fi

  if [[ -n "$center" ]]; then
    adb_shell input tap $center >/dev/null 2>&1 || true
  else
    adb_shell input tap "$fallback_x" "$fallback_y" >/dev/null 2>&1 || true
  fi
}

reset_gfxinfo() {
  adb_shell dumpsys gfxinfo "$PACKAGE_NAME" reset >/dev/null 2>&1 || true
}

open_reader_translation_picker() {
  for tap_point in "212 128" "236 128" "212 154"; do
    adb_shell input tap $tap_point >/dev/null 2>&1 || true
    sleep 0.7
    if poll_content "Select Translation|My Translations|Available|translation-picker-search" >/dev/null; then
      return 0
    fi
  done

  tap_matching_ui "BSB|Berean|Standard" 212 128
  poll_content "Select Translation|My Translations|Available|translation-picker-search" >/dev/null
}

prepare_bible_browser() {
  prepare_fresh_onboarded_home
  adb_shell input tap 216 1185 >/dev/null 2>&1 || true
  poll_content "Old Testament|Genesis|Exodus|Bible" >/dev/null || true
}

open_browser_translation_picker() {
  adb_shell input tap 570 140 >/dev/null 2>&1 || true
  sleep 1.2
  poll_content "Select Translation|My Translations|Available|translation-picker-search" >/dev/null
}

get_gfxinfo_summary() {
  local output
  output="$(adb_shell dumpsys gfxinfo "$PACKAGE_NAME" 2>/dev/null || true)"

  GFXINFO_OUTPUT="$output" python3 - <<'PY'
import os
import re

source = os.environ.get("GFXINFO_OUTPUT", "")

def value(pattern: str, default: str = "NA") -> str:
    match = re.search(pattern, source, re.I)
    return match.group(1) if match else default

total_frames = value(r"Total frames rendered:\s*([0-9]+)")
janky_frames = value(r"Janky frames:\s*([0-9]+)")
janky_percent = value(r"Janky frames:\s*[0-9]+\s*\(([0-9.]+)%\)")
p50 = value(r"50th percentile:\s*([0-9]+)ms")
p90 = value(r"90th percentile:\s*([0-9]+)ms")
p95 = value(r"95th percentile:\s*([0-9]+)ms")
p99 = value(r"99th percentile:\s*([0-9]+)ms")

print(
    "gfxTotalFrames="
    + total_frames
    + ",gfxJankyFrames="
    + janky_frames
    + ",gfxJankyPercent="
    + janky_percent
    + ",gfxP50Ms="
    + p50
    + ",gfxP90Ms="
    + p90
    + ",gfxP95Ms="
    + p95
    + ",gfxP99Ms="
    + p99
)
PY
}

complete_onboarding_if_needed() {
  for _ in $(seq 1 8); do
    dump_ui_xml /tmp/everybible-android-perf-window.xml || return 0
    if ! rg -q "Set Up Your Bible Experience|Step [0-9]+ of [0-9]+" /tmp/everybible-android-perf-window.xml; then
      return 0
    fi

    if rg -q "Berean Standard Bible|Public-domain Berean|onboarding-translation-search|Translations" /tmp/everybible-android-perf-window.xml; then
      tap_matching_ui "Berean Standard Bible|BSB|Public-domain Berean" 360 430
      sleep 2.5
      continue
    fi

    tap_matching_ui "English|United States|Nepal|Español|Spanish" 360 360
    sleep 0.5
    tap_matching_ui "Continue|Get Started|Start|Done|Finish" 500 1160
    sleep 1.2
  done
}

prepare_fresh_onboarded_home() {
  adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
  adb_shell pm clear "$PACKAGE_NAME" >/dev/null 2>&1 || true
  adb_shell am start -W -n "$ACTIVITY" >/dev/null 2>&1 || true
  sleep 2
  complete_onboarding_if_needed
  poll_content "VERSE OF THE DAY|Foundations 1|Home" >/dev/null || true
}

measure_start() {
  local label="$1"
  shift
  echo "## $label am_start"
  for run in $(seq 1 "$RUNS"); do
    adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
    sleep 0.5
    local output
    output="$(adb_shell "$@" 2>/dev/null || true)"
    local status launch total wait
    status="$(printf '%s\n' "$output" | awk -F': ' '/Status/ { print $2; exit }')"
    launch="$(printf '%s\n' "$output" | awk -F': ' '/LaunchState/ { print $2; exit }')"
    total="$(printf '%s\n' "$output" | awk -F': ' '/TotalTime/ { print $2; exit }')"
    wait="$(printf '%s\n' "$output" | awk -F': ' '/WaitTime/ { print $2; exit }')"
    echo "$run,status=${status:-NA},launch=${launch:-NA},totalMs=${total:-NA},waitMs=${wait:-NA}"
    sleep 1
  done
}

measure_content_ready() {
  local label="$1"
  local pattern="$2"
  shift 2
  echo "## $label content_ready"
  for run in $(seq 1 "$CONTENT_RUNS"); do
    adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
    sleep 0.5
    local start_output
    start_output="$(adb_shell "$@" 2>/dev/null || true)"
    local total
    total="$(printf '%s\n' "$start_output" | awk -F': ' '/TotalTime/ { print $2; exit }')"
    local content_ms="NA"
    local found="false"
    if content_ms="$(poll_content "$pattern")"; then
      found="true"
    fi
    if [[ -z "$content_ms" ]]; then
      content_ms="NA"
    fi
    echo "$run,contentMs=$content_ms,amTotalMs=${total:-NA},found=$found"
    sleep 1
  done
}

measure_tab_to_reader() {
  echo "## bible_tab_to_reader content_ready"
  adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
  adb_shell am start -W -n "$ACTIVITY" >/dev/null 2>&1 || true
  poll_content "VERSE OF THE DAY|Home" >/dev/null || true

  for run in $(seq 1 "$CONTENT_RUNS"); do
    adb_shell input tap 72 1160 >/dev/null 2>&1 || true
    sleep 0.4
    local start
    start="$(now_ms)"
    adb_shell input tap 216 1160 >/dev/null 2>&1 || true
    local content_ms="NA"
    local found="false"
    if content_ms="$(poll_content "John|Genesis|Previous chapter|Play chapter audio")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$content_ms" || "$content_ms" == "NA" ]]; then
      content_ms="$((end - start))"
    fi
    echo "$run,contentMs=$content_ms,found=$found"
    sleep 1
  done
}

measure_bible_browser_tab_open() {
  echo "## bible_browser_tab_open content_ready"
  for run in $(seq 1 "$CONTENT_RUNS"); do
    prepare_fresh_onboarded_home

    local start
    start="$(now_ms)"
    tap_matching_ui "Bible" 216 1160

    local content_ms="NA"
    local found="false"
    if content_ms="$(poll_content "Old Testament|Genesis|Exodus|Bible")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$content_ms" || "$content_ms" == "NA" ]]; then
      content_ms="$((end - start))"
    fi
    echo "$run,contentMs=$content_ms,found=$found"
    sleep 1
  done
}

measure_bible_browser_scroll() {
  echo "## bible_browser_scroll command_response"
  prepare_fresh_onboarded_home
  tap_matching_ui "Bible" 216 1160
  poll_content "Old Testament|Genesis|Exodus|Bible" >/dev/null || true

  for run in $(seq 1 "$CONTENT_RUNS"); do
    local start
    start="$(now_ms)"
    reset_gfxinfo
    adb_shell input swipe 360 1040 360 320 450 >/dev/null 2>&1 || true
    adb_shell input swipe 360 1040 360 320 450 >/dev/null 2>&1 || true
    local settled_ms="NA"
    local found="false"
    if settled_ms="$(poll_content "Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$settled_ms" || "$settled_ms" == "NA" ]]; then
      settled_ms="$((end - start))"
    fi
    local gfxinfo
    gfxinfo="$(get_gfxinfo_summary)"
    echo "$run,settledMs=$settled_ms,found=$found,$gfxinfo"
    sleep 1
  done
}

measure_reader_next_chapter() {
  echo "## reader_next_chapter content_ready"
  for run in $(seq 1 "$CONTENT_RUNS"); do
    adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
    adb_shell am start -W -a android.intent.action.VIEW -d com.everybible.app://bible/john/3 "$PACKAGE_NAME" >/dev/null 2>&1 || true
    poll_content "John 3|For God|Previous chapter|Play chapter audio" >/dev/null || true

    local start
    start="$(now_ms)"
    tap_matching_ui "Next chapter|Goes to the next chapter" 500 1046

    local content_ms="NA"
    local found="false"
    if content_ms="$(poll_content "John 4|The Pharisees|Previous chapter|Play chapter audio")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$content_ms" || "$content_ms" == "NA" ]]; then
      content_ms="$((end - start))"
    fi
    echo "$run,contentMs=$content_ms,found=$found"
    sleep 1
  done
}

measure_reader_search() {
  echo "## reader_search query_ready"
  for run in $(seq 1 "$CONTENT_RUNS"); do
    adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
    adb_shell am start -W -a android.intent.action.VIEW -d com.everybible.app://bible/john/3 "$PACKAGE_NAME" >/dev/null 2>&1 || true
    poll_content "John 3|For God|Previous chapter|Play chapter audio" >/dev/null || true

    local start
    start="$(now_ms)"
    tap_matching_ui "Search" 540 128
    sleep 0.2
    adb_shell input text love >/dev/null 2>&1 || true

    local query_ms="NA"
    local found="false"
    if query_ms="$(poll_content "love|Search|John 3:16|For God")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$query_ms" || "$query_ms" == "NA" ]]; then
      query_ms="$((end - start))"
    fi
    echo "$run,queryMs=$query_ms,found=$found"
    sleep 1
  done
}

measure_reader_search_no_results() {
  echo "## reader_search_no_results query_settled"
  for run in $(seq 1 "$CONTENT_RUNS"); do
    adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
    adb_shell am start -W -a android.intent.action.VIEW -d com.everybible.app://bible/john/3 "$PACKAGE_NAME" >/dev/null 2>&1 || true
    poll_content "John 3|For God|Previous chapter|Play chapter audio" >/dev/null || true

    local start
    start="$(now_ms)"
    tap_matching_ui "Search" 540 128
    sleep 0.2
    adb_shell input text zzzqxzv >/dev/null 2>&1 || true

    local settled_ms="NA"
    local found="false"
    if settled_ms="$(poll_content_without "zzzqxzv|Search" "android.widget.ProgressBar")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$settled_ms" || "$settled_ms" == "NA" ]]; then
      settled_ms="$((end - start))"
    fi
    echo "$run,settledMs=$settled_ms,found=$found"
    sleep 1
  done
}

measure_reader_audio_start() {
  echo "## reader_audio first_control_response"
  for run in $(seq 1 "$CONTENT_RUNS"); do
    adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
    adb_shell am start -W -a android.intent.action.VIEW -d com.everybible.app://bible/john/3 "$PACKAGE_NAME" >/dev/null 2>&1 || true
    poll_content "John 3|For God|Previous chapter|Play chapter audio" >/dev/null || true

    local start
    start="$(now_ms)"
    tap_matching_ui "Play chapter audio|Pause chapter audio" 360 1046

    local audio_ms="NA"
    local found="false"
    if audio_ms="$(poll_content "Pause chapter audio|Pause|Loading|0:0|Stop")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$audio_ms" || "$audio_ms" == "NA" ]]; then
      audio_ms="$((end - start))"
    fi
    echo "$run,responseMs=$audio_ms,found=$found"
    sleep 1
  done
}

measure_translation_picker_open() {
  echo "## translation_picker_open content_ready"
  for run in $(seq 1 "$CONTENT_RUNS"); do
    prepare_bible_browser

    local start
    start="$(now_ms)"
    open_browser_translation_picker

    local content_ms="NA"
    local found="false"
    if content_ms="$(poll_content "Select Translation|My Translations|Available|translation-picker-search")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$content_ms" || "$content_ms" == "NA" ]]; then
      content_ms="$((end - start))"
    fi
    echo "$run,contentMs=$content_ms,found=$found"
    sleep 1
  done
}

measure_translation_picker_scroll() {
  echo "## translation_picker_scroll command_response"
  prepare_bible_browser
  open_browser_translation_picker || true

  for run in $(seq 1 "$CONTENT_RUNS"); do
    local start
    start="$(now_ms)"
    reset_gfxinfo
    adb_shell input swipe 360 1040 360 360 450 >/dev/null 2>&1 || true
    adb_shell input swipe 360 1040 360 360 450 >/dev/null 2>&1 || true
    local settled_ms="NA"
    local found="false"
    if settled_ms="$(poll_content "World English Bible|King James Version|American Standard Version|WEB|KJV|ASV")"; then
      found="true"
    fi
    local end
    end="$(now_ms)"
    if [[ -z "$settled_ms" || "$settled_ms" == "NA" ]]; then
      settled_ms="$((end - start))"
    fi
    local gfxinfo
    gfxinfo="$(get_gfxinfo_summary)"
    echo "$run,settledMs=$settled_ms,found=$found,$gfxinfo"
    sleep 1
  done
}

require_file "$ADB"
require_file "$EMULATOR"
require_file "$APK_PATH"

if [[ -z "$SERIAL" ]]; then
  SERIAL="$(choose_attached_device)"
fi

if [[ -z "$SERIAL" ]]; then
  create_temp_avd
  boot_temp_emulator
fi

echo "# EveryBible Android Perf Smoke"
echo "serial=$SERIAL"
echo "apk=$APK_PATH"
echo "runs=$RUNS contentRuns=$CONTENT_RUNS"
echo "flowFilter=${FLOW_FILTER:-all}"

"$ADB" -s "$SERIAL" install -r "$APK_PATH" >/dev/null
adb_shell am force-stop "$PACKAGE_NAME" >/dev/null 2>&1 || true
adb_shell pm clear "$PACKAGE_NAME" >/dev/null 2>&1 || true
adb_shell am start -W -n "$ACTIVITY" >/dev/null 2>&1 || true
sleep 2
complete_onboarding_if_needed

run_flow home_start measure_start home am start -W -n "$ACTIVITY"
run_flow reader_deeplink_start measure_start reader_deeplink am start -W -a android.intent.action.VIEW -d com.everybible.app://bible/john/3 "$PACKAGE_NAME"
run_flow home_content measure_content_ready home "VERSE OF THE DAY|Foundations 1|Home" am start -W -n "$ACTIVITY"
run_flow reader_deeplink_content measure_content_ready reader_deeplink "John 3|For God|Previous chapter|Play chapter audio" am start -W -a android.intent.action.VIEW -d com.everybible.app://bible/john/3 "$PACKAGE_NAME"
run_flow bible_tab_to_reader measure_tab_to_reader
run_flow bible_browser_tab_open measure_bible_browser_tab_open
run_flow bible_browser_scroll measure_bible_browser_scroll
run_flow reader_next_chapter measure_reader_next_chapter
run_flow reader_search measure_reader_search
run_flow reader_search_no_results measure_reader_search_no_results
run_flow reader_audio_start measure_reader_audio_start
run_flow translation_picker_open measure_translation_picker_open
run_flow translation_picker_scroll measure_translation_picker_scroll
