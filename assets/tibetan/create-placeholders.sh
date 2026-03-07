#!/bin/bash
# Create placeholder images for Tibetan illustrations

# Create originals directory
mkdir -p originals

# Use ImageMagick to create simple placeholder PNGs with labels
for img in "home-hero" "field-entry" "field-gospel" "field-discipleship" "field-church" "field-multiplication" "journey-complete"; do
  # Create 1920x1080 placeholder with gradient and text
  magick -size 1920x1080 \
    gradient:'#8B2635-#D4A017' \
    -gravity center \
    -pointsize 72 \
    -fill white \
    -annotate +0+0 "${img}\n(placeholder)" \
    originals/${img}.png
done

echo "Created 7 placeholder images in originals/"
ls -lh originals/
