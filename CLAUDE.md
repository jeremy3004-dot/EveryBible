# EveryBible Project Guide

## Project Overview

EveryBible is a mobile Bible study app built with Expo/React Native. It provides offline Bible reading, audio playback, discipleship courses (Four Fields), group study features, and multi-language support (EN, ES, NE, HI). The app uses Supabase for backend services and supports Apple/Google OAuth authentication.

**Tech Stack:** React Native 0.81, Expo SDK 54, TypeScript, Zustand, Supabase, React Navigation, i18next, SQLite
**Current Phase:** Production - App is live on iOS/Android

---

## Critical Rules (Always Follow)

1. **TypeScript strict mode is enabled** - Why: Catch type errors at compile time, app handles sensitive user data
2. **Never commit .env file** - Why: Contains Supabase keys, OAuth credentials, API keys
3. **Always use barrel exports (index.ts)** - Why: Maintains clean import paths across codebase
4. **Theme context for all colors** - Why: App supports dark mode, hardcoded colors break theming
5. **Translation keys for ALL user-facing text** - Why: App supports 4 languages, no hardcoded strings
6. **Use Zustand stores for global state** - Why: Lightweight, persistent via AsyncStorage, already established pattern
7. **Offline-first architecture** - Why: Bible data is SQLite-based for offline access
8. **Test on both iOS and Android** - Why: Platform-specific issues with audio, notifications, OAuth
9. **Use Expo's native modules** - Why: Custom native modules require ejecting from managed workflow
10. **Follow React Navigation v7 patterns** - Why: Stack/Tab navigators have specific type requirements

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
  /i18n           - Internationalization (en, ne, hi, es locales)
  /navigation     - Navigation stacks (AuthStack, BibleStack, HomeStack, LearnStack, MoreStack, TabNavigator)
  /screens        - Screen components organized by feature (auth, bible, home, learn, more)
  /services       - Business logic (audio, auth, bible, courses, supabase, sync)
  /stores         - Zustand stores (authStore, bibleStore, audioStore, progressStore, fourFieldsStore)
  /types          - TypeScript type definitions
  /utils          - Utility functions (platform, haptics)

/supabase         - Supabase migrations and functions
/data             - Bible text data files
/assets           - Images, icons, fonts
/scripts          - Build and utility scripts
```

### Patterns We Use
- **State Management:** Zustand with AsyncStorage persistence (authStore, bibleStore, audioStore, progressStore, fourFieldsStore)
- **Navigation:** React Navigation v7 (Bottom Tabs + Native Stack navigators)
- **Styling:** StyleSheet.create() with ThemeContext colors - no inline styles
- **API Layer:** Supabase client for backend, SQLite for Bible data
- **Error Handling:** ErrorBoundary component wraps app, try/catch in async operations
- **i18n:** react-i18next with expo-localization for device locale detection
- **Routing:** Tab-based with nested stacks (Home, Bible, Harvest/Learn, More)

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
npm run typecheck      # TypeScript compile check
npm run test:release   # Focused release regression suite
npm run release:verify # Lint + typecheck + release metadata + release regressions
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Format code with Prettier
npm run format:check   # Check code formatting
```

### EAS Build & Deploy
```bash
eas build --platform ios --profile development    # Dev build with dev client
eas build --platform ios --profile preview        # Internal distribution build
eas build --platform ios --profile production     # Store/TestFlight submission build
eas build --platform android --profile production # Android production build
eas submit --platform ios --profile production    # Submit iOS to App Store/TestFlight
eas submit --platform android --profile production # Submit Android to Play Store
```

### Supabase
```bash
supabase start       # Start local Supabase (requires Docker)
supabase db reset    # Reset local database
supabase db push     # Push migrations to remote
supabase status      # Check local Supabase status
```

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
import { useAuthStore } from '../stores';
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
- **Audio Bible:** Public-domain WEB chapter audio is available without extra credentials; Bible.is remains optional for configured streamed translations
- **Progress Tracking:** Tracks verses read, courses completed, time spent - syncs to Supabase
- **Offline Mode:** App works fully offline except OAuth, sync, and any remote-only audio streams that have not been downloaded yet
- **User Preferences:** Font size, theme, language, notifications - persist via AsyncStorage

