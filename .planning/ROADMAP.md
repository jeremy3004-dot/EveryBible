# Roadmap: EveryBible

## Overview

This roadmap treats EveryBible as a brownfield mobile product that already has most of its feature surface in code, but still needs a disciplined pass to align startup, sync, onboarding, reading/audio polish, learn flows, and release safety. The goal is not to reinvent the app; it is to turn the existing foundation into a coherent, dependable v1.0 baseline that GSD can plan and execute phase by phase.

After the foundation and discovery work, the next Milestone 2 sequence focuses on Dwell-inspired Bible experience parity: richer book hubs, a premium chapter session with synchronized read/listen states, a more complete media-product action model, and companion content around each book.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Startup And Backend Hardening** - Make boot, auth, and sync behavior predictable across real devices and builds
- [ ] **Phase 2: Onboarding And Preference Cohesion** - Align first-run locale setup, privacy, and settings into one reliable user loop
- [ ] **Phase 3: Core Reading And Audio Polish** - Finish the read/listen experience the product is judged by every day
- [ ] **Phase 4: Discipleship And Group Rollout** - Wire the learn surface fully and unify local and synced group behavior
- [ ] **Phase 5: Release Hardening And Distribution** - Add the checks and config alignment needed for confident TestFlight and store releases
- [ ] **Phase 6: Discovery, Retention, And Responsiveness** - Make scripture entry smarter, reading progress more visible, and heavy Bible lists smoother
- [x] **Phase 7: Premium Reader And Personal Study** - Turn the chapter experience into a premium read/listen session with synchronized context and follow-along text
- [x] **Phase 8: Bible Book Hub And Chapter Launch Experience** - Add Dwell-style book landing pages between the book grid and chapter session
- [x] **Phase 9: Saved Library And Audio Personalization** - Add the media-product actions around listening such as favorites, playlists, sharing, and persistent resume/history
- [x] **Phase 10: Book Companion Content And Ecosystem Surfaces** - Populate each book hub with figures, passages, plans, devotionals, and playlists without breaking the core Bible loop

## Phase Details

### Phase 1: Startup And Backend Hardening
**Goal**: Make app launch, session restoration, and Supabase-backed sync reliable on device without regressing the local-first experience.
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-01, AUTH-02, AUTH-03, SYNC-01, SYNC-02
**Success Criteria** (what must be TRUE):
  1. User can cold-start the app and reach the correct gate (onboarding, privacy lock, or main shell) without startup regressions.
  2. User can sign in with the supported providers and keep the session across restarts.
  3. Signed-in progress and preferences sync cleanly across reconnects and foreground transitions without duplicating or losing local state.
**Plans**: 2 plans

Plans:
- [x] 01-01: Audit and harden startup, auth initialization, and session restoration
- [x] 01-02: Validate sync merge behavior, Supabase contracts, and device-config dependencies

### Phase 2: Onboarding And Preference Cohesion
**Goal**: Make the first-run and settings experience internally consistent for language, locale, privacy, and reminders.
**Depends on**: Phase 1
**Requirements**: LOCL-01, LOCL-02, PRIV-01, PREF-01
**Success Criteria** (what must be TRUE):
  1. First-time users can complete locale and content-language setup without getting stuck or creating inconsistent preference state.
  2. Returning users can change locale, theme, font, privacy, and reminder settings from the app without breaking their saved state.
  3. Discreet mode relocks correctly after app backgrounding and remains understandable in settings UI.
**Plans**: 2 plans

Plans:
- [x] 02-01: Tighten onboarding models, locale selection, and first-run state transitions
- [x] 02-02: Unify settings, privacy, and reminder behaviors with synced preference handling

### Phase 3: Core Reading And Audio Polish
**Goal**: Make the daily scripture, browsing, reading, and listen flows feel dependable and polished both online and offline.
**Depends on**: Phase 2
**Requirements**: READ-01, READ-02, READ-03, READ-04, AUDIO-01, AUDIO-02, AUDIO-03
**Success Criteria** (what must be TRUE):
  1. User can browse, search, and open scripture offline with correct reading-position restoration.
  2. Daily scripture and reader presentation behave predictably even when optional assets are missing or still loading.
  3. Audio playback and audio downloads work reliably enough that a user can move between streaming and offline listening without confusion.
**Plans**: 2 plans

