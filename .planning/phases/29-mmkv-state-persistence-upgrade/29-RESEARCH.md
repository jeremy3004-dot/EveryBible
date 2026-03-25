# Phase 29: MMKV State Persistence Upgrade - Research

**Researched:** 2026-03-25
**Domain:** React Native state persistence — react-native-mmkv, Zustand persist middleware, TanStack Query
**Confidence:** HIGH (architecture constraint), MEDIUM (MMKV version selection due to active library churn)

---

## Summary

This phase swaps AsyncStorage for MMKV across all Zustand stores and optionally introduces TanStack Query for Supabase data fetching. The biggest planning decision is version selection for react-native-mmkv: the app currently runs with `newArchEnabled: false` (old architecture), and MMKV v3 and v4 both have documented issues with old arch. The safe, confirmed-working choice for this project is **MMKV v2.12.2** — the last release of the v2 series that does not require the New Architecture. This avoids the Nitro dependency (v4) and the TurboModule-only requirement (v3), both of which are incompatible with the project's current `newArchEnabled: false` setting.

The MMKV-to-Zustand adapter is a 10-line `StateStorage` object — the official pattern from mrousavy's docs. All six persisted stores require the same swap: replace `createJSONStorage(() => AsyncStorage)` with `createJSONStorage(() => zustandStorage)`. No store logic changes. The `merge` and `partialize` functions are unaffected because they operate on the deserialized JSON, not the storage layer.

TanStack Query is a viable addition but represents significant scope expansion. The Supabase calls in this project live in service-layer functions, not in React hooks, and there are no direct `useQuery` consumers today. Adding TanStack Query now requires: installing the package, wrapping the app root in `QueryClientProvider`, configuring `AppState` focus management, and migrating at least a few Supabase calls to `useQuery`. This is worth considering as a separate plan within this phase rather than a gate for the MMKV migration.

**Primary recommendation:** Migrate all six persisted stores to MMKV v2.12.2 in a single plan. Treat TanStack Query as a separate optional plan with a clear scope gate.

---

## Project Constraints (from CLAUDE.md)

| Directive | Applies to This Phase |
|-----------|----------------------|
| TypeScript strict mode enabled | All new code must type-check cleanly |
| Never commit .env | Not affected |
| Always use barrel exports (index.ts) | Storage adapter should be exported from stores/index.ts or a shared storage file |
| Theme context for all colors | Not affected |
| Translation keys for ALL user-facing text | Not affected |
| Use Zustand stores for global state | Aligned — this phase improves Zustand persistence |
| Offline-first architecture | MMKV is fully offline, no network dependency |
| Test on both iOS and Android | Critical — MMKV requires native module; dev build required for both platforms |
| Use Expo's native modules | MMKV v2.12.2 is NOT an Expo module — it requires `pod install` and a new dev build |
| React Navigation v7 patterns | Not affected |
| Bump all three DB version constants when rebuilding bible-bsb-v2.db | Not affected |

**Critical constraint:** The app is Expo managed workflow with `newArchEnabled: false`. Any MMKV version >= 3.0 is incompatible with this configuration. Use v2.12.2 only.

---

## Current State: Persisted Stores Inventory

All six stores use `createJSONStorage(() => AsyncStorage)` from Zustand persist middleware. None use MMKV. No TanStack Query is installed.

| Store | Persist Key | Partialize | migrate? | Special Notes |
|-------|------------|------------|----------|---------------|
| `authStore` | `auth-storage` | user, isAuthenticated, preferences | Yes (v3) | Has `merge` with `sanitizePersistedAuthState`; does NOT persist session tokens (security) |
| `bibleStore` | `bible-storage` | currentBook, currentChapter, preferredChapterLaunchMode, currentTranslation, translations | No | Has `merge` with `sanitizePersistedBibleState`; `translations` is a large, complex object |
| `audioStore` | `audio-storage` | playbackRate, autoAdvanceChapter, repeatMode, sleepTimerMinutes, backgroundMusicChoice, queue, queueIndex, lastPlayedTranslationId, lastPlayedBookId, lastPlayedChapter, lastPosition | No | Has `merge` with `sanitizePersistedAudioState` |
| `progressStore` | `progress-storage` | chaptersRead, streakDays, lastReadDate | No | Has `merge` with `sanitizePersistedProgressState`; `chaptersRead` grows unboundedly over time |
| `fourFieldsStore` | `four-fields-storage` | completedLessons, practiceCompleted, taughtCompleted, currentField, currentCourseId, currentLessonId, groups, activeGroupId, groupProgress | Yes (v1) | Groups contain member arrays — largest payload of all stores |
| `gatherStore` | `gather-storage` | completedLessons, infoBannerDismissed | No | Simplest store; excellent first target for testing MMKV adapter |
| `libraryStore` | `library-storage` | favorites, playlists, history | No | Has `merge` with `sanitizePersistedLibraryState` |

