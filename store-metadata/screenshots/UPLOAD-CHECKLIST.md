# Store Upload Checklist

Use this checklist when uploading EveryBible marketing assets to App Store Connect and Google Play Console.

## Authoritative Asset Sets

- Apple App Store 6.7-inch screenshots:
  - `store-metadata/screenshots/ios/iphone-67-2026-04-03/`
- Apple App Store 6.5-inch screenshots:
  - `store-metadata/screenshots/ios/iphone-65-2026-04-03/`
- Google Play phone screenshots:
  - `store-metadata/screenshots/google-play/`
- Google Play feature graphic:
  - `store-metadata/screenshots/google-play/feature-graphic.png`

## Apple App Store Connect

Official references:
- Apple screenshot specs: [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
- Apple upload flow: [Upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)

Apple currently allows `1` to `10` screenshots in `.jpeg`, `.jpg`, or `.png` format. The accepted portrait sizes we are using are:
- 6.7-inch: `1290 x 2796`
- 6.5-inch: `1242 x 2688`

### Upload Steps

1. Open [App Store Connect](https://appstoreconnect.apple.com/), then go to `Apps` → `Every Bible`.
2. Open the iOS version that is in `Prepare for Submission`, `Ready for Review`, `Invalid Binary`, `Rejected`, `Metadata Rejected`, or `Developer Rejected`.
3. In the iOS platform page, scroll to `App Previews and Screenshots`.
4. Upload the 6.7-inch set in this order:
   - `01-read-offline.png`
   - `02-track-habit.png`
   - `03-highlight-verses.png`
   - `04-share-verse-cards.png`
   - `05-save-notes.png`
   - `06-grow-foundations.png`
   - `07-find-wisdom.png`
5. Click `View All Sizes in Media Manager`.
6. Open the `6.5"` device size and upload the matching 6.5-inch files in the same order.
7. Confirm every uploaded image is portrait, crisp, and in the right sequence.
8. Save the version metadata.

### App Store Checks Before Leaving

- The 6.7-inch screenshots all read `1290 x 2796`.
- The 6.5-inch screenshots all read `1242 x 2688`.
- No raw simulator captures from `store-metadata/screenshots/ios/` were uploaded directly.
- The screenshots appear in the exact order listed above.
- The version metadata still points to the right subtitle, keywords, and description from:
  - `store-assets/app-store-listing.md`

### App Store Privacy

Official references:
- Apple privacy details: [App privacy details on the App Store](https://developer.apple.com/app-store/app-privacy-details/)
- Apple privacy management: [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)

Use the App Privacy form in App Store Connect to match the current analytics behavior:

1. Open [App Store Connect](https://appstoreconnect.apple.com/) and go to `Apps` → `Every Bible`.
2. Open `App Privacy` and click `Edit` next to `Data Types`.
3. Add `Usage Data` → `Product Interaction` for the anonymous usage analytics stream.
4. Mark that usage data as `Not linked to the user` and `Analytics`.
5. Keep the account-linked sync data separate if it is still present in the app:
   - reading progress
   - bookmarks
   - preferences
6. Publish the updated privacy details after confirming the selections.

## Google Play Console

Official references:
- Google asset requirements: [Add preview assets to showcase your app](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-GB_)
- Google listing guidance: [Best practices for your store listing](https://support.google.com/googleplay/android-developer/answer/13393723?hl=en)

Google currently requires:
- Feature graphic: `1024 x 500`, JPEG or 24-bit PNG, no alpha
- Screenshots: minimum `2`, JPEG or 24-bit PNG, no alpha
- For recommendation-friendly phone screenshots, Google recommends at least `4` screenshots at minimum `1080 px` resolution in `9:16` portrait or `16:9` landscape

### Upload Steps

1. Open [Google Play Console](https://play.google.com/console/).
2. Go to `Grow users` → `Store presence` → `Main store listing`.
3. In `Graphics`, upload or replace the feature graphic with:
   - `store-metadata/screenshots/google-play/feature-graphic.png`
4. Optional source file for future edits:
   - `store-metadata/screenshots/google-play/feature-graphic.svg`
5. In `Phone screenshots`, upload the seven PNGs in this order:
   - `01-read-offline.png`
   - `02-track-habit.png`
   - `03-highlight-verses.png`
   - `04-share-verse-cards.png`
   - `05-save-notes.png`
   - `06-grow-foundations.png`
   - `07-find-wisdom.png`
6. Remove any older five-shot Play pack assets if the console still has them cached from a previous draft.
7. Save the store listing.

### Google Play Checks Before Leaving

- `feature-graphic.png` shows `1024 x 500`.
- All seven Play screenshots show `1290 x 2796`.
- The old five-shot pack is not mixed with the new seven-shot pack.
- The Play listing copy matches:
  - `store-assets/google-play-listing.md`
- The feature graphic stays text-light and uses the same rust / ivory visual system as the screenshots.

### Google Play Data Safety

Use the Google Play Data safety form to mirror the listing copy in `store-assets/google-play-listing.md`:

1. Open [Google Play Console](https://play.google.com/console/).
2. Open the app's `Data safety` form.
3. Record the anonymous usage analytics as `App activity` / `App interactions` with:
   - minutes listened
   - sessions or time spent
   - chapter completion
   - playback progress
   - feature engagement
   - mark it `Not linked to the user` and `Analytics`
4. Keep the optional sync data separate under account-related data:
   - email
   - name
   - reading history
   - bookmarks
   - preferences
5. Publish the updated data safety details after confirming they match the privacy policy and store listing.

### Recommended Alt Text

If Play Console prompts for graphic descriptions, use:
- Feature graphic: `Every Bible feature graphic with the app name and two dark phone previews showing the home and wisdom screens.`
- Screenshot 1: `Bible reading screen with offline scripture text.`
- Screenshot 2: `Home screen with verse of the day and reading stats.`
- Screenshot 3: `Verse highlighting and action controls.`
- Screenshot 4: `Verse card sharing screen with background picker.`
- Screenshot 5: `Verse note modal with saved reflection.`
- Screenshot 6: `Foundations discipleship course list.`
- Screenshot 7: `Wisdom topics grid for real-life situations.`
