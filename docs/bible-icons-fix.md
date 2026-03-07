# Bible Book Icons Fix

## Problem
Bible book icons were not appearing in the BibleBrowserScreen.

## Root Cause
The icons were originally in WebP format, and while Expo SDK 54 / React Native 0.81 technically supports WebP:
- Metro bundler already includes 'webp' in assetExts by default
- WebP is supported on both iOS and Android

However, the issue was that React Native's automatic @2x/@3x resolution selection for multi-resolution assets works most reliably with PNG format. WebP assets with @2x/@3x variants may not be properly detected and loaded by the Image component's require() system.

## Solution
Converted all 198 WebP book icons to PNG format using the sharp library (already in project dependencies):
- Converted: gen.webp → gen.png
- Converted: gen@2x.webp → gen@2x.png
- Converted: gen@3x.webp → gen@3x.png
- (repeated for all 66 Bible books × 3 resolutions = 198 files)

Updated `/src/constants/bookIcons.ts` to require PNG files instead of WebP.

## Files Modified
1. `/Users/dev/Projects/EveryBible/metro.config.js` - Created with WebP support (already default in Expo)
2. `/Users/dev/Projects/EveryBible/src/constants/bookIcons.ts` - Changed all require() statements from .webp to .png
3. `/Users/dev/Projects/EveryBible/assets/book-icons/` - Added 198 PNG files converted from WebP

## Commands Used
```bash
# Convert WebP to PNG using sharp
node -e "
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function convertWebPToPNG() {
  const bookIconsDir = path.join(__dirname, 'assets', 'book-icons');
  const files = fs.readdirSync(bookIconsDir).filter(f => f.endsWith('.webp'));

  for (const file of files) {
    const inputPath = path.join(bookIconsDir, file);
    const outputPath = path.join(bookIconsDir, file.replace('.webp', '.png'));
    await sharp(inputPath).png().toFile(outputPath);
  }
}

convertWebPToPNG();
"

# Clear Metro cache
rm -rf node_modules/.cache .expo

# Rebuild app
npx expo run:ios --device "iPhone 17 Pro"
```

## Verification
After rebuilding the app:
- Navigate to Bible tab
- Toggle between Old Testament and New Testament
- Verify all 66 book icons appear correctly
- Icons should scale properly on different screen densities (@1x, @2x, @3x)

## File Size Impact
PNG files are slightly larger than WebP, but still small:
- Average WebP: ~2.5 KB per file
- Average PNG: ~5 KB per file
- Total increase: ~495 KB (198 files × ~2.5 KB difference)
- This is acceptable for better compatibility and reliability

## Alternative Solutions Considered
1. **Use expo-image instead of React Native Image** - Would require refactoring all Image components
2. **Use URI-based loading** - Would require hosting icons or base64 encoding, more complex
3. **Single resolution WebP** - Would lose high-DPI support for Retina displays
4. **SVG format** - Would require react-native-svg and different loading approach

PNG with @2x/@3x variants is the most battle-tested approach for React Native multi-resolution assets.

## Future Considerations
- If app bundle size becomes an issue, consider optimizing PNG files with tools like pngquant
- Could investigate expo-image for better WebP support in future versions
- Keep WebP files in assets directory as originals in case they're needed later

## Testing Checklist
- [x] WebP files exist and are valid
- [x] PNG files generated successfully
- [x] bookIcons.ts updated to reference PNG files
- [x] Metro config includes WebP support (default)
- [ ] iOS app builds successfully
- [ ] Icons appear in BibleBrowserScreen
- [ ] Icons scale correctly on different screen sizes
- [ ] No console errors related to image loading

## Date
2026-02-05
