# Integrations

## Summary

The app integrates with Supabase for auth and sync, Bible.is for remote audio, Expo native services for secure storage and notifications, and platform auth providers for Apple and Google sign-in.

## Environment Inputs

- Public runtime envs are documented in [`.env.example`](/Users/dev/Projects/EveryBible/.env.example)
- Supabase client reads `EXPO_PUBLIC_SUPABASE_URL` and either `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` in [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts)
- Google auth reads `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in [`src/services/auth/googleSignIn.ts`](/Users/dev/Projects/EveryBible/src/services/auth/googleSignIn.ts)
- Bible audio reads `EXPO_PUBLIC_BIBLE_IS_API_KEY` in [`src/services/audio/audioRemote.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioRemote.ts)
- Local Supabase dev config also references provider secrets in [`supabase/config.toml`](/Users/dev/Projects/EveryBible/supabase/config.toml)

## Supabase

### What It Handles

- Authentication
- User profiles
- Synced reading progress
- Synced preferences
- Group study data and RPC helpers

### Client Entry Points

- Runtime client: [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts)
- Lazy client accessor: [`src/services/supabase/lazyClient.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/lazyClient.ts)
- Typed table aliases: [`src/services/supabase/types.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/types.ts)

### Auth Providers

- Email/password in [`src/services/auth/authService.ts`](/Users/dev/Projects/EveryBible/src/services/auth/authService.ts)
- Apple Sign-In in [`src/services/auth/authService.ts`](/Users/dev/Projects/EveryBible/src/services/auth/authService.ts)
- Google Sign-In in [`src/services/auth/authService.ts`](/Users/dev/Projects/EveryBible/src/services/auth/authService.ts)
- Redirect URLs are configured in [`supabase/config.toml`](/Users/dev/Projects/EveryBible/supabase/config.toml)

### Database Surface

- Base schema in [`supabase/schema.sql`](/Users/dev/Projects/EveryBible/supabase/schema.sql)
- Historical migrations in [`supabase/migrations/`](/Users/dev/Projects/EveryBible/supabase/migrations)
- Important tables and routines referenced by app code:
- `profiles`
- `user_progress`
- `user_preferences`
- `groups`
- `group_members`
- `group_sessions`
- `join_group_by_code(...)`
- `leave_group(...)`
- `delete_my_account()`

### App Features Using Supabase

- Session restoration and auth state subscription in [`src/stores/authStore.ts`](/Users/dev/Projects/EveryBible/src/stores/authStore.ts)
- Progress sync in [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts)
- Preferences sync in [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts)
- Synced groups in [`src/services/groups/groupService.ts`](/Users/dev/Projects/EveryBible/src/services/groups/groupService.ts)
- Account deletion / profile flows in [`src/services/account/accountService.ts`](/Users/dev/Projects/EveryBible/src/services/account/accountService.ts)

## Bible.is Audio API

- Remote source implementation: [`src/services/audio/audioRemote.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioRemote.ts)
- The app maps local book IDs to Bible.is identifiers and fetches chapter audio from `https://4.dbt.io/api`
- Audio metadata is cached in-memory with a `Map`
- Translation metadata determines whether a fileset ID exists before remote fetches
- Download and playback flows compose this integration through [`src/services/audio/audioService.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioService.ts) and [`src/services/audio/audioDownloadService.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioDownloadService.ts)

## Secure Storage And Local Persistence

- Supabase auth session storage uses SecureStore on native and `localStorage` on web in [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts)
- Privacy PIN settings use SecureStore in [`src/services/privacy/privacyService.ts`](/Users/dev/Projects/EveryBible/src/services/privacy/privacyService.ts)
- AsyncStorage persists Zustand slices in:
- [`src/stores/authStore.ts`](/Users/dev/Projects/EveryBible/src/stores/authStore.ts)
- [`src/stores/progressStore.ts`](/Users/dev/Projects/EveryBible/src/stores/progressStore.ts)
- [`src/stores/audioStore.ts`](/Users/dev/Projects/EveryBible/src/stores/audioStore.ts)
- [`src/stores/bibleStore.ts`](/Users/dev/Projects/EveryBible/src/stores/bibleStore.ts)

## SQLite

- Database setup lives in [`src/services/bible/bibleDatabase.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bibleDatabase.ts)
- Initial data comes from [`src/services/bible/bsbData.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bsbData.ts) and [`data/bsb_processed.json`](/Users/dev/Projects/EveryBible/data/bsb_processed.json)
- The app uses SQLite for offline read/search flows rather than remote scripture fetches

## Notifications

- Native plugin registration in [`app.json`](/Users/dev/Projects/EveryBible/app.json)
- Notification scheduling and permissions live in [`src/screens/more/SettingsScreen.tsx`](/Users/dev/Projects/EveryBible/src/screens/more/SettingsScreen.tsx)
- The feature is preference-backed and can sync via [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts)

## Native / Expo Platform Hooks

- Apple entitlement is present in [`ios/EveryBible/EveryBible.entitlements`](/Users/dev/Projects/EveryBible/ios/EveryBible/EveryBible.entitlements)
- Custom prebuild behavior for splash and alternate icon assets is implemented in [`plugins/withBrandedSplashAsset.js`](/Users/dev/Projects/EveryBible/plugins/withBrandedSplashAsset.js)
- Audio background mode is declared in [`app.json`](/Users/dev/Projects/EveryBible/app.json)

## External Integration Boundaries To Watch

- This repo contains a local credential-looking file at [`every-bible-485319-82e2f287e3f8.json`](/Users/dev/Projects/EveryBible/every-bible-485319-82e2f287e3f8.json); verify whether it is intentionally tracked
- The root [`.env`](/Users/dev/Projects/EveryBible/.env) exists locally; keep it untracked and avoid copying values into planning docs
- No webhooks or Edge Functions are currently visible in repo code; the integration model is client-to-Supabase plus device-native services
