# App Store screenshots, 2026-09-24

Fresh iPhone captures of the current app (main at `9e1a3f25`, version 1.0.9), taken from a
Release simulator build. **Nothing here has been uploaded to App Store Connect.** The images are
kept outside the repo in `~/Downloads/everybible-store-assets/2026-09-24/`.

## Output folders

| Folder | Size | App Store slot |
| --- | --- | --- |
| `iphone-6.9-raw/` | 1320x2868 | raw simulator captures (iPhone 17 Pro Max, iOS 26.5) |
| `iphone-6.9-framed/` | 1320x2868 | `APP_IPHONE_67` / `APP_IPHONE_69` (6.9", the required set) |
| `iphone-6.5-framed/` | 1242x2688 | `APP_IPHONE_65` (optional once a 6.9" set exists) |

`asc screenshots sizes --all` confirms 1320x2868 is accepted for the 6.9"/6.7" slots and 1242x2688
for 6.5". The 6.5" set is rebuilt from the 6.9" captures on a 1242x2688 canvas, so the device image
keeps its proportions and nothing is stretched.

## Files

Each name appears in all three folders. Files ending in `-dark` use the dark app theme and a dark
canvas.

| File | Screen | Headline (framed) |
| --- | --- | --- |
| `01-home-light.png` | Home: verse of the day (Romans 12:12), Continue card, Bible in One Year day 13, Foundations, 1-day streak | Start each day / in Scripture |
| `01-home-dark.png` | Same Home screen in the dark theme | Start each day / in Scripture |
| `02-reader-highlight-light.png` | Psalm 23 reader: verse 2 highlighted yellow, verse 1 selected with the highlight palette and Note/Copy/Share/Image actions | Highlight what / speaks to you |
| `03-audio-listening-dark.png` | John 1 playing chapter audio, verse 5 ("The Light shines in the darkness") marked as it is read | Listen and / follow along |
| `04-plan-heatmap-light.png` | Bible in One Year plan: day 13 of 365, 12 filled dots on the dot heatmap, today's reading and the ledger | Read the Bible / in a year |
| `04-plan-heatmap-dark.png` | Same plan screen in the dark theme | Read the Bible / in a year |
| `05-gather-light.png` | Gather: Discovery Bible Study, Up next lesson, the 7 Foundations | Grow with / Foundations |
| `05-gather-dark.png` | Same Gather screen in the dark theme | Grow with / Foundations |
| `06-search-light.png` | Bible search for "love one another" (John 13:34, Romans 12:10, 1 John 4:11, and more) | Find any verse / in seconds |
| `07-translation-picker-light.png` | Select Translation sheet: My Translations (BSB, ASV, NPB) and Available English | Your Bible, / even offline |
| `08-settings-light.png` | Settings: font size, Light/Dark theme, language, feedback, icon, reminder | Light or dark, / your way |
| `08-settings-dark.png` | Same Settings screen with Dark selected | Light or dark, / your way |

Suggested upload order (up to 10 per slot): 01-home-light, 02-reader-highlight-light,
03-audio-listening-dark, 04-plan-heatmap-light, 05-gather-light, 06-search-light,
07-translation-picker-light, 08-settings-dark.

Known content in the captures:

- The data comes from a fresh guest install. Plan days 2 to 12 were completed ahead of schedule to
  fill the heatmap, so the ledger dates for those days are future dates (Sep 25 to Oct 5).
- The simulator ran in Nepal (UTC+5:45), so Nepali Bible (NPB) appears under My Translations in
  the picker.
- The app was launched with `SIMCTL_CHILD_TZ=Europe/London` so the greeting says "Good morning" to
  match the 9:41 status bar.

## How to regenerate

1. Worktree setup: `git merge origin/main`, `npm ci` (check that patch-package applies all 4
   patches), copy `.env` from the main checkout, then `cd ios && LANG=en_US.UTF-8 pod install`.
2. Build a Release simulator app with ad-hoc signing (no EAS):

   ```bash
   cd ios && LANG=en_US.UTF-8 xcodebuild -workspace EveryBible.xcworkspace -scheme EveryBible \
     -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
     -derivedDataPath <scratch>/dd CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO build
   ```

3. Create and boot a dedicated simulator, and set the marketing status bar:

   ```bash
   xcrun simctl create "EB Shots 6.9" com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max \
     com.apple.CoreSimulator.SimRuntime.iOS-26-5
   xcrun simctl boot <udid>
   xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100 \
     --cellularMode active --cellularBars 4 --wifiMode active --wifiBars 3
   xcrun simctl install <udid> <scratch>/dd/Build/Products/Release-iphonesimulator/EveryBible.app
   SIMCTL_CHILD_TZ=Europe/London xcrun simctl launch <udid> com.everybible.app
   ```

4. Drive the app with a venv `fb-idb` client (`python3 -m venv idbenv && idbenv/bin/pip install
   fb-idb`). Read coordinates from `idb ui describe-all --udid <udid> --json` and tap element
   centres with `idb ui tap X Y` (points; the Pro Max is 440x956 pt). Don't guess coordinates.
   - Onboarding: tap the "English, Berean Standard Bible" row.
   - Reader: `xcrun simctl openurl <udid> "com.everybible.app://bible/psalms/23"` (accept the
     Open prompt), tap a verse, and choose a highlight colour.
   - Plans: Find plans, then Bible in One Year, then Start plan. For each day, tap Read, move
     through the chapters with the next-chapter button, and finish with Complete day.
   - Audio: open `bible/john/1`, tap Play chapter audio, and capture when the marked verse is where
     you want it. Terminate and relaunch the app afterwards so the "Now playing" side tab does not
     appear in later screens.
   - Dark captures: More, then Settings, then Theme: Dark.
   - Capture with `xcrun simctl io <udid> screenshot <name>.png` into `iphone-6.9-raw/`.
5. Frame both slots: `scripts/store-screenshots/compose-all.sh ~/Downloads/everybible-store-assets/2026-09-24`.
   Headlines are mapped by filename prefix in `compose-all.sh`. `compose.sh` frames a single image.
   ImageMagick 7 and `assets/fonts/AlteHaasGrotesk-*.ttf` are required.
6. Remove the simulator (`xcrun simctl delete <udid>`), the derived data, and the copied `.env`.

Uploading is a separate, explicit step. See the ASC upload notes in the maintainer's screenshot
pipeline memory (DELETE the old `appScreenshots`, then reserve, PUT, and commit each image, using
JWTs of 20 minutes or less).
