# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-11)

**Core value:** When someone opens the app, they can reliably read or listen to scripture and continue their discipleship journey even when network conditions are weak or backend features are partially unavailable.
**Current focus:** Execute Phase 12.1 to rebuild the Bible read experience around the supplied premium liquid-glass video reference, then package a new TestFlight build

## Current Position

Phase: 12.1 (Premium liquid-glass reader chrome and scroll-collapse motion)
Plan: 2 of 3 in current phase
Status: Core implementation complete; release packaging in progress
Last activity: 2026-03-21 — Rebuilt the read-mode BibleReader around blur-backed floating chrome, serif typography, and scroll-collapse motion; next step is TestFlight release packaging

Progress: [██████████] 99%

## Performance Metrics

**Velocity:**

- Total plans completed: 30
- Current phase plans remaining: 0
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

- Last 5 plans: 10-02, 10-03, 11-01, 11-02, 11-03
- Trend: Milestone 2 had shifted into QA/release mode, but the new premium-reader reference created a high-priority design-and-motion follow-up that now sits ahead of the next release

_Updated after each plan completion_

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

### Pending Todos

- Manual device verification for Phase 05.1 WEB audio translation selection, download, and offline playback behavior
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
- Manual device verification that built-in BSB audio still streams, downloads, and plays offline correctly after the direct-source swap away from Bible.is
- Plan 13-02: replace the older local BSB text refresh path with an official Berean download/import pipeline and regenerate bundled BSB artifacts from first-party files

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
- Phase 11 now depends on device QA for visual fit on smaller iPhones because the new art-led listen layout intentionally uses more vertical space and fewer header affordances
- Phase 12 improves the main impression surfaces first; deeper edge screens such as full settings flows may still benefit from a second-pass polish after device review
- Phase 12.1 depends on a credible React Native approximation of Apple's liquid-glass feel; Expo blur and motion tuning must improve the experience without making controls unreadable or brittle on device
- Phase 13 still needs device QA for BSB download/offline playback after the direct-source provider swap, and plan 02 still needs to replace the older local BSB text refresh path with official Berean downloads

## Session Continuity

Last session: 2026-03-21 00:16 +0545
Stopped at: Phase 12.1 has been inserted from the supplied motion reference; next step is implementing the premium read-mode chrome, scroll collapse, and release verification
Resume file: .planning/phases/12.1-premium-liquid-glass-reader-chrome-and-scroll-collapse-motion/12.1-CONTEXT.md
