# Clear Cache

Clear all caches for EveryBible to fix common development issues. Use this when experiencing weird Metro bundler errors, stale builds, or dependency issues.

## What This Clears

1. Metro bundler cache
2. Node modules
3. iOS Pods and build cache
4. Android Gradle cache
5. Expo cache

## Full Cache Clear

```bash
# Stop any running Metro bundler
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Clear Expo cache
rm -rf .expo

# Clear Metro bundler cache
rm -rf $TMPDIR/metro-*
rm -rf $TMPDIR/haste-map-*

# Clear node modules
rm -rf node_modules
npm install

# Clear iOS cache
rm -rf ios/Pods
rm -rf ios/build
cd ios && pod install && cd ..

# Clear Android cache
cd android
./gradlew clean
cd ..

echo "All caches cleared! Run 'npm start' to restart."
```

## Partial Cache Clear (Faster)

### Just Metro Bundler
```bash
npx expo start -c
```
Use this most of the time for quick cache refresh.

### Just Node Modules
```bash
rm -rf node_modules && npm install
```
Use when package.json changed or dependencies are corrupted.

### Just iOS Pods
```bash
cd ios && rm -rf Pods && pod install && cd ..
```
Use when adding/updating native iOS dependencies.

### Just Android Gradle
```bash
cd android && ./gradlew clean && cd ..
```
Use when Android builds are failing.

## When to Clear Cache

### Clear Metro Cache (Quick)
- Seeing "Unable to resolve module" errors
- Changes not reflecting in app
- React components not updating
- Translation files not updating

### Clear Node Modules
- After pulling new code with dependency changes
- After updating package.json
- Seeing "Cannot find module" errors
- TypeScript types not updating

### Clear iOS Pods
- After adding native iOS dependencies
- Build fails with "pod not found" errors
- Header file not found errors
- After updating iOS-specific packages

### Clear Android Gradle
- Build fails with Gradle errors
- "Task not found" errors
- After updating Android-specific packages
- Seeing "Failed to install the app" errors

### Clear Everything (Nuclear Option)
- When nothing else works
- Before switching branches with major changes
- After major version upgrades
- When troubleshooting mysterious issues

## Common Issues Solved by Clearing Cache

### "Unable to resolve module" Error
**Solution:** Clear Metro cache
```bash
npx expo start -c
```

### "Invariant Violation: Native module cannot be null"
**Solution:** Clear node modules and pods
```bash
rm -rf node_modules ios/Pods
npm install
cd ios && pod install && cd ..
```

### TypeScript Can't Find Types
**Solution:** Clear node modules
```bash
rm -rf node_modules && npm install
```

### iOS Build Fails with Header Errors
**Solution:** Clear pods and Xcode derived data
```bash
rm -rf ios/Pods ios/build
cd ios && pod install && cd ..
# Also clear Xcode derived data via Xcode preferences
```

### Android Build Fails with Gradle Error
**Solution:** Clear Gradle cache
```bash
cd android && ./gradlew clean && cd ..
```

### Changes Not Appearing in App
**Solution:** Clear Metro cache and restart
```bash
npx expo start -c
# Or: lsof -ti:8081 | xargs kill -9
# Then: npm start
```

## After Clearing Cache

1. **Restart development server:**
   ```bash
   npm start
   ```

2. **Rebuild iOS:**
   ```bash
   npm run ios
   ```

3. **Rebuild Android:**
   ```bash
   npm run android
   ```

4. **If still failing, try development build:**
   ```bash
   eas build --profile development --platform ios
   eas build --profile development --platform android
   ```

## Prevention

To minimize cache issues:

1. **Use clear cache flag regularly:**
   ```bash
   npx expo start -c
   ```

2. **Commit package-lock.json:**
   Ensures consistent dependency versions.

3. **Update dependencies carefully:**
   Test after each major dependency update.

4. **Use development builds for native features:**
   Expo Go has limitations with native modules.

5. **Keep Xcode and Android Studio updated:**
   Older versions can cause build cache issues.

## Advanced Cache Locations

### macOS Cache Locations
```bash
# Metro bundler
$TMPDIR/metro-*
$TMPDIR/haste-map-*

# Expo
~/.expo
.expo/

# npm
~/.npm

# CocoaPods
~/Library/Caches/CocoaPods

# Xcode derived data
~/Library/Developer/Xcode/DerivedData

# Gradle
~/.gradle/caches
```

### Clearing System-Wide Caches (Extreme)
```bash
# Clear npm cache
npm cache clean --force

# Clear CocoaPods cache
pod cache clean --all

# Clear Gradle cache
rm -rf ~/.gradle/caches

# Clear Xcode derived data
rm -rf ~/Library/Developer/Xcode/DerivedData
```

Only use system-wide cache clearing if project-level clearing doesn't work.
