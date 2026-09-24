# EveryBible Project Guide

## Project Overview

EveryBible is a mobile Bible study app built with Expo/React Native. It provides offline Bible reading, audio playback, discipleship courses (Four Fields), group study features, and broad multi-language support. The app uses Supabase for backend services and supports Apple/Google OAuth authentication.

**Tech Stack:** React Native 0.81, Expo SDK 54, TypeScript, Zustand, Supabase, React Navigation, i18next, SQLite
**Current Phase:** Production - App is live on iOS/Android

---

## Critical Rules (Always Follow)

1. **TypeScript strict mode is enabled** - Why: Catch type errors at compile time, app handles sensitive user data
2. **Never commit .env file** - Why: Contains Supabase keys, OAuth credentials, API keys
3. **Always use barrel exports (index.ts)** - Why: Maintains clean import paths across codebase. Exception: `src/stores/index.ts` is deliberately *not* a barrel — it re-exports only the shared MMKV plumbing, so importing one store never hydrates all of them. Import each store from its own module (e.g. `../stores/authStore`), never from `../stores`.
4. **Theme context for all colors** - Why: App supports dark mode, hardcoded colors break theming
5. **Translation keys for ALL user-facing text** - Why: App ships a broad interface language set, and hardcoded strings break localization coverage
6. **Use Zustand stores for global state** - Why: Lightweight, persistent via MMKV, already established pattern
7. **Offline-first architecture** - Why: Bible data is SQLite-based for offline access
8. **Test on both iOS and Android** - Why: Platform-specific issues with audio, notifications, OAuth
9. **Use Expo's native modules** - Why: Custom native modules require ejecting from managed workflow
10. **Follow React Navigation v7 patterns** - Why: Stack/Tab navigators have specific type requirements
11. **Bump all three DB version constants when rebuilding bible-bsb-v2.db** - Why: The upgrade gate in `ensureBundledDatabaseReady()` will silently skip re-importing the DB on existing devices if the thresholds aren't raised. Every rebuild of `bible-bsb-v2.db` MUST update in the same commit: (a) `PRAGMA user_version` in the DB file, (b) `BUNDLED_BIBLE_SCHEMA_VERSION` in `bibleDataModel.ts`, (c) `DEFAULT_MINIMUM_READY_VERSE_COUNT` in `bibleDatabase.ts`. Failing this caused ASV to be invisible on existing installs even though the bundled DB had the data.
12. **For iOS TestFlight releases, prefer the synced local build path with remote Expo-managed credentials** - Why: This project can successfully run `npm run testflight:build-local`, which first syncs Expo's remote iOS build number into native code and then performs the local production build while EAS fetches signing assets from Expo's remote credential store. Missing local `credentials.json`, `.p12`, or `.mobileprovision` files are not a release blocker unless the flow explicitly requires manual local signing.
13. **When the human says ship, treat it as finish-and-land-the-current-work** - Why: For EveryBible, `ship` means the current task should be brought to a clean end. The normal sequence is stage, commit, push to GitHub, merge or sync to `main`, push `main`, then finish the release path if it is a release. If the task is a release, that includes local EAS production build, TestFlight submission, and verification of the intended tester/group. If it is feature work, that means finish, test, and land it cleanly. Never stop at build completion or `eas submit` alone when the task is a release unless the user explicitly says no TestFlight.

---

## Architecture Decisions

### File Structure

```
/src
  /components     - Reusable UI components (audio, buttons, cards, fourfields, skeleton, typography)
  /constants      - Static data (books, colors, languages, config)
  /contexts       - React contexts (ThemeContext only - prefer Zustand for state)
  /data           - Static data files
  /hooks          - Custom React hooks (useAudioPlayer, useFontSize, useI18n, useSync)
  /i18n           - Internationalization (21 bundled interface locales)
  /design         - Design tokens/system (colors, spacing, fonts) - see Theming & Styling
  /navigation     - RootNavigator, TabNavigator + stacks (AuthStack, BibleStack, HomeStack, LearnStack, PlansStack, MoreStack)
  /screens        - Screen components organized by feature (auth, bible, home, learn, plans, more)
  /services       - Business logic (audio, auth, bible, courses, supabase, sync, groups, plans, feedback)
  /stores         - Zustand stores, MMKV-persisted (see State Management below); `index.ts` is NOT a barrel
  /types          - TypeScript type definitions
  /utils          - Utility functions (platform, haptics)

/supabase         - Supabase migrations and functions
/data             - Bible text data files
/assets           - Images, icons, fonts
/scripts          - Build and utility scripts
```

