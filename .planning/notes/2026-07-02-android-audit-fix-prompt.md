# GOAL: Fix the 2026-07-02 Android audit findings in EveryBible

> Source: read-only Android audit (2026-07-02). All `file:line` references below were
> verified against the code at audit time — re-verify before editing, since line numbers drift.
> Companion memory: `~/.claude/projects/-Users-dev-Projects-EveryBible/memory/project_android_audit_2026_07.md`.

You are working in `/Users/dev/Projects/EveryBible` (Expo SDK 54 / RN 0.81 / Hermes, no JIT /
TypeScript / Zustand+MMKV / Supabase). A read-only Android audit produced the findings below with
verified `file:line` references. Fix them. This is real production code serving live users —
correctness and Android-phone behavior are the bar.

## Operating rules (do not violate)
- **Test-first bugfix protocol.** For each behavioral bug, first add/adjust an automated test that
  reproduces it and fails, then fix, then confirm the test passes. Where a device is genuinely
  required (media session, edge-to-edge), write the smallest deterministic unit test around the
  extractable logic and note what still needs on-device verification.
- **Hermes hot-path rule.** Never introduce `new URL()`, `Intl.*`, `String.prototype.localeCompare`,
  large `JSON.parse`, or Fuse index builds at module scope or in hydration/render/keystroke paths.
  Use regex/Map/plain `<`/`>`/deferred `require()`. Metro `inlineRequires` is OFF — every static
  import is eager at boot.
- **Bundled-DB triple-bump rule.** If you touch `bible-bsb-v2.db`, bump all three in the same commit:
  `PRAGMA user_version`, `BUNDLED_BIBLE_SCHEMA_VERSION` (bibleDataModel.ts),
  `DEFAULT_MINIMUM_READY_VERSE_COUNT` (bibleDatabase.ts). (These fixes should NOT require a DB
  rebuild — flag it if you think one is needed.)
- **No cloud builds.** Do not run `eas build` (cloud). Local verification only: `npm run lint`,
  `npm run typecheck`, `npm test` / `npm run test:release`. Do not start builds speculatively.
- Follow repo conventions: theme colors via `useTheme()`, all user-facing strings via `t()` across
  all locale files, service-layer logic (not in components), barrel exports, no `any`.
- Work on a feature branch. Keep changes minimal and root-cause-focused. Don't fix things not listed
  here without flagging them first.
- Preserve offline-first behavior throughout.

## Scope — fix in this order

### Tier 1 — Critical / silent data & feature failures