**Not persisted (no AsyncStorage swap needed):**
- `privacyStore` — uses `expo-secure-store` via a dedicated privacy service; no Zustand persist middleware
- `audioPlaybackCompletionModel`, `audioPlaybackSequenceModel`, `audioQueueModel` — models without persist middleware

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-native-mmkv | **2.12.2** | Synchronous key/value storage replacing AsyncStorage | Last version of v2 series; confirmed old-arch compatible; peerDeps: react-native >=0.71.0 only |
| zustand | 5.0.10 (already installed) | State management | Already in project |

### Architecture Decision: MMKV v2 vs v3 vs v4

| Version | Old Arch (`newArchEnabled: false`) | Notes |
|---------|------------------------------------|-------|
| v2.12.2 | Confirmed compatible | Last JSI-based release; no TurboModule or Nitro dependency |
| v3.x | Requires New Architecture | Pure CxxTurboModule — explicitly incompatible |
| v4.x | Theoretically compatible via Nitro; reports of crashes in practice | Issue #937 closed as NOT_PLANNED; Android build failures on Expo SDK 54 reported |

**Decision: Use v2.12.2.** The project cannot risk a new-architecture migration as a side effect of this phase.

### Supporting (Optional — TanStack Query Plan)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tanstack/react-query | 5.95.2 | Server state management for Supabase calls | If/when TanStack Query plan is executed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MMKV v2.12.2 | MMKV v4.3.0 | v4 requires react-native-nitro-modules; old arch crash reports make it risky |
| MMKV v2.12.2 | expo-secure-store | Only suitable for small secrets, not JSON blobs |
| MMKV v2.12.2 | expo-file-system (JSON files) | Much slower; adds I/O complexity |

**Installation (MMKV only):**
```bash
npm install react-native-mmkv@2.12.2
cd ios && pod install && cd ..
# Requires new development build — does NOT work in Expo Go
```

**Version verification (done 2026-03-25):**
- `react-native-mmkv@2.12.2` — confirmed on npm (peerDeps: react *, react-native >=0.71.0)
- `@tanstack/react-query@5.95.2` — confirmed on npm (peerDeps: react ^18 || ^19)
- Zustand `5.0.10` — already installed; includes the Jan 2026 rehydration race-condition fix

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── stores/
│   ├── mmkvStorage.ts        # NEW: shared MMKV instance + StateStorage adapter
│   ├── authStore.ts          # swap AsyncStorage → mmkvStorage
│   ├── bibleStore.ts         # swap AsyncStorage → mmkvStorage
│   ├── audioStore.ts         # swap AsyncStorage → mmkvStorage
│   ├── progressStore.ts      # swap AsyncStorage → mmkvStorage
│   ├── fourFieldsStore.ts    # swap AsyncStorage → mmkvStorage
│   ├── gatherStore.ts        # swap AsyncStorage → mmkvStorage
│   ├── libraryStore.ts       # swap AsyncStorage → mmkvStorage
│   └── index.ts              # re-export mmkvStorage if needed
```

### Pattern 1: Shared MMKV Storage Adapter

Create one `mmkvStorage.ts` module that all stores import. Using a single MMKV instance for all stores is the standard pattern — each store writes its own namespaced key (`auth-storage`, `bible-storage`, etc.).

```typescript
// src/stores/mmkvStorage.ts
// Source: https://github.com/mrousavy/react-native-mmkv/blob/main/docs/WRAPPER_ZUSTAND_PERSIST_MIDDLEWARE.md
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const mmkvInstance = new MMKV();

export const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    return mmkvInstance.set(name, value);
  },
  getItem: (name) => {
    const value = mmkvInstance.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    return mmkvInstance.delete(name);
  },
};
```

**Note on v2 API:** In MMKV v2.x the delete method is `.delete()`. The v4 upgrade guide renames it to `.remove()` — do not use `.remove()` in v2.

### Pattern 2: Store Swap (same in every store)

```typescript
// Before (in every persisted store):
import AsyncStorage from '@react-native-async-storage/async-storage';
// ...
storage: createJSONStorage(() => AsyncStorage),

