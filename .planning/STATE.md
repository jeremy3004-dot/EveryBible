---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase complete — ready for verification
stopped_at: Completed 18-03-PLAN.md
last_updated: "2026-04-07T02:32:20.731Z"
progress:
  total_phases: 35
  completed_phases: 25
  total_plans: 70
  completed_plans: 68
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** When someone opens the app, they can reliably read or listen to scripture and continue their discipleship journey even when network conditions are weak or backend features are partially unavailable.
**Current focus:** Phase 18 — reading-plans

## Current Position

Phase: 18 (reading-plans) — EXECUTING
Plan: 4 of 4
Phase: 33 (chapter-feedback-and-review-pipeline) — IN PROGRESS (plans 01-03 complete, 04 pending)

## Performance Metrics

**Velocity:**

- Total plans completed: 32
- Current phase plans remaining: 2
- Average duration: n/a
- Total execution time: n/a

**By Phase:**

| Phase                                             | Plans | Total | Avg/Plan |
| ------------------------------------------------- | ----- | ----- | -------- |
| 1. Startup And Backend Hardening                  | 2     | n/a   | n/a      |
| 2. Onboarding And Preference Cohesion             | 2     | n/a   | n/a      |
| 3. Core Reading And Audio Polish                  | 2     | n/a   | n/a      |
| 4. Discipleship And Group Rollout                 | 3     | n/a   | n/a      |
| 5. Release Hardening And Distribution             | 2     | n/a   | n/a      |
| 05.1 Audio-only downloadable Bible experience     | 1     | n/a   | n/a      |
| 6. Discovery, Retention, And Responsiveness       | 3     | n/a   | n/a      |
| 7. Premium Reader And Personal Study              | 3     | n/a   | n/a      |
| 8. Bible Book Hub And Chapter Launch Experience   | 3     | n/a   | n/a      |
| 9. Saved Library And Audio Personalization        | 3     | n/a   | n/a      |
| 10. Book Companion Content And Ecosystem Surfaces | 3     | n/a   | n/a      |

**Recent Trend:**

- Last 5 plans: 13-01, 14-01, 14-02, 26-01, 27-01
- Trend: Quick phases (25, 26, 27) now complete; all three phases addressed analytics tracking, navigation gaps, and translation availability

