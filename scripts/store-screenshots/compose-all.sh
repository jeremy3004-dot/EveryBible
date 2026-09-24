#!/usr/bin/env bash
# Frame every raw capture in a dated store-assets folder for both App Store iPhone slots.
#
#   compose-all.sh [assets-dir]
#
# assets-dir defaults to ~/Downloads/everybible-store-assets/2026-09-24 and must contain
# iphone-6.9-raw/*.png (1320x2868 captures from an iPhone 17 Pro Max simulator).
# Writes iphone-6.9-framed/ (1320x2868, APP_IPHONE_67/69) and iphone-6.5-framed/
# (1242x2688, APP_IPHONE_65). Captures whose name ends in -dark get the ink canvas.
set -euo pipefail

dir="${1:-$HOME/Downloads/everybible-store-assets/2026-09-24}"
here="$(cd "$(dirname "$0")" && pwd)"

headline() {
  case "$1" in
    01-home-*) echo "Start each day|in Scripture" ;;
    02-reader-highlight-*) echo "Highlight what|speaks to you" ;;
    03-audio-listening-*) echo "Listen and|follow along" ;;
    04-plan-heatmap-*) echo "Read the Bible|in a year" ;;
    05-gather-*) echo "Grow with|Foundations" ;;
    06-search-*) echo "Find any verse|in seconds" ;;
    07-translation-picker-*) echo "Your Bible,|even offline" ;;
    08-settings-*) echo "Light or dark,|your way" ;;
    *) echo "" ;;
  esac
}

mkdir -p "$dir/iphone-6.9-framed" "$dir/iphone-6.5-framed"
for raw in "$dir"/iphone-6.9-raw/*.png; do
  name="$(basename "$raw" .png)"
  text="$(headline "$name")"
  if [ -z "$text" ]; then
    echo "skip $name (no headline mapped)"
    continue
  fi
  mode=light
  case "$name" in *-dark) mode=dark ;; esac
  "$here/compose.sh" "$raw" "$dir/iphone-6.9-framed/$name.png" "${text%%|*}" "${text#*|}" "$mode" 1320x2868
  "$here/compose.sh" "$raw" "$dir/iphone-6.5-framed/$name.png" "${text%%|*}" "${text#*|}" "$mode" 1242x2688
done