// After:
import { zustandStorage } from './mmkvStorage';
// ...
storage: createJSONStorage(() => zustandStorage),
```

`createJSONStorage` is already imported from `zustand/middleware` in every store — no new imports needed there. The `merge`, `partialize`, `migrate`, and `version` options are unaffected.

### Pattern 3: onRehydrateStorage for Cold-Start Hydration Gates

MMKV is synchronous — reads are immediate. This means `onRehydrateStorage` fires much faster than with AsyncStorage (which is async bridge). However, the correct pattern for guarding UI that depends on hydrated state is still valuable.

```typescript
// Source: https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data
// Zustand v5.0.10 includes the rehydration race-condition fix (Jan 2026)
{
  name: 'auth-storage',
  storage: createJSONStorage(() => zustandStorage),
  onRehydrateStorage: () => (state) => {
    // Called AFTER hydration completes — correct pattern in zustand v5
    if (state) {
      // state is available here; can mark hydration complete if needed
    }
  },
  // ...rest of options
}
```

**Key insight:** With MMKV, `onRehydrateStorage` fires synchronously during store initialization, before any React render. This eliminates the async hydration lag that causes "flash of initial state" with AsyncStorage.

### Pattern 4: TanStack Query Setup (Optional Plan)

```typescript
// src/App.tsx or root navigator
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

// React Native focus management
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

// Online status (project already has @react-native-community/netinfo)
onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5 * 60 * 1000, // 5 min
    },
  },
});

