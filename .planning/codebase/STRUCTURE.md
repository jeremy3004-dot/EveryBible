# Structure

## Top-Level Layout

- [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx): top-level providers, startup gates, splash handling
- [`index.ts`](/Users/dev/Projects/EveryBible/index.ts): Expo app registration
- [`src/`](/Users/dev/Projects/EveryBible/src): main application code
- [`data/`](/Users/dev/Projects/EveryBible/data): bundled Bible data assets
- [`assets/`](/Users/dev/Projects/EveryBible/assets): app icons, splash, imagery
- [`plugins/`](/Users/dev/Projects/EveryBible/plugins): Expo config plugins
- [`scripts/`](/Users/dev/Projects/EveryBible/scripts): utility and build-support scripts
- [`supabase/`](/Users/dev/Projects/EveryBible/supabase): schema, migrations, local Supabase config
- [`ios/`](/Users/dev/Projects/EveryBible/ios) and [`android/`](/Users/dev/Projects/EveryBible/android): native projects

## Source Tree By Responsibility

### UI And Screens

- [`src/components/`](/Users/dev/Projects/EveryBible/src/components): reusable presentation components
- [`src/screens/home/`](/Users/dev/Projects/EveryBible/src/screens/home): home/dashboard experience
- [`src/screens/bible/`](/Users/dev/Projects/EveryBible/src/screens/bible): browser, reader, chapter selection
- [`src/screens/auth/`](/Users/dev/Projects/EveryBible/src/screens/auth): sign-in / sign-up
- [`src/screens/more/`](/Users/dev/Projects/EveryBible/src/screens/more): settings, about, profile, locale prefs
- [`src/screens/learn/`](/Users/dev/Projects/EveryBible/src/screens/learn): discipleship, lesson, and group study flows
- [`src/screens/onboarding/`](/Users/dev/Projects/EveryBible/src/screens/onboarding): locale and initial setup

### Application Logic

- [`src/services/audio/`](/Users/dev/Projects/EveryBible/src/services/audio): playback, downloads, remote resolution
- [`src/services/auth/`](/Users/dev/Projects/EveryBible/src/services/auth): email/social auth and error mapping
- [`src/services/bible/`](/Users/dev/Projects/EveryBible/src/services/bible): SQLite, scripture loading, presentation helpers
- [`src/services/groups/`](/Users/dev/Projects/EveryBible/src/services/groups): Supabase-backed group operations
- [`src/services/onboarding/`](/Users/dev/Projects/EveryBible/src/services/onboarding): locale and interface selection logic
- [`src/services/privacy/`](/Users/dev/Projects/EveryBible/src/services/privacy): discreet mode, PIN, app icon
- [`src/services/startup/`](/Users/dev/Projects/EveryBible/src/services/startup): startup coordination
- [`src/services/supabase/`](/Users/dev/Projects/EveryBible/src/services/supabase): client construction and types
- [`src/services/sync/`](/Users/dev/Projects/EveryBible/src/services/sync): merge rules and cloud synchronization

### Client State And Shared Context

- [`src/stores/`](/Users/dev/Projects/EveryBible/src/stores): Zustand slices and persisted-state sanitizers
- [`src/contexts/`](/Users/dev/Projects/EveryBible/src/contexts): React contexts, primarily theme
- [`src/hooks/`](/Users/dev/Projects/EveryBible/src/hooks): lifecycle and stateful app hooks such as sync and privacy lock

### Static Definitions

- [`src/constants/`](/Users/dev/Projects/EveryBible/src/constants): translations, books, languages, config-like constants
- [`src/data/`](/Users/dev/Projects/EveryBible/src/data): in-app discipleship course content
- [`src/types/`](/Users/dev/Projects/EveryBible/src/types): shared TypeScript domain models
- [`src/i18n/`](/Users/dev/Projects/EveryBible/src/i18n): i18next setup and locale bundles

## Supabase Layout

- [`supabase/schema.sql`](/Users/dev/Projects/EveryBible/supabase/schema.sql): baseline schema snapshot
- [`supabase/migrations/20240101000000_initial_schema.sql`](/Users/dev/Projects/EveryBible/supabase/migrations/20240101000000_initial_schema.sql): initial database setup
- [`supabase/migrations/20260306_group_sync_foundation.sql`](/Users/dev/Projects/EveryBible/supabase/migrations/20260306_group_sync_foundation.sql): synced group foundation
- [`supabase/migrations/20260306_production_hardening.sql`](/Users/dev/Projects/EveryBible/supabase/migrations/20260306_production_hardening.sql): hardening pass
- [`supabase/migrations/20260307_expand_interface_languages.sql`](/Users/dev/Projects/EveryBible/supabase/migrations/20260307_expand_interface_languages.sql): language support expansion
- [`supabase/migrations/20260307_locale_onboarding_preferences.sql`](/Users/dev/Projects/EveryBible/supabase/migrations/20260307_locale_onboarding_preferences.sql): onboarding / locale sync additions
- [`supabase/migrations/20260310_fix_function_search_path.sql`](/Users/dev/Projects/EveryBible/supabase/migrations/20260310_fix_function_search_path.sql): database function hardening

## Naming Patterns

- Screen components generally follow `*Screen.tsx`
- Store modules generally follow `*Store.ts`
- Service modules generally follow `*Service.ts`, though some domains also use helper modules like `syncMerge.ts` or `audioRemote.ts`
- Barrel exports are common via `index.ts` files in domain folders
- Tests are colocated next to source with `*.test.ts`

## High-Signal Feature Hotspots

- Bible reading core: [`src/screens/bible/`](/Users/dev/Projects/EveryBible/src/screens/bible) plus [`src/services/bible/`](/Users/dev/Projects/EveryBible/src/services/bible)
- Auth and sync: [`src/services/auth/`](/Users/dev/Projects/EveryBible/src/services/auth), [`src/services/sync/`](/Users/dev/Projects/EveryBible/src/services/sync), [`src/stores/authStore.ts`](/Users/dev/Projects/EveryBible/src/stores/authStore.ts)
- Audio experience: [`src/components/audio/`](/Users/dev/Projects/EveryBible/src/components/audio) plus [`src/services/audio/`](/Users/dev/Projects/EveryBible/src/services/audio)
- Discipleship and group study: [`src/screens/learn/`](/Users/dev/Projects/EveryBible/src/screens/learn), [`src/stores/fourFieldsStore.ts`](/Users/dev/Projects/EveryBible/src/stores/fourFieldsStore.ts), [`src/services/groups/groupService.ts`](/Users/dev/Projects/EveryBible/src/services/groups/groupService.ts)

## Structure Observations

- The codebase is organized by domain more than by architectural layer
- The `src/services` directory is the deepest concentration of business logic
- Large content-heavy files in [`src/data/`](/Users/dev/Projects/EveryBible/src/data) and [`src/i18n/locales/`](/Users/dev/Projects/EveryBible/src/i18n/locales) will matter for navigation and bundle-size discussions
- Planning artifacts were not previously present; `.planning/codebase/` is being created as part of this GSD bootstrap