_Updated after each plan completion_
| Phase 28-multi-translation-supabase-library P01 | 4 | 2 tasks | 4 files |
| Phase 28 P02 | 7m | 2 tasks | 8 files |
| Phase 29-mmkv-state-persistence-upgrade P01 | 7 | 3 tasks | 18 files |
| Phase 29-mmkv-state-persistence-upgrade P02 | 2m | 2 tasks | 4 files |
| Phase 30-animated-chapter-swipe P01 | 3m | 2 tasks | 5 files |
| Phase 30-animated-chapter-swipe P02 | 4m | 2 tasks | 1 file |
| Phase 30-animated-chapter-swipe P03 | ~2m | 2 tasks (1 auto + 1 human-verify) | 1 file |
| Phase 31-push-notification-implementation P01 | ~6m | 2 tasks | 9 files |
| Phase 31-push-notification-implementation P02 | ~4m | 2 tasks | 6 files |
| Phase 32-bible-verse-deep-linking P01 | ~6m | 3 tasks | 10 files |
| Phase 18 P01 | 15m | 4 tasks | 6 files |
| Phase 18-reading-plans P18-02 | 12m | 4 tasks | 13 files |
| Phase 18-reading-plans P04 | 25 | 3 tasks | 1 files |
| Phase 18 P03 | 25 | 4 tasks | 1 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Initialization: Treat this as a brownfield hardening roadmap, not a greenfield project
- Initialization: Keep Expo / React Native / Supabase and plan improvements incrementally
- Initialization: Use standard-granularity phases with parallel execution and verification enabled
- Phase 2: Treat locale flow as verification-heavy because the core flow already exists; spend implementation effort on privacy/settings parity and reminder correctness
- Phase 3: Expose local Bible search through the live browser instead of adding a separate search screen or data path
- Phase 3: Gate audio affordances by real remote-or-offline capability rather than by translation metadata alone
- Phase 4: Mount the existing LearnStack directly in the root shell before attempting deeper discipleship or group rewrites
- Phase 4: Use a read-side group repository boundary so preserved local groups stay usable while synced groups remain honest about rollout status
- Phase 4: Route synced session completion through explicit service guards instead of letting remote groups fall through local-only mutation paths
- Phase 05.1: Add a dedicated audio-only translation path so the app can be validated when audio exists but chapter text does not
- Phase 6: Keep passage parsing inline with the existing Bible search entry point instead of adding a separate scripture-jump screen
- Phase 6: Treat the calendar as a reading-activity view backed by current progress data, not a full reading-plan system
- Phase 6: Migrate only the highest-value Bible lists to FlashList first and preserve existing reader/audio contracts
- Phase 7: Use one chapter screen with explicit session-mode helpers rather than splitting listen and read into separate routes
- Phase 8: Use a local-first book experience contract with seeded metadata and original fallback visuals instead of blocking on a backend content source
- Phase 9: Keep saved-library features local-first and extend the existing audio store/player contract rather than introducing a new playback architecture
- Phase 10: Attach companion modules to the book hub through one reusable schema and a thin analytics seam instead of adding a CMS or vendor analytics dependency first
- Post-phase polish: Keep completion context in the chapter grid, but remove the large hero progress card from the book hub because it competes with the actual reader/listener surfaces
- Post-phase polish: Treat chapter-to-chapter audio navigation as a single-session handoff and cancel stale chapter loads instead of letting multiple playback requests race
- Post-phase polish: Let the player own chapter transport inside BibleReader, hide the global tab shell on that route, and use the freed vertical space for a fuller listen/audio-first layout
- Post-phase polish: Only resync BibleReader to the active audio chapter when the reader was already showing that playing chapter; manual chapter launches must override stale playback state
- Post-phase polish: Keep the book hub focused on title plus chapter grid, removing extra explanatory and promotional chrome that competes with the actual reading/listening action
- Post-phase polish: Treat the audio-first Bible screen as a dedicated minimal listen surface with its own stripped header and transport variant instead of reusing the fuller reader chrome
- Post-phase polish: Keep the Listen/Read toggle exclusive to the actual chapter session screen, and keep book-hub hero banners on the shared accent red instead of rotating per-book colors
- Phase 11: Reuse the existing playback/session model, but give audio-first chapters a dedicated chapter-only transport and art-led layout instead of stacking extra shells and explanatory copy
- Phase 12: Prefer a disciplined mobile system built around structured native sans typography, 4-point spacing rhythm, and semantic surfaces rather than adding more decorative treatments or screen-specific visual experiments
- Phase 13 hardening: Treat translation identity as part of audio track identity so BSB and WEB playback, queue entries, and resume state cannot collide on the same chapter
- Phase 27: Co-locate all bundled translations in a single bible-bsb-v2.db asset rather than per-translation files; downloadTranslation resolves silently for hasText translations; TranslationBrowserScreen uses useBibleStore.getState() inside callbacks to avoid reactive re-trigger loops
- [Phase 28-multi-translation-supabase-library]: bible_verses schema mirrors bundled SQLite verses table 1:1 so download data maps cleanly to local DB format
- [Phase 28-multi-translation-supabase-library]: anon RLS policies added to all three translation tables so unauthenticated users can browse without requiring login
- [Phase 28-multi-translation-supabase-library]: Import script uses service_role key (bypasses RLS) and is a dev/ops tool only — not called from the app
- [Phase 28]: Use expo-file-system/legacy for cloudTranslationService filesystem ops; new v2 API does not expose documentDirectory on its top-level namespace
- [Phase 28]: Fetch Supabase bible_verses in pages of 5000 to respect free-tier response size limits
- [Phase 28]: Dynamic import() of cloudTranslationService in bibleStore to keep bundled-only app startup lean
- [Phase 28 regression hardening]: Do not expose runtime translations from `translation_catalog` unless the normalized translation ID resolves to a current `translation_versions` row with real verse coverage
- [Phase 28 regression hardening]: Only mark `translation_catalog.is_available` true after verse rows and `translation_versions` upsert successfully; failed imports must not leave picker-visible orphan rows
- [Phase 28 regression hardening]: Preserve seeded runtime translations as `source: runtime` and merge persisted remote metadata on rehydrate so valid cloud-backed Hindi/Nepali entries do not fall back to bundled placeholders after restart
- [Phase 28 regression hardening]: Hide unreadable runtime placeholder rows while the picker is hydrating the runtime catalog so fresh launches do not briefly label installable translations as coming soon
- [Phase 28 regression hardening]: Resolve Expo's Babel preset through the installed Expo package path so Reanimated-enabled release bundles succeed in `expo export:embed` and Release iOS builds
- [Phase 29-mmkv-state-persistence-upgrade]: Pin react-native-mmkv to 2.12.2 (no caret) — prevents accidental v3 install which requires New Architecture and crashes on newArchEnabled=false builds
- [Phase 29-mmkv-state-persistence-upgrade]: Use dynamic require() in migrateFromAsyncStorage for native deps so STORE_KEYS and migrateStoreKeys can be imported in Node test runner without native module resolution
- [Phase 29-mmkv-state-persistence-upgrade P02]: QueryClientProvider placed as outermost provider in App() — wraps all other providers so future useQuery hooks work regardless of which provider tree they sit in
- [Phase 29-mmkv-state-persistence-upgrade P02]: No Supabase calls migrated in this plan — additive foundation only; existing fetch patterns untouched
- [Phase 30-animated-chapter-swipe P01]: Pin react-native-reanimated to ~3.19.5 explicitly — npx expo install without a pin resolves to 4.x which requires New Architecture and crashes on newArchEnabled=false builds
- [Phase 30-animated-chapter-swipe P01]: Place swipe threshold constants and resolveSwipeChapterNavigation in bibleReaderModel.ts alongside existing reader model constants — keeps the model surface cohesive and avoids a new file for a small addition
- [Phase 30-animated-chapter-swipe P02]: Use inline threshold logic in .onEnd worklet (not resolveSwipeChapterNavigation import) to avoid potential Reanimated Babel plugin bundling issues with imported functions in worklet context
- [Phase 30-animated-chapter-swipe P02]: persistentReaderBottomBar stays outside GestureDetector so bottom nav buttons do not translate during swipe
- [Phase 30-animated-chapter-swipe P03]: Follow Along modal uses transparent Modal + inner Animated.View because React Native's native animationType hides Reanimated enter animation behind an opaque backdrop; SlideOutDown uses fixed 250ms (not spring) for fast natural exit
- [Phase 31-push-notification-implementation P01]: Use cancelScheduledNotificationAsync('daily-reading-reminder') not cancelAllScheduledNotificationsAsync — preserves future group alert notifications from being destroyed when disabling daily reminders
- [Phase 31-push-notification-implementation P01]: setupNotificationHandler() called at module scope before any React component renders — ensures foreground handler is registered before any notification can arrive
- [Phase 31-push-notification-implementation P01]: setupAndroidChannels() called in AppContent useEffect (not startup coordinator) — channels are idempotent so mount timing is safe and avoids coordinator complexity
- [Phase 31-push-notification-implementation P02]: Cache push token in module-level cachedPushToken variable — avoids async Supabase read in sign-out path and keeps deactivatePushToken gate-able without a round-trip
- [Phase 31-push-notification-implementation P02]: Fire-and-forget group notification uses void IIFE with internal try/catch — enables awaiting getCurrentUserId() inside without leaking an async promise to recordSyncedGroupSession's caller
- [Phase 31-push-notification-implementation P02]: Edge Function fetches group name from groups table internally — keeps recordSyncedGroupSession API stable (no groupName param added), avoids a breaking API change
- [Phase 31 crash sweep 2026-03-27]: Forward the `addPushTokenListener` device token into `registerPushToken` and reuse the cached registration for the same signed-in user after a successful sync — avoids re-entering Expo's device-token lookup from the refresh callback while keeping auth-time registration and sign-out deactivation intact
- [Phase 31 crash sweep 2026-03-27]: Stop forcing bundled BSB SQLite opens through a cached Expo directory path and probe the bundled asset through SQLite directly — fixes the connected-iPhone `Could not open database` startup/search failure and keeps verse-of-the-day reads on the live device
- [Phase 3 crash sweep 2026-03-27]: BibleBrowserScreen full-text search now waits 250ms and ignores stale async completions — reduces rapid-typing SQLite churn on device and guards against search-screen freezes after the bundled DB repair
- [Phase 3/28 crash sweep 2026-03-27]: Non-FTS downloaded translations now throw `BibleSearchUnavailableError` instead of scanning `verses.text LIKE '%query%'`, and BibleBrowserScreen surfaces `bible.searchUnavailable` for that path — removes the last known CPU-heavy search fallback tied to the historical build 176 `cpu_resource` report while preserving reference navigation and bundled-FTS search
- [Phase 29/31 crash sweep 2026-03-27]: syncService now lazy-loads progressStore and bibleStore inside async sync paths — removes the Metro `progressStore -> syncService` require-cycle warning on connected-iPhone relaunch smoke without changing sync behavior
- [Phase 30/reader regression hardening 2026-03-27]: Reader session-mode persistence and live-transcript retention regressions are now covered by `bibleReaderModel.test.ts` and `bibleReaderChromeSource.test.ts`, and both suites are included in `npm run test:release`
- [Phase 28 translation picker regression 2026-03-27]: TranslationPickerList now dismisses the sheet only after a translation is actually activated; runtime translations that still need a text-pack download keep the picker open so install progress remains visible and the user can leave manually later
- [Phase 28 translation download rollback fix 2026-03-27]: Cloud text-pack installs now write verse batches through `withExclusiveTransactionAsync(txn)` instead of the non-exclusive Expo `withTransactionAsync` helper — avoids the iOS/native `execAsync -> cannot rollback - no transaction is active` failure that surfaced while selecting a runtime translation to download
- [Phase 32-bible-verse-deep-linking P01]: Extract buildBibleNavState as pure function separate from linkingConfig so Node.js test runner can test routing logic without expo-linking/react-native dependency
- [Phase 32-bible-verse-deep-linking P01]: Derive SLUG_TO_BOOK_ID from bibleBooks array at module scope — single source of truth, no hardcoded slug map
- [Phase 32-bible-verse-deep-linking P01]: Add psalm alias to SLUG_TO_BOOK_ID (Psalms canonical name but users expect singular form)
- [Phase 33-chapter-feedback-and-review-pipeline]: Keep chapter feedback opt-in and route it through the existing chapter overflow instead of adding persistent thumbs to the reader chrome
- [Phase 33-chapter-feedback-and-review-pipeline]: Emit `chapter_feedback_opened`, `chapter_feedback_submitted`, and `chapter_feedback_failed` analytics events with translation/chapter context so the funnel is observable
- [Phase 33-chapter-feedback-and-review-pipeline]: Save feedback rows in Supabase first and treat Google Sheets export as a recoverable operator sink with degraded-success support
- [Phase 18]: Used UNION ALL SQL pattern for reading plan entry seeds — UUID-independent subqueries look up plan by slug at migration time
- [Phase 18]: Chronological Bible order: Job after Genesis, Psalms/Proverbs/Ecclesiastes/Song after 2 Samuel, prophets interleaved with Kings, post-exilic books last in OT, then NT sequentially
- [Phase 18-reading-plans]: ReadingPlanDetailScreen accepts planId+navigation as required props; PlanDetailScreen wrapper forwards PlansStack params
- [Phase 18-reading-plans]: Plans tab placed between Learn and More; uses calendar-outline icon; PlanDetail hides tab bar
- [Phase 18-reading-plans]: PlanDetailScreen rewritten as standalone full screen (not enhancing ReadingPlanDetailScreen) for clean Plans stack ownership
- [Phase 18-reading-plans]: LinearGradient used for cover image overlay; PlanCoverImage helper handles null cover_image_url with themed fallback
- [Phase 18]: All PlansHomeScreen sub-components kept in one file (~1050 lines); chip colors use accentPrimary opacity variations to avoid hardcoded hex