### Four Fields Model
The app implements the "Four Fields" discipleship method:
1. **Entry** (Field 1): Sharing stories, building relationships
2. **Gospel** (Field 2): Teaching Bible stories, salvation message
3. **Discipleship** (Field 3): One-on-one mentoring, spiritual growth
4. **Kingdom Growth** (Field 4): Multiplication, church planting

Each field has lessons, courses, and tracking. Groups conduct sessions following this model.

### External Dependencies
- **Supabase:** Backend (auth, profiles, progress, groups). Tables: profiles, user_progress, groups, group_members, group_sessions
- **Bible.is API:** Optional streaming source for configured translations that still use Bible.is filesets
- **Google OAuth:** Sign in with Google (uses the supported web + iOS client IDs)
- **Apple Sign-In:** iOS native authentication (configured in app.json)
- **Expo Notifications:** Push notifications for reminders and group updates
- **SQLite:** Local Bible database (bibleDatabase.ts manages this)

### Known Issues & Workarounds
- **iOS Audio Playback:** Requires UIBackgroundModes: ['audio'] in app.json for background play
- **Android Edge-to-Edge:** predictiveBackGestureEnabled: false to avoid nav issues
- **Google Sign-In:** Uses the supported web + iOS client IDs; Android-only client ID setup is not supported here
- **Expo Go Limitations:** Dev builds required for Apple Sign-In, Google Sign-In, notifications
- **CocoaPods:** May need manual installation (see global CLAUDE.md for fix)
- **AsyncStorage Persistence:** Zustand stores persist user/session but NOT session tokens (security)

---

## State Management

### Zustand Stores
All stores use zustand with AsyncStorage persistence:

**authStore.ts**
- User authentication state (user, session, isAuthenticated)
- User preferences (fontSize, theme, language, notifications)
- Actions: setUser, setSession, setPreferences, signOut, initialize
- Persists: user, preferences (NOT session tokens for security)

**bibleStore.ts**
- Current reading state (book, chapter, verse)
- Reading history and bookmarks
- Font size and reading preferences
- Actions: setCurrentBook, setCurrentChapter, addBookmark, etc.

**audioStore.ts**
- Audio playback state (isPlaying, currentChapter, position)
- Playlist management
- Actions: play, pause, seek, next, previous

**progressStore.ts**
- User progress tracking (verses read, courses completed, time)
- Syncs to Supabase when online
- Actions: trackProgress, syncProgress

**fourFieldsStore.ts**
- Four Fields course progress
- Lesson completion state
- Actions: markLessonComplete, resetProgress

### When to Use Zustand vs React State
- **Zustand:** Global state, needs persistence, shared across screens
- **React State:** Component-local state, temporary UI state, forms

---

## Navigation Architecture

