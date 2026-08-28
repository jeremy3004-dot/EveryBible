#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
pack_dir="$repo_root/store-metadata/screenshots/ios/iphone-69-2026-08-28"
source_dir="$pack_dir/source"
work_dir="$pack_dir/work"
font_regular="$repo_root/assets/fonts/AlteHaasGrotesk-Regular.ttf"
font_bold="$repo_root/assets/fonts/AlteHaasGrotesk-Bold.ttf"
frame="$source_dir/device-frame.png"

mkdir -p "$work_dir"

render_slide() {
  local number="$1"
  local slug="$2"
  local headline="$3"
  local headline_color="$4"
  local label_color="$5"
  local background="$source_dir/backgrounds/$number.png"
  local screen="$source_dir/screens/$number-$slug.png"
  local base="$work_dir/$number-base.png"
  local rounded_screen="$work_dir/$number-screen.png"
  local shadow="$work_dir/$number-shadow.png"
  local label="$work_dir/$number-label.png"
  local headline_image="$work_dir/$number-headline.png"
  local output="$pack_dir/$number-$slug.png"

  magick "$background" \
    -resize '1320x2868^' \
    -gravity center \
    -extent 1320x2868 \
    -colorspace sRGB \
    "$base"

  magick "$screen" \
    -resize '918x1990!' \
    \( -size 918x1990 xc:none -fill white -draw 'roundrectangle 0,0 917,1989 126,126' \) \
    -alpha off \
    -compose CopyOpacity \
    -composite \
    "$rounded_screen"

  magick -size 1022x2082 xc:none \
    -fill 'rgba(6,12,20,0.48)' \
    -draw 'roundrectangle 18,18 1004,2064 110,110' \
    -blur 0x28 \
    "$shadow"

  magick -size 1180x84 \
    -background none \
    -font "$font_regular" \
    -fill "$label_color" \
    -pointsize 36 \
    -kerning 8 \
    -gravity center \
    caption:'EVERY BIBLE' \
    "$label"

  magick -size 1180x460 \
    -background none \
    -font "$font_bold" \
    -fill "$headline_color" \
    -pointsize 128 \
    -interline-spacing -18 \
    -gravity center \
    caption:"$headline" \
    "$headline_image"

  magick "$base" \
    "$shadow" -geometry +149+728 -compose over -composite \
    "$frame" -geometry +149+710 -compose over -composite \
    "$rounded_screen" -geometry +201+756 -compose over -composite \
    "$label" -geometry +70+76 -compose over -composite \
    "$headline_image" -geometry +70+154 -compose over -composite \
    -background white \
    -alpha remove \
    -alpha off \
    -colorspace sRGB \
    -strip \
    "$output"
}

render_slide '01' 'home' $'Start each day\nin Scripture' '#102334' '#247DB4'
render_slide '02' 'bible' $'Read without\ndistraction' '#F7F1E6' '#62B9E9'
render_slide '03' 'gather' $'Grow as\na disciple' '#102334' '#247DB4'
render_slide '04' 'plans' $'Build a\ndaily rhythm' '#102334' '#247DB4'

magick montage \
  "$pack_dir/01-home.png" \
  "$pack_dir/02-bible.png" \
  "$pack_dir/03-gather.png" \
  "$pack_dir/04-plans.png" \
  -font "$font_regular" \
  -thumbnail 330x717 \
  -tile 2x2 \
  -geometry +12+12 \
  -background '#E9E3D9' \
  "$pack_dir/contact-sheet.png"