### Pending Todos

- Manual device verification for Phase 05.1 WEB audio translation selection, download, and offline playback behavior
- Manual device verification that Select Translation stays open while a runtime Bible text pack downloads and still dismisses normally after an actual translation activation
- Manual device verification that runtime text-pack downloads no longer surface the SQLite rollback alert during install on the connected iPhone
- Manual verification for typed references like `John 3:16`, `1 Cor 13`, and `Luke 10:5-7, 10-11` from the Bible surface
- Manual verification for ChapterSelector and BibleBrowser FlashList behavior on device, especially scroll feel and layout stability
- Manual verification for the Reading Activity screen from More/Profile, including marked days and selected-day detail behavior
- Translation pass for the new reading-activity strings; non-English locales currently use English fallback copy to preserve key coverage
- Manual verification for the new Phase 7 listen/read segmented session, including overlay open/close, playback continuity, and read-mode return behavior
- Manual device verification for the new book hub hero, synopsis, intro strip, continue CTA, and chapter grid across smaller phones
- Manual verification for saved-library flows, including favorites, playlist save/reopen, queue advancement, history reopen, and share/download behavior
- Manual verification for reader chapter navigation while audio is already playing, especially repeated `Next`/`Previous` taps and mixed read/listen mode transitions
- Manual verification for opening a different chapter from the chapter list while another chapter is already playing, ensuring the new chapter starts immediately instead of snapping back
- Manual verification for the global mini-player across tabs, app background/foreground transitions, and reopen/dismiss behavior
- Manual verification for companion-module sections, including sparse-book empty states and return navigation back into the book hub or chapter session
- Manual device verification for the full-screen BibleReader chrome, especially hidden tabs, audio-only chapter spacing, and read/listen mode bottom insets on smaller phones
- Manual device verification for the simplified book hub on smaller phones, ensuring the reduced hero still balances cleanly above the chapter grid
- Manual device verification that simplified book hubs no longer show the top Listen/Read rail, no longer show the empty companion fallback card, and keep the same accent-red hero background across books
- Manual device verification that chapter tiles no longer show completion check badges and still keep the intended continue-chapter highlight
- Manual device verification for the new simplified audio-first listen screen, especially header removal, three-button transport spacing, and overflow/favorite actions on smaller iPhones
- Manual device verification that the top audio toggle/button remains discoverable enough on text chapters now that audio-first chapters no longer show duplicate top chrome
- Manual device verification for the new Phase 12 professional design system, especially tab-bar fit, card density, and title hierarchy across Home, Bible, Learn, More, Profile, and Reading Activity
- Manual device verification for the new Phase 12.1 premium read-mode chrome, especially scroll-collapse timing, glass legibility, and safe-area fit on smaller iPhones
- Manual device verification that built-in BSB audio still streams, downloads, switches cleanly from an already-playing WEB chapter, and plays offline correctly after the direct-source swap away from Bible.is
- Longer on-device soak for the Phase 31 notification registration path across sign-in, relaunch, and token-refresh conditions; 2026-03-27 smoke coverage found no new EveryBible crash reports after the listener/device-token fix
- Plan 13-02: replace the older local BSB text refresh path with an official Berean download/import pipeline and regenerate bundled BSB artifacts from first-party files
- Phase 30 all manual device verifications COMPLETE (swipe left/right, scroll-collapse, gesture conflict, audio sync, Follow Along spring modal — all 7 checks passed)

