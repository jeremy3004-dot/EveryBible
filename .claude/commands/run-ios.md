# Run iOS

Run the EveryBible app on iOS simulator. This command handles the full iOS development workflow.

## Steps

1. Check if node_modules exists, install dependencies if needed
2. Check if iOS pods are installed, install if needed
3. Clear Metro bundler cache (prevents stale cache issues)
4. Start the iOS app on simulator
5. If build fails, provide troubleshooting steps

## Commands to run

```bash
# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  npm install
fi

# Install pods if needed
if [ ! -d "ios/Pods" ]; then
  cd ios && pod install && cd ..
fi

# Clear cache and run
npx expo start -c --ios
```

## Common Issues

### CocoaPods not found
If you get "pod: command not found", install CocoaPods:
```bash
gem install cocoapods --user-install
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
```

### Build fails with "unable to find simulator"
Open Xcode and ensure at least one iOS simulator is available:
- Open Xcode
- Go to Window > Devices and Simulators
- Add a simulator if none exist (iOS 17+ recommended)

### Port already in use
If Metro bundler port (8081) is in use:
```bash
lsof -ti:8081 | xargs kill
npx expo start -c --ios
```

### Native module errors
If you see "Invariant Violation: Native module cannot be null":
```bash
rm -rf node_modules ios/Pods
npm install
cd ios && pod install && cd ..
npx expo start -c --ios
```

## Development Build vs Expo Go

**Expo Go** (default): Limited features, no custom native code
- Cannot use: Apple Sign-In, Google Sign-In, notifications
- Good for: Quick testing of UI and basic features

**Development Build**: Full features, custom native code
```bash
eas build --profile development --platform ios
```
- All features work
- Slower to build (15-20 min)
- Install on device or simulator via EAS

For testing auth features, use a development build.