### Structure
```
RootNavigator (NavigationContainer)
└── TabNavigator (Bottom Tabs)
    ├── HomeStack (Stack Navigator)
    │   ├── HomeScreen
    │   ├── DailyReadingScreen
    │   └── ProgressScreen
    ├── BibleStack (Stack Navigator)
    │   ├── BibleReaderScreen
    │   ├── ChapterSelectorScreen
    │   └── BookSelectorScreen
    ├── LearnStack (Stack Navigator - "Harvest" tab)
    │   ├── CourseListScreen
    │   ├── CourseDetailScreen
    │   ├── FourFieldsJourneyScreen
    │   ├── FieldOverviewScreen
    │   ├── FourFieldsLessonViewScreen
    │   ├── GroupListScreen
    │   ├── GroupDetailScreen
    │   └── GroupSessionScreen
    └── MoreStack (Stack Navigator)
        ├── MoreScreen
        ├── SettingsScreen
        ├── AccountScreen
        └── AboutScreen
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
- No separate AuthStack - auth screens in MoreStack
- useAuthStore.isAuthenticated determines feature access

---

## Internationalization (i18n)

### Supported Languages
- English (en) - Default
- Spanish (es)
- Nepali (ne)
- Hindi (hi)

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
- `es.ts` - Spanish
- `ne.ts` - Nepali
- `hi.ts` - Hindi

### Adding New Translations
1. Add key to `en.ts` first
2. Add translations to all language files
3. Use dot notation for nested keys: `bible.chapter`, `settings.notifications.enabled`
4. Always use translation keys - NEVER hardcode user-facing strings

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
See `/src/constants/colors.ts` for full palette:
- `background` - Main background
- `cardBackground` - Card/section backgrounds
- `primaryText` - Main text color
- `secondaryText` - Muted text
- `accentGreen` - Primary accent (brand color)
- `tabActive` / `tabInactive` - Tab bar colors
- `errorText` - Error messages
- And many more...

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

// Check auth state
import { useAuthStore } from '../stores';
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
- Session stored in memory, NOT AsyncStorage (security)

---

## Data Management

### SQLite Bible Database
- Located in app's document directory
- Managed by `/src/services/bible/bibleDatabase.ts`
- Contains BSB text, searchable
- Initialized on first app launch via `initBibleData()`
- Fully offline, no network required

### Supabase Schema
**profiles table:**
- User profile data (display_name, avatar_url, preferences)
- One-to-one with auth.users

**user_progress table:**
- Reading progress, course completion, time tracking
- JSON fields for flexible progress tracking

**groups table:**
- Study groups (name, description, leader_id)
- Four Fields group management

**group_members table:**
- Group membership (many-to-many)

**group_sessions table:**
- Session records (date, field, notes, attendance)

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

const {
  isPlaying,
  currentChapter,
  play,
  pause,
  seek
} = useAudioPlayer();
```

### Audio Issues
- iOS: Must configure background modes in app.json
- Android: Foreground service permission required
- Remote streaming requires network, but downloaded chapter audio is available offline
- expo-av handles playback

---

## Testing Strategy

### Manual Testing Checklist
- Test on both iOS and Android simulators
- Test offline mode (airplane mode)
- Test OAuth on physical devices (doesn't work in Expo Go)
- Test audio playback in background
- Test language switching
- Test theme switching (dark mode)
- Test font size adjustments

### Platform-Specific Testing
**iOS:**
- Apple Sign-In (device only)
- Background audio playback
- Push notifications

**Android:**
- Google Sign-In
- Edge-to-edge display
- Back gesture handling

### Future: Automated Tests
- No test suite currently
- Good candidates: Utility functions, data parsing, stores
- React Native Testing Library for components
- Jest for unit tests

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
- **development:** Dev client, internal distribution
- **preview:** Internal distribution builds (not TestFlight)
- **production:** App Store/Play Store builds

### Build Process
```bash
# iOS Production
eas build --platform ios --profile production

# Android Production
eas build --platform android --profile production

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
- Service account: every-bible-485319-82e2f287e3f8.json
- Uploads to internal track as draft

### Release Checklist
1. Update version in app.json
2. Test on both platforms
3. Run lint and format checks
4. Build with EAS (production profile)
5. Test builds via internal distribution or TestFlight, depending on profile
6. Submit to stores
7. Monitor crash reports

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
- Verify EXPO_PUBLIC_ prefix on all env vars

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
- Create development build: `eas build --profile development`

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
- **expo:** ~54.0.32 - Platform and build system
- **react-native:** 0.81.5 - UI framework
- **@supabase/supabase-js:** ^2.91.0 - Backend client
- **zustand:** ^5.0.10 - State management
- **react-navigation:** ^7.x - Navigation
- **i18next / react-i18next:** ^25.x / ^16.x - Internationalization
- **expo-sqlite:** ~16.0.10 - Local Bible database
- **expo-av:** ~16.0.8 - Audio playback
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