**Screen subfolders:** a large screen keeps its file and path (`BibleReaderScreen.tsx`); its hooks, sub-components, and models live in a sibling folder next to it. In use: `src/screens/bible/reader/`, `browser/`, `picker/`; `src/screens/more/settings/`, `readingActivity/`; `src/screens/plans/planDetail/`, `plansHome/`, `rhythmDetail/`, `rhythmComposer/`; `src/screens/onboarding/localeSetup/`; `src/screens/auth/authScreenParts/`, `resetPassword/`; `src/components/audio/playbackControlsParts/`; `src/hooks/audioPlayer/`; `src/stores/bible/` (bibleStore's slices), `src/stores/readingPlans/`, `src/stores/sanitizers/`; `src/services/audio/download/`; `src/services/plans/readingPlan/`. A sibling folder is never named exactly the screen's PascalCase stem (`authScreenParts`, not `AuthScreen`) — macOS's default case-insensitive filesystem can't have a folder and a `.tsx` file share a name differing only by case. Screens and components import hooks from their own module, never the `../hooks` barrel — a static-import-graph guard in `src/services/startup/startupBootSurface.test.ts` enforces this.

### Patterns We Use

- **State Management:** Zustand persisted to MMKV (`react-native-mmkv` v2, pinned for old-architecture compatibility) via `stores/mmkvStorage.ts`, not AsyncStorage. Private, device-only data (annotations, library/downloads, Gather progress, Four Fields) is additionally scoped per signed-in account by `stores/privateDataScope.ts` — see State Management below.
- **Navigation:** React Navigation v7 (Bottom Tabs + Native Stack navigators)
- **Styling:** StyleSheet.create() with ThemeContext colors - no inline styles
- **API Layer:** Supabase client for backend, SQLite for Bible data
- **Reading Plans:** Plan catalog and plan entries are bundled locally in `src/data/readingPlans.generated.ts`; Supabase may sync user progress, but it is not the source of truth for which plans exist
- **Error Handling:** ErrorBoundary component wraps app, try/catch in async operations
- **i18n:** react-i18next with expo-localization for device locale detection
- **Routing:** Tab-based with nested stacks (Home, Bible, Learn/Gather, Plans, More)

### Patterns We AVOID

- ❌ No inline styles - use StyleSheet.create() with theme colors
- ❌ No hardcoded colors - use colors from useTheme()
- ❌ No hardcoded strings - use t('translation.key') from react-i18next
- ❌ No Context API for state - use Zustand stores (except ThemeContext)
- ❌ No class components - functional components with hooks only
- ❌ No any types - use proper TypeScript types from /types
- ❌ No direct Supabase calls in components - use service layer in /services
- ❌ No custom native modules - use Expo modules only (managed workflow)

---

## Commands & Workflow

### Development

```bash
npm start              # Start Expo dev server (press 'i' for iOS, 'a' for Android)
npm run ios            # Build and run on iOS simulator (requires Xcode)
npm run android        # Build and run on Android emulator
npm run web            # Start web version (limited functionality)
npm run lint           # ESLint check
npm run typecheck      # TypeScript compile check (runs tsc, then typecheck:strict)
npm run typecheck:strict # noUncheckedIndexedAccess etc. for non-UI code (tsconfig.strict.json)
npm run test:release   # Focused release regression suite
npm run release:verify # Lint + typecheck + full test suite (npm test) + expo config check
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Format code with Prettier
npm run format:check   # Check code formatting
```

`npm run typecheck` runs `tsc --noEmit` for the whole app, then `typecheck:strict` (`scripts/typecheck-strict.mjs`), which type-checks `tsconfig.strict.json` (`noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noImplicitOverride`) but only fails on diagnostics inside its `include` (`src/services`, `src/stores`, `src/utils`, `src/hooks`, `src/constants`, `src/i18n`, minus an `exclude` list still covering `src/services/audio`, `src/stores/audio*`, `src/hooks/useAudioPlayer*`, `src/services/sync`, `src/services/notifications`, `src/services/privacy`, `src/services/diagnostics`). Run `node scripts/typecheck-strict.mjs --list-deferred` to see diagnostics outside that set — moving a directory into the strict set is then a one-line config change. Use `assertDefined` (`src/utils/assertDefined.ts`) instead of `!` where `noUncheckedIndexedAccess` can't follow reasoning the caller already did.

### EAS Build & Deploy

**Local builds only — never a bare cloud `eas build`.** The account has exhausted EAS cloud build credits; every `eas build` invocation must carry `--local` (or run inside the GitHub Actions runner, which also uses `--local`). For day-to-day dev/simulator work, prefer `npx expo run:ios` / `npx expo run:android` over invoking EAS at all.

```bash
npx expo run:ios                                              # Local dev build + launch (simulator/device)
npx expo run:android                                          # Local dev build + launch (emulator/device)
npm run testflight:build-local                                # iOS production IPA, local build, synced build number
eas build --platform android --profile production --local     # Android production AAB, local build (also what CI runs)
eas submit --platform android --profile production            # Submit Android to Play Store (upload only, not a build)
```

### iOS Release Credential Rule

```bash
eas build --platform ios --profile production --local
```

- Default to a local EAS production build first for TestFlight releases.
- Let EAS use remote Expo-managed iOS credentials when they are configured for the project.
- Do not treat absent local signing artifacts (`credentials.json`, `.p12`, `.mobileprovision`) as a blocker unless the release explicitly requires manual local credentials.
- For TestFlight, do not stop at upload/submission. Use `npm run testflight:submit-and-verify` so the build is submitted and then verified against the intended tester/group before marking the release done.
- If a build is already uploaded, use `npm run testflight:verify-distribution` to confirm the intended tester/group can actually see it before telling anyone it is live.
- If TestFlight verification shows `tester_has_build=true` but `group_has_build=false`, attach the build to the beta group with `asc builds add-groups` or let the verify script do it automatically; a tester-only attachment is not enough to call the release done.

### Supabase

```bash
supabase start       # Start local Supabase (requires Docker)
supabase db reset    # Reset local database
supabase db push     # Push migrations to remote
supabase status      # Check local Supabase status
```

**Migration file versions must match what's live.** Applying a migration through the Supabase MCP `apply_migration` tool records it under the timestamp *MCP* assigns, which can differ from the repo filename. If that happens, rename the repo file to the live version (or run `supabase migration repair`) so `list_migrations`/`db push` stay in sync — a mismatch here blocks `db push` and silently drifts the history table without changing the live schema. Check `list_migrations` for drift before trusting that a repo file and the live database agree; see `docs/research/supabase-migration-drift-2026-09-24.md` for a worked example.

**Edge functions deploy via the Supabase MCP `deploy_edge_function` tool**, not the CLI. Each function's own files go under `functions/<fn>/...` plus anything shared under `functions/_shared/...`, with `functions/<fn>/index.ts` as the entrypoint. `submit-chapter-feedback` additionally needs `import_map_path: functions/submit-chapter-feedback/deno.json` (its own `deno.json`, for its extra import map).

### Common Tasks

```bash
# Clear Expo cache (fixes weird Metro bundler issues)
npx expo start -c

# Reset iOS simulator
xcrun simctl erase all

# Install iOS pods (after adding native dependencies)
cd ios && pod install && cd ..

# Generate app icons
npm run generate-icons  # If script exists

# Check bundle size
npx expo-bundle-analyzer
```

### Before Committing

```bash
npm run lint && npm run format:check
```

Why: Ensures code quality and consistent formatting before PR review

---

## Code Style & Conventions

### Naming

- **Components:** PascalCase with descriptive names (e.g., `AudioPlayerControls.tsx`, `BibleVerseCard.tsx`)
- **Screens:** PascalCase ending in "Screen" (e.g., `BibleReaderScreen.tsx`, `CourseDetailScreen.tsx`)
- **Hooks:** camelCase starting with "use" (e.g., `useAudioPlayer.ts`, `useFontSize.ts`)
- **Services:** camelCase with descriptive names (e.g., `authService.ts`, `bibleDatabase.ts`)
- **Stores:** camelCase ending in "Store" (e.g., `authStore.ts`, `bibleStore.ts`)
- **Utils:** camelCase (e.g., `haptics.ts`, `platform.ts`)
- **Constants:** UPPER_SNAKE_CASE for primitives, camelCase for objects/arrays
- **Types:** PascalCase for interfaces/types (e.g., `User`, `BibleVerse`, `Course`)

### Imports Order

```typescript
// 1. React and React Native
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

// 2. Third-party libraries
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';

// 3. Components (absolute imports via src/)
import { Button } from '../components';

// 4. Services, stores, hooks
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../services/supabase';
import { useTheme } from '../contexts/ThemeContext';

// 5. Types
import type { User, BibleVerse } from '../types';

// 6. Constants
import { BOOKS } from '../constants';
```

### Prettier Configuration

- Single quotes for strings
- Semicolons required
- Print width: 100 characters
- 2 space indentation
- Trailing commas: ES5 style

### ESLint Rules

- No unused variables (warn for underscore-prefixed like `_event`)
- No explicit return types required on functions
- React import not required in JSX scope (React 17+)

### Comments

- Document WHY, not WHAT (code should be self-documenting)
- Explain business logic and Four Fields concepts
- Document Supabase schema relationships
- Mark TODO items with actionable context
- Explain platform-specific workarounds

---

## Domain-Specific Context

### Business Rules

- **Bible Text:** Berean Standard Bible (BSB) is the default translation, stored in SQLite for offline access
- **Four Fields:** Discipleship training method (Entry, Gospel, Discipleship, Kingdom Growth) - core feature
- **Groups:** Users can create study groups, track progress, conduct sessions
- **Audio Bible:** Public-domain BSB and WEB chapter audio are available without extra credentials; Bible.is remains optional only for any future configured streamed translations
- **Progress Tracking:** Tracks verses read, courses completed, time spent - syncs to Supabase
- **Reading Plans:** The Plans tab must render from bundled local data first so the catalog is available offline on-device
- **Offline Mode:** App works fully offline except OAuth, sync, and any remote-only audio streams that have not been downloaded yet
- **User Preferences:** Font size, theme, language, notifications - persist via MMKV

### Four Fields Model

The app implements the "Four Fields" discipleship method:

1. **Entry** (Field 1): Sharing stories, building relationships
2. **Gospel** (Field 2): Teaching Bible stories, salvation message
3. **Discipleship** (Field 3): One-on-one mentoring, spiritual growth
4. **Kingdom Growth** (Field 4): Multiplication, church planting

Each field has lessons, courses, and tracking. Groups conduct sessions following this model.

### External Dependencies

- **Supabase:** Backend (auth, profiles, progress, groups, reading plans, chapter feedback, analytics, admin tooling). Grown well past the original 5 tables — 94 migrations as of this writing. Core tables: `profiles`, `user_progress`, `user_preferences`, `groups`, `group_members`, `group_sessions`, `reading_plans`, `reading_plan_entries`, `user_reading_plan_progress`, `translation_catalog`, `translation_versions`, `user_annotations`, `chapter_feedback_submissions`, `translator_review_attempts`, `analytics_events`. Treat `supabase/migrations/` as the source of truth rather than any list here.
- **Bible.is API:** Optional streaming source only for any future translations that still use Bible.is filesets
- **Google OAuth:** Sign in with Google (uses the supported web + iOS client IDs)
- **Apple Sign-In:** iOS native authentication (configured in app.json)
- **Expo Notifications:** Push notifications for reminders and group updates
- **SQLite:** Local Bible database (bibleDatabase.ts manages this)

### Known Issues & Workarounds

- **iOS Audio Playback:** Requires UIBackgroundModes: ['audio'] in app.json for background play
- **Android Edge-to-Edge:** predictiveBackGestureEnabled: false to avoid nav issues
- **Google Sign-In:** Uses the supported web + iOS client IDs; Android-only client ID setup is not supported here
- **Google Sign-In on iOS:** Release builds must inject the reversed iOS client ID as the Google URL scheme via the Expo config plugin. If `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` is present but the plugin does not receive `iosUrlScheme`, tapping Google sign-in can abort natively before JS receives an error.
- **Expo Go Limitations:** Dev builds required for Apple Sign-In, Google Sign-In, notifications
- **CocoaPods:** May need manual installation (see global CLAUDE.md for fix)
- **MMKV Persistence:** Zustand stores persist user/session but NOT session tokens (security); private per-device data is additionally bucketed per signed-in account (see State Management)

---

## State Management

### Zustand Stores

All stores persist through `zustandStorage` (MMKV, not AsyncStorage — see `stores/mmkvStorage.ts`). `stores/index.ts` only re-exports that shared MMKV plumbing; import each store directly from its own module (`../stores/authStore`, etc.) so importing one store doesn't hydrate every store.

`bibleStore.ts` and `readingPlansStore.ts` are each a single store assembled from slice modules (`stores/bible/*Slice.ts`, `stores/readingPlans/*Slice.ts`) rather than one flat file. The persisted MMKV bytes are pinned regardless: `bibleStore.persistence.test.ts` and `readingPlansStore.persistence.test.ts` assert the exact JSON a store writes and rehydrates (keys, key order, the `partialize` selection, `version`). Any change to what a store persists — including moving code between slices in a way that changes shape — must update those tests deliberately, and bump `version` with a `migrate` if the shape actually changed.

Original five, still present:

- **authStore.ts** — user/session, preferences (fontSize, theme, language, notifications). Persists user + preferences, NOT session tokens.
- **bibleStore.ts** — current reading position, bookmarks/history, translation + downloads state (see `bibleStoreModel.ts`, `bibleTranslationPersistence.ts`).
- **audioStore.ts** — playback state, queue, playback sequence/resume (delegates to `audioQueueModel.ts`, `audioPlaybackSequenceModel.ts`, `audioPlaybackCompletionModel.ts`).
- **progressStore.ts** — reading/course progress, syncs to Supabase when online.
- **fourFieldsStore.ts** — Four Fields group state and actions.

Added since: **annotationStore** (highlights/notes/bookmarks), **libraryStore** (offline audio library/downloads), **gatherStore** (Four Fields/Gather lesson progress), **privacyStore** (privacy lock preferences), **readingPlansStore**, **translationPreferenceStore**, **translatorReviewStore** (translator queue + dev-passcode-gated review), **readerChromeStore** (reader UI chrome state).

**Account-scoped private data (`stores/privateDataScope.ts`):** annotations, library, gather, and Four Fields data are device-only (never synced), so they're bucketed per owner (`<store>:user:<uid>`, or the bare key for guests) rather than wiped at sign-in/out. Signing in for the first time merges the guest bucket into the account; switching accounts swaps buckets without deleting either. `stores/migrateFromAsyncStorage.ts` handles the one-time move for installs that predate MMKV.

### When to Use Zustand vs React State

- **Zustand:** Global state, needs persistence, shared across screens
- **React State:** Component-local state, temporary UI state, forms

---

## Navigation Architecture

### Structure

Five root tabs, defined in `navigation/tabManifest.ts`: Home, Bible, Learn (labelled "Gather" — `tabs.gather`), Plans, More.

```
RootNavigator (NavigationContainer)
└── TabNavigator (Bottom Tabs)
    ├── HomeStack (Stack Navigator)
    │   └── HomeScreen
    ├── BibleStack (Stack Navigator)
    │   ├── BibleBrowser / BiblePicker (modal) (BibleBrowserScreen)
    │   ├── ChapterSelector (ChapterSelectorScreen)
    │   ├── BibleReader (BibleReaderScreen)
    │   ├── TranslatorQueue (TranslatorReviewQueueScreen)
    │   └── ChapterFeedbackReview (ChapterFeedbackReviewScreen)
    ├── LearnStack (Stack Navigator - "Gather" tab)
    │   ├── GatherHome (GatherScreen)
    │   ├── FoundationDetail (FoundationDetailScreen)
    │   ├── LessonDetail (LessonDetailScreen)
    │   ├── PrayerWall (PrayerWallScreen)
    │   ├── GroupList (GroupListScreen)
    │   ├── GroupDetail (GroupDetailScreen)
    │   └── GroupSession (GroupSessionScreen)
    ├── PlansStack (Stack Navigator)
    │   ├── PlansHome (PlansHomeScreen)
    │   ├── PlanDetail (PlanDetailScreen)
    │   ├── RhythmDetail (RhythmDetailScreen)
    │   └── RhythmComposer (RhythmComposerScreen)
    └── MoreStack (Stack Navigator)
        ├── MoreScreen, Settings, LocalePreferences, PrivacyPreferences
        ├── Profile, ReadingActivity, Annotations, MyFeedback
        ├── TranslationBrowser, About, Diagnostics
        └── Auth (modal) → AuthStack (AuthScreen, ResetPasswordScreen)
```

### Navigation Types

All navigation types are defined in `/src/navigation/types.ts`. Use proper typing:

```typescript
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BibleStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<BibleStackParamList, 'BibleReader'>;
```

### Authentication Flow

- Unauthenticated users can browse Bible, learn content (limited)
- Auth required for: progress tracking, groups, syncing, personalization
- `AuthStack.tsx` (AuthScreen, ResetPasswordScreen) exists as its own stack but is only reachable as a modal `Auth` route inside `MoreStack` — there's no top-level auth stack in `RootNavigator`
- `useAuthStore().isAuthenticated` determines feature access

---

## Internationalization (i18n)

### Supported Languages

`SUPPORTED_LANGUAGES` in `src/constants/languages.ts` defines 21 interface languages: English (`en`, default), Simplified Chinese (`zh`), Hindi (`hi`), Spanish (`es`), Arabic (`ar`), French (`fr`), Bengali (`bn`), Portuguese (`pt`), Russian (`ru`), Urdu (`ur`), Indonesian (`id`), German (`de`), Japanese (`ja`), Punjabi (`pa`), Marathi (`mr`), Telugu (`te`), Turkish (`tr`), Tamil (`ta`), Vietnamese (`vi`), Korean (`ko`), and Nepali (`ne`). Bible translation availability is separate from interface language support.

### Usage

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<Text>{t('tabs.home')}</Text>
<Text>{t('bible.chapter', { number: 1 })}</Text>
```

### Translation Files

Located in `/src/i18n/locales/`:

- `en.ts` - English (source of truth)
- `{code}.ts` - One exported translation object for each supported language

English loads initially; the other bundled locale objects load on demand through `localeLoaders.ts`. Interface translations do not require a network request.

### Adding New Translations

1. Add key to `en.ts` first
2. Add translations to all language files
3. Use dot notation for nested keys: `bible.chapter`, `settings.notifications.enabled`
4. Always use translation keys - NEVER hardcode user-facing strings
5. Preserve interpolation tokens exactly, including `{{count}}` and `{{name}}`. Keep every English key and add the locale's required plural variants for existing `_other` stems. Valid additional suffixes come from `Intl.PluralRules(code).resolvedOptions().pluralCategories` (for example, Russian `_few` and `_many`); unrelated extra keys are rejected.

### Translation Verification

Run the locale, source coverage, and runtime rendering checks after updating translations:

```bash
node --test --import tsx src/i18n/locales/coverage.test.ts src/i18n/locales/coreLocaleCoverage.test.ts src/i18n/interfaceCoverage.test.ts src/i18n/interfaceRendering.test.ts
npm run typecheck
```

These checks require the full English keyset, exact interpolation tokens, all language-specific plural forms, nonblank text without translation artifacts, and no unintended English copies. Legitimate shared words and proper names need explicit exceptions in the coverage test. Source checks catch missing translation keys and hardcoded JSX/accessibility text; rendering checks exercise all bundled locales without English fallback or unresolved tokens.

### Native Permission Messages

Translate camera, microphone, photo-library, and Face ID explanations under `interface.nativePermissions` in every locale. After changing them, regenerate and check the native resources:

```bash
npm run i18n:native
npm run i18n:native:check
```

`scripts/sync-native-localizations.mjs` updates `src/i18n/native/{code}.json`, the Expo locale configuration in `app.json`, and the iOS `InfoPlist.strings` resources/project references. Chinese uses the native locale code `zh-Hans`. Review these generated changes with the source translations. iOS chooses system permission prompt translations from the device or per-app OS language, independently of the language selected inside EveryBible. Permission-message changes require a rebuilt and installed native app; changing the in-app language or refreshing JavaScript does not replace them.

### Language Detection

App automatically detects device language via expo-localization. Falls back to English if unsupported.

---

## Theming & Styling

### Theme Context

Use `useTheme()` hook for all colors:

```typescript
import { useTheme } from '../contexts/ThemeContext';

const { colors, isDark } = useTheme();

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
  },
  text: {
    color: colors.primaryText,
  },
});
```

### Available Colors

See `ThemeColors` and `createThemeColors()` in `/src/contexts/ThemeContext.tsx` (palettes in `/src/constants/appearancePalettes.ts`) for the full token set:

- `background` - Main background
- `cardBackground` - Card/section backgrounds
- `primaryText` - Main text color
- `secondaryText` - Muted text
- `accentPrimary` - Primary accent (terracotta by default; historically called "el-blue" as a storage id, with an alternate `el-blue-brand` palette also available)
- `tabActive` / `tabInactive` - Tab bar colors
- `errorText` - Error messages
- And many more...

### Design System (Every Language / "EL" redesign)

The app runs the "Every Language" (EL) design system (`src/design/system.ts`, `src/constants/appearancePalettes.ts`): a warm, paper-like "vellum" default surface, tighter EL corner-radius tokens, and Lucide icons (`lucide-react-native`, see `navigation/tabManifest.ts`). Two font families are bundled and loaded at startup (`App.tsx`): **Alte Haas Grotesk** as the identity/display face (screen titles, chapter numerals — Latin-only, so `getDisplayFontFamily()` falls back to the platform UI font for the ~14 of 21 interface languages it can't render) and **Lora** as the reading serif (via `getReadingFontFamily()`, with the same non-Latin fallback). Alte Haas Grotesk is used on both the mobile app and the marketing site — it is not web-only.

### Font Sizes

Use `useFontSize()` hook for responsive text:

```typescript
import { useFontSize } from '../hooks';

