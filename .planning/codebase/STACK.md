# Stack

## Summary

`EveryBible` is a brownfield Expo / React Native mobile app with a TypeScript-first codebase, local-first Bible data, optional cloud sync via Supabase, and native auth plus media integrations.

## Runtime And Platforms

- Mobile runtime: Expo SDK 54 with React Native 0.81 and React 19 in [`package.json`](/Users/dev/Projects/EveryBible/package.json)
- Platforms: iOS and Android are primary; web exists as a limited Expo target in [`app.json`](/Users/dev/Projects/EveryBible/app.json)
- App entrypoints: [`index.ts`](/Users/dev/Projects/EveryBible/index.ts) registers [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)
- Expo config: [`app.json`](/Users/dev/Projects/EveryBible/app.json)
- Native projects are committed: [`ios/`](/Users/dev/Projects/EveryBible/ios) and [`android/`](/Users/dev/Projects/EveryBible/android)
- React Native New Architecture is disabled: `expo.newArchEnabled = false` in [`app.json`](/Users/dev/Projects/EveryBible/app.json)

## Language And Tooling

- Language: TypeScript with a minimal [`tsconfig.json`](/Users/dev/Projects/EveryBible/tsconfig.json)
- Package manager: npm with lockfile in [`package-lock.json`](/Users/dev/Projects/EveryBible/package-lock.json)
- Linting: flat config in [`eslint.config.js`](/Users/dev/Projects/EveryBible/eslint.config.js) plus legacy config in [`.eslintrc.js`](/Users/dev/Projects/EveryBible/.eslintrc.js)
- Formatting: Prettier via [`.prettierrc`](/Users/dev/Projects/EveryBible/.prettierrc)
- Metro config: [`metro.config.js`](/Users/dev/Projects/EveryBible/metro.config.js)
- Test runner: Node built-in test runner with `tsx` loader from the `test` script in [`package.json`](/Users/dev/Projects/EveryBible/package.json)

## Core App Libraries

- Navigation: `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`
- State: `zustand` plus `zustand/middleware` persistence
- Local persistence: `@react-native-async-storage/async-storage`, `expo-secure-store`, `expo-sqlite`
- Networking / backend client: `@supabase/supabase-js`
- Media: `expo-av`
- Notifications: `expo-notifications`
- Localization: `i18next`, `react-i18next`, `expo-localization`
- Auth providers: `expo-apple-authentication`, `@react-native-google-signin/google-signin`, `expo-auth-session`, `expo-web-browser`
- Device APIs: `expo-haptics`, `expo-file-system`, `react-native-safe-area-context`, `@react-native-community/netinfo`
- UI assets: `expo-font`, `expo-linear-gradient`, `@expo/vector-icons`

## Architecture-Level Stack Choices

- App shell and providers live in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)
- Theming is handled by [`src/contexts/ThemeContext.tsx`](/Users/dev/Projects/EveryBible/src/contexts/ThemeContext.tsx)
- Domain logic is organized under [`src/services/`](/Users/dev/Projects/EveryBible/src/services)
- Durable client state is stored in [`src/stores/`](/Users/dev/Projects/EveryBible/src/stores)
- Feature screens are grouped under [`src/screens/`](/Users/dev/Projects/EveryBible/src/screens)
- Database schema and migrations live in [`supabase/schema.sql`](/Users/dev/Projects/EveryBible/supabase/schema.sql) and [`supabase/migrations/`](/Users/dev/Projects/EveryBible/supabase/migrations)

## Data Storage Layers

- Offline Bible text is stored locally in SQLite via [`src/services/bible/bibleDatabase.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleDatabase.ts)
- Bundled Bible source data is loaded from [`data/bsb_processed.json`](/Users/dev/Projects/EveryBible/data/bsb_processed.json) through [`src/services/bible/bsbData.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bsbData.ts)
- Auth sessions and privacy settings use secure storage via [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts) and [`src/services/privacy/privacyService.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyService.ts)
- User preferences, progress, and audio settings persist via Zustand + AsyncStorage in [`src/stores/authStore.ts`](/Users/dev/Projects/EveryBible/src/stores/authStore.ts), [`src/stores/progressStore.ts`](/Users/dev/Projects/EveryBible/src/stores/progressStore.ts), and [`src/stores/audioStore.ts`](/Users/dev/Projects/EveryBible/src/stores/audioStore.ts)

## Build And Release Tooling

- EAS Build / Submit configuration in [`eas.json`](/Users/dev/Projects/EveryBible/eas.json)
- Expo owner and project ID in [`app.json`](/Users/dev/Projects/EveryBible/app.json)
- iOS native dependency management via [`ios/Podfile`](/Users/dev/Projects/EveryBible/ios/Podfile)
- Android Gradle setup in [`android/build.gradle`](/Users/dev/Projects/EveryBible/android/build.gradle)
- Custom Expo config plugin in [`plugins/withBrandedSplashAsset.js`](/Users/dev/Projects/EveryBible/plugins/withBrandedSplashAsset.js)

## Key NPM Scripts

- `npm start` -> Expo dev server
- `npm run ios` / `npm run android` -> native run commands
- `npm run web` -> Expo web
- `npm test` -> `node --test --import tsx "src/**/*.test.ts"`
- `npm run lint` / `npm run lint:fix`
- `npm run format` / `npm run format:check`

## Notable Stack Characteristics

- No monorepo tooling; this is a single-package app
- No Jest, Vitest, or React Native Testing Library currently installed
- No backend app server in the repo; backend responsibilities are pushed into Supabase schema, auth, and RPC usage
- No generated Supabase types checked in; the client is intentionally generic in [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts)
