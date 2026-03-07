# App Store Screenshots Guide

## Current Status

### Captured Screenshots (iOS)
Located in `ios/` folder:
1. `0_splash_screen.png` - App splash/loading screen
2. `1_bible_browser.png` - Bible book browser (Old/New Testament)
3. `2_home_screen.png` - Home screen with Verse of the Day

### Screenshot Dimensions
- Current: **1206 x 2622** (iPhone 17 Pro simulator @3x)
- App Store 6.7" required: **1290 x 2796** (iPhone 15/16 Pro Max)
- App Store 6.5" required: **1284 x 2778** (iPhone 14 Plus)

## Remaining Screenshots Needed

### For iOS (5-10 screenshots recommended)
- [ ] Bible Reader (showing verses)
- [ ] Audio Player controls active
- [ ] Harvest/Four Fields Journey screen
- [ ] Settings screen
- [ ] Sign-in screen (showing Google/Apple buttons)

### For Android
- [ ] All above screens at 1080x1920+ resolution
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

## Store Metadata Files
Store listing metadata is in:
- `../ios/` - iOS App Store metadata
- `../android/` - Google Play Store metadata