const fontSize = useFontSize();
// Returns scaled font sizes based on user preference (small, medium, large)
```

### Style Guidelines

- Always use StyleSheet.create() at component bottom
- Never inline styles (performance + maintainability)
- Theme-aware colors only (no hardcoded hex values)
- Use padding/margin with multiples of 4 (4, 8, 12, 16, 24, etc.)

---

## Authentication & Security

### Supabase Configuration

Requires environment variables in `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=xxx
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=xxx
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=xxx
```

### Auth Methods

1. **Email/Password:** Standard Supabase auth
2. **Apple Sign-In:** iOS only (requires app.json config)
3. **Google Sign-In:** Cross-platform (requires OAuth client IDs)

### Auth Flow

```typescript
// Sign in
import { signInWithGoogle } from '../services/auth';
const { user, error } = await signInWithGoogle();

// Check auth state — import the store directly; '../stores' is not a barrel
import { useAuthStore } from '../stores/authStore';
const { isAuthenticated, user } = useAuthStore();

// Sign out
const signOut = useAuthStore((state) => state.signOut);
await signOut();
```

### Security Rules

- Never log session tokens or user credentials
- All Supabase operations use Row Level Security (RLS)
- User can only access their own data (profiles, progress, groups they're in)
- API keys in .env, never committed (use .env.example as template)
- Session stored in memory, NOT persisted to MMKV (security)

---

## Data Management

### SQLite Bible Database

- Located in app's document directory
- Managed by `/src/services/bible/bibleDatabase.ts`
- Contains BSB text, searchable
- Initialized on first app launch via `initBibleData()`
- Fully offline, no network required

### Supabase Schema

See "External Dependencies" above for the current core table list (`profiles`, `user_progress`, `groups`, `group_members`, `group_sessions`, plus reading plans, feedback, translation catalog, and analytics tables added since). `supabase/migrations/` (94 files) is the source of truth, not this doc.

### Sync Strategy

- App works offline by default
- Periodic sync when online (via useSync hook)
- Conflict resolution: last-write-wins
- User sees loading states during sync

---

## Audio Features

### Audio Bible

- World English Bible chapter audio streams directly from eBible.org and can be downloaded for offline playback
- Bible.is streaming remains supported for configured translations when `EXPO_PUBLIC_BIBLE_IS_API_KEY` is present
- Background playback supported (iOS: UIBackgroundModes)
- Managed by `useAudioPlayer` hook and `audioStore`

### Audio Player Controls

```typescript
import { useAudioPlayer } from '../hooks';