Plans:
- [x] 03-01: Polish scripture browsing, reader state, and daily-scripture presentation
- [x] 03-02: Harden audio playback, controls, and offline download UX

### Phase 4: Discipleship And Group Rollout
**Goal**: Complete the app's learn surface and make group-study behavior coherent across local and synced paths.
**Depends on**: Phase 3
**Requirements**: DISC-01, GROUP-01, GROUP-02
**Success Criteria** (what must be TRUE):
  1. User can reach discipleship lesson content from the live app shell without hidden or orphaned navigation paths.
  2. Existing local group progress is preserved while synced group functionality is introduced or completed.
  3. Group leaders can create/join groups and record session progress with backend rules that protect access correctly.
**Plans**: 3 plans

Plans:
- [x] 04-01: Wire the learn navigation surface and lesson entrypoints into the active shell
- [x] 04-02: Reconcile local group state with synced group flows and migration expectations
- [x] 04-03: Verify group-session capture, permissions, and data-protection behavior

### Phase 5: Release Hardening And Distribution
**Goal**: Add the release gates, regression evidence, and config alignment needed to ship confidently.
**Depends on**: Phase 4
**Requirements**: REL-01, REL-02
**Success Criteria** (what must be TRUE):
  1. Critical startup, auth, sync, reading, and audio paths have repeatable regression checks before release.
  2. Expo config, native iOS config, and native Android config are aligned for the current release path.
  3. TestFlight and store-bound builds can be described as ready based on evidence, not assumption.
**Plans**: 2 plans

Plans:
- [x] 05-01: Add release-focused regression checks for core user journeys
- [x] 05-02: Align native and Expo config, build metadata, and submission readiness

### Phase 6: Discovery, Retention, And Responsiveness
**Goal**: Make Bible discovery faster, reading momentum more visible, and the heaviest scripture lists more responsive without rewriting the core read/listen flow.
**Depends on**: Phase 05.1
**Requirements**: READ-05, ENG-01, PERF-01
**Success Criteria** (what must be TRUE):
  1. User can type common references like `John 3:16` or `1 Cor 13` in the Bible surface and open the intended passage directly.
  2. User can open a reading-activity calendar that reflects existing local reading progress and current streak context without introducing plan-management complexity.
  3. The list-heavy Bible browse surfaces stay responsive on device while preserving current navigation and audio behavior.
**Plans**: 3 plans

Plans:
- [x] 06-01: Add typed passage-reference parsing and direct navigation to the Bible surface
- [x] 06-02: Upgrade the heaviest Bible list surfaces to FlashList without changing current behavior
- [x] 06-03: Add a reading-activity calendar surface backed by existing progress state

### Phase 7: Premium Reader And Personal Study
**Goal**: Transform the chapter-level Bible experience into a calm, premium session where reading and listening share context, and listen mode can reveal live follow-along text instead of forcing a separate flow.
**Depends on**: Phase 6
**Requirements**: M2-READ-01, M2-AUDIO-01
**Success Criteria** (what must be TRUE):
  1. User can open a chapter once and switch between `Listen` and `Read` without losing the chapter, verse focus, or playback context.
  2. Listen mode exposes a Dwell-style follow-along text surface that auto-scrolls and highlights the current verse or timed text segment from the player chrome.
  3. Read mode keeps typography/display controls available without crowding the content, and transitions between the two modes feel intentional rather than like separate screens.
**Plans**: 3 plans

Plans:
- [x] 07-01: Build a shared chapter-session model and segmented read/listen shell
- [x] 07-02: Implement immersive listen mode with follow-along text overlay and synchronized verse focus
- [x] 07-03: Refine read mode typography, controls, and continuity between listen and read

### Phase 8: Bible Book Hub And Chapter Launch Experience
**Goal**: Insert a richer book-detail layer between the book browser and the chapter session so each Bible book has artwork, intro context, a primary play CTA, and clearer launch points into chapters.
**Depends on**: Phase 7
**Requirements**: M2-BROWSE-01
**Success Criteria** (what must be TRUE):
  1. Tapping a book from the Bible browser opens a dedicated book hub instead of dropping directly into a plain chapter grid.
  2. The book hub can show art, synopsis, intro audio when available, chapter entry points, and resilient empty/loading states when supporting metadata is missing.
  3. Launching a chapter from the hub preserves the user’s preferred mode and hands off to the shared chapter session cleanly.
