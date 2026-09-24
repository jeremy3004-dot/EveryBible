#!/usr/bin/env bash
# Compose a framed App Store screenshot from a raw simulator capture.
#
#   compose.sh <raw.png> <out.png> "<headline line 1>" "<headline line 2>" [light|dark] [WxH]
#
# Layout matches the set live on the App Store since 2026-09-09: vellum canvas,
# terracotta "EVERY BIBLE" eyebrow, two-line Alte Haas Bold headline, and the
# device capture at 76% of canvas width with rounded corners, bleeding off the
# bottom edge. `dark` swaps to an ink canvas for dark-theme captures.
# WxH defaults to 1320x2868 (APP_IPHONE_67/69); pass 1242x2688 for APP_IPHONE_65.
#
# Requires ImageMagick 7 (`magick`). Rounded corners use the DstIn form; the
# CopyOpacity form silently produces an empty layer on this machine.
set -euo pipefail

if [ "$#" -lt 4 ]; then
  sed -n '2,12p' "$0"
  exit 1
fi

raw="$1"; out="$2"; line1="$3"; line2="$4"; mode="${5:-light}"; size="${6:-1320x2868}"
W="${size%x*}"; H="${size#*x}"

root="$(cd "$(dirname "$0")/../.." && pwd)"
font="$root/assets/fonts/AlteHaasGrotesk-Bold.ttf"
eyebrow_font="$root/assets/fonts/AlteHaasGrotesk-Regular.ttf"

if [ "$mode" = "dark" ]; then
  canvas="#1B1916"; ink="#F0ECE5"; accent="#D9876F"; edge="#3A3631"
else
  canvas="#F0ECE5"; ink="#1B1916"; accent="#9F503B"; edge="#D8D2C8"
fi

# Every dimension scales with canvas width so the 6.5" variant keeps proportions.
s() { awk -v w="$W" -v f="$1" 'BEGIN { printf "%d", w * f / 1320 + 0.5 }'; }
dev_w=$(s 1003)
radius=$(s 88)
border=$(s 3)
eyebrow_pt=$(s 38)
head_pt=$(s 104)
eyebrow_y=$(s 110)
line1_y=$(s 230)
line2_y=$(s 400)
dev_y=$(s 686)

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

magick "$raw" -resize "${dev_w}x" "$tmp/dev.png"
dev_h=$(magick identify -format '%h' "$tmp/dev.png")
magick "$tmp/dev.png" -alpha set \
  \( +clone -alpha transparent -background none -fill white \
     -draw "roundrectangle 0,0,$((dev_w - 1)),$((dev_h - 1)),$radius,$radius" \) \
  -compose DstIn -composite "$tmp/round.png"
# Hairline edge so light captures don't melt into the vellum canvas.
magick -size "$((dev_w + 2 * border))x$((dev_h + 2 * border))" xc:none -fill "$edge" \
  -draw "roundrectangle 0,0,$((dev_w + 2 * border - 1)),$((dev_h + 2 * border - 1)),$((radius + border)),$((radius + border))" \
  "$tmp/edge.png"

magick -size "${W}x${H}" "xc:$canvas" \
  -font "$eyebrow_font" -pointsize "$eyebrow_pt" -fill "$accent" -kerning $(s 9) \
  -gravity north -annotate "+0+$eyebrow_y" "EVERY BIBLE" \
  -font "$font" -pointsize "$head_pt" -fill "$ink" -kerning 0 \
  -annotate "+0+$line1_y" "$line1" \
  -annotate "+0+$line2_y" "$line2" \
  -gravity northwest \
  "$tmp/edge.png" -geometry "+$(((W - dev_w) / 2 - border))+$((dev_y - border))" -composite \
  "$tmp/round.png" -geometry "+$(((W - dev_w) / 2))+$dev_y" -composite \
  -alpha off -depth 8 "$out"

echo "wrote $out ($(magick identify -format '%wx%h' "$out"))"
