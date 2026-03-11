# Concerns

## Security And Secret Hygiene

- The repo contains a credential-looking file at [`every-bible-485319-82e2f287e3f8.json`](/Users/dev/Projects/EveryBible/every-bible-485319-82e2f287e3f8.json); confirm whether it is intentionally tracked and rotate if it ever contained live credentials
- A local [`.env`](/Users/dev/Projects/EveryBible/.env) exists in the workspace; keep planning docs and commits free of env values
- Bible.is requests append the API key in the query string inside [`src/services/audio/audioRemote.ts`](/Users/dev/Projects/EveryBible/src/services/audio/audioRemote.ts), which is workable but easier to leak into logs or proxies than header-based auth

## Product / Architecture Drift

- `LearnStack` is defined in [`src/navigation/LearnStack.tsx`](/Users/dev/Projects/EveryBible/src/navigation/LearnStack.tsx) but is not mounted in [`src/navigation/TabNavigator.tsx`](/Users/dev/Projects/EveryBible/src/navigation/TabNavigator.tsx); this suggests either dead navigation or an incomplete product path
- Group study exists in both local-state form in [`src/stores/fourFieldsStore.ts`](/Users/dev/Projects/EveryBible/src/stores/fourFieldsStore.ts) and synced form in [`src/services/groups/groupService.ts`](/Users/dev/Projects/EveryBible/src/services/groups/groupService.ts); these models can drift without an explicit migration or rollout strategy
- Locale bundles extend beyond the four languages mentioned in [`README.md`](/Users/dev/Projects/EveryBible/README.md), so marketing/docs and actual support surface may already be out of sync

## Startup And Performance

- The app bundles a large scripture data file through [`src/services/bible/bsbData.ts`](/Users/dev/Projects/EveryBible/src/services/bible/bsbData.ts) and [`data/bsb_processed.json`](/Users/dev/Projects/EveryBible/data/bsb_processed.json); preload is deferred now, but bundle size and first-time population cost still matter
- Startup is safer than a typical Expo app because of [`src/services/startup/startupService.ts`](/Users/dev/Projects/EveryBible/src/services/startup/startupService.ts), but `App.tsx` still coordinates many gates and can become a regression hotspot
- `useSync()` in [`App.tsx`](/Users/dev/Projects/EveryBible/App.tsx) begins app-state and network listeners globally; sync race conditions are guarded, but the flow still deserves careful release testing

## Data Integrity And Sync

- Sync code mixes local store reads, merge logic, remote fetches, and remote upserts in [`src/services/sync/syncService.ts`](/Users/dev/Projects/EveryBible/src/services/sync/syncService.ts); this is practical but makes full conflict reasoning harder
- `createSyncedGroup(...)` in [`src/services/groups/groupService.ts`](/Users/dev/Projects/EveryBible/src/services/groups/groupService.ts) spans multiple writes without a database transaction boundary visible in app code
- The app is local-first for core reading, but preferences, progress, and group data each have different persistence paths; future migrations should be validated carefully

## Observability And Release Safety

- Error reporting appears to rely mostly on `console.error(...)` and `console.warn(...)`; there is no visible crash reporting, analytics, or central telemetry integration in repo code
- Current tests are mostly logic-level and do not exercise native auth, notifications, splash behavior, audio session handling, or full user journeys
- Expo New Architecture is disabled in [`app.json`](/Users/dev/Projects/EveryBible/app.json), which is reasonable for stability now but creates a future migration track

## Tooling And Maintenance

- Dual ESLint config files in [`eslint.config.js`](/Users/dev/Projects/EveryBible/eslint.config.js) and [`.eslintrc.js`](/Users/dev/Projects/EveryBible/.eslintrc.js) can drift and confuse editors or CI
- The Supabase client intentionally stays generic in [`src/services/supabase/client.ts`](/Users/dev/Projects/EveryBible/src/services/supabase/client.ts), so schema drift will be caught later than with generated types
- Large content and locale files will make refactors noisy and can obscure user-facing logic changes in diffs

## Active Or Recently Sensitive Areas

- Recent git history shows ongoing work around onboarding, reader controls, live auth, backend restoration, and offline audio
- The current worktree has local modifications in:
- [`src/components/audio/AudioFirstChapterCard.tsx`](/Users/dev/Projects/EveryBible/src/components/audio/AudioFirstChapterCard.tsx)
- [`src/services/bible/presentation.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.ts)
- [`src/services/bible/presentation.test.ts`](/Users/dev/Projects/EveryBible/src/services/bible/presentation.test.ts)
- Those files are likely the most fragile area for immediate continuation work
