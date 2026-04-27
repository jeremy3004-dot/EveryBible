# EveryBible Architecture Overview

## Purpose

This document describes the complete system architecture for EveryBible—a mobile Bible study app built with Expo/React Native, backed by Supabase and a monorepo orchestrated with Turbo. It is intended as a reference for engineers joining the project and for understanding how systems interact across the stack.

**Last Updated:** April 2026  
**Audience:** Backend and mobile engineers, system architects

---

## Table of Contents

1. [High-Level System Overview](#high-level-system-overview)
2. [Monorepo Structure](#monorepo-structure)
3. [Mobile App Architecture](#mobile-app-architecture)
4. [Data Flow & Synchronization](#data-flow--synchronization)
5. [Authentication & Security](#authentication--security)
6. [State Management](#state-management)
7. [Bible Data Pipeline](#bible-data-pipeline)
8. [Audio System](#audio-system)
9. [Reading Plans & Progress](#reading-plans--progress)
10. [Navigation & Routing](#navigation--routing)
11. [Admin Portal & Public Site](#admin-portal--public-site)
12. [Analytics & Telemetry](#analytics--telemetry)
13. [Internationalization & Theming](#internationalization--theming)
14. [Discipleship Features](#discipleship-features)
15. [Annotations & Local Storage](#annotations--local-storage)
16. [Edge Functions & Workers](#edge-functions--workers)
17. [System Interaction Diagram](#system-interaction-diagram)
18. [Deployment & CI/CD](#deployment--cicd)

---

## High-Level System Overview

EveryBible is a multi-platform system composed of:

- **Mobile App** (Expo/React Native 0.81, TypeScript)
  - Offline-first Bible reading with SQLite database
  - Audio playback, reading plans, discipleship courses
  - Real-time sync with cloud when available

- **Backend** (Supabase)
  - Authentication (Apple/Google OAuth, email)
  - User profiles, progress tracking, groups
  - 44 migrations, 5 edge functions

- **Admin Portal** (Next.js 15, Vercel)
  - Dashboard, translation management, content publishing
  - User support tools, analytics visualization

- **Public Site** (Next.js 15, Vercel)
  - Marketing homepage, privacy/terms
  - Mobile content API, media proxy

- **Edge Infrastructure**
  - Supabase edge functions (geo-enriched analytics, notifications)
  - Cloudflare workers (analytics collection, IP geolocation)

- **Data Pipeline**
  - 45 Python/TypeScript scripts for Bible data management
  - Bible text seeding, translation downloads, cross-reference imports

---

## Monorepo Structure

```
EveryBible/
├── apps/
│   ├── admin/               # Next.js 15 admin portal (Vercel)
│   └── site/                # Next.js 15 public website (Vercel)
│
├── src/                      # Expo/React Native mobile app
│   ├── components/          # Reusable UI components
│   ├── contexts/            # ThemeContext (only)
│   ├── hooks/               # Custom React hooks
│   ├── i18n/                # Internationalization (21 languages)
│   ├── navigation/          # React Navigation v7 stack definitions
│   ├── screens/             # Screen components by feature
│   ├── services/            # Business logic layer
│   │   ├── auth/            # Authentication
│   │   ├── bible/           # Bible data & search
│   │   ├── audio/           # Audio playback & downloads
│   │   ├── plans/           # Reading plans
│   │   ├── sync/            # Cloud sync orchestration
│   │   ├── courses/         # Four Fields & Gather lessons
│   │   ├── groups/          # Group management
│   │   ├── supabase/        # Supabase client & types
│   │   └── notifications/   # Push notifications
│   ├── stores/              # Zustand + MMKV state
│   ├── types/               # TypeScript definitions
│   ├── utils/               # Utility functions
│   ├── design/              # Design tokens & system
│   └── constants/           # Static data
│
├── supabase/
│   ├── migrations/          # 44 database migrations
│   └── functions/           # 5 edge functions
│
├── cloudflare/
│   └── analytics-collector/ # Analytics ingestion worker
│
├── scripts/                 # 45 data management scripts
│   ├── bible/               # Bible text seeding
│   ├── translations/        # Translation imports
│   └── *.ts|*.py           # Misc. utilities
│
├── packages/
│   ├── env/                 # Shared environment config
│   └── types/               # Shared TypeScript types
│
├── .github/
│   └── workflows/           # CI/CD (Android production release)
│
├── docs/                    # Project documentation
├── data/                    # Static data files
├── assets/                  # Images, icons, fonts
└── app.json                 # Expo configuration
```

**Key Points:**
- Monorepo uses **Turbo** for orchestration
- Mobile app is primary focus; admin/site are secondary services
- All code is **TypeScript** (strict mode enabled)
- Environment config centralized in `packages/env/`
- No custom native modules (Expo managed workflow only)

---

## Mobile App Architecture

### Core App Structure

**Entry Point:** `/src/App.tsx`

```typescript
App.tsx
  ├── Initialize stores (authStore, bibleStore, progressStore, etc.)
  ├── Initialize Supabase
  ├── Set up error boundary
  ├── Apply theme context
  └── Render RootNavigator
```

**RootNavigator:** `/src/navigation/RootNavigator.tsx`
- Conditionally renders authentication flow
- Renders bottom tab navigation (5 main tabs)
- Handles deep linking

### Navigation Structure

**React Navigation v7** with bottom tabs and nested stacks:

```
RootNavigator (NavigationContainer)
├── [Auth Flow if !isAuthenticated]
│   └── AuthStack (Sign in, Sign up, etc.)
│
└── TabNavigator (BottomTabNavigator, 5 tabs)
    ├── HomeStack (Home, Daily Reading, Progress)
    ├── BibleStack (Bible Reader, Chapter Select, Search)
    ├── GatherStack (Gather lessons, courses)
    ├── PlansStack (Reading plans, progress)
    └── MoreStack (Settings, Account, About, Auth screens)
```

**Deep Linking:** `com.everybible.app://bible/{bookSlug}/{chapter}/{verse?}`

See `/src/navigation/linkingConfig.ts` for full routing configuration.

### Component Architecture

**Location:** `/src/components/`

Components are organized by feature:
- `AudioPlayer/` — Audio playback controls, UI
- `Bible/` — Verse cards, chapter browsers
- `Books/` — Book selection, filtering
- `Buttons/` — Reusable button variants
- `Typography/` — Text components with font scaling
- `FourFields/` — Lesson views, progress indicators
- `Gather/` — Discipline categories, lesson cards
- `Forms/` — Input fields, feedback forms
- `Loaders/` — Skeleton screens, spinners

**Rules:**
- All styling via `StyleSheet.create()` at component bottom
- All colors from `useTheme()` hook (no hardcoded hex)
- All text via `t('translation.key')` (no hardcoded strings)
- Use `React.memo()` for expensive list items

---

## Data Flow & Synchronization

### Sync System Overview

**Files:**
- `/src/services/sync/syncService.ts` (382 lines) — Orchestration
- `/src/services/sync/syncMerge.ts` (240 lines) — Merge algorithms
- `/src/hooks/useSync.ts` — Hook for triggering sync

**Sync Triggers:**
1. App moves to foreground (via AppState)
2. Network reconnects (via useNetInfo)
3. Auth state change (sign in/out)
4. Manual refresh (user pulls to refresh)

**Three Sync Operations:**

1. **syncProgress()** — Reading history, chapter streak
   - Fetch remote progress via Supabase RPC
   - Merge with local using `mergeReadingSnapshot()`
   - Conflict resolution: newer timestamp wins
   - Grace period: 5 minutes (local wins if edited < 5 min ago)

2. **syncPreferences()** — Font size, theme, language
   - Fetch remote preferences from `profiles` table
   - Merge with local using `mergePreferences()`
   - Remote wins unless it would reopen completed onboarding
   - Push local changes back if newer

3. **syncReadingPlans()** — Plan progress, current day
   - Two-way sync: push local → pull remote
   - Union of completed entries
   - `current_day` = max(local, remote)

**Implementation Details:**

```typescript
// syncService.ts
const syncProgress = async () => {
  const userId = await getCurrentUserId();
  if (!userId) return { success: true };
  
  const [local, remote] = await Promise.all([
    getLocalReadingSnapshot(),
    fetchRemoteProgress(userId)
  ]);
  
  const merged = mergeReadingSnapshot(local, remote);
  await applyMergedState(merged);
};

// syncMerge.ts
export const mergeReadingSnapshot = (
  local: LocalReadingSnapshot,
  remote: RemoteReadingSnapshot
) => ({
  chaptersRead: union(local.chaptersRead, remote.chaptersRead),
  streakDays: Math.max(local.streakDays, remote.streakDays),
  currentBook: remote.currentBook || local.currentBook,
});
```

**Guard Rails:**
- `isSyncing` ref prevents concurrent syncs
- Only syncs if app is `initialized && authenticated`
- Network errors are logged but not fatal
- UI displays sync status in header

---

## Authentication & Security

### Auth System Architecture

**Files:**
- `/src/services/auth/authService.ts` — Main auth logic
- `/src/services/auth/googleSignIn.ts` — Google OAuth flow
- `/src/stores/authStore.ts` — Auth state (Zustand + MMKV)
- `/src/services/auth/authErrors.ts` — Error mapping

### Cold Start Flow

1. **App launches** → `App.tsx` calls `authStore.initialize()`
2. **Check SecureStore** → `getCurrentSession()` retrieves persisted session token
3. **Validate with Supabase** → Call `supabase.auth.getSession()`
4. **Map to app User** → `mapSupabaseUser()` converts Supabase auth.user to app User
5. **Subscribe to changes** → `onAuthStateChange()` listens for logout/expiry
6. **Set isInitialized** → UI renders appropriate screen (Home or Auth)

### Authentication Methods

**Email/Password:**
- Standard Supabase auth
- Requires email verification

**Apple Sign-In (iOS only):**
- Via `expo-apple-authentication`
- Configured in `app.json` with App ID
- Returns JWT, exchanged for Supabase session

**Google Sign-In (iOS + Android):**
- Via `@react-native-google-signin/google-signin`
- Two client IDs: web (OAuth) + iOS (native)
- Web client ID configured in Supabase
- iOS client ID injected via Expo config plugin
- Android-only client ID setup is NOT supported

### Session Storage

**Critical Security Detail:**
- Session token stored in **expo-secure-store** (platform-native secure enclave)
- NOT persisted to AsyncStorage (too insecure)
- Supabase SecureStore is source of truth
- User/session cleared on sign-out; preferences retained for offline use

### Auth State Machine

```
[Initial]
  ↓
[Loading] → getSession() → validateWithSupabase()
  ↓
[Initialized]
  ├─→ [Authenticated] (user + session set)
  └─→ [Unauthenticated] (user = null, session = null)

On sign-out:
  User/session → null
  Preferences → retained (offline mode)
  Subscribe to onAuthStateChange() → listen for native logout
```

### Error Codes

```typescript
export enum AuthErrorCode {
  CANCELLED = 'cancelled',
  CONFIGURATION = 'configuration',
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
  IN_PROGRESS = 'in_progress',
  INVALID_CREDENTIALS = 'invalid_credentials',
  SERVICE_UNAVAILABLE = 'service_unavailable',
  UNKNOWN = 'unknown',
}
```

---

## State Management

### Zustand + MMKV Architecture

**Shared Storage:** Single MMKV instance (namespaced keys)

File: `/src/stores/mmkvStorage.ts`

```typescript
import { MMKV } from 'react-native-mmkv';
const mmkv = new MMKV(); // Shared instance

// Each store uses namespaced keys:
// authStore: 'auth_*'
// progressStore: 'progress_*'
// bibleStore: 'bible_*'
```

**Why MMKV?**
- Fast, persistent key-value storage
- Namespace support prevents collisions
- Survives app crashes better than AsyncStorage
- Pinned to v2.12.2 (uses `.delete()` not `.remove()`)

### Store Catalog

**Location:** `/src/stores/`

| Store | Purpose | Persisted | Rehydrate Guard |
|-------|---------|-----------|-----------------|
| `authStore.ts` | Auth state + preferences (v3) | ✓ (prefs only) | `sanitizePersistedAuthState()` |
| `progressStore.ts` | Chapters read, streak, progress | ✓ | `sanitizeProgressState()` |
| `bibleStore.ts` | Current book/chapter, translation lifecycle | ✓ | `sanitizeBibleState()` |
| `audioStore.ts` | Playback state, queue, position | ✓ | `sanitizeAudioState()` |
| `annotationStore.ts` | Bookmarks, highlights, notes (local only) | ✓ | `sanitizeAnnotationState()` |
| `libraryStore.ts` | Downloaded translations | ✓ | `sanitizeLibraryState()` |
| `readingPlansStore.ts` | Plans, progress by plan | ✓ | `sanitizeReadingPlansState()` |
| `privacyStore.ts` | Analytics opt-out, feature flags | ✓ | `sanitizePrivacyState()` |
| `fourFieldsStore.ts` | Four Fields course progress | ✓ | `sanitizeFourFieldsState()` |
| `gatherStore.ts` | Gather course progress | ✓ | `sanitizeGatherState()` |

### State Sanitization

**File:** `/src/stores/persistedStateSanitizers.ts`

On app relaunch, each store validates persisted data:

```typescript
// Example: sanitizeProgressState()
const sanitizeProgressState = (raw: unknown): ProgressState => {
  if (!isObject(raw)) return getDefaultProgressState();
  
  const state = raw as Record<string, unknown>;
  return {
    chaptersRead: Array.isArray(state.chaptersRead) 
      ? state.chaptersRead.filter(isValidChapter)
      : [],
    streakDays: Number.isInteger(state.streakDays) 
      ? Math.max(0, state.streakDays)
      : 0,
    // ... validate each field
  };
};
```

**Why Sanitization?**
- Prevents crashes from corrupted MMKV data
- Ensures type safety across releases
- Blocks invalid states from persisting

---

## Bible Data Pipeline

### Bundled Database

**File:** `/assets/databases/bible-bsb-v2.db`

SQLite database (93K verses) bundled with app:

```
Translations:
  - BSB (Berean Standard Bible) — primary, offline
  - WEB (World English Bible) — offline
  - ASV (American Standard Version) — offline (optional)

Schema:
  - verses (id, book, chapter, verse_start, verse_end, text, translation)
  - cross_references (sample dataset of 28 entries)
  - metadata (book names, chapter counts)

Indexes:
  - FTS5 on verse text (BSB + WEB only, for performance)
  - book+chapter+verse (query optimization)
```

**Version Management:** THREE constants must stay in sync

```typescript
// src/services/bible/bibleDataModel.ts
export const BUNDLED_BIBLE_SCHEMA_VERSION = 6;

// src/services/bible/bibleDatabase.ts
export const DEFAULT_MINIMUM_READY_VERSE_COUNT = 90_001;

// assets/databases/bible-bsb-v2.db
PRAGMA user_version = 6;
```

**Why Three?** The upgrade gate in `ensureBundledDatabaseReady()` uses all three to determine if the bundled DB needs re-importing. If any threshold is stale, the app will silently skip reimporting even if data is available.

### Database Initialization

**File:** `/src/services/bible/bibleDatabase.ts`

```typescript
const initDatabase = async () => {
  // 1. Copy bundled DB to app documents directory (first launch only)
  const dbPath = await copyBundledDatabase();
  
  // 2. Open connection
  const db = await SQLiteDatabase.openDatabase({ name: dbPath });
  
  // 3. Verify schema version matches BUNDLED_BIBLE_SCHEMA_VERSION
  const pragma = await db.execAsync('PRAGMA user_version');
  if (pragma !== 6) throw new Error('Schema mismatch');
  
  // 4. Count verses, ensure >= DEFAULT_MINIMUM_READY_VERSE_COUNT
  const count = await countVerses(db);
  if (count < 90_001) throw new Error('Incomplete data');
  
  // 5. Store connection in module-level variable for reuse
  bibleDatabase = db;
};
```

### Cloud Translation Downloads

**File:** `/src/services/bible/cloudTranslationService.ts`

Downloads per-translation SQLite DBs from Supabase:

**State Machine:**

```
[seeded] → download() → verify checksum → install → [installed]
               ↓
            [downloading]
               ↓
            [verifying]
               ↓
            [installing]
               ↓ (on error) → [failed] → rollback()
```

**Implementation:**
- Download happens in background (doesn't block UI)
- Concurrent downloads: 4 chapters per book, 2 books per translation
- LRU cache: 300 entries (in-memory, survives sync)
- Fallback: searches bundled DB if cloud DB not ready
- Telemetry: download duration, checksum failures logged

### Bible Search

**File:** `/src/services/bible/bibleService.ts`

Two strategies:

1. **Bundled DB (BSB/WEB):**
   - Uses FTS5 with BM25 ranking
   - Fast, offline-capable

2. **Cloud Translations:**
   - Skip FTS (causes iOS crash with large datasets)
   - Use exact string match with LIKE
   - Slower but memory-safe

**Search Example:**
```typescript
const search = async (query: string, translationId: string) => {
  const db = getDatabase(translationId);
  
  if (translationId === 'bsb' || translationId === 'web') {
    // FTS5 search
    return db.allAsync(
      'SELECT * FROM verses_fts WHERE text MATCH ? LIMIT 50',
      [query]
    );
  } else {
    // Exact match
    return db.allAsync(
      'SELECT * FROM verses WHERE text LIKE ? LIMIT 50',
      [`%${query}%`]
    );
  }
};
```

### Daily Verse

**File:** `/src/services/bible/dailyScripture.ts`

Deterministic daily rotation (same verse for all users on same day):

```typescript
// POPULAR_VERSE_REFERENCES = 365-entry array
const getDailyVerse = () => {
  const dayOfYear = getDayOfYear();
  const ref = POPULAR_VERSE_REFERENCES[dayOfYear % 365];
  return fetchVerse(ref);
};
```

**Refresh:** `/src/services/bible/dailyScriptureRefresh.ts` updates on app foreground

### Cross-References

**File:** `/src/services/bible/crossReferenceService.ts`

Currently: 28-entry sample dataset from OpenBible.info  
Future: 340K+ full dataset (awaiting import)

```typescript
interface CrossReference {
  verseId: string;
  relatedVerseId: string;
  relationship: 'same_topic' | 'parallel' | 'quotation';
}
```

---

## Audio System

### Architecture

**Files:**
- `/src/services/audio/audioService.ts` — High-level API
- `/src/services/audio/audioRemote.ts` — Remote fetch + cache
- `/src/services/audio/audioPlayer.ts` — Playback wrapper (TrackPlayer)
- `/src/services/audio/audioDownloadService.ts` — Download orchestration
- `/src/hooks/useAudioPlayer.ts` (1176 lines) — React hook + UI state

### Three Resolution Strategies

When audio is requested, the system tries strategies in order:

1. **Local Cache:** Check app's documents/audio directory
2. **Remote Fetch + Cache:**
   - Try provider (Bible.is API) → stream-template (URL pattern) → audio-pack (ZIP)
   - Cache result using LRU (300 entries)
   - Download for offline if user requests

3. **Fallback:** Bible.is may be configured in `.env`; otherwise eBible.org (free)

**File:** `/src/services/audio/audioRemote.ts`

```typescript
const resolveAudioUrl = async (
  bookId: string,
  chapter: number,
  translationId: string
): Promise<string> => {
  // 1. Try provider API (Bible.is)
  if (provider === 'bible-is') {
    const url = await fetchFromBibleIs(bookId, chapter);
    if (url) return url;
  }
  
  // 2. Try stream-template substitution
  if (streamTemplate) {
    const url = streamTemplate
      .replace('{book}', bookId)
      .replace('{chapter}', chapter);
    return url; // Assume valid until playback
  }
  
  // 3. Try audio-pack (ZIP download)
  if (audioPack) {
    const url = await extractFromPack(bookId, chapter);
    if (url) return url;
  }
  
  throw new Error('No audio source available');
};
```

### Playback

**Technology:** `react-native-track-player`

Single shared instance (singleton pattern):

```typescript
// audioPlayer.ts
let trackPlayerInstance: TrackPlayer | null = null;

export const getAudioPlayer = async () => {
  if (!trackPlayerInstance) {
    trackPlayerInstance = new TrackPlayer({
      automaticallyWaitsForWebSocket: true,
      // ... iOS background modes: ['audio']
    });
  }
  return trackPlayerInstance;
};
```

**Features:**
- Background playback (requires UIBackgroundModes: ['audio'] on iOS)
- Playback rates: 0.75x, 1x, 1.25x, 1.5x, 2x
- Sleep timer (1-60 min, user configurable)
- Auto-advance to next chapter
- Repeat modes: off / one / all
- Position interpolation at 50ms intervals (smooth UI)

### Downloads

**File:** `/src/services/audio/audioDownloadService.ts`

**Concurrency Model:**
- 4 chapters per book (simultaneous)
- 2 books per translation (simultaneous)
- Max 8 parallel downloads

**Tracking:**
```typescript
interface DownloadTask {
  id: string;
  bookId: string;
  chapter: number;
  progress: number; // 0-100
  status: 'pending' | 'downloading' | 'completed' | 'failed';
  size: number;
  speed: number; // bytes/sec
}
```

### Telemetry

**Events logged every 30 seconds during playback:**
```typescript
{
  type: 'chapter_listening',
  bookId: string,
  chapter: number,
  listened_ms: number,  // Time listened so far
  progress_percent: number, // 0-100
  playbackRate: number,
  device: 'ios' | 'android',
}
```

---

## Reading Plans & Progress

### Plans System

**Files:**
- `/src/services/plans/readingPlanService.ts` (639 lines)
- `/src/services/plans/readingPlanModel.ts` (436 lines)
- `/src/stores/readingPlansStore.ts`
- `/src/data/readingPlans.generated.ts` (generated bundled data)

### Plan Types

**1. Timed Plans:** Fixed duration (e.g., "Psalms in 30 Days")
   - Slug IDs: `psalms-30-days`, `new-testament-100-days`
   - User selects start date
   - Calculate current_day based on start_date

**2. Recurring Plans:** Calendar-based (e.g., "Daily Gospel")
   - UUID IDs (non-deterministic)
   - No start date (always "today")
   - Repeats forever

### Plan Structure

```typescript
interface ReadingPlan {
  id: string; // UUID for recurring, slug for timed
  slug?: string;
  name: string;
  description: string;
  type: 'timed' | 'recurring';
  durationDays?: number; // Timed only
  planEntries: PlanEntry[];
}

interface PlanEntry {
  dayNumber: number;
  sessions: {
    morning?: VerseRange[];
    midday?: VerseRange[];
    evening?: VerseRange[];
  };
}
```

### Session Keys

**PLAN_SESSION_ORDER = ['morning', 'midday', 'evening']**

Users can read all three sessions per day, or just their preferred time(s).

### Progress Tracking

**Local State:** `/src/stores/readingPlansStore.ts`

```typescript
interface ReadingPlansState {
  progressByPlanId: Record<
    string,
    {
      planId: string;
      completedEntries: Set<number>; // dayNumber
      currentDay: number;
      isCompleted: boolean;
      startedAt: number; // timestamp
    }
  >;
}
```

**Sync to Cloud:** Via `readingPlanService.syncPlanProgress()`

```typescript
const syncPlanProgress = async (localProgress: PlanProgress[]) => {
  const userId = await getCurrentUserId();
  
  // Fetch remote progress from Supabase RPC
  const remote = await supabase.rpc('get_plan_progress', { userId });
  
  // Merge: union of completed_entries, max(current_day), OR is_completed
  const merged = localProgress.map(local => ({
    completedEntries: union(local.completedEntries, remote.completedEntries),
    currentDay: Math.max(local.currentDay, remote.currentDay),
    isCompleted: local.isCompleted || remote.isCompleted,
  }));
  
  // Push merged state back to Supabase
  await supabase.rpc('upsert_plan_progress', { userId, data: merged });
};
```

### Rhythms (Multi-Plan Sequences)

Users can create custom reading sequences combining multiple plans.

**File:** `/src/services/plans/readingPlanService.ts`

```typescript
interface Rhythm {
  id: string; // UUID
  name: string;
  planIds: string[];
  isActive: boolean;
  createdAt: number;
}
```

---

## Navigation & Routing

### React Navigation v7 Setup

**Files:**
- `/src/navigation/RootNavigator.tsx` — Root (auth fork + tabs)
- `/src/navigation/TabNavigator.tsx` — Bottom tab navigator
- `/src/navigation/HomeStack.tsx` — Home stack
- `/src/navigation/BibleStack.tsx` — Bible reader stack
- `/src/navigation/LearnStack.tsx` — Gather/Lessons stack (renamed from "Harvest")
- `/src/navigation/PlansStack.tsx` — Reading plans stack
- `/src/navigation/MoreStack.tsx` — Settings, account, auth screens
- `/src/navigation/linkingConfig.ts` — Deep linking routes
- `/src/navigation/types.ts` — Navigation param lists

### Tab Visibility

**File:** `/src/navigation/tabBarVisibility.ts`

Tabs collapse on certain screens (full-screen readers):

```typescript
// Tabs visible on:
// - HomeScreen, BibleChapterScreen
// 
// Tabs hidden on:
// - BibleReaderScreen (full page)
// - LessonDetailScreen (full page)
// - GroupSessionScreen (full page)

const isTabBarVisible = (routeName: string): boolean => {
  const hiddenOnRoutes = [
    'BibleReader',
    'LessonDetail',
    'GroupSession',
  ];
  return !hiddenOnRoutes.includes(routeName);
};
```

### Deep Linking

**Scheme:** `com.everybible.app://`

**Routes:**
```
com.everybible.app://bible/genesis/1/1
com.everybible.app://bible/matthew/5
com.everybible.app://lesson/field-1/lesson-3
com.everybible.app://group/abc123/session/xyz789
```

---

## Admin Portal & Public Site

### Admin Portal

**Location:** `/apps/admin/`  
**Framework:** Next.js 15 with Supabase SSR  
**Deployment:** Vercel

**Pages:**
- **Dashboard:** KPIs (active users, reading streaks, engagement score)
- **Translations:** Download status, schema version, audio providers
- **Verse of Day:** Schedule daily verses, view past selections
- **Content Images:** Manage illustrations, verse art
- **User Support (Read-Only):** View support requests, feedback
- **Health Monitor:** Check service status, DB migrations
- **Analytics:** MapLibre globe (geo-enriched user heatmap)
- **Settings:** Admins, API keys, feature flags

**Architecture:**
- Two Supabase clients:
  - Anon key (RLS enforced)
  - Service role key (elevated, admin actions)
- OpenAI API for operator chat
- Full audit logging on all admin state changes

### Public Site

**Location:** `/apps/site/`  
**Framework:** Next.js 15  
**Deployment:** Vercel

**Pages:**
- **Homepage:** App teaser, download links, testimonials
- **About:** Mission, team, story
- **Privacy Policy**
- **Terms of Service**
- **Support** (contact form)

**APIs:**
- `/api/media/[...assetPath]` — Proxy to Cloudflare R2 (S3 client)
- `/api/mobile/content` → Supabase RPC `get_live_mobile_content()`

---

## Analytics & Telemetry

### Event Queue & Submission

**Files:**
- `/src/services/analytics/analyticsService.ts` — Event queueing
- `/src/services/analytics/eventSchema.ts` — Event types

**Queue Configuration:**
```typescript
const AUTO_FLUSH_SIZE = 20;      // Flush on 20 events
const MAX_QUEUE_SIZE = 500;      // Max queued before drop
```

**Event Flow:**

```
Mobile App
  ├─ Event created (e.g., chapter_read)
  ├─ Queued in memory (AUTO_FLUSH_SIZE check)
  ├─ Auto-flush on size/timer
  └─ POST /analytics-collector (Cloudflare Worker)
       ├─ Enrich with Cloudflare geolocation headers
       ├─ Add session ID, device info
       └─ POST to Supabase edge function (track-analytics-events)
            ├─ Geo-decode from Cloudflare headers (3-tier: country → region → city)
            ├─ Store in analytics_events table
            └─ Aggregate engagement score (cron job)
```

### Event Types

```typescript
type AnalyticsEvent =
  | { type: 'app_launch'; version: string; platform: 'ios' | 'android' }
  | { type: 'chapter_read'; bookId: string; chapter: number }
  | { type: 'chapter_listening'; listened_ms: number; progress_percent: number }
  | { type: 'plan_completed'; planId: string; durationDays: number }
  | { type: 'lesson_completed'; lessonId: string; field: number }
  | { type: 'group_joined'; groupId: string }
  | { type: 'prayer_request_created'; groupId: string }
  | ...others
```

### Engagement Scoring

**Edge Function:** `/supabase/functions/aggregate-engagement/`

**Formula (nightly cron):**
```
engagement_score = (
  0.35 * reading_events_count +
  0.25 * listening_events_count +
  0.20 * streak_multiplier +
  0.10 * plans_completed_count +
  0.10 * community_interactions
)
```

---

## Internationalization & Theming

### i18n Setup

**Files:**
- `/src/i18n/locales/` — Translation files (en, es, ne, hi, ar, ur, ...)
- `/src/i18n/i18n.ts` — i18next config

**Supported Languages:** 21 languages (including RTL: Arabic, Urdu)

**Detection:** 
- On first launch: `expo-localization` detects device language
- Stored in `authStore.preferences.language`
- Can be changed manually in Settings

**Usage:**
```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
const text = t('tabs.home'); // Nested dot notation
const paramText = t('bible.chapter', { number: 1 });
```

### Theming System

**Files:**
- `/src/contexts/ThemeContext.ts` — Theme context (not Zustand)
- `/src/design/system.ts` — Design tokens
- `/src/constants/colors.ts` — Color palettes

**Theme Modes:** dark, light, low-light

**Accent Palettes:** ember (default), sapphire, teal, olive

**Design Tokens:**
```typescript
// src/design/system.ts
export const designSystem = {
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  radius: {
    sm: 6,
    md: 12,
    lg: 16,
  },
  typography: {
    // scale: small, medium (default), large, xlarge
  },
};
```

**Theme Hook:**
```typescript
const { colors, isDark } = useTheme();
// colors: { background, primaryText, accentGreen, ... }
```

---

## Discipleship Features

### Four Fields

**Files:** `/src/stores/fourFieldsStore.ts`, `/src/data/fourFieldsCourses.ts`

**Model:** 5 sequential fields

```
1. Entry (Field 1) — Relationship building, storytelling
2. Gospel (Field 2) — Bible stories, salvation message
3. Discipleship (Field 3) — One-on-one mentoring
4. Church (Field 4) — Multiplication, leadership
5. Multiplication (Field 5) — Ongoing growth
```

**Content:**
- 23 total lessons across 5 fields
- Lessons organized with video, text, discussion prompts
- Progress tracked per user (completed_lessons)

**Screens:**
- `/src/screens/learn/FourFieldsJourneyScreen.tsx` — Overview
- `/src/screens/learn/FieldOverviewScreen.tsx` — Field detail
- `/src/screens/learn/FourFieldsLessonViewScreen.tsx` — Lesson view

### Gather

**Files:** `/src/stores/gatherStore.ts`, `/src/services/gather/gatherBibleService.ts`

**Curriculum:**
- 7 Foundations (70 lessons) — Basic discipleship
- 24 Wisdom Topics (192 lessons) across 5 categories:
  1. Scripture
  2. Prayer
  3. Obedience
  4. Witness
  5. Multiplication

**Structure:**
```
Gather Root
├─ Foundations (7 courses, 70 lessons)
├─ Wisdom Topics (24 topics, 192 lessons)
│  ├─ Scripture (X lessons)
│  ├─ Prayer (X lessons)
│  ├─ Obedience (X lessons)
│  ├─ Witness (X lessons)
│  └─ Multiplication (X lessons)
```

### Groups

**Files:**
- `/src/services/groups/groupService.ts` — Group CRUD
- `/src/services/groups/groupSessionService.ts` — Sessions
- `/src/screens/learn/GroupListScreen.tsx`
- `/src/screens/learn/GroupDetailScreen.tsx`

**Features:**
- Create groups with join codes
- Leader/member roles
- Session recording (with Four Fields or Gather lesson references)
- Prayer wall (prayer requests, prayed/encouraged reactions)

**Data:**
```typescript
interface Group {
  id: string; // UUID
  name: string;
  description?: string;
  joinCode: string; // 6-char alphanumeric
  leaderId: string; // User ID
  createdAt: number;
}

interface GroupSession {
  id: string;
  groupId: string;
  field?: number; // Four Fields field (1-5)
  lessonId?: string; // Lesson being studied
  date: number; // timestamp
  notes: string;
  attendees: string[]; // User IDs
}
```

---

## Annotations & Local Storage

### Annotation Types

**File:** `/src/services/annotations/annotationService.ts`

**Local-only by design** (no cloud sync for privacy):

```typescript
type Annotation =
  | { type: 'bookmark'; book: string; chapter: number; verse: number }
  | { type: 'highlight'; book: string; chapter: number; verse_start: number; verse_end: number; color: 'yellow' | 'pink' | 'blue' | 'green' }
  | { type: 'note'; book: string; chapter: number; verse_start: number; verse_end: number; text: string };

interface StoredAnnotation extends Annotation {
  id: string; // Composite key deduplication
  createdAt: number;
  updatedAt: number;
  deleted_at?: number; // Soft delete
}
```

### Deduplication

**Key:** `${book}|${chapter}|${verse_start}|${type}`

Prevents duplicate bookmarks/highlights on same verse.

### Persistence

Annotations stored in MMKV via `annotationStore`:

```typescript
interface AnnotationState {
  annotations: StoredAnnotation[];
  addAnnotation: (annotation: Annotation) => void;
  removeAnnotation: (id: string) => void; // Soft delete
}
```

Soft delete never removes data permanently (deleted_at timestamp set instead).

---

## Edge Functions & Workers

### Supabase Edge Functions

**Location:** `/supabase/functions/`

**1. track-analytics-events**
- Ingests events from Cloudflare Worker
- Parses Cloudflare geolocation headers (cf-country, cf-region, cf-city)
- Stores in `analytics_events` table
- Called hourly by cron to aggregate engagement_score

**2. track-anonymous-usage-events**
- Similar to above, for unauthenticated event tracking
- Geolocation from Cloudflare Worker

**3. aggregate-engagement (Cron)**
- Runs nightly
- Recalculates engagement_score for all users
- Updates `user_metrics` table

**4. send-group-notification**
- Triggered on group session created
- Fans out via Expo Push Notification Service
- Notifies group members

**5. submit-chapter-feedback**
- Receives user feedback on chapter
- Stores in `chapter_feedback` table
- Appends to Google Sheets (admin sheet)

### Cloudflare Workers

**Location:** `/cloudflare/`

**analytics-collector**
- HTTP endpoint listening on custom domain
- Receives POST from mobile app
- Adds Cloudflare geolocation headers (cf-country, cf-region, cf-city)
- Forwards to Supabase edge function
- Returns 200 OK immediately (fire-and-forget)

**geo worker**
- Standalone IP geolocation service
- Returns { country, region, city } for client IP
- Used for analytics enrichment

---

## System Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EVERYBIBL SYSTEM DIAGRAM                          │
└─────────────────────────────────────────────────────────────────────────────┘

MOBILE APP (Expo/React Native)
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────────┐         │
│  │   UI Screens    │  │  Theme/i18n     │  │   Navigation     │         │
│  │   (React)       │  │   Context       │  │   (React Nav v7) │         │
│  └────────┬────────┘  └────────┬────────┘  └────────┬─────────┘         │
│           │                    │                    │                   │
│           └────────────────────┼────────────────────┘                   │
│                                │                                        │
│                    ┌───────────▼──────────┐                            │
│                    │  Zustand Stores      │                            │
│                    │ (MMKV Persistence)   │                            │
│                    │ - authStore          │                            │
│                    │ - progressStore      │                            │
│                    │ - bibleStore         │                            │
│                    │ - audioStore         │                            │
│                    │ - annotationStore    │                            │
│                    │ - readingPlansStore  │                            │
│                    │ - fourFieldsStore    │                            │
│                    │ - gatherStore        │                            │
│                    └───────────┬──────────┘                            │
│                                │                                        │
│        ┌───────────────────────┼───────────────────────┐               │
│        │                       │                       │               │
│   ┌────▼────┐           ┌─────▼──────┐        ┌──────▼──────┐        │
│   │ Services │           │  SQLite    │        │  SecureStore│        │
│   │ Layer    │           │ (Bible DB) │        │ (Session)   │        │
│   │ - auth   │           │            │        │             │        │
│   │ - bible  │           │ - BSB      │        └─────────────┘        │
│   │ - audio  │           │ - WEB      │                              │
│   │ - plans  │           │ - ASV      │                              │
│   │ - sync   │           │            │                              │
│   │ - groups │           └────────────┘                              │
│   │ - courses│                                                       │
│   └────┬─────┘                                                       │
│        │                                                              │
│        └──────────────────────┬──────────────────────┐               │
│                               │                      │               │
│                        ┌──────▼────┐        ┌───────▼────┐          │
│                        │ Analytics  │        │  React     │          │
│                        │ Queue      │        │ Native     │          │
│                        │ (In-Memory)│        │ Audio      │          │
│                        └──────┬─────┘        └────────────┘          │
│                               │                                      │
│                               │ POST events                          │
│                               │                                      │
└───────────────────────────────┼──────────────────────────────────────┘
                                │
                        ┌───────▼────────┐
                        │ Cloudflare     │
                        │ Worker         │
                        │ (analytics     │
                        │  collector)    │
                        │                │
                        │ + CF geo       │
                        │ headers        │
                        └───────┬────────┘
                                │
                        ┌───────▼───────────────┐
                        │  Supabase             │
                        │                       │
        ┌───────────────┼──────────┬────────────┼──────────────────┐
        │               │          │            │                  │
   ┌────▼──────┐ ┌─────▼────┐ ┌──▼─────┐ ┌───▼──────┐ ┌───────┐  │
   │ Auth      │ │ Database │ │Edge    │ │ Analytics│ │Storage│  │
   │           │ │ Tables   │ │Func.   │ │ Table    │ │(R2)   │  │
   │ - profiles│ │          │ │        │ │          │ │       │  │
   │ - sessions│ │ - profiles│         │ │- analytics_│       │  │
   │           │ │ - groups │ │track-*-│ │  events  │ │Media  │  │
   │           │ │ - gp_mem-│ │submit- │ │          │ │files  │  │
   │           │ │  bers    │ │chap-   │ │- user_   │ │       │  │
   │           │ │ - plans  │ │ter-fb  │ │  metrics │ │       │  │
   │           │ │ - plan   │ │send-   │ │          │ │       │  │
   │           │ │  entries │ │group-  │ │          │ │       │  │
   │           │ │ - ...    │ │notif   │ │          │ │       │  │
   │           │ │          │ │        │ │          │ │       │  │
   └───────────┘ └──────────┘ └────────┘ └──────────┘ └───────┘  │
                                                                  │
   ┌──────────────────────────────────────────────────────────────┘
   │
   │ JSON RPC / REST API
   │
   ┌──▼────────────────────────────────────────────────────────┐
   │ ADMIN PORTAL (Next.js 15)                                 │
   │                                                            │
   │ - Dashboard (KPIs)                                        │
   │ - Translations (manage downloads)                         │
   │ - Verse of Day                                            │
   │ - Health Monitor                                          │
   │ - Analytics (MapLibre)                                    │
   │ - User Support (read-only)                                │
   │                                                            │
   │ (Queries Supabase anon + service role keys)               │
   └──────────────────────────────────────────────────────────┘

   ┌──────────────────────────────────────────────────────────┐
   │ PUBLIC SITE (Next.js 15)                                 │
   │                                                            │
   │ - Homepage                                               │
   │ - /api/mobile/content (RPC)                              │
   │ - /api/media/[path] (R2 proxy)                           │
   │ - Privacy, Terms                                         │
   │                                                            │
   │ (Queries Supabase anon key, Cloudflare R2)              │
   └──────────────────────────────────────────────────────────┘
```

---

## Deployment & CI/CD

### Mobile App Deployment

**Build System:** EAS Build (Expo-managed)

**Profiles in eas.json:**
- `development` — Dev client, internal distribution, expects Metro
- `preview` — Internal distribution, embedded JS bundle
- `production` — App Store/Play Store, embedded JS bundle

**iOS Release Flow:**

```bash
npm run release:prepare              # Pre-flight checks
npm run testflight:build-local       # Local production build
  └─ Syncs EAS remote build number → native code
  └─ EAS fetches signing from remote credential store
  └─ Builds .ipa

bash scripts/testflight_precheck.sh [app.ipa]  # Verify build number

eas submit --platform ios --profile production --path [app.ipa]
  └─ Uploads to App Store Connect

npm run testflight:submit-and-verify
  └─ Polls until processingState=VALID
  └─ Attaches to Internal Testers beta group
  └─ Verifies build appears in TestFlight
```

**Key Rules:**
- Use local EAS build for TestFlight (syncs iOS build number)
- Never stop at `eas submit` — build is invisible to testers until attached to beta group
- Attachment requires Python JWT script at `~/.claude/projects/.../memory/testflight_distribution.md`

**Android Release Flow:**

```bash
eas build --platform android --profile production
eas submit --platform android --profile production
  └─ Uploads to Google Play (goes to draft)
```

### CI/CD Pipeline

**File:** `.github/workflows/`

**Currently:** Android production release trigger (manual)

**Future:** iOS release automation via Actions

---

## Key Files Reference

| System | Primary File | Size | Purpose |
|--------|--------------|------|---------|
| **Auth** | `/src/stores/authStore.ts` | ~150 lines | Auth state + preferences |
| **Auth** | `/src/services/auth/authService.ts` | ~200 lines | Sign-in/out logic |
| **Bible** | `/src/services/bible/bibleDatabase.ts` | ~300 lines | DB initialization |
| **Bible** | `/src/services/bible/bibleService.ts` | ~250 lines | Verse fetching, search |
| **Bible** | `/src/services/bible/cloudTranslationService.ts` | ~400 lines | Translation downloads |
| **Audio** | `/src/hooks/useAudioPlayer.ts` | **1176 lines** | Audio playback hook |
| **Audio** | `/src/services/audio/audioService.ts` | ~300 lines | Audio API |
| **Plans** | `/src/services/plans/readingPlanService.ts` | **639 lines** | Plan logic |
| **Sync** | `/src/services/sync/syncService.ts` | **382 lines** | Sync orchestration |
| **Sync** | `/src/services/sync/syncMerge.ts` | **240 lines** | Merge algorithms |
| **State** | `/src/stores/persistedStateSanitizers.ts` | ~400 lines | State validation |
| **Nav** | `/src/navigation/RootNavigator.tsx` | ~200 lines | Root nav setup |

---

## Common Workflows

### Cold Start (App Launch)

```
1. App.tsx renders
   ├─ Initialize MMKV instance
   ├─ Create Zustand stores (rehydrate from MMKV)
   ├─ Apply state sanitizers
   └─ Call authStore.initialize()

2. authStore.initialize()
   ├─ Retrieve session from expo-secure-store
   ├─ Validate with Supabase.auth.getSession()
   ├─ Map to app User type
   ├─ Subscribe to onAuthStateChange()
   └─ Set isInitialized = true

3. App renders RootNavigator
   ├─ If isAuthenticated → TabNavigator (Home)
   └─ Else → AuthStack (Sign in)

4. useSync hook triggers
   └─ syncProgress(), syncPreferences(), syncReadingPlans()
```

### Reading Flow

```
1. User navigates to Bible Reader
   └─ BibleReaderScreen component mounts

2. Component queries:
   ├─ bibleStore.currentBook, currentChapter (from MMKV)
   └─ Fetches verses via bibleService.getChapter()

3. User reads chapter → progressStore.markChapterRead(book, chapter)
   ├─ Updates MMKV locally
   ├─ Debounced (2-sec timer)
   └─ Queued for next sync

4. App moves to foreground
   └─ useSync triggers syncProgress()
      ├─ Merge with remote
      └─ Push back to Supabase

5. Listening telemetry:
   └─ Every 30 sec: POST { chapter_listening, listened_ms, progress_percent }
```

### Audio Playback

```
1. User taps play on chapter
   └─ audioService.play(bookId, chapter, translationId)

2. Service resolves audio URL:
   ├─ Check cache (MMKV LRU)
   ├─ Try remote (Bible.is / stream-template / audio-pack)
   └─ Cache result

3. Pass URL to react-native-track-player
   └─ TrackPlayer loads and plays

4. useAudioPlayer hook:
   ├─ Subscribes to playback events
   ├─ Updates audioStore every 50ms
   └─ UI re-renders position/duration

5. Every 30 sec:
   └─ Log telemetry event (listened_ms, progress_percent)
```

---

## Performance Considerations

- **MMKV** vs AsyncStorage: 10x faster for large datasets
- **FTS5 Search:** Only on bundled DB (BSB/WEB); cloud translations use LIKE
- **LRU Audio Cache:** 300 entries, in-memory, survives sync
- **Lazy Loading:** Screens loaded via React Navigation
- **List Optimization:** FlatList with `keyExtractor` and `maxToRenderPerBatch`
- **Memoization:** `React.memo()` on expensive list items

---

## Troubleshooting Reference

| Issue | Root Cause | Solution |
|-------|-----------|----------|
| Bundled Bible DB not loading | Schema version mismatch | Bump PRAGMA user_version, BUNDLED_BIBLE_SCHEMA_VERSION, DEFAULT_MINIMUM_READY_VERSE_COUNT in sync |
| Sync fails silently | App not isInitialized or isAuthenticated | Check authStore.initialize() completed |
| Audio not downloading | Wrong strategy chosen | Verify provider/stream-template/audio-pack in bibleStore |
| Preferences not syncing | Remote wins on next sync | Check sync merge logic in syncMerge.ts |
| State corrupted on crash | No validation on rehydrate | Sanitizers in persistedStateSanitizers.ts should prevent |

---

## Future Directions

- Full cross-reference dataset (340K+ from OpenBible.info)
- Offline syncing queue (store sync operations locally when offline)
- Group video calling (Gather sessions)
- Advanced search filters (by theme, time period)
- Personalized recommendations (engagement-based)

---

## Contact & Maintenance

- **Project Lead:** See GitHub repo
- **Architecture Questions:** See CLAUDE.md in repo root
- **Last Review:** April 15, 2026

