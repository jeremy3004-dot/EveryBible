# EveryBible New Engineer Onboarding Guide

Welcome to the EveryBible project! This guide will help you get up and running on your first day. If you get stuck on anything, ask—there's no such thing as a dumb question when you're starting out.

---

## Table of Contents

1. [Before You Start (Prerequisites)](#before-you-start-prerequisites)
2. [Getting Started](#getting-started)
3. [Key Commands](#key-commands)
4. [Codebase Orientation](#codebase-orientation)
5. [Patterns & Conventions](#patterns--conventions)
6. [Architecture Quick Hits](#architecture-quick-hits)
7. [Testing](#testing)
8. [Your First Week](#your-first-week)
9. [Common Gotchas](#common-gotchas)
10. [Where to Find Things](#where-to-find-things)

---

## Before You Start (Prerequisites)

Install these tools first. You'll need them to build and run the app.

### Required Software

**Node.js 20 and npm**
- Download from https://nodejs.org/ (LTS version 20)
- Check version: `node --version` and `npm --version`
- Why: The app and monorepo are built with Node 20. Earlier versions may have dependency conflicts.

**Xcode (for iOS development)**
- Install from the Mac App Store or https://developer.apple.com/xcode/
- Also installs Command Line Tools automatically
- Size: ~12GB, plan accordingly
- Why: Required to build and run the iOS simulator

**Android Studio (for Android development)**
- Download from https://developer.android.com/studio
- Install Android SDK (API 34+)
- Size: ~8GB
- Why: Required to build and run the Android emulator

**Supabase CLI**
- `npm install -g supabase`
- Check: `supabase --version`
- Why: Manage local Supabase instance for backend development

**EAS CLI**
- `npm install -g eas-cli`
- Check: `eas --version`
- Why: Build and submit to TestFlight / Play Store

**Docker**
- Download from https://www.docker.com/products/docker-desktop
- Check: `docker --version`
- Why: Supabase runs in Docker containers locally

**CocoaPods**
- Usually pre-installed with Xcode
- Check: `pod --version`
- If missing: `sudo gem install cocoapods`
- Why: Manages iOS native dependencies (dependencies of our React Native modules)

### Optional but Recommended

- **VS Code** or your preferred editor
- **Git** (check: `git --version`)
- **Volta** (version manager for Node/npm): https://volta.sh/

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/yourorg/everybible.git
cd everybible
```

### 2. Install Dependencies

This is a monorepo. Install everything at the root.

```bash
npm install
```

This installs dependencies for:
- The main Expo React Native app (in the root)
- The admin portal (`apps/admin/`)
- The public website (`apps/site/`)
- Build and utility scripts

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Open `.env` and fill in the required variables. You'll need:

```env
# Supabase (required for auth and backend)
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Google OAuth (required for Google Sign-In)
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxx.apps.googleusercontent.com

# Optional: Bible.is API (for streaming audio in select languages)
EXPO_PUBLIC_BIBLE_IS_API_KEY=your-key
```

**How to get these values:**
- Ask your team lead or check the team's shared credentials document
- Supabase URL and keys are in Supabase Project Settings
- Google OAuth IDs are in Google Cloud Console

**Important:** Never commit `.env` to Git. It's in `.gitignore` for security.

### 4. Start the Development Server

```bash
npm start
```

This launches Expo's Metro bundler. You'll see:

```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
  Local:   exp://127.0.0.1:19000
  LAN:     exp://192.168.x.x:19000
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
i  iOS Simulator
a  Android Emulator
w  Web Browser
```

### 5. Run on iOS Simulator

Start the iOS simulator first:

```bash
open -a Simulator
```

Then press `i` in the Metro output to build and launch the app. First build takes 2-3 minutes.

### 6. Run on Android Emulator

Start Android Studio. Open a virtual device (AVD Manager). Then press `a` in the Metro output.

### 7. Test OAuth (Important!)

**Expo Go doesn't support OAuth.** To test Google Sign-In or Apple Sign-In, you need a development build:

```bash
eas build --platform ios --profile development
```

This builds a custom Expo client with native modules enabled. Takes ~10 minutes. Once built, scan the QR code to install on your device.

### 8. Start the Admin Portal (Optional)

The admin portal is a Next.js app for managing translations, analytics, and content.

```bash
cd apps/admin
npm run dev
```

Open http://localhost:3000 (or the port it tells you).

### 9. Start the Public Site (Optional)

The public website is Next.js 15.

```bash
cd apps/site
npm run dev
```

Open http://localhost:3000 (or the port it tells you).

---

## Key Commands

Run these from the project root.

### Development

| Command | What It Does |
|---------|------------|
| `npm start` | Start Expo dev server (Metro bundler) |
| `npm run ios` | Build and run on iOS simulator |
| `npm run android` | Build and run on Android emulator |
| `npm run web` | Run web version (limited features) |

### Code Quality

| Command | What It Does |
|---------|------------|
| `npm run lint` | Check code with ESLint |
| `npm run lint:fix` | Auto-fix ESLint issues |
| `npm run typecheck` | TypeScript compile check (no emit) |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check if code is formatted |

### Testing

| Command | What It Does |
|---------|------------|
| `npm test` | Run all tests in src/**/*.test.ts |
| `npm run test:release` | Run 46 critical release regression tests |
| `npm run release:verify` | Full pre-release check (lint + typecheck + tests) |

### Build & Deploy

| Command | What It Does |
|---------|------------|
| `eas build --platform ios --profile development` | Dev build for iPhone (custom Expo client) |
| `eas build --platform ios --profile production --local` | TestFlight build (local) |
| `eas build --platform android --profile production` | Android Play Store build |
| `npm run testflight:build-local` | Build + sync iOS build number for TestFlight |
| `npm run release:prepare` | Pre-flight check for release (metadata, build number drift) |

### Troubleshooting

| Command | What It Does |
|---------|------------|
| `npx expo start -c` | Clear Metro bundler cache (fixes weird issues) |
| `npm install` | Reinstall all dependencies |
| `cd ios && pod install && cd ..` | Reinstall iOS CocoaPods |

---

## Codebase Orientation

This is a monorepo. Here's what lives where and what each part does.

### Main App (React Native / Expo)

Located at the root of the repo.

```
/src
  /services/           — Business logic (auth, bible, audio, sync, etc.)
  /stores/             — Zustand state stores (persist to MMKV, not AsyncStorage)
  /navigation/         — React Navigation screens and stack configuration
  /components/         — Reusable UI components (buttons, cards, audio player)
  /screens/            — Screen components organized by feature (auth, bible, home, learn, more)
  /hooks/              — Custom React hooks (useAudioPlayer, useFontSize, useSync)
  /contexts/           — ThemeContext (only—use Zustand for other state)
  /constants/          — Static data (books, colors, languages, config)
  /types/              — TypeScript type definitions
  /i18n/               — Translation files (21 languages)
  /design/             — Design tokens (spacing, typography, radius)
  /data/               — Static data files (reading plans, courses, Gather content)
  /utils/              — Utility functions (platform helpers, haptics)
/assets/               — Images, icons, fonts
/scripts/              — Data management and build scripts (Python + TypeScript)
/supabase/             — Database migrations and edge functions
/cloudflare/           — Analytics and geo-location workers
```

### Admin Portal (Next.js 15)

Located at `apps/admin/`.

```
/apps/admin
  /app/                — Next.js App Router pages
  /components/         — React components
  /lib/                — Utilities (API clients, auth, database)
  /types/              — TypeScript types
```

Used for:
- Managing translations and languages
- Viewing analytics and crash reports
- Configuring Bible translations
- Administering groups and users

### Public Website (Next.js 15)

Located at `apps/site/`.

```
/apps/site
  /app/                — Next.js App Router pages
  /components/         — React components
  /content/            — Markdown content and data files
```

Used for:
- Landing page (marketing)
- Privacy policy, terms of service
- Help documentation
- Download links

### Backend (Supabase + Cloudflare)

```
/supabase/
  /migrations/         — Database schema (46+ migrations)
  /functions/          — Edge functions (TypeScript, run on Supabase)

/cloudflare/
  /src/                — Workers (analytics collector, geo routing)
```

---

## Patterns & Conventions

These are the rules we follow. They're not suggestions—they keep the codebase consistent and prevent bugs.

### TypeScript

- **Strict mode enabled.** No `any` types. Use proper types from `/types/` or define new ones.
- Example:
  ```typescript
  // Good
  const user: User = await fetchUser();
  
  // Bad
  const user: any = await fetchUser();
  ```

### Styling

- **Always use `StyleSheet.create()` at the bottom of components.**
- **Always use colors from `useTheme()`. Never hardcode colors.**
- **Never use inline styles.**
- Example:
  ```typescript
  import { useTheme } from '../contexts/ThemeContext';
  
  const MyComponent = () => {
    const { colors } = useTheme();
    return <View style={styles.container}><Text style={styles.text}>Hello</Text></View>;
  };
  
  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.background,  // ✓ Theme-aware
      padding: 16,
    },
    text: {
      color: colors.primaryText,  // ✓ Theme-aware
      fontSize: 16,
    },
  });
  ```

### Strings & Internationalization (i18n)

- **All user-facing text must use translation keys. Never hardcode strings.**
- **Use `t('key')` from `useTranslation()`**
- Example:
  ```typescript
  import { useTranslation } from 'react-i18next';
  
  const { t } = useTranslation();
  return <Text>{t('tabs.home')}</Text>;  // ✓ Translatable
  ```
- Translation keys live in `/src/i18n/locales/`:
  - `en.ts` (source of truth)
  - `es.ts`, `ne.ts`, `hi.ts`, + more

### State Management

- **Use Zustand stores for global state** (auth, progress, audio, etc.)
- **Use React state for component-local state** (form inputs, UI toggles)
- **Never create new Context providers.** Use Zustand instead.
- Stores persist to MMKV (not AsyncStorage—MMKV is faster for React Native)
- Example:
  ```typescript
  // ✓ Global state
  import { useAuthStore } from '../stores/authStore';
  const { user, setUser } = useAuthStore();
  
  // ✓ Local state
  const [isOpen, setIsOpen] = useState(false);
  ```

### Services

- **All business logic lives in `/src/services/`**
- **No direct Supabase calls in components.** Use service functions instead.**
- Example:
  ```typescript
  // ✓ Good: service layer
  const user = await authService.signInWithGoogle();
  
  // ✗ Bad: direct Supabase call in component
  const { data } = await supabase.auth.signInWithOAuth({provider: 'google'});
  ```

### Components

- **Functional components with hooks only.** No class components.
- **Use `React.memo` for expensive components** to avoid unnecessary re-renders.
- **Use FlatList for long lists** (chapters, courses, groups).
- Example:
  ```typescript
  // ✓ Good
  export const MyComponent = React.memo(({ item }) => {
    return <Text>{item.name}</Text>;
  });
  
  // ✗ Bad
  class MyComponent extends React.Component { ... }
  ```

### Imports Order

Keep imports organized:

```typescript
// 1. React and React Native
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

// 2. Third-party libraries
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';

// 3. Components (use barrel exports from index.ts)
import { Button, Card } from '../components';

// 4. Services, stores, hooks
import { useAuthStore } from '../stores';
import { authService } from '../services';
import { useTheme } from '../contexts/ThemeContext';

// 5. Types
import type { User } from '../types';

// 6. Constants
import { BOOKS } from '../constants';
```

### Barrel Exports

Create `index.ts` files in component directories to keep imports clean:

```typescript
// src/components/index.ts
export { Button } from './Button';
export { Card } from './Card';
export { AudioPlayer } from './AudioPlayer';

// Usage: much cleaner
import { Button, Card } from '../components';
// vs.
import { Button } from '../components/Button';
import { Card } from '../components/Card';
```

### Code Format

- **Single quotes for strings:** `'hello'` not `"hello"`
- **Semicolons required:** `const x = 5;` not `const x = 5`
- **Print width: 100 characters** (line break after 100 chars)
- **2 space indentation** (not 4, not tabs)
- **Trailing commas (ES5 style):** `{ a, b, c, }` in objects/arrays

Run Prettier:
```bash
npm run format
```

---

## Architecture Quick Hits

These are the things that trip up new engineers. Read these carefully.

### Authentication & Session Management

- **User and session come from Supabase SecureStore,** not persisted in Zustand.
- **Only preferences persist to MMKV** (theme, font size, language).
- Why: Security. Session tokens should never touch disk or Zustand.
- Example:
  ```typescript
  const { user, session } = useAuthStore();  // Loaded from SecureStore on app start
  // NOT persisted when app closes
  ```

### Bible Data Strategy

The app has three layers of Bible data:

1. **Bundled SQLite database** (`bible-bsb-v2.db`): Default BSB translation, embedded in app
2. **Per-translation installed databases**: User can install translations on-device
3. **Stream templates** (optional): Audio streaming from providers

- The bundled DB is compiled into the app binary during build.
- **When you rebuild `bible-bsb-v2.db`, you must update THREE version constants in the same commit:**
  1. `PRAGMA user_version` in the DB file itself
  2. `BUNDLED_BIBLE_SCHEMA_VERSION` in `/src/services/bible/bibleDataModel.ts`
  3. `DEFAULT_MINIMUM_READY_VERSE_COUNT` in `/src/services/bible/bibleDatabase.ts`
- If you don't update all three, the app will silently skip re-importing the DB on existing devices even though it has the data.

### Audio Playback

Audio uses a three-resolution strategy:

1. **Check local cache first:** User may have downloaded chapter audio offline
2. **Stream from provider:** WEB and BSB from eBible.org, or from Bible.is if configured
3. **Fail gracefully:** Show message if audio unavailable

Why: Users have limited data plans. Download once, stream later.

### Sync Logic

When the app syncs (user progress, group sessions, etc.):

- **Last-write-wins** conflict resolution
- **Special cases:**
  - Onboarding pages revert if user goes backward (don't let sync undo progress)
  - Fresh install detection (new user gets default state)
- Sync happens in background via `useSync` hook

### Annotations (Notes)

- **Annotations are local-only by design.** They don't sync to the cloud.
- Why: Privacy. Users may write sensitive notes about faith, struggles, etc.
- Stored in local MMKV store

### MMKV Version Pinned

- **MMKV is pinned to v2.12.2.** (See `package.json`.)
- **Use `.delete()` method, not `.remove()`** (v3+ changed the API)
- Why: Stability. Later versions had issues with React Native.

### Google Sign-In

- **You need BOTH the web and iOS client IDs** in `.env`
- Google Sign-In on iOS requires the reversed iOS client ID injected as a URL scheme via an Expo config plugin
- If either is missing, tapping "Sign in with Google" fails silently
- Android-only client ID setup is not supported in this repo

### iOS Background Audio

- **Must configure `UIBackgroundModes: ['audio']` in `app.json`**
- Without this, audio pauses when app goes to background
- It's already in the config, but good to know why it's there

### Expo Go Limitations

- **Expo Go doesn't support:**
  - Apple Sign-In
  - Google Sign-In
  - Push notifications
  - Custom native modules
- **Use a dev build instead:**
  ```bash
  eas build --platform ios --profile development
  ```

---

## Testing

We use Node.js native test runner (not Jest). All tests live in `src/**/*.test.ts`.

### Running Tests

```bash
npm test                # Run all tests
npm run test:release    # Run 46 critical release regression tests
npm run release:verify  # Full check: lint + typecheck + tests
```

### Test Examples

Tests use Node.js `assert` module:

```typescript
// src/services/auth/__tests__/authService.test.ts
import assert from 'assert';
import { parseGoogleAuth } from '../authService';

describe('parseGoogleAuth', () => {
  it('should parse valid Google OAuth token', () => {
    const token = 'valid.token.here';
    const result = parseGoogleAuth(token);
    assert(result.isValid);
  });

  it('should reject invalid tokens', () => {
    const token = 'invalid';
    const result = parseGoogleAuth(token);
    assert(!result.isValid);
  });
});
```

### Manual Testing Checklist

Before committing, test on real devices:

- [ ] iOS simulator (iPhone 15 Pro)
- [ ] Android emulator (Pixel 8)
- [ ] Offline mode (airplane mode on)
- [ ] OAuth (Google, Apple on physical device)
- [ ] Audio playback (play a Bible chapter)
- [ ] Background audio (play, press home button, audio continues)
- [ ] Language switching (switch to Spanish, Hindi, etc.)
- [ ] Theme switching (dark mode, light mode)
- [ ] Font size adjustment (small, medium, large)

---

## Your First Week

Here's a suggested ramp-up to get productive fast.

### Day 1: Setup & Orientation

- [ ] Clone repo, install dependencies
- [ ] Copy `.env.example` to `.env`, get credentials from team
- [ ] Run `npm start` and launch iOS simulator
- [ ] Open the app, explore the UI
- **Read:** `CLAUDE.md` (project guide) and this file (you're reading it!)

### Day 2: Architecture Overview

- [ ] Read `docs/architecture-overview.md` (if it exists) or trace the code
- [ ] Trace the **auth flow:**
  - App cold start (`App.tsx`)
  - Load user from SecureStore
  - Check if authenticated
  - If not, show auth screens
  - If yes, show main tabs
- [ ] Find the relevant files: `authStore.ts`, `authService.ts`, auth screens in `/screens/auth/`

### Day 3: Bible Data Flow

- [ ] Read `/src/services/bible/bibleDatabase.ts`
- [ ] Understand how Bible text is loaded from SQLite
- [ ] Trace a Bible read:
  - User opens Bible tab
  - Selects book (1 Samuel)
  - Selects chapter (5)
  - Component queries `bibleService.getChapter()`
  - SQLite returns verses
  - Component renders verses
- [ ] Files: `BibleReaderScreen.tsx`, `bibleService.ts`, `bibleDatabase.ts`

### Day 4: Admin Portal

- [ ] Open admin portal: `cd apps/admin && npm run dev`
- [ ] Explore the dashboard, translations management, analytics
- [ ] Understand what data flows between admin portal and main app

### Day 5: Make a Small Change

Now you're ready to code. Make a small, low-stakes change to get comfortable:

- [ ] **Option A:** Add a new translation key
  - Add `hello.world: "Hello, World!"` to `/src/i18n/locales/en.ts`
  - Use it somewhere: `<Text>{t('hello.world')}</Text>`
  - Run `npm run lint` and `npm run typecheck`
  - Test in simulator: `npm start` → press `i`

- [ ] **Option B:** Adjust a color
  - Edit `/src/constants/colors.ts`
  - Change a color value
  - Find where it's used with `grep -r "accentGreen" src/`
  - Run simulator and verify change

- [ ] **Option C:** Fix a lint warning
  - Run `npm run lint`
  - Pick an easy one to fix
  - Run `npm run lint:fix`

- [ ] Run tests:
  ```bash
  npm test
  ```

- [ ] Build for simulator:
  ```bash
  npm start  # press i
  ```

- [ ] Create a branch and commit your change
  ```bash
  git checkout -b my-first-change
  git add .
  git commit -m "Add hello world translation"
  git push origin my-first-change
  ```

---

## Common Gotchas

Developers often hit these issues. Here's how to fix them.

### Metro Bundler Cache Issues

**Symptoms:** App won't load, weird module errors, "Cannot find module" errors.

**Fix:**
```bash
npx expo start -c
```

The `-c` flag clears Metro's cache. Do this if you have strange bundler issues.

### iOS Pods Not Installed

**Symptoms:** `Undefined symbol` errors on iOS build.

**Fix:**
```bash
cd ios && pod install && cd ..
```

CocoaPods manages native dependencies. Re-install them after adding/updating native libraries.

### TypeScript Errors After Updating Dependencies

**Symptoms:** TypeScript won't compile, lots of type errors.

**Fix:**
```bash
rm -rf node_modules
npm install
npm run typecheck
```

This clears Node modules and reinstalls everything from `package-lock.json`.

### Android Java Version Error

**Symptoms:** `Java version is not matching` or similar.

**Fix:** Android requires Java 17 or later.

```bash
java --version  # Check your version
```

If you don't have Java 17+, install it:
- macOS: `brew install openjdk@17` then set `JAVA_HOME`
- Linux: `sudo apt-get install openjdk-17-jdk`

### Supabase Not Configured

**Symptoms:** "Supabase is not configured" error on app start.

**Fix:** Check your `.env` file.

```bash
cat .env
```

Make sure these are present and not empty:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

**Important:** All env vars for the app must start with `EXPO_PUBLIC_`. The Expo bundler only exposes variables with this prefix.

### Audio Won't Play in Background

**Symptoms:** App background audio pauses when you press home.

**Fix:** Check `app.json` for:
```json
{
  "plugins": [
    [
      "expo-av",
      {
        "microphonePermission": "Allow EveryBible to access the microphone."
      }
    ]
  ],
  "ios": {
    "infoPlist": {
      "UIBackgroundModes": ["audio"]
    }
  }
}
```

The `UIBackgroundModes` is what makes background audio work.

### Google Sign-In Fails

**Symptoms:** Tapping "Sign in with Google" does nothing or crashes.

**Fix:** Check `.env` for both client IDs:
```env
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxx.apps.googleusercontent.com
```

Missing either one will cause silent failure.

### Can't Test OAuth in Expo Go

**Symptoms:** Tapping Google/Apple sign-in buttons does nothing.

**Fix:** Expo Go doesn't support native modules. Create a dev build:

```bash
eas build --platform ios --profile development
```

Scan the QR code to install on your device, then test OAuth there.

---

## Where to Find Things

Quick reference for where to find common files.

### Configuration Files

| File | Purpose |
|------|---------|
| `app.json` | App name, version, bundle ID, plugins, app icon, build profiles |
| `eas.json` | EAS build configuration (development, preview, production) |
| `.env` | Environment variables (never committed) |
| `.env.example` | Template for `.env` |
| `package.json` | Dependencies, npm scripts |
| `tsconfig.json` | TypeScript configuration |
| `.eslintrc.js` | ESLint rules |
| `.prettierrc` | Prettier formatting rules |

### Supabase & Database

| File/Folder | Purpose |
|-------------|---------|
| `supabase/migrations/` | Database schema migrations (46+) |
| `supabase/functions/` | Edge functions (run on Supabase servers) |
| `.env` (fields starting with `EXPO_PUBLIC_SUPABASE_`) | Supabase credentials |

### App Features

| Feature | Where to Find It |
|---------|-----------------|
| Authentication | `/src/services/auth/`, `/src/screens/auth/` |
| Bible Reading | `/src/services/bible/`, `/src/screens/bible/` |
| Audio Player | `/src/services/audio/`, `/src/components/AudioPlayer*` |
| Groups & Sessions | `/src/services/groups/`, `/src/screens/learn/` |
| Reading Plans | `/src/services/plans/`, `/src/data/readingPlans.generated.ts` |
| Four Fields Courses | `/src/services/courses/`, `/src/screens/learn/FourFields*` |
| Progress Tracking | `/src/stores/progressStore.ts`, `/src/services/sync/` |
| User Preferences | `/src/stores/authStore.ts` (preferences), `/src/contexts/ThemeContext.tsx` |

### Translations & Localization

| File | Purpose |
|------|---------|
| `/src/i18n/locales/en.ts` | English translations (source of truth) |
| `/src/i18n/locales/es.ts` | Spanish |
| `/src/i18n/locales/ne.ts` | Nepali |
| `/src/i18n/locales/hi.ts` | Hindi |
| `i18n.ts` (in root of i18n folder) | i18next configuration |

### Styling & Theming

| File | Purpose |
|------|---------|
| `/src/contexts/ThemeContext.tsx` | Theme colors and dark mode logic |
| `/src/constants/colors.ts` | Color palette definitions |
| `/src/design/system.ts` | Spacing scales, font sizes, and typography (consolidated design system) |

### Navigation

| File | Purpose |
|------|---------|
| `/src/navigation/types.ts` | TypeScript types for all routes and params |
| `/src/navigation/RootNavigator.tsx` | Main navigation structure (tabs + stacks) |
| `/src/navigation/` | Each stack (HomeStack, BibleStack, etc.) |

### State Management

| File | Purpose |
|------|---------|
| `/src/stores/authStore.ts` | User, session, preferences |
| `/src/stores/progressStore.ts` | Reading progress, course completion |
| `/src/stores/bibleStore.ts` | Current book/chapter, bookmarks |
| `/src/stores/audioStore.ts` | Audio playback state, playlist |
| `/src/stores/readingPlansStore.ts` | Reading plan progress |

### Hooks

| Hook | Purpose |
|------|---------|
| `useAuthStore` | Access auth state |
| `useProgressStore` | Access progress state |
| `useFontSize` | Get responsive font sizes |
| `useTheme` | Get colors and dark mode state |
| `useAudioPlayer` | Control audio playback |
| `useSync` | Sync data with Supabase |
| `useI18n` | Access translation function (via react-i18next) |

### Scripts

| Script | Purpose |
|--------|---------|
| `scripts/testflight_*.ts` | TestFlight release helpers |
| `scripts/data-*.py` | Data import/export utilities |
| `npm run release:prepare` | Pre-release checks |
| `npm run testflight:build-local` | Build for TestFlight |

### Session Notes

| File | Purpose |
|------|---------|
| `SCRATCHPAD.md` | Current session notes, blockers, next steps |
| `.planning/` | Long-term planning and roadmap |
| `.gsd/` | Get-Shit-Done project tracking |

---

## Getting Help

### When You're Stuck

1. **Check the docs:** You're reading them!
2. **Check CLAUDE.md:** It has detailed architecture info
3. **Look for tests:** Tests show how code is meant to be used
4. **Search the code:** Use `grep -r "what I'm looking for" src/`
5. **Ask a teammate:** No question is dumb

### Common Resources

- **Expo docs:** https://docs.expo.dev/
- **React Native docs:** https://reactnative.dev/
- **React Navigation:** https://reactnavigation.org/
- **Zustand:** https://github.com/pmndrs/zustand
- **Supabase:** https://supabase.com/docs
- **TypeScript:** https://www.typescriptlang.org/docs/

### Debugging Tips

**See console logs:**
```bash
npm start  # Look at terminal output while app runs
```

**Inspect app state:**
- Add temporary `console.log(useAuthStore.getState())` to see Zustand state
- Use React DevTools browser extension (for web version)

**Check Supabase:**
- Go to your Supabase dashboard
- Check "SQL Editor" for database state
- Check "Logs" for edge function errors

---

## Summary

You now have everything you need to:

1. Build and run the app locally
2. Navigate the codebase
3. Follow our coding patterns
4. Write tests
5. Get help when stuck

**Next steps:**
- Set up your environment (prerequisites)
- Clone and run the app
- Read CLAUDE.md for detailed architecture
- Make your first small change (Day 5)
- Join the team and start contributing!

Welcome to the team. We're excited to have you.

---

## Quick Reference: First 30 Minutes

1. `npm install` — Install all dependencies
2. `cp .env.example .env` — Create .env, fill in Supabase URL + anon key
3. `npm start` — Start Expo dev server
4. Press `i` — Launch iOS simulator
5. Open app, explore UI
6. Read `CLAUDE.md` — Deep dive on architecture
7. Read `docs/architecture-overview.md` — Visual system design
8. Pick a small task from GitHub issues
9. Create a branch: `git checkout -b my-task-name`
10. Make your change, run tests, push
11. Create a pull request
12. Review feedback, iterate
13. Merge and celebrate!

Good luck!