// Wrap root with QueryClientProvider
```

### Anti-Patterns to Avoid
- **Creating multiple MMKV instances per store:** Each `new MMKV()` call opens a separate mmap file. Use one shared instance unless encryption isolation is required.
- **Using MMKV v3 or v4 with old architecture:** Both v3 (pure CxxTurboModule) and v4 (Nitro) require the New Architecture. This project has `newArchEnabled: false`.
- **Removing `migrate` functions before verifying existing user data is safe:** Users have existing AsyncStorage data. The migration must handle the case where MMKV is empty on first launch after the update — Zustand's persist middleware will fall back to initial state when the MMKV key is not found, which is correct behavior.
- **Persisting session tokens:** `authStore` already explicitly excludes `session` from `partialize`. Do not add it.
- **Using MMKV in tests without mocking:** MMKV is a native module. Existing tests use pure TS/Node runtime. Tests that import stores will break unless MMKV is mocked in the test environment.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key/value storage | Custom AsyncStorage wrapper | `react-native-mmkv` | MMKV handles mmap, locking, crash safety |
| Zustand storage adapter | Custom serialization shim | `StateStorage` + `createJSONStorage` from zustand/middleware | Already the project pattern; MMKV adapter is 10 lines |
| Server state cache | Custom fetch cache with manual invalidation | `@tanstack/react-query` | Handles stale-while-revalidate, dedup, background refetch |
| Network state for TanStack | Custom NetInfo subscription | `onlineManager` from TanStack + `@react-native-community/netinfo` (already installed) | Standard RN integration pattern |

---

## Runtime State Inventory

> This is NOT a rename/refactor/migration phase. Existing AsyncStorage data is not migrated to MMKV — on first launch after upgrade, MMKV keys will be absent and Zustand will rehydrate from initial state (not from AsyncStorage).

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | AsyncStorage keys: `auth-storage`, `bible-storage`, `audio-storage`, `progress-storage`, `four-fields-storage`, `gather-storage`, `library-storage` | Data loss on upgrade — users lose reading position, audio preferences, progress streak, favorites on first launch after update |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None — MMKV does not add env vars | None |
| Build artifacts | New dev build required (MMKV is a native module) | `npx expo run:ios` and `npx expo run:android` after npm install |

**Data loss on upgrade is a known consequence.** The `@react-native-async-storage/async-storage` package stays installed (other non-store code may depend on it, and removing it is out of scope). The planner should decide whether to add a one-time migration that reads AsyncStorage keys on first MMKV launch and writes them to MMKV. This adds complexity but preserves user streaks and reading positions.

**Migration option:** A one-time `migrateFromAsyncStorage()` helper that runs before stores initialize — checks if the MMKV key is empty and the AsyncStorage key is populated, then copies the value. This is LOW effort but HIGH user-experience value for users who have real reading progress or course completions.

---

## Common Pitfalls

### Pitfall 1: Using MMKV v3 or v4 with `newArchEnabled: false`
**What goes wrong:** App crashes at startup with `Failed to create a new MMKV instance: react-native-mmkv 3.x.x requires TurboModules` (v3) or `Failed to install Nitro: global.__nitroDispatcher already exists` (v4 on old arch).
**Why it happens:** v3 is a pure CxxTurboModule; v4 uses Nitro — both require the New Architecture bridge. This project has `newArchEnabled: false` in app.json.
**How to avoid:** Pin to `react-native-mmkv@2.12.2` explicitly.
**Warning signs:** Any v3.x or v4.x install.

### Pitfall 2: Forgetting the Dev Build Requirement
**What goes wrong:** App builds fine but crashes immediately in Expo Go with "native module not found."
**Why it happens:** MMKV is a native C++ module. Expo Go does not include it.
**How to avoid:** After npm install, run `npx expo run:ios` / `npx expo run:android` to build a new dev binary. Document this in the plan.
**Warning signs:** Testing in Expo Go instead of a dev build.

### Pitfall 3: Using `.remove()` Instead of `.delete()` in v2
**What goes wrong:** TypeScript error — `remove` does not exist on MMKV v2 instance.
**Why it happens:** MMKV v4 renamed `.delete()` to `.remove()` (because `delete` is a C++ keyword). v2 still uses `.delete()`.
**How to avoid:** In the storage adapter, use `mmkvInstance.delete(name)` in the `removeItem` method.

### Pitfall 4: AsyncStorage Data Loss Without Migration
**What goes wrong:** Users who update the app lose their reading progress, audio queue, streak data, and course completions on first launch.
**Why it happens:** MMKV starts empty; Zustand falls back to `initialState`. Old AsyncStorage data is untouched but not read.
**How to avoid:** Implement a one-time migration helper that reads each AsyncStorage key and writes it to MMKV if MMKV key is absent.
**Warning signs:** No migration code in the plan.

### Pitfall 5: MMKV in Test Environment
**What goes wrong:** Node.js test runner (`node --test`) fails to import any store after the swap because MMKV requires native modules.
**Why it happens:** `react-native-mmkv` calls into native code. Node's test runner cannot execute native modules.
**How to avoid:** Mock `react-native-mmkv` in the test environment, or keep `mmkvStorage.ts` separated so test-facing store logic still compiles cleanly without the native module.
**Warning signs:** `node --test` failures after swap.

### Pitfall 6: `progressStore` Size Growth
**What goes wrong:** `chaptersRead` grows by one entry per chapter read. After a year of daily use, this could be 365+ entries. MMKV handles this fine (it's a mmap file), but the Zustand serialization still JSON-encodes the entire object on every write.
**Why it happens:** `persist` middleware serializes the full partialize output on every `set()` call.
**How to avoid:** Accept this for now — it is the same behavior as AsyncStorage. Not a regression.

---

## Code Examples

### Complete MMKV Storage Adapter (v2 API)
```typescript
// src/stores/mmkvStorage.ts
// Source: https://github.com/mrousavy/react-native-mmkv/blob/main/docs/WRAPPER_ZUSTAND_PERSIST_MIDDLEWARE.md
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

const mmkvInstance = new MMKV();

export const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    return mmkvInstance.set(name, value);
  },
  getItem: (name) => {
    const value = mmkvInstance.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    // v2 uses .delete() — v4 renamed this to .remove()
    return mmkvInstance.delete(name);
  },
};
```

### Store Swap Pattern (same for all 7 stores)
```typescript
// Before
import AsyncStorage from '@react-native-async-storage/async-storage';
// storage: createJSONStorage(() => AsyncStorage),

// After
import { zustandStorage } from './mmkvStorage';
// storage: createJSONStorage(() => zustandStorage),
```

### One-Time AsyncStorage Migration Helper
```typescript
// src/stores/migrateFromAsyncStorage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';

const STORE_KEYS = [
  'auth-storage',
  'bible-storage',
  'audio-storage',
  'progress-storage',
  'four-fields-storage',
  'gather-storage',
  'library-storage',
];

const mmkvInstance = new MMKV(); // Same instance as zustandStorage

export async function migrateFromAsyncStorage(): Promise<void> {
  for (const key of STORE_KEYS) {
    // Only migrate if MMKV doesn't have this key yet
    if (mmkvInstance.getString(key) !== undefined) {
      continue;
    }
    try {
      const value = await AsyncStorage.getItem(key);
      if (value != null) {
        mmkvInstance.set(key, value);
      }
    } catch {
      // Best-effort migration — failures are non-fatal
    }
  }
}
```

### TanStack Query Root Setup
```typescript
// Source: https://tanstack.com/query/v5/docs/react/react-native
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';

focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener('change', (state) => {
    handleFocus(state === 'active');
  });
  return () => subscription.remove();
});

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected);
  });
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 5 * 60 * 1000 } },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AsyncStorage (JS bridge, async) | MMKV (JSI, synchronous) | MMKV v1 released ~2021 | Eliminates cold-start hydration delay; reads return synchronously |
| `new MMKV()` (v2 API) | `createMMKV()` (v4 API) | v4.0.0 (2025) | Breaking change — not applicable to v2.12.2 |
| `.delete()` (v2 API) | `.remove()` (v4 API) | v4.0.0 (2025) | Breaking change — not applicable to v2.12.2 |
| Zustand v4 `persist` | Zustand v5 `persist` | v5.0.0 (late 2024) | Hydration race condition fixed in v5.0.10 |
| Manual Supabase `useEffect` fetching | TanStack Query `useQuery` | TanStack Query v5 (2023) | Automatic caching, dedup, stale-while-revalidate |

**Deprecated/outdated:**
- `@react-native-async-storage/async-storage` for performance-critical state: Functional but 30x slower than MMKV for synchronous reads. Keep installed (other code may use it), but don't add new Zustand stores to it.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| npm | Package install | ✓ | 11.11.0 | — |
| node | Build tools | ✓ | 25.8.1 | — |
| Expo CLI | Dev build | ✓ | 54.0.23 | — |
| iOS simulator / device | MMKV test | ✓ (Xcode at /Applications/Xcode.app) | iOS 26.2 SDK | — |
| Android emulator / device | MMKV test | Check per session | — | Use iOS first |
| react-native-mmkv@2.12.2 | All stores | ✗ (not installed) | — | AsyncStorage (current state) |
| @tanstack/react-query@5.95.2 | TanStack plan | ✗ (not installed) | — | Existing manual fetch pattern |
| react-native-nitro-modules | NOT NEEDED | — | — | Do not install |

**Missing dependencies with no fallback:**
- `react-native-mmkv@2.12.2` must be installed and a new dev build created before any store swap can be tested.

**Missing dependencies with fallback:**
- `@tanstack/react-query` — skipping it leaves the existing manual Supabase fetch pattern in place, which works.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node --test --import tsx`) |
| Config file | none — scripts in package.json |
| Quick run command | `npm run test:release` |
| Full suite command | `node --test --import tsx "src/**/*.test.ts"` |

### Phase Requirements → Test Map

Phase 29 has no formal requirement IDs in REQUIREMENTS.md. Mapping to behaviors:

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Stores rehydrate from MMKV with correct sanitized state | unit | `node --test --import tsx src/stores/persistedStateSanitizers.test.ts` | ✅ (existing) |
| MMKV storage adapter returns null for missing keys | unit | `node --test --import tsx src/stores/mmkvStorage.test.ts` | ❌ Wave 0 |
| Migration helper copies AsyncStorage data to MMKV if MMKV key absent | unit | `node --test --import tsx src/stores/migrateFromAsyncStorage.test.ts` | ❌ Wave 0 |
| Auth store does not persist session token | unit | `node --test --import tsx src/stores/authSessionState.test.ts` | ✅ (existing) |

**Note on native module mocking:** The MMKV native module must be mocked in the Node.js test environment. `react-native-mmkv` does not run in Node. Tests must mock the MMKV instance with a plain Map.

### Sample MMKV Mock for Tests
```typescript
// In test file or test helper:
jest.mock('react-native-mmkv', () => {
  const store = new Map<string, string>();
  return {
    MMKV: class {
      getString(key: string) { return store.get(key); }
      set(key: string, value: string) { store.set(key, value); }
      delete(key: string) { store.delete(key); }
    },
  };
});
```
Since the project uses Node's built-in test runner (not Jest), the mock strategy needs adjustment — see Wave 0 gaps below.

### Sampling Rate
- **Per task commit:** `npm run test:release` (14 focused tests, ~3s)
- **Per wave merge:** `npm run test:release`
- **Phase gate:** Full suite green + manual device smoke test (new dev build) before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/stores/mmkvStorage.ts` — the shared MMKV adapter (production code, not test)
- [ ] `src/stores/mmkvStorage.test.ts` — covers adapter behavior with a Map-based mock of MMKV
- [ ] `src/stores/migrateFromAsyncStorage.ts` — one-time migration helper
- [ ] `src/stores/migrateFromAsyncStorage.test.ts` — covers migration logic with mocked MMKV + AsyncStorage
- [ ] Node test mock strategy for `react-native-mmkv` — the project uses Node's native runner, not Jest; mocking requires a manual stub file or `--import` shim

