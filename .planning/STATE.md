# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** When someone opens the app, they can reliably read or listen to scripture and continue their discipleship journey even when network conditions are weak or backend features are partially unavailable.
**Current focus:** Manual UX/device verification for the newly completed Dwell-inspired milestone slice, especially book hubs, saved-library flows, the global mini-player, and companion modules on physical devices

## Current Position

Phase: 10 (Book Companion Content And Ecosystem Surfaces)
Plan: 3 of 3 in current phase
Status: Phases 8 to 10 implemented and verified in automation; awaiting manual device QA for content layout, saved-library flows, and mini-player continuity
Last activity: 2026-03-20 — Shipped local-first book hubs, companion modules, saved-library actions, queue/history persistence, and a global mini-player for Bible listening

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**
- Total plans completed: 26
- Current phase plans remaining: 0
- Average duration: n/a (first execution session)
- Total execution time: n/a

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Startup And Backend Hardening | 2 | n/a | n/a |
| 2. Onboarding And Preference Cohesion | 2 | n/a | n/a |
| 3. Core Reading And Audio Polish | 2 | n/a | n/a |
| 4. Discipleship And Group Rollout | 3 | n/a | n/a |
| 5. Release Hardening And Distribution | 2 | n/a | n/a |
| 05.1 Audio-only downloadable Bible experience | 1 | n/a | n/a |
| 6. Discovery, Retention, And Responsiveness | 3 | n/a | n/a |
| 7. Premium Reader And Personal Study | 3 | n/a | n/a |
| 8. Bible Book Hub And Chapter Launch Experience | 3 | n/a | n/a |
| 9. Saved Library And Audio Personalization | 3 | n/a | n/a |
| 10. Book Companion Content And Ecosystem Surfaces | 3 | n/a | n/a |

**Recent Trend:**
- Last 5 plans: 09-02, 09-03, 10-01, 10-02, 10-03
- Trend: Strong execution with the remaining Dwell-inspired roadmap phases implemented through local-first contracts, reusable book hubs, and saved-library flows

*Updated after each plan completion*

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

### Pending Todos

- Manual device verification for Phase 05.1 WEB audio translation selection, download, and offline playback behavior
- Manual verification for typed references like `John 3:16`, `1 Cor 13`, and `Luke 10:5-7, 10-11` from the Bible surface
- Manual verification for ChapterSelector and BibleBrowser FlashList behavior on device, especially scroll feel and layout stability
- Manual verification for the Reading Activity screen from More/Profile, including marked days and selected-day detail behavior
- Translation pass for the new reading-activity strings; non-English locales currently use English fallback copy to preserve key coverage
- Manual verification for the new Phase 7 listen/read segmented session, including overlay open/close, playback continuity, and read-mode return behavior
- Manual device verification for the new book hub hero, synopsis, intro strip, continue CTA, and chapter grid across smaller phones
- Manual verification for saved-library flows, including favorites, playlist save/reopen, queue advancement, history reopen, and share/download behavior
- Manual verification for the global mini-player across tabs, app background/foreground transitions, and reopen/dismiss behavior
- Manual verification for companion-module sections, including sparse-book empty states and return navigation back into the book hub or chapter session

### Roadmap Evolution

- Phase 05.1 inserted after Phase 5: Audio-only downloadable Bible experience (URGENT)
- Phase 6 added after Phase 05.1: Discovery, Retention, And Responsiveness
- Phase 7 mapped from Dwell gap audit: Premium Reader And Personal Study
- Phase 8 mapped from Dwell gap audit: Bible Book Hub And Chapter Launch Experience
- Phase 9 mapped from Dwell gap audit: Saved Library And Audio Personalization
- Phase 10 mapped from Dwell gap audit: Book Companion Content And Ecosystem Surfaces

### Blockers/Concerns

- Phase 1 still needs manual device validation for startup, auth callbacks, and reconnect sync
- Phase 2 still needs manual device validation for locale completion, discreet-mode relock, and reminder delivery
- Phase 3 still needs manual device validation for offline search, daily audio CTA behavior, and remote-vs-offline audio transitions
- Phase 4 still needs manual device validation for Harvest-tab navigation, local-vs-synced group flows, and synced session completion
- Signed builds, device checks, and distribution attachment still need manual verification before the milestone can be called shipped
- Phase 05.1 now uses direct eBible.org WEB audio and still needs manual device verification for in-app download/offline playback behavior
- Phase 6 adds new dependencies (`@shopify/flash-list`, `react-native-calendars`, `bible-passage-reference-parser`) that need verification against current Expo / React Native runtime behavior
- Dwell-style follow-along text currently uses weighted progress estimation because the current audio layer does not expose uniform verse-level timing metadata
- Phases 8 to 10 ship with local-first seeded metadata and companion content; any future backend source now needs only to implement the existing contracts rather than redefining the UI layer
- Gstack/browser verification remains intentionally skipped for the new Bible flows because the repo does not include Expo web dependencies and the shipped surfaces are native-first

## Session Continuity

Last session: 2026-03-20 09:05 +0545
Stopped at: Phases 8 to 10 implemented with automated verification; remaining work is physical-device QA for the new hub, library, mini-player, and companion-content flows
Resume file: .planning/phases/10-book-companion-content-and-ecosystem-surfaces/10-03-SUMMARY.md
