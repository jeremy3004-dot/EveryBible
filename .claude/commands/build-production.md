# Build Production

Build production-ready versions of EveryBible for iOS and Android app stores.

## Prerequisites

- EAS account configured (`eas login`)
- App Store credentials configured (for iOS)
- Google Play credentials configured (for Android)
- Updated version number in `app.json`
- All tests passing
- Code linted and formatted

## Pre-build Checklist

1. Update version in `app.json`:
   ```json
   {
     "expo": {
       "version": "1.x.x"
     }
   }
   ```

2. Run quality checks:
   ```bash
   npm run lint
   npm run format:check
   ```

3. Test on both platforms:
   ```bash
   npm run ios
   npm run android
   ```

4. Commit all changes:
   ```bash
   git add .
   git commit -m "Release v1.x.x"
   git push
   ```

## Build Commands

### iOS Production Build
```bash
# Build for App Store
eas build --platform ios --profile production

# Wait for build to complete (15-30 min)
# Download IPA or submit directly to App Store
eas submit --platform ios
```

### Android Production Build
```bash
# Build App Bundle for Play Store
eas build --platform android --profile production

# Wait for build to complete (15-30 min)
# Download AAB or submit directly to Play Store
eas submit --platform android
```

### Build Both Platforms
```bash
# Build iOS and Android simultaneously
eas build --platform all --profile production
```

## Build Profiles (from eas.json)

### Production Profile
- **iOS:** App Bundle (AAB) for App Store Connect
- **Android:** App Bundle (AAB) for Google Play
- **Auto-increment:** Build number auto-increments
- **Optimizations:** Full release optimizations enabled
- **Resource class:** m-medium (faster builds)

### Preview Profile
- **Distribution:** Internal testing
- **iOS:** Simulator: false (real devices only)
- **Android:** APK for easy distribution
- **Use case:** TestFlight, internal testing

### Development Profile
- **Development client:** Includes dev tools
- **Distribution:** Internal only
- **iOS:** Simulator: true
- **Android:** APK build type
- **Use case:** Testing with native modules

## After Build Completes

### iOS Submission
```bash
# Submit to App Store Connect
eas submit --platform ios

# Or download and upload manually:
# 1. Download IPA from EAS
# 2. Upload via Xcode or Transporter app
# 3. Go to App Store Connect
# 4. Select build for release
# 5. Submit for review
```

### Android Submission
```bash
# Submit to Google Play
eas submit --platform android

# Or download and upload manually:
# 1. Download AAB from EAS
# 2. Upload to Google Play Console
# 3. Go to Production > Releases
# 4. Create new release
# 5. Upload AAB
# 6. Submit for review
```

## App Store Credentials

### iOS (App Store Connect)
- **Apple ID:** curryj@protonmail.com
- **Team ID:** NVC9N47PRH
- **Bundle ID:** com.everybible.app
- **App Store ID:** 6758254335

### Android (Google Play Console)
- **Package:** com.everybible.app
- **Service Account:** every-bible-485319-82e2f287e3f8.json
- **Track:** Internal (then promote to production)
- **Release Status:** Draft

## Troubleshooting

### iOS Build Fails
- Check Apple Developer certificates are valid
- Verify provisioning profiles are up to date
- Check Xcode compatibility (need latest)
- Review build logs on EAS dashboard

### Android Build Fails
- Check service account JSON is valid
- Verify package name matches in app.json and Google Play
- Review build logs on EAS dashboard
- Check Java version compatibility

### Submission Fails
- Verify app version is higher than current store version
- Check that required app store metadata is complete
- Ensure privacy policy and app description are updated
- Review rejection reasons in App Store Connect / Play Console

## Post-Submission

1. **Tag release in Git:**
   ```bash
   git tag v1.x.x
   git push --tags
   ```

2. **Monitor crash reports:**
   - Xcode Organizer for iOS
   - Google Play Console for Android

3. **Update SCRATCHPAD.md with release notes**

4. **Notify team/users of new release**

## Version Numbering

Follow semantic versioning:
- **Major (1.x.x):** Breaking changes, major features
- **Minor (x.1.x):** New features, backwards compatible
- **Patch (x.x.1):** Bug fixes, small improvements

Examples:
- 1.0.0 - Initial release
- 1.1.0 - Add new Four Fields course
- 1.1.1 - Fix audio playback bug
- 2.0.0 - Major redesign

## Release Frequency

- **Bug fixes:** As needed (patch versions)
- **Feature releases:** Every 2-4 weeks (minor versions)
- **Major releases:** Every 6-12 months (major versions)

Keep users updated with new features and improvements regularly.
