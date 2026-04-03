# App Store Screenshots Guide

## Current Status

### Authoritative Submission Sets

Use only these final export folders for store submission:

- Apple App Store 6.7-inch: `ios/iphone-67-2026-04-03/`
- Apple App Store 6.5-inch: `ios/iphone-65-2026-04-03/`
- Google Play: `google-play/`

The polished 6.7-inch iOS pack is the master source. The 6.5-inch App Store pack and the Google Play pack are derived from it so both stores stay visually aligned.

### Upload-Ready iOS 6.7-inch Pack
Use the final 6.7-inch App Store set in:

- `ios/iphone-67-2026-04-03/`

Recommended upload order:
1. `01-read-offline.png`
2. `02-track-habit.png`
3. `03-highlight-verses.png`
4. `04-share-verse-cards.png`
5. `05-save-notes.png`
6. `06-grow-foundations.png`
7. `07-find-wisdom.png`

This pack was rebuilt on 2026-04-03 from the user-approved iPhone 17 Pro captures only.

### Upload-Ready iOS 6.5-inch Pack
Use the companion 6.5-inch App Store set in:

- `ios/iphone-65-2026-04-03/`

Recommended upload order matches the 6.7-inch pack:
1. `01-read-offline.png`
2. `02-track-habit.png`
3. `03-highlight-verses.png`
4. `04-share-verse-cards.png`
5. `05-save-notes.png`
6. `06-grow-foundations.png`
7. `07-find-wisdom.png`

### Authoritative Google Play Pack
Use the final Android / Google Play set in:

- `google-play/`

Recommended upload order:
1. `01-read-offline.png`
2. `02-track-habit.png`
3. `03-highlight-verses.png`
4. `04-share-verse-cards.png`
5. `05-save-notes.png`
6. `06-grow-foundations.png`
7. `07-find-wisdom.png`

Use the matching Play feature graphic:

- `google-play/feature-graphic.png`

### Approved Source Screenshots (iOS)
Raw simulator sources live in `ios/` and should be treated as source material, not the final upload set:
1. `1_bible_browser.png`
2. `2_home_screen.png`
3. `Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 12.52.43.png`
4. `Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 12.53.25.png`
5. `Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 12.53.52.png`
6. `Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 13.34.38.png`
7. `Simulator Screenshot - iPhone 17 Pro - 2026-04-03 at 13.34.54.png`

### Screenshot Dimensions
- Raw simulator captures: **1206 x 2622** (iPhone 17 Pro simulator @3x)
- Final iOS 6.7 pack: **1290 x 2796**
- Final iOS 6.5 pack: **1242 x 2688**
- Final Google Play pack: **1290 x 2796**
- App Store 6.7" required: **1290 x 2796** (iPhone 15/16 Pro Max)
- App Store 6.5" required: **1242 x 2688**

## Remaining Screenshots Needed

### For iOS
- [x] Bible Reader (showing verses)
- [x] Home / reading habit screen
- [x] Highlighting flow
- [x] Verse share card flow
- [x] Notes flow
- [x] Foundations screen
- [x] Wisdom screen
- [ ] Optional audio-player-specific marketing shot if we want an 8th screenshot

### For Android
- [x] All above screens at 1080x1920+ resolution
- [ ] Feature graphic: 1024 x 500

## How to Capture Remaining Screenshots

### Option 1: Manual Capture (Recommended)
1. Open Simulator app
2. Navigate to desired screen manually
3. Press **Cmd + S** to save screenshot
4. Screenshots save to Desktop by default

### Option 2: Use iPhone 15 Pro Max Simulator
For correct 6.7" dimensions:
```bash
# List available simulators
xcrun simctl list devices

# Boot iPhone 15 Pro Max if available
xcrun simctl boot "iPhone 15 Pro Max"

# Set clean status bar
xcrun simctl status_bar booted override \
  --time "9:41" \
  --batteryState charged \
  --batteryLevel 100 \
  --cellularMode active \
  --cellularBars 4

# Capture screenshot
xcrun simctl io booted screenshot ~/Desktop/screenshot.png
```

### Status Bar Best Practices
- Time: 9:41 (Apple's traditional demo time)
- Full battery (100%, charging icon)
- Full cellular signal (4 bars)
- Wi-Fi connected

## File Naming Convention
```
1_feature_name.png
2_feature_name.png
...
```

For final iOS marketing exports, use the zero-padded dash format already in `ios/iphone-67-2026-04-03/`.

## Store Metadata Files
Store listing metadata is in:
- `../ios/` - iOS App Store metadata
- `../android/` - Google Play Store metadata

Cross-store upload guidance:
- [AUTHORITATIVE.md](/Users/dev/Projects/EveryBible/store-metadata/screenshots/AUTHORITATIVE.md)
- [UPLOAD-CHECKLIST.md](/Users/dev/Projects/EveryBible/store-metadata/screenshots/UPLOAD-CHECKLIST.md)