---

## Open Questions

1. **Should the plan include a one-time AsyncStorage migration?**
   - What we know: All 7 store keys exist in AsyncStorage on users' devices. MMKV will start empty. Zustand falls back to initial state.
   - What's unclear: How much user data exists in practice (most users may be developers with minimal data).
   - Recommendation: Include migration. The code is small (~30 lines) and the user-experience cost of losing reading progress or course completions is real.

2. **Should TanStack Query be in this phase or deferred?**
   - What we know: Zero existing `useQuery` hooks; all Supabase calls are in service functions called from components/stores via `useEffect`. Adding TanStack Query requires wrapping the app root and migrating at least some call sites.
   - What's unclear: How many Supabase calls should be migrated (all 10+ services vs. a targeted subset).
   - Recommendation: Treat TanStack Query as a standalone optional plan within phase 29 (Plan 02). Plan 01 is the MMKV swap only. Plan 02 is TanStack Query setup + migrate the highest-value queries (e.g., reading plans, annotations, prayer requests). This keeps Plan 01 low-risk.

3. **Does `@react-native-async-storage/async-storage` need to stay installed?**
   - What we know: It is only used in store persist middleware after this phase (and in the migration helper temporarily). No other files import it directly.
   - What's unclear: Whether any Expo plugin or transitive dependency uses it at runtime.
   - Recommendation: Keep it installed. Removing it is a separate cleanup task that requires audit of the full dependency tree.

4. **Does enabling New Architecture (`newArchEnabled: true`) unlock MMKV v4?**
   - What we know: Expo SDK 54 is the last SDK to support disabling the New Architecture. RN 0.81 supports both architectures.
   - What's unclear: What breaking changes New Architecture would cause for this specific app.
   - Recommendation: Out of scope for Phase 29. Do not change `newArchEnabled` as part of this phase — the risk/reward is not justified.

---

## Sources

### Primary (HIGH confidence)
- [react-native-mmkv Zustand wrapper docs](https://github.com/mrousavy/react-native-mmkv/blob/main/docs/WRAPPER_ZUSTAND_PERSIST_MIDDLEWARE.md) — official adapter pattern
- [react-native-mmkv v4 upgrade guide](https://github.com/mrousavy/react-native-mmkv/blob/main/docs/V4_UPGRADE_GUIDE.md) — confirms v4 old-arch restoration claim
- npm registry — `react-native-mmkv@2.12.2` (peerDeps verified), `@tanstack/react-query@5.95.2` (peerDeps verified)
- [Zustand persisting store data](https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data) — onRehydrateStorage pattern
- Codebase: all 7 store files read directly — complete inventory of AsyncStorage usage

### Secondary (MEDIUM confidence)
- [react-native-mmkv issue #937](https://github.com/mrousavy/react-native-mmkv/issues/937) — v4 + old arch crash, closed NOT_PLANNED
- [expo/expo issue #38991](https://github.com/expo/expo/issues/38991) — MMKV build failure on Expo SDK 54 (closed/completed but resolution details not public)
- [Zustand discussion #2584](https://github.com/pmndrs/zustand/discussions/2584) — onRehydrateStorage timing
- [TanStack Query React Native docs](https://tanstack.com/query/v5/docs/react/react-native) — AppState + onlineManager setup

### Tertiary (LOW confidence)
- Multiple Medium/DEV Community articles on Zustand + MMKV — consistent with official docs but not independently authoritative

---

## Metadata

**Confidence breakdown:**
- MMKV v2.12.2 version choice: HIGH — verified via npm + issue tracker
- Zustand adapter pattern: HIGH — from official mrousavy docs
- Old arch incompatibility of v3/v4: HIGH — documented in issue tracker and maintainer statements
- AsyncStorage data loss on upgrade: HIGH — Zustand behavior is deterministic
- TanStack Query feasibility: MEDIUM — confirmed library works with Expo 54 / React 19; migration scope is project-specific

**Research date:** 2026-03-25
**Valid until:** 2026-04-25 (stable libraries, but MMKV releases frequently — recheck before executing if >30 days)