### Roadmap Evolution

- Phase 05.1 inserted after Phase 5: Audio-only downloadable Bible experience (URGENT)
- Phase 6 added after Phase 05.1: Discovery, Retention, And Responsiveness
- Phase 7 mapped from Dwell gap audit: Premium Reader And Personal Study
- Phase 8 mapped from Dwell gap audit: Bible Book Hub And Chapter Launch Experience
- Phase 9 mapped from Dwell gap audit: Saved Library And Audio Personalization
- Phase 10 mapped from Dwell gap audit: Book Companion Content And Ecosystem Surfaces
- Phase 11 added: Audio reader chrome simplification and Dwell-style listen layout polish
- Phase 12 added: Professional design-system unification across the app shell and highest-traffic screens
- Phase 12.1 inserted after Phase 12: Premium liquid-glass reader chrome and scroll-collapse motion (URGENT)
- Phase 13 added: Public-domain Berean Standard Bible sourcing and direct audio integration
- Phase 14 added: Backend-driven Bible content sync and offline pack delivery
- Phase 15 added: Reverential Theme & Typography
- Phase 16 added: Backend Foundation & Theme Fix (low-light sync bug, storage buckets, push tokens)
- Phase 17 added: Bookmarks, Highlights & Notes (verse-level annotations with offline-first sync)
- Phase 18 added: Reading Plans (pre-seeded plans with enrollment, group assignments)
- Phase 19 added: Prayer Community (group-scoped prayer walls with interactions)
- Phase 20 added: Analytics & Engagement Metrics (lightweight PG event tracking + Edge Function aggregation)
- Phase 21 added: Content Versioning & Multiple Translations (version tracking, preferences, scrollmapper data sourcing)
- Phase 22 added: Gather Tab: Waha-style Foundations, Topics & Meeting Format
- Phase 23 added: Foundations content restructure (7 foundations, 67 lessons, single-chapter-per-lesson)
- Phase 26 completed: UX completeness — navigation stubs removed (AnnotationsScreen, LessonDetailScreen note button)
- Phase 27 completed: Translation downloads WEB & ASV — bundled in bible-bsb-v2.db, TranslationBrowserScreen wired
- Phase 28 added: Multi-Translation Supabase Library — 211 public-domain full Bibles (OT+NT) from eBible.org into Supabase, download-on-demand in app
- Phase 29 added: MMKV State Persistence Upgrade — swap AsyncStorage for MMKV across all Zustand stores to eliminate cold-start hydration lag
- Phase 30 added: Animated Chapter Swipe and Reader Gestures — swipe navigation + scroll-driven header collapse using rn-reanimated
- Phase 31 added: Push Notification Implementation — complete APNs/FCM setup, token registration, daily reading reminders, group alerts
- Phase 32 added: Bible Verse Deep Linking — everybible://bible/john/3/16 deep link scheme + share verse functionality
- Phase 33 added: Chapter Feedback And Review Pipeline — opt-in thumbs up/down plus optional written chapter feedback routed into Supabase and spreadsheet review ops