const { status, currentChapter, playChapter, pause, resume } = useAudioPlayer('bsb');
```

### Audio Issues

- iOS: Must configure background modes in app.json
- Android: Foreground service permission required
- Remote streaming requires network, but downloaded chapter audio is available offline
- `expo-av` still does the actual playback (not `expo-audio`). `services/audio/trackPlayer.ts` wraps it behind the `react-native-track-player` v4 API surface as a stopgap — real native track-player needs a bare-workflow eject — so most call sites are already written against that contract. `expo-media-control` (Android only; excluded from iOS autolinking) drives the Android lock-screen/notification MediaSession via `services/audio/androidMediaSession.ts`, since expo-av doesn't expose one itself.

---

## Testing Strategy

Read `docs/testing.md` before writing or changing tests. Summary:

- Tests run on Node's built-in runner (no Jest, no Metro) and are discovered
  automatically: any `*.test.ts` under `src/`, `scripts/`, `apps/`, `packages/`,
  or `supabase/functions`.
- Every service, store, util, and hook under `src/` has behavioral unit tests
  that load the real module through the loader with `mock.module` replacing
  native packages. Shared fakes live in `src/testing/` (Supabase, React Native,
  MMKV, `mockModule`).
- Do not add source-text tests (`readFileSync` + regex) or `vm` transpile tests
  for behaviour; the older ones that remain guard startup import graphs only.
- Bug fixes are test-first: failing test, minimal fix, passing test, same commit.
- `npm test` and `npm run test:release` set `TSX_DISABLE_CACHE=1`; running a test
  file directly with `node --test` needs the same env var if it stalls on exit
  (see docs/testing.md). `fast-check` is available for property tests.

```bash
npm test                                   # whole workspace (~670 *.test.ts files; see docs/testing.md for current timing)
node --test --experimental-test-module-mocks --import tsx src/path/to/file.test.ts
npm run typecheck                          # tests are type-checked too
```

### Manual Testing Checklist (device behaviour tests cannot cover)

- Test on both iOS and Android simulators
- Test offline mode (airplane mode)
- Test OAuth on physical devices (doesn't work in Expo Go)
- Test audio playback in background
- Test language switching, theme switching, font size adjustments

---

## Performance Considerations

### Optimization Rules

- Use React.memo for expensive components
- FlatList for long lists (Bible chapters, courses)
- Lazy load screens (already done via React Navigation)
- Optimize images (use optimized assets)
- SQLite queries indexed (Bible database)
- Avoid re-renders (proper Zustand selectors)

### Bundle Size

- Current app is Expo managed workflow (smaller than bare)
- Avoid large dependencies without good reason
- Use tree-shaking where possible
- expo-bundle-analyzer to check size

### Database Performance

- SQLite Bible database has indexes on book/chapter/verse
- Keep Supabase queries lean (only fetch needed data)
- Pagination for group lists, sessions

---

## Deployment

### EAS Configuration

See `eas.json` for build profiles:

- **development:** Dev client, internal distribution, expects Metro on launch
- **preview:** Internal distribution builds (not TestFlight) with embedded JS bundle
- **production:** App Store/Play Store builds with embedded JS bundle

### Build Process

```bash
# Pre-build release guard for local iOS signing and branch sync
npm run release:prepare

