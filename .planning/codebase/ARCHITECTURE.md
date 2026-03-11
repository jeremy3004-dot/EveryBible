# Architecture

## Summary

The app follows a feature-organized React Native client architecture: `screens` render UI, `stores` hold durable client state, `services` encapsulate domain and integration logic, and startup coordinates only the critical boot path before deferring heavier warmups.

## Entry Points And Boot Sequence

- Native registration starts in [`index.ts`](/Users/dev/Projects/EveryBible/index.ts)
- App shell and providers live in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)
- Provider stack:
- `I18nextProvider`
- `SafeAreaProvider`
- `ThemeProvider`
- `ErrorBoundary`
- Splash is held early with `SplashScreen.preventAutoHideAsync()` in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)

## Startup Flow

- `LoadingScreen` in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx) owns initial boot state
- Critical startup work is composed through [`src/services/startup/startupService.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.ts)
- Critical phase only initializes:
- auth via [`src/stores/authStore.ts`](/Users/dev/Projects/EveryBible/src/stores/authStore.ts)
- privacy via [`src/stores/privacyStore.ts`](/Users/dev/Projects/EveryBible/src/stores/privacyStore.ts)
- Non-critical Bible preload is deferred with `InteractionManager.runAfterInteractions(...)`
- After readiness:
- onboarding gate decides between [`src/screens/onboarding/LocaleSetupFlow`](/Users/dev/Projects/EveryBible/src/screens/onboarding)
- privacy lock gate can render a lock screen
- otherwise the app enters the root navigator

## Navigation Architecture

- Container: [`src/navigation/RootNavigator.tsx`](/Users/dev/Projects/EveryBible/src/navigation/RootNavigator.tsx)
- Root tabs: [`src/navigation/TabNavigator.tsx`](/Users/dev/Projects/EveryBible/src/navigation/TabNavigator.tsx)
- Mounted tab stacks:
- [`src/navigation/HomeStack.tsx`](/Users/dev/Projects/EveryBible/src/navigation/HomeStack.tsx)
- [`src/navigation/BibleStack.tsx`](/Users/dev/Projects/EveryBible/src/navigation/BibleStack.tsx)
- [`src/navigation/MoreStack.tsx`](/Users/dev/Projects/EveryBible/src/navigation/MoreStack.tsx)
- Modal auth flow is nested under `More -> Auth`
- A queued global auth open path exists in [`src/navigation/rootNavigation.ts`](/Users/dev/Projects/EveryBible/src/navigation/rootNavigation.ts)
- `LearnStack` exists in [`src/navigation/LearnStack.tsx`](/Users/dev/Projects/EveryBible/src/navigation/LearnStack.tsx) but is not mounted in the current tab navigator

## State Management Model

- Zustand is the main application state mechanism
- Store slices are domain-specific:
- auth in [`src/stores/authStore.ts`](/Users/dev/Projects/EveryBible/src/stores/authStore.ts)
- Bible reader state in [`src/stores/bibleStore.ts`](/Users/dev/Projects/EveryBible/src/stores/bibleStore.ts)
- reading progress in [`src/stores/progressStore.ts`](/Users/dev/Projects/EveryBible/src/stores/progressStore.ts)
- audio player settings in [`src/stores/audioStore.ts`](/Users/dev/Projects/EveryBible/src/stores/audioStore.ts)
- privacy mode in [`src/stores/privacyStore.ts`](/Users/dev/Projects/EveryBible/src/stores/privacyStore.ts)
- Four Fields local study state in [`src/stores/fourFieldsStore.ts`](/Users/dev/Projects/EveryBible/src/stores/fourFieldsStore.ts)
- Persistence is mostly slice-local via `persist(...)`

## Service Layer Pattern

- Domain service modules live under [`src/services/`](/Users/dev/Projects/EveryBible/src/services)
- Services are used for:
- Bible DB bootstrap and querying
- auth provider coordination
- sync merge logic
- audio source resolution and download
- privacy persistence and app icon switching
- group sync RPC / table access
- Some services call stores directly through `useStore.getState()`, especially [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts)

## Bible Data Pipeline

- Initial scripture source is a bundled JSON payload loaded by [`src/services/bible/bsbData.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bsbData.ts)
- JSON is inserted into SQLite by [`src/services/bible/bibleService.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleService.ts)
- Query paths then read from SQLite through [`src/services/bible/bibleDatabase.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleDatabase.ts)
- Presentation helpers for verse-of-day and reading cards live alongside service code in [`src/services/bible/presentation.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.ts)

## Sync Architecture

- Hook entrypoint: [`src/hooks/useSync.ts`](/Users/dev/Projects/EveryBible/src/hooks/useSync.ts)
- Trigger sources:
- app foreground
- network reconnect
- auth becoming ready
- Merge rules are isolated in [`src/services/sync/syncMerge.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncMerge.ts)
- Cloud read/write orchestration is in [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts)
- Local merged state is pushed back into Zustand stores after remote fetches

## Privacy Architecture

- App-state-based lock behavior is in [`src/hooks/usePrivacyLock.ts`](/Users/dev/Projects/EveryBible/src/hooks/usePrivacyLock.ts)
- Privacy persistence is in [`src/services/privacy/privacyService.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyService.ts)
- Alternate app icon behavior lives in [`src/services/privacy/appIcon.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/appIcon.ts)
- UI gate is rendered through privacy state in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx)

## Group Study Architecture

- There are two overlapping models:
- local/offline group state in [`src/stores/fourFieldsStore.ts`](/Users/dev/Projects/EveryBible/src/stores/fourFieldsStore.ts)
- synced backend group operations in [`src/services/groups/groupService.ts`](/Users/dev/Projects/EveryBible/src/services/groups/groupService.ts)
- This suggests a transition from device-local group study toward Supabase-backed groups

## Design Characteristics

- The app is intentionally local-first for Bible content
- Startup work has begun to move away from import-time side effects toward explicit orchestration
- Architecture is pragmatic and service-heavy rather than fully layered or DI-driven
- State and service boundaries are clear enough for feature work, but some flows still couple services to store internals
