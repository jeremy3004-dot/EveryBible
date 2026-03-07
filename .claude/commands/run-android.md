# Run Android

Run the EveryBible app on Android emulator or device. This command handles the full Android development workflow.

## Steps

1. Check if node_modules exists, install dependencies if needed
2. Ensure Android emulator is running or device is connected
3. Clear Metro bundler cache (prevents stale cache issues)
4. Start the Android app
5. If build fails, provide troubleshooting steps

## Commands to run

```bash
# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  npm install
fi

# Check if emulator or device is available
if ! adb devices | grep -q "device$"; then
  echo "No Android device/emulator found. Starting emulator..."
  emulator -avd Pixel_6_API_34 &
  # Wait for emulator to boot
  adb wait-for-device
fi

# Clear cache and run
npx expo start -c --android
```

## Common Issues

### No emulator available
List available emulators:
```bash
emulator -list-avds
```

Start a specific emulator:
```bash
emulator -avd <emulator-name> &
```

Create a new emulator in Android Studio:
- Open Android Studio
- Tools > Device Manager
- Create Virtual Device
- Select Pixel 6 or similar
- Download Android 13 (API 34) or later

### ANDROID_HOME not set
Add to your shell profile (~/.zshrc or ~/.bash_profile):
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools
export PATH=$PATH:$ANDROID_HOME/tools/bin
```

Then reload:
```bash
source ~/.zshrc
```

### Build fails with Gradle errors
Clean Gradle cache:
```bash
cd android && ./gradlew clean && cd ..
rm -rf node_modules && npm install
npx expo start -c --android
```

### Java version issues
EveryBible requires Java 17. Check version:
```bash
java -version
```

If wrong version, install Java 17 and set JAVA_HOME:
```bash
brew install openjdk@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

### Port already in use
If Metro bundler port (8081) is in use:
```bash
lsof -ti:8081 | xargs kill
npx expo start -c --android
```

## Development Build vs Expo Go

**Expo Go** (default): Limited features, no custom native code
- Cannot use: Google Sign-In, advanced notifications
- Good for: Quick testing of UI and basic features

**Development Build**: Full features, custom native code
```bash
eas build --profile development --platform android
```
- All features work
- Slower to build (15-20 min)
- Install APK on device or emulator

For testing auth features, use a development build.

## Testing on Physical Device

1. Enable Developer Options on Android device
2. Enable USB Debugging
3. Connect device via USB
4. Run `adb devices` to verify connection
5. Run `npm run android`