1. **Onboarding import bloats every user's boot graph.** `App.tsx:25` statically imports
   `LocaleSetupFlow`, pulling `bibleStore` hydration + supabase-js + sync/translations into the eager
   boot path for all users (RootNavigator is lazy-required at `App.tsx:265`; onboarding isn't).
   Lazy-require `LocaleSetupFlow` inside the `!onboardingCompleted` branch (same pattern as
   RootNavigator), and extend `startupBootSurface.test.ts` to scan the transitive boot closure (not
   just App.tsx's own source) so this can't regress.

2. **Fallback audio download saves HTTP error bodies as audio, permanently.**
   `src/services/audio/audioDownloadStorage.ts:27-29` ignores `downloadAsync`'s status; error bodies
   get written, then `src/services/audio/audioDownloadService.ts:505-508`'s `fileExists`
   short-circuit marks the chapter downloaded forever. Check returned `status` (delete + throw on
   ≥400) and validate a sanity-floor byte size before marking complete. Add a timeout.

3. **Android push has never worked.** No `googleServicesFile` / `google-services.json`
   (app.json:35-48), so `getExpoPushTokenAsync` rejects and is swallowed
   (`src/services/notifications/notificationService.ts:177`). Wire FCM: add `googleServicesFile` to
   the app.json android block and document the EAS FCM V1 credential step. **This one needs the
   actual Firebase project + credentials — if those artifacts aren't available, do the code/config
   wiring and clearly flag the manual dashboard steps rather than faking it.**

4. **Missing translation-pack file bricks the translation.** The resolver
   (`src/stores/bibleStore.ts:962-972`) returns an installed source whenever `textPackLocalPath` is
   set, and `getDatabase`'s open *creates* a 0-byte DB before the deferred `reconcileTranslationPacks`
   runs — reconcile then sees `exists: true` and keeps it "installed" forever. Make reconcile verify a
   usable DB (size>0 / verses-table probe), and have `getDatabase` check existence before open and
   trigger the missing-pack path instead of letting SQLite create the file.

### Tier 2 — High-impact UX / performance

5. **bibleStore persists the full translations array** (`src/stores/bibleStore.ts:950`) → full
   `JSON.stringify` + sync MMKV write on every `set()` (chapter nav, download ticks) + re-sanitize
   every boot. Persist only user-mutable deltas keyed by translation id; rebuild full objects from the
   runtime catalog. **This changes the persisted format — write a migration and test hydration from
   the old format.**

6. **Google sign-in cancel shows an error alert.** `src/services/auth/authService.ts:182-186` checks
   only `!idToken`; v16 `signIn()` resolves `{type:'cancelled'}`. Check `response.type === 'cancelled'`
   first and return the silent `cancelled` auth error. While here, fix [G6]: map auth error codes to
   translated keys in `src/screens/auth/AuthScreen.tsx:127` instead of showing raw English service
   strings.

7. **Tab bar ignores safe-area insets** (`src/navigation/TabNavigator.tsx:81-109`) → 3-button nav
   overlaps labels under enforced edge-to-edge. Use `useSafeAreaInsets()`:
   `paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm` and derive height. Centralize a
   `useTabBarHeight()` also consumed by `AudioReturnTab` and the reader dock math.

8. **Back handling for the verse action sheet + onboarding.** `AnnotationActionSheet` is an inline
   overlay (not a Modal) (`src/components/annotations/AnnotationActionSheet.tsx:348`) → Android back
   pops the reader instead of closing the sheet. Convert to a Modal with `onRequestClose`, or add a
   focused `hardwareBackPress` listener (RN 0.79+ subscription `.remove()` cleanup — do NOT use
   `removeEventListener`). Add a BackHandler to `LocaleSetupFlow` calling `goToPreviousStep()` when not
   on the first step (`App.tsx:253`).

9. **Cancel download is a no-op.** `src/stores/bibleStore.ts:828` builds the wrong job id (real ids
   are `audio-download:${translationId}:${scope}:…`, `src/services/audio/audioDownloadService.ts:102`)
   and `runWithConcurrency` has no abort token. Thread the real job id from the active job record into
   cancel, and add an aborted flag checked in the worker loop.

10. **Harden bundled-DB init.** Add `PRAGMA quick_check` (or a `verses_fts` probe) after any fresh
    import before declaring ready (`src/services/bible/bibleDatabase.ts`); hoist a single in-flight
    init promise shared by `initDatabase`/`getDatabase`/`inspectBundledDatabaseStatus`; delete
    `-wal`/`-shm` siblings before force re-import; null the singleton before throwing on not-ready. Use
    one shared verse-count constant on the startup path (`src/services/bible/bibleService.ts:10`
    hardcodes 60000, bypassing `DEFAULT_MINIMUM_READY_VERSE_COUNT`). Add a node test asserting the
    shipped `.db`'s `user_version` and verse count match the constants.

### Tier 3 — do if Tier 1–2 land cleanly (otherwise leave as follow-up notes)
- Password-reset deep link dead-ends: add a `reset-password` route + screen and a recovery-fragment
  handler (`src/navigation/linkingConfig.ts:24`, G2).
- Drop `currentPosition`/`duration` from the `useAudioPlayer` selector (`src/hooks/useAudioPlayer.ts:108`)
  so the reader stops re-rendering at 4Hz during playback.
- Add a global error handler + crash reporting (M2) — zero visibility into Android production crashes today.
- RTL policy for ar/ur (M3): `I18nManager.allowRTL(false)` stopgap unless doing full RTL.

## Explicitly out of scope for this pass (flag as follow-ups, don't start)
- The expo-av → react-native-track-player media-session/foreground-service migration (A3). It's the
  biggest strategic item, larger effort, needs its own plan.
- Anything requiring invented Firebase/Google Cloud/Supabase dashboard state. List these as manual
  verification items:
  - Firebase project + `google-services.json` + EAS FCM V1 key (finding 3)
  - Google Cloud Android OAuth SHA-1s (EAS keystore + Play App Signing) (G3)
  - `eas env:list --environment production` contains the Google client IDs
  - Supabase authorized client IDs + `reset-password` redirect URL

## Definition of done
- Each fixed bug has a failing-then-passing test (or a documented reason it can't be unit-tested + the
  extracted-logic test that can).
- `npm run lint`, `npm run typecheck`, and `npm run release:verify` pass.
- A short report per fix: root cause, test added, fix summary, verification command/result.
- The manual/dashboard follow-ups and the deferred A3 migration are listed clearly at the end.
- Nothing marked "done" that wasn't actually verified — if a fix only compiles but couldn't be
  runtime-tested, say so.

## Verified-healthy (do NOT touch / don't "re-fix")
- June startup fixes still in place: `new URL()`→regex, lazy locale engine, `getBookById` Map, ISO
  sorts via `<`/`>` in annotationStore/annotationService.
- Bundled DB currently consistent: `user_version=7` = `BUNDLED_BIBLE_SCHEMA_VERSION=7`, 124,372 verses
  ≥ `DEFAULT_MINIMUM_READY_VERSE_COUNT=120000`, `quick_check` ok.
- Sessions in SecureStore (not MMKV); no async Supabase calls in `onAuthStateChange`; Apple button
  iOS-gated; new-arch flags consistent; notification channels created before scheduling; Hermes date
  parsing clean; R8/proguard keep rules comprehensive. `RECORD_AUDIO` is legitimately used (chapter
  feedback voice notes) — not an unused permission.