# iOS Production
npm run testflight:build-local

# Android Production — always --local; never a bare cloud `eas build`.
# In practice this runs in CI: .github/workflows/android-production-release.yml
# builds on push to main via `eas build --platform android --profile production --local --non-interactive`.
eas build --platform android --profile production --local

# Preflight iOS submission artifact
bash scripts/testflight_precheck.sh /absolute/path/to/app.ipa

# Submit to stores
eas submit --platform ios --profile production
eas submit --platform android --profile production
```

### App Store Configuration

**iOS:**

- Bundle ID: com.everybible.app
- Apple ID: curryj@protonmail.com
- Team ID: NVC9N47PRH
- App Store ID: 6758254335

**Android:**

- Package: com.everybible.app
- Service account: google-play-service-account.json
- Uploads to production track as draft

### Release Checklist

1. Update version in app.json
2. Test on both platforms
3. Run `npm run release:prepare` in a clean release worktree
4. Build with the synced local iOS flow (`npm run testflight:build-local`)
5. Test builds via internal distribution or TestFlight, depending on profile
6. Submit iOS by IPA path (`eas submit --platform ios --profile production --path /absolute/path/to/app.ipa --non-interactive --no-wait`)
7. Submit Android to Play when applicable
8. Monitor crash reports

`npm run release:prepare` runs the release metadata checks and `scripts/testflight_release_guard.ts`, which now fails fast if the EAS remote iOS build number has drifted away from App Store Connect latest + 1 or if someone accidentally switched the repo into stale local-signing mode. `npm run testflight:build-local` then syncs the Expo-managed iOS build number into native code before the local IPA build so TestFlight uploads cannot silently reuse an old `CFBundleVersion`. The precheck script also compares the IPA build number against the current EAS remote counter before any upload proceeds.

### ⛔ TestFlight Distribution — MANDATORY 4-Step Flow

**Default for `ship it`: land on `main`, then Internal Testers only.**
Do not mark a release done until the build is attached to the `Internal Testers` group and visible in TestFlight. `eas submit` only uploads the binary; upload success is not the finish line.

Side-branch TestFlight builds are allowed when you intentionally want testers to exercise branch work before it lands on `main`.

`eas submit` only uploads the binary. **Build is invisible to ALL testers until these 4 steps are done.**
This mistake has been made 4 times (builds 113, 115, 138, 142). Do not skip.

**Step 1 — Poll until `processingState=VALID`** (~5-10 min after upload)
**Step 2 — Attach to the Internal Testers beta group** via POST `/v1/builds/<id>/relationships/betaGroups`

- Internal: `3a75b4d5-cae0-4c9a-8880-890f486f605a`
  **Step 3 — Verify** the build appears in the Internal Testers group before telling user anything
  **Step 4 — Only if the user explicitly wants external testers:** attach the external beta group and submit for external review

Use the Python JWT script in `~/.claude/projects/-Users-dev-Projects-EveryBible/memory/feedback_testflight_distribution.md`.
ASC key: `~/.asc/AuthKey_766CTDMG96.p8` | App ID: `6758254335`

---

## Troubleshooting

### Common Issues

**Metro bundler cache issues:**

```bash
npx expo start -c
```

**iOS build fails:**

```bash
cd ios && pod install && cd ..
# Or clear derived data in Xcode
```

**Android build fails:**

- Check Java version (needs 17)
- Clear gradle cache: `cd android && ./gradlew clean`

**Supabase not configured error:**

- Check .env file exists and has valid credentials
- Verify EXPO*PUBLIC* prefix on all env vars

**Audio doesn't play in background (iOS):**

- Verify UIBackgroundModes: ['audio'] in app.json

**Google Sign-In fails:**

- Need the supported client IDs (web and iOS)
- Android-only Google client ID setup is not supported in this repo
- Web client ID must be configured in Supabase

**TypeScript errors after dependency update:**

```bash
rm -rf node_modules && npm install
```

**Expo Go doesn't support feature:**

- Create a development build locally: `npx expo run:ios` / `npx expo run:android` (never a bare cloud `eas build`)

---

## External Memory

- `SCRATCHPAD.md` - Current session notes, blockers, next steps
- `.env` - Environment variables (never commit!)
- `.env.example` - Template for required env vars
- `eas.json` - Build configuration
- `/supabase/migrations/` - Database schema history

---

## Dependencies

### Key Dependencies

- **expo:** ~54.0.36 - Platform and build system
- **react-native:** 0.81.5 - UI framework
- **@supabase/supabase-js:** ^2.91.0 - Backend client
- **zustand:** ^5.0.10 - State management
- **react-native-mmkv:** 2.12.2 - Zustand persistence (pinned to v2 for old-architecture compatibility; patched via patch-package for Android 16KB page-size compliance)
- **react-navigation:** ^7.x - Navigation
- **i18next / react-i18next:** ^25.x / ^16.x - Internationalization
- **expo-sqlite:** ~16.0.10 - Local Bible database
- **expo-av:** ~16.0.8 - Audio playback (not expo-audio)
- **expo-media-control:** 1.0.12 - Android lock-screen/notification MediaSession
- **lucide-react-native:** ^1.38.0 - Icon set (tab bar and elsewhere)
- **expo-apple-authentication:** ~8.0.8 - Apple Sign-In
- **@react-native-google-signin/google-signin:** ^16.1.1 - Google Sign-In

### Adding Dependencies

1. Check bundle size impact first
2. Verify Expo compatibility (use expo install when possible)
3. Test on both platforms
4. Update iOS pods if native dependency: `cd ios && pod install`
5. May require new development build

---

## Four Fields Implementation Notes

### Course Structure

Courses are organized by fields (1-4) with lessons:

- Field 1 (Entry): Relationship building, storytelling
- Field 2 (Gospel): Bible stories, salvation
- Field 3 (Discipleship): One-on-one growth
- Field 4 (Kingdom): Multiplication, leadership

### Group Sessions

Groups conduct sessions following Four Fields model:

1. Look Back (review progress)
2. Look Up (Bible study)
3. Look Forward (application, goals)

Sessions tracked in Supabase with attendance, notes, progress.

### Progress Tracking

- Individual course progress (fourFieldsStore)
- Group progress (via Supabase)
- Visualized with progress indicators in UI

---

## When You Get Stuck

1. **Check logs:** Console in Expo Go, or Xcode/Android Studio for native logs
2. **Supabase Dashboard:** Check auth, database, real-time logs
3. **Clear everything:**
   ```bash
   npx expo start -c
   rm -rf node_modules && npm install
   cd ios && pod install && cd ..
   ```
4. **Platform-specific issues:** Test on physical device, not just simulator
5. **Ask questions if unclear:** This is a complex app with many moving parts

---

## Updates Log

- 2026-01-29: Initial CLAUDE.md created based on codebase analysis
- 2026-09-24: Documented the screen-subfolder pattern, bibleStore/readingPlansStore slice
  architecture + persistence pinning, `typecheck:strict` scope and `assertDefined`, and
  MCP-based edge function deployment, after the day's large refactors
- Future: Use # key to add instructions when Claude needs correction

---

## Remember

- **Offline-first:** App must work without network for Bible reading
- **Multi-language:** Always use t() for strings, never hardcode
- **Theme-aware:** Use colors from useTheme(), never hardcode
- **Type-safe:** Leverage TypeScript strict mode, avoid any
- **Service layer:** Keep business logic in /services, not components
- **Zustand for state:** Don't add new Context providers
- **Test both platforms:** iOS and Android have different quirks
- **Security matters:** This app handles user data and authentication

This is a production app serving real users. Code quality and user experience matter.
