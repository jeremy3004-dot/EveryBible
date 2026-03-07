#!/bin/bash

# Image Processing Script for Tibetan Illustrations
# Generates @1x, @2x, @3x variants and optimizes file sizes

set -e

ASSET_DIR="/Users/dev/Projects/EveryBible/assets/tibetan"
SOURCE_DIR="${ASSET_DIR}/originals"
OUTPUT_DIR="${ASSET_DIR}"

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================="
echo "Tibetan Illustration Processing Script"
echo "========================================="
echo ""

# Check if ImageMagick is installed
if ! command -v convert &> /dev/null; then
    echo -e "${RED}Error: ImageMagick is not installed.${NC}"
    echo "Install with: brew install imagemagick"
    exit 1
fi

# Check if optipng is installed (optional but recommended)
if ! command -v optipng &> /dev/null; then
    echo -e "${YELLOW}Warning: optipng is not installed. Skipping PNG optimization.${NC}"
    echo "Install with: brew install optipng"
    OPTIMIZE=false
else
    OPTIMIZE=true
fi

# Create directories
mkdir -p "${SOURCE_DIR}"
mkdir -p "${OUTPUT_DIR}"

# Image list
IMAGES=(
    "home-hero"
    "field-entry"
    "field-gospel"
    "field-discipleship"
    "field-church"
    "field-multiplication"
    "journey-complete"
)

# Check if source images exist
echo "Checking for source images in ${SOURCE_DIR}..."
MISSING_COUNT=0
for img in "${IMAGES[@]}"; do
    if [ ! -f "${SOURCE_DIR}/${img}.png" ]; then
        echo -e "${RED}Missing: ${img}.png${NC}"
        ((MISSING_COUNT++))
    else
        echo -e "${GREEN}Found: ${img}.png${NC}"
    fi
done

if [ $MISSING_COUNT -gt 0 ]; then
    echo ""
    echo -e "${RED}Error: ${MISSING_COUNT} source image(s) missing.${NC}"
    echo "Please place all generated images in: ${SOURCE_DIR}"
    echo "Expected files:"
    for img in "${IMAGES[@]}"; do
        echo "  - ${img}.png"
    done
    exit 1
fi

echo ""
echo "All source images found. Starting processing..."
echo ""

# Process each image
for img in "${IMAGES[@]}"; do
    echo "========================================="
    echo "Processing: ${img}.png"
    echo "========================================="

    SOURCE="${SOURCE_DIR}/${img}.png"

    # Get source dimensions
    SOURCE_WIDTH=$(identify -format "%w" "${SOURCE}")
    SOURCE_HEIGHT=$(identify -format "%h" "${SOURCE}")
    echo "Source dimensions: ${SOURCE_WIDTH}x${SOURCE_HEIGHT}"

    # Calculate target dimensions (assuming source is @3x = 5760x3240)
    # @1x = 1920x1080
    # @2x = 3840x2160
    # @3x = 5760x3240

    # Determine if source is correct size for @3x
    if [ $SOURCE_WIDTH -eq 5760 ] && [ $SOURCE_HEIGHT -eq 3240 ]; then
        echo "Source is correct @3x size"
        SCALE_FROM="3x"
    elif [ $SOURCE_WIDTH -eq 3840 ] && [ $SOURCE_HEIGHT -eq 2160 ]; then
        echo "Source is @2x size, will scale accordingly"
        SCALE_FROM="2x"
    elif [ $SOURCE_WIDTH -eq 1920 ] && [ $SOURCE_HEIGHT -eq 1080 ]; then
        echo "Source is @1x size, will scale accordingly"
        SCALE_FROM="1x"
    else
        echo -e "${YELLOW}Warning: Unusual dimensions. Scaling from largest to maintain quality.${NC}"
        SCALE_FROM="custom"
    fi

    # Generate @1x (1920x1080)
    echo "  Generating @1x (1920x1080)..."
    convert "${SOURCE}" -resize 1920x1080! "${OUTPUT_DIR}/${img}.png"

    # Generate @2x (3840x2160)
    echo "  Generating @2x (3840x2160)..."
    convert "${SOURCE}" -resize 3840x2160! "${OUTPUT_DIR}/${img}@2x.png"

    # Generate @3x (5760x3240)
    echo "  Generating @3x (5760x3240)..."
    if [ "$SCALE_FROM" = "3x" ]; then
        cp "${SOURCE}" "${OUTPUT_DIR}/${img}@3x.png"
    else
        convert "${SOURCE}" -resize 5760x3240! "${OUTPUT_DIR}/${img}@3x.png"
    fi

    # Optimize PNGs if optipng is available
    if [ "$OPTIMIZE" = true ]; then
        echo "  Optimizing with optipng..."
        optipng -quiet -o2 "${OUTPUT_DIR}/${img}.png"
        optipng -quiet -o2 "${OUTPUT_DIR}/${img}@2x.png"
        optipng -quiet -o2 "${OUTPUT_DIR}/${img}@3x.png"
    fi

    # Show file sizes
    SIZE_1X=$(du -h "${OUTPUT_DIR}/${img}.png" | cut -f1)
    SIZE_2X=$(du -h "${OUTPUT_DIR}/${img}@2x.png" | cut -f1)
    SIZE_3X=$(du -h "${OUTPUT_DIR}/${img}@3x.png" | cut -f1)

    echo "  File sizes:"
    echo "    @1x: ${SIZE_1X}"
    echo "    @2x: ${SIZE_2X}"
    echo "    @3x: ${SIZE_3X}"

    # Check if @1x exceeds 500KB target
    SIZE_1X_BYTES=$(stat -f%z "${OUTPUT_DIR}/${img}.png")
    if [ $SIZE_1X_BYTES -gt 512000 ]; then
        echo -e "    ${YELLOW}Warning: @1x exceeds 500KB target${NC}"
    else
        echo -e "    ${GREEN}@1x within 500KB target${NC}"
    fi

    echo ""
done

echo "========================================="
echo "Processing Complete!"
echo "========================================="
echo ""
echo "Generated files are in: ${OUTPUT_DIR}"
echo ""
echo "Next steps:"
echo "1. Review cultural-review-checklist.md for each image"
echo "2. Test images in React Native app on both iOS and Android"
echo "3. Verify all images meet <500KB target for @1x versions"
echo "4. Get cultural validation from Tibetan community member"
echo ""
