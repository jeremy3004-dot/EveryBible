# EveryBible

A mobile Bible study app with offline access, audio playback, discipleship training, and group study features.

## Overview

EveryBible is a comprehensive Bible study application built with React Native and Expo. It provides:

- **Offline Bible Reading:** Complete Berean Standard Bible (BSB) stored locally in SQLite
- **Audio Bible:** Stream Bible chapters via Bible.is API
- **Four Fields Discipleship:** Training courses based on the Four Fields model
- **Group Study:** Create and manage study groups with progress tracking
- **Multi-language Support:** English, Spanish, Nepali, and Hindi
- **Cross-platform:** iOS and Android with native authentication

## Tech Stack

- **Framework:** React Native 0.81 with Expo SDK 54
- **Language:** TypeScript (strict mode)
- **State Management:** Zustand with AsyncStorage persistence
- **Navigation:** React Navigation v7 (Bottom Tabs + Stack)
- **Backend:** Supabase (Authentication, Database, Real-time)
- **Database:** SQLite for offline Bible text
- **Internationalization:** i18next with 4 languages
- **Authentication:** Email/Password, Apple Sign-In, Google Sign-In
- **Styling:** React Native StyleSheet with theme context

## Prerequisites

- Node.js 18+ and npm
- Expo CLI (`npm install -g expo-cli`)
- iOS: Xcode 15+ and CocoaPods
- Android: Android Studio and JDK 17
- Supabase account and project
- (Optional) Bible.is API key for audio features
- (Optional) Google OAuth credentials
- EAS CLI for builds (`npm install -g eas-cli`)

## Getting Started

### 1. Clone and Install

```bash
git clone <repository-url>
cd EveryBible
npm install
```

### 2. Environment Setup

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required variables:
- `EXPO_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `EXPO_PUBLIC_SUPABASE_ANON_KEY` - Your Supabase anon key

Optional for full features:
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` - Google OAuth web client ID
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` - Google OAuth iOS client ID
- `EXPO_PUBLIC_BIBLE_IS_API_KEY` - Bible.is API key for audio

### 3. Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Run the migrations in `/supabase/migrations/` to set up the database schema
3. Enable authentication providers:
   - Email/Password (enabled by default)
   - Google (configure with OAuth credentials)
   - Apple (configure with Apple Developer credentials)
4. Copy your project URL and anon key to `.env`

See `/supabase/README.md` for detailed setup instructions.

### 4. Run Development Server

```bash
# Start Expo development server
npm start

# Run on iOS simulator (requires Xcode)
npm run ios

# Run on Android emulator
npm run android

# Run on web (limited functionality)
npm run web
```

**Note:** Some features (Apple Sign-In, Google Sign-In, notifications) require a development build, not Expo Go:

```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

### 5. iOS Setup (macOS only)

```bash
cd ios
pod install
cd ..
npm run ios
```

If you encounter CocoaPods issues, see the global CLAUDE.md for troubleshooting.

## Development Commands

### Code Quality

```bash
npm run lint              # Check code with ESLint
npm run typecheck         # Verify TypeScript compile safety
npm run test:release      # Run the focused pre-release regression suite
npm run release:verify    # Lint + typecheck + release metadata + focused release tests
npm run lint:fix          # Auto-fix ESLint issues
npm run format            # Format code with Prettier
npm run format:check      # Check code formatting
```

### Building

```bash
# Development builds (with dev client)
eas build --profile development --platform ios
eas build --profile development --platform android

# Preview builds (internal distribution installs)
eas build --profile preview --platform ios
eas build --profile preview --platform android

# Production builds (store / TestFlight submission candidates)
eas build --profile production --platform ios
eas build --profile production --platform android
```

### Deployment

```bash
# Preflight an iOS IPA before submission
bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa

# Submit to App Store / TestFlight
eas submit --platform ios --profile production

# Submit to Google Play
eas submit --platform android --profile production
```

## Project Structure

```
/src
  /components     - Reusable UI components
  /constants      - Static data and configuration
  /contexts       - React contexts (ThemeContext)
  /data           - Static data files
  /hooks          - Custom React hooks
  /i18n           - Internationalization (4 languages)
  /navigation     - Navigation configuration
  /screens        - Screen components by feature
  /services       - Business logic and API clients
  /stores         - Zustand state management
  /types          - TypeScript type definitions
  /utils          - Utility functions

/supabase         - Database migrations and functions
/data             - Bible text data files
/assets           - Images, icons, splash screens
/scripts          - Build and utility scripts
```

## Key Features

### Offline Bible Reading
- Complete BSB text stored in SQLite
- Works without network connection
- Fast search and navigation
- Bookmarks and reading history

### Audio Bible
- Stream Bible chapters from Bible.is
- Background playback support
- Playback controls and progress tracking
- Requires API key (see .env.example)

### Four Fields Discipleship
Implementation of the Four Fields training model:
1. **Field 1 (Entry):** Relationship building and storytelling
2. **Field 2 (Gospel):** Bible stories and salvation message
3. **Field 3 (Discipleship):** One-on-one spiritual growth
4. **Field 4 (Kingdom Growth):** Multiplication and leadership

Each field contains courses and lessons with progress tracking.

### Group Study
- Create and manage study groups
- Conduct sessions following Four Fields model
- Track attendance and progress
- Group leader and member roles

### User Accounts & Sync
- Email/password authentication
- Apple Sign-In (iOS)
- Google Sign-In (iOS & Android)
- Cloud sync of progress and preferences
- Works offline, syncs when online

### Multi-language Support
- English (default)
- Spanish
- Nepali
- Hindi
- Auto-detects device language
- User can change language in settings

## Configuration Files

- `app.json` - Expo configuration
- `eas.json` - EAS Build configuration
- `tsconfig.json` - TypeScript configuration
- `.eslintrc.js` - ESLint rules
- `.prettierrc` - Prettier code formatting
- `CLAUDE.md` - AI assistant project guide (detailed technical reference)

## Troubleshooting

### Metro bundler cache issues
```bash
npx expo start -c
```

### iOS build fails
```bash
cd ios && pod install && cd ..
# If still failing, clear Xcode derived data
```

### Android build fails
```bash
cd android && ./gradlew clean && cd ..
```

### Supabase connection error
- Verify .env file exists and has correct credentials
- Check that all env vars start with `EXPO_PUBLIC_`
- Restart Expo dev server after changing .env

### Google Sign-In not working
- Ensure the supported client IDs are configured (web and iOS)
- Android-only Google client ID setup is not supported in this repo
- Web client ID must be added to Supabase auth providers
- Test on physical device (doesn't work in Expo Go)

### Apple Sign-In not working
- Only works on physical iOS devices
- Requires development build (not Expo Go)
- Verify `usesAppleSignIn: true` in app.json

## Contributing

1. Follow the code style defined in `.eslintrc.js` and `.prettierrc`
2. Use TypeScript strict mode (no `any` types)
3. All user-facing text must use i18n translation keys
4. Use theme colors from `useTheme()` (no hardcoded colors)
5. Test on both iOS and Android
6. Run `npm run release:verify` before cutting a release, and at least `npm run lint && npm run format:check` before committing

See `CLAUDE.md` for detailed development guidelines.

## License

[Add your license here]

## Support

[Add support contact or issue reporting information]

---

Built with React Native and Expo