**Plans**: 3 plans

Plans:
- [x] 08-01: Define book metadata, artwork, and intro-audio contracts with fallback behavior
- [x] 08-02: Build the book hub screen with hero, synopsis, play CTA, and chapter launch grid
- [x] 08-03: Wire browser-to-hub-to-chapter navigation, resume state, and mini-player handoff

### Phase 9: Saved Library And Audio Personalization
**Goal**: Add the media-product actions that make listening feel owned and resumable: favorites, playlists, sharing, downloads, queue/history, and honest personalization controls for voice or ambient layers where supported.
**Depends on**: Phase 8
**Requirements**: M2-LIB-01
**Success Criteria** (what must be TRUE):
  1. User can favorite, share, download, and save books or chapters to playlists from the listen experience and related overflow menus.
  2. User can reopen recent listening from queue/history and control playback from a persistent mini-player outside the immediate reader screen.
  3. Voice, translation, and ambient controls communicate availability honestly and never imply options the content layer cannot support.
**Plans**: 3 plans

Plans:
- [x] 09-01: Add local-first saved-item, playlist, and queue/history models for Bible listening
- [x] 09-02: Build player actions and overflow flows for favorite, share, download, and playlist entry
- [x] 09-03: Ship a persistent mini-player plus voice/ambient selection surfaces with fallbacks

### Phase 10: Book Companion Content And Ecosystem Surfaces
**Goal**: Turn book hubs into broader study destinations by attaching Dwell-style companion modules such as passages, devotionals, plans, figures, and playlists through reusable, data-driven sections.
**Depends on**: Phase 9
**Requirements**: M2-CONTENT-01
**Success Criteria** (what must be TRUE):
  1. Each book hub can render optional companion modules from a shared contract without breaking when some modules have no content.
  2. Users can open book-adjacent passages, devotionals, figures, plans, and playlists from one surface and return without losing their Bible context.
  3. The companion content system supports graceful offline/loading/error behavior instead of assuming full connectivity.
**Plans**: 3 plans

Plans:
- [x] 10-01: Define companion-content schema, sourcing rules, and offline cache strategy
- [x] 10-02: Build reusable book-hub sections for passages, devotionals, figures, plans, and playlists
- [x] 10-03: Add analytics and verification coverage for module launch, empty states, and return navigation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 05.1 → 6 → 7 → 8 → 9 → 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Startup And Backend Hardening | 2/2 | Awaiting device verification | - |
| 2. Onboarding And Preference Cohesion | 2/2 | Awaiting device verification | - |
| 3. Core Reading And Audio Polish | 2/2 | Awaiting device verification | - |
| 4. Discipleship And Group Rollout | 3/3 | Awaiting device verification | - |
| 5. Release Hardening And Distribution | 2/2 | Awaiting signed-build verification | - |
| 05.1 Audio-only downloadable Bible experience | 1/1 | Awaiting device verification | - |
| 6. Discovery, Retention, And Responsiveness | 3/3 | In verification | - |
| 7. Premium Reader And Personal Study | 3/3 | Automated verification complete; needs device UX QA | 2026-03-20 |
| 8. Bible Book Hub And Chapter Launch Experience | 3/3 | Automated verification complete; needs device content/layout QA | 2026-03-20 |
| 9. Saved Library And Audio Personalization | 3/3 | Automated verification complete; needs device playback/library QA | 2026-03-20 |
| 10. Book Companion Content And Ecosystem Surfaces | 3/3 | Automated verification complete; needs device module/navigation QA | 2026-03-20 |

### Phase 05.1: Audio-only downloadable Bible experience (INSERTED)

**Goal:** Add a first-class audio-only Bible test path so users can download and listen even when chapter text is unavailable.
**Requirements**: READ-04, AUDIO-03, AUDIO-04
**Depends on:** Phase 5
**Success Criteria** (what must be TRUE):
  1. A selectable audio-only translation exists in-app and intentionally has no chapter text while retaining audio playback/download support.
  2. Reader and daily-scripture surfaces present clear audio-first/no-text states instead of generic missing-content fallbacks.
  3. Audio book/translation downloads still succeed for the audio-only translation and can be replayed offline.
**Plans:** 1 plan

Plans:
- [x] 05.1-01: Implement and verify audio-only translation download path plus no-text UI behavior