### Blockers/Concerns

- Phase 1 still needs manual device validation for startup, auth callbacks, and reconnect sync
- Phase 2 still needs manual device validation for locale completion, discreet-mode relock, and reminder delivery
- Phase 3 still needs manual device validation for offline search, daily audio CTA behavior, and remote-vs-offline audio transitions
- Phase 4 still needs manual device validation for Harvest-tab navigation, local-vs-synced group flows, and synced session completion
- Signed builds, device checks, and distribution attachment still need manual verification before the milestone can be called shipped
- Phase 05.1 now uses direct eBible.org WEB audio and still needs manual device verification for in-app download/offline playback behavior
- Phase 28 regression hardening passed warm-state simulator smoke, clean-install Maestro smoke, and local iOS production/TestFlight release verification. App Store Connect now shows build `175` (`6dc62699-0c6d-4bd0-8eb6-264ca8eda9e9`) as `VALID`, attached to the `Internal Testers` group and directly to `curryj@protonmail.com`. Remaining manual work is the end-to-end on-device download/install/offline reopen check on TestFlight hardware.
- 2026-03-27 connected-iPhone crash sweep has now fixed three concrete regressions: Expo notification token refresh re-registration, bundled BSB SQLite opens using a forced directory path, and the non-FTS downloaded-translation `%query%` search scan. Current smoke runs show no new EveryBible crash reports, no recurring `Could not open database` startup failure, and no remaining known CPU-heavy full-text fallback; remaining confidence gaps are longer real-device soak coverage plus manual device confirmation of the new unsupported-search message on installed translations.
- Phase 6 adds new dependencies (`@shopify/flash-list`, `react-native-calendars`, `bible-passage-reference-parser`) that need verification against current Expo / React Native runtime behavior
- Dwell-style follow-along text currently uses weighted progress estimation because the current audio layer does not expose uniform verse-level timing metadata
- Phases 8 to 10 ship with local-first seeded metadata and companion content; any future backend source now needs only to implement the existing contracts rather than redefining the UI layer
- Gstack/browser verification remains intentionally skipped for the new Bible flows because the repo does not include Expo web dependencies and the shipped surfaces are native-first
- Phase 11 now depends on device QA for visual fit on smaller iPhones because the new art-led listen layout intentionally uses more vertical space and fewer header affordances
- Phase 12 improves the main impression surfaces first; deeper edge screens such as full settings flows may still benefit from a second-pass polish after device review
- Phase 12.1 depends on a credible React Native approximation of Apple's liquid-glass feel; Expo blur and motion tuning must improve the experience without making controls unreadable or brittle on device
- Phase 12.1 is now in TestFlight as App Store Connect build `100` (`aa288850-2023-4ff4-817f-a071af783fd1`), with `processingState=VALID`, `group_has_build=true`, and `tester_has_build=true` for `curryj@protonmail.com`
- Phase 13 still needs device QA for BSB translation-switch handoff, download, and offline playback after the direct-source provider swap, and plan 02 still needs to replace the older local BSB text refresh path with official Berean downloads
- Supabase evidence sweep confirms `bible-audio` objects are present and publicly readable, but the live bucket still serves BSB `.m4a` files with `Cache-Control: no-cache`, and the bucket config has drifted from the migration's MIME/size guardrails. This looks like backend performance debt, not the current iPhone crash root cause.
- Phase 33 plans 01-03 are complete locally and the remote backend has now been provisioned: the secrets were set on Supabase, migration `create_chapter_feedback_pipeline` was applied to project `ganmududzdzpruvdulkg`, and the `submit-chapter-feedback` Edge Function was deployed. The remaining blocker before plan 04 ship work is Google-side: the Sheets API is still disabled for project `every-bible-485319`, and spreadsheet sharing to `sheets-writer@every-bible-485319.iam.gserviceaccount.com` still needs confirmation once the API is enabled

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260324-lvw | Comprehensive i18n audit and fix across all screens, components, and data files | 2026-03-24 | 94728f4 | [260324-lvw](./quick/260324-lvw-comprehensive-i18n-audit-and-fix-across-/) |
| 260323 | Fix 4 Bible reader bugs: back navigation, background downloads, font size clipping, audio scroll alignment | 2026-03-23 | 954569f | [260323-fix-4-bible-reader-bugs-back-navigation-](./quick/260323-fix-4-bible-reader-bugs-back-navigation-/) |
| 260324 | Fix 5 UI bugs: tab bar padding, secure-code keyboard, reader header, back button safe area, mini player overlap | 2026-03-24 | 7bc941b | [260324-fix-5-ui-bugs-tab-bar-padding-secure-cod](./quick/260324-fix-5-ui-bugs-tab-bar-padding-secure-cod/) |
| 260324-lvw | Comprehensive i18n audit and fix: locale parity es/ne/hi, hardcoded strings in screens/components, static data file keys | 2026-03-24 | 26680a5 | [260324-lvw-comprehensive-i18n-audit-and-fix-across-](./quick/260324-lvw-comprehensive-i18n-audit-and-fix-across-/) |
| 260406-rso | Replace ipapi.co with a self-owned Cloudflare Worker for geolocation | 2026-04-06 | f15d311 | [260406-rso-replace-ipapi-co-with-a-self-owned-cloud](./quick/260406-rso-replace-ipapi-co-with-a-self-owned-cloud/) |
| 260406-s17 | Deploy Cloudflare Worker for geo and smoke test end-to-end | 2026-04-06 | — | [260406-s17-deploy-cloudflare-worker-for-geo-and-smo](./quick/260406-s17-deploy-cloudflare-worker-for-geo-and-smo/) |

## Session Continuity

Last session: 2026-04-07T02:32:20.726Z
Stopped at: Completed 18-03-PLAN.md
Resume file: None
