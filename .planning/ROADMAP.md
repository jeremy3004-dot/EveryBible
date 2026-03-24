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
- [x] **Phase 11: Audio reader chrome simplification and Dwell-style listen layout polish** - Strip the audio-first Bible screen down to the essential Dwell-style listen chrome while keeping EveryBible's current palette
- [x] **Phase 12: Professional Design System Unification** - Replace ad hoc styling with one disciplined, professional visual system across the main app shell and highest-traffic screens
- [ ] **Phase 16: Backend Foundation & Theme Fix** - Fix low-light theme sync bug, create storage buckets, add push token table
- [ ] **Phase 17: Bookmarks, Highlights & Notes** - Verse-level annotations with offline-first sync
- [ ] **Phase 18: Reading Plans** - Pre-seeded multi-day reading plans with enrollment and group assignments
- [ ] **Phase 19: Prayer Community** - Group-scoped prayer request walls with interactions
- [ ] **Phase 20: Analytics & Engagement Metrics** - Lightweight event tracking with server-side aggregation
- [ ] **Phase 21: Content Versioning & Multiple Translations** - Translation version tracking, preferences, and expanded content sourcing
- [ ] **Phase 22: Gather Tab — Waha-style Foundations, Topics & Meeting Format** - Replace Harvest tab with Waha-style Gather tab featuring DBS meeting format
- [ ] **Phase 23: Foundations Content Restructure** - Replace 9-foundation placeholder data with authoritative 7-foundation, 67-lesson content spec

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
3. Launching a chapter from the hub preserves the user's preferred mode and hands off to the shared chapter session cleanly.
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

### Phase 11: Audio reader chrome simplification and Dwell-style listen layout polish

**Goal**: Make the audio-first Bible chapter screen feel deliberately minimal and Dwell-inspired by removing redundant chrome, explanatory copy, and transport clutter while preserving EveryBible's existing colors and playback behavior.
**Depends on**: Phase 10
**Requirements**: M2-AUDIO-02
**Success Criteria** (what must be TRUE):

1. Audio-first Bible chapters show only the essential listen-shell chrome: back button, `Listen / Read` toggle, overflow actions, cover art, chapter label, progress, and chapter transport.
2. The screen removes redundant elements called out in device feedback, including the top title/version/`AA` bar, 10-second skip buttons, nested shell framing, background icon watermark, and audio-only explanatory copy.
3. The simplified screen keeps current EveryBible colors, does not regress chapter switching or playback continuity, and gains regression coverage plus a focused device QA checklist.
   **Plans**: 3 plans

Plans:

- [x] 11-01: Simplify the audio-first reader chrome and remove redundant header/body copy
- [x] 11-02: Rebuild the audio-first transport layout around chapter controls and clean visual shells
- [x] 11-03: Add regression checks and device QA for the simplified Dwell-style listen screen

### Phase 12: Professional Design System Unification

**Goal**: Make EveryBible feel like one intentional product by standardizing typography, spacing, radii, shadows, and semantic colors across the main mobile surfaces.
**Depends on**: Phase 11
**Requirements**: M2-DESIGN-01
**Success Criteria** (what must be TRUE):

1. The app uses one shared mobile design system for typography, spacing, border radius, and elevation instead of screen-by-screen style drift.
2. High-traffic surfaces across Home, Bible browse/book hub, Learn, and More adopt the same professional card, header, and navigation language.
3. Decorative treatments that make the app feel stitched together are removed or simplified so the product reads as calm, structured, and trustworthy at first glance.
   **Plans**: 3 plans

Plans:

- [x] 12-01: Define the app-wide design tokens, palette refinements, and typography hierarchy
- [x] 12-02: Apply the shared design system to the app shell, Home, Bible browse, and book-hub surfaces
- [x] 12-03: Apply the shared design system to Learn, More, Profile, Reading Activity, and shared cards, then verify the sweep

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 05.1 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23

| Phase                                                                         | Plans Complete | Status                                                             | Completed  |
| ----------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------ | ---------- |
| 1. Startup And Backend Hardening                                              | 2/2            | Awaiting device verification                                       | -          |
| 2. Onboarding And Preference Cohesion                                         | 2/2            | Awaiting device verification                                       | -          |
| 3. Core Reading And Audio Polish                                              | 2/2            | Awaiting device verification                                       | -          |
| 4. Discipleship And Group Rollout                                             | 3/3            | Awaiting device verification                                       | -          |
| 5. Release Hardening And Distribution                                         | 2/2            | Awaiting signed-build verification                                 | -          |
| 05.1 Audio-only downloadable Bible experience                                 | 1/1            | Awaiting device verification                                       | -          |
| 6. Discovery, Retention, And Responsiveness                                   | 3/3            | In verification                                                    | -          |
| 7. Premium Reader And Personal Study                                          | 3/3            | Automated verification complete; needs device UX QA                | 2026-03-20 |
| 8. Bible Book Hub And Chapter Launch Experience                               | 3/3            | Automated verification complete; needs device content/layout QA    | 2026-03-20 |
| 9. Saved Library And Audio Personalization                                    | 3/3            | Automated verification complete; needs device playback/library QA  | 2026-03-20 |
| 10. Book Companion Content And Ecosystem Surfaces                             | 3/3            | Automated verification complete; needs device module/navigation QA | 2026-03-20 |
| 11. Audio reader chrome simplification and Dwell-style listen layout polish   | 3/3            | Automated verification complete; needs device visual QA            | 2026-03-20 |
| 12. Professional Design System Unification                                    | 3/3            | Automated verification complete; needs device visual QA            | 2026-03-20 |
| 12.1 Premium liquid-glass reader chrome and scroll-collapse motion            | 3/3            | TestFlight build 100 distributed; needs device visual QA           | 2026-03-21 |
| 13. Public-domain Berean Standard Bible sourcing and direct audio integration | 1/2            | Plan 01 complete; translation-aware audio handoff fixed; plan 02 pending | 2026-03-21 |
| 14. Backend-driven Bible content sync and offline pack delivery               | 2/4            | Plans 01-02 complete; plan 03 in progress                         | -          |
| 15. Reverential Theme & Typography                                            | 0/3            | Planned                                                            | -          |
| 16. Backend Foundation & Theme Fix                                             | 3/3            | Complete                                                           | 2026-03-22 |
| 17. Bookmarks, Highlights & Notes                                              | 2/2            | Backend + frontend complete (reader integration + list screen)     | 2026-03-22 |
| 18. Reading Plans                                                              | 2/2            | Backend + frontend complete (plan browser + detail + nav wiring)   | 2026-03-22 |
| 19. Prayer Community                                                           | 2/2            | Backend + frontend complete (prayer wall + group integration)      | 2026-03-22 |
| 20. Analytics & Engagement Metrics                                             | 2/2            | Backend + frontend complete (profile engagement + Edge Function)   | 2026-03-22 |
| 21. Content Versioning & Multiple Translations                                 | 2/2            | Backend + frontend complete (translation browser + preferences)    | 2026-03-22 |
| 22. Gather Tab — Waha-style Foundations, Topics & Meeting Format               | 0/4            | Planned                                                            | -          |
| 23. Foundations Content Restructure                                            | 0/1            | Planned                                                            | -          |
| 28. Multi-Translation Supabase Library                                         | 2/2 | Complete   | 2026-03-24 |

### Phase 12.1: Premium liquid-glass reader chrome and scroll-collapse motion (INSERTED)

**Goal:** Rebuild the read-mode Bible chapter experience around the supplied video so the reader feels premium, glassy, and motion-led instead of like a static screen with attached controls.
**Requirements**: M2-READ-01, M2-DESIGN-01
**Depends on:** Phase 12
**Success Criteria** (what must be TRUE):

1. Read mode opens in the video-led resting state: top back/segment/overflow glass controls, centered serif chapter hero, and bottom floating glass controls without the old static header or bottom audio bar.
2. Scrolling the chapter collapses the resting chrome into the compact pinned state from the video, including disappearing top controls and shrinking bottom controls down to a centered chapter pill.
3. The redesign keeps current read/listen session continuity and adds regression coverage for the new collapse model, glass chrome, and read-mode control placement.
   **Plans:** 3 plans

Plans:

- [x] 12.1-01: Define the premium reader motion model and visual contract from the supplied video
- [x] 12.1-02: Rebuild the read-mode BibleReader chrome with liquid-glass surfaces and scroll-collapse animation
- [x] 12.1-03: Lock the redesign with regression coverage, verification, and release readiness

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

### Phase 13: Public-domain Berean Standard Bible sourcing and direct audio integration

**Goal:** Replace legacy BSB sourcing ambiguity with official public-domain text provenance and direct public BSB audio so the built-in English experience no longer depends on private audio credentials.
**Requirements**: READ-01, AUDIO-03, AUDIO-04
**Depends on:** Phase 12
**Success Criteria** (what must be TRUE):

1. The app's built-in BSB translation points at official Berean public-domain terms for text and direct public MP3 chapter audio for playback/downloads.
2. BSB chapter audio can stream and download without `EXPO_PUBLIC_BIBLE_IS_API_KEY`, matching the app's existing public-source WEB approach.
3. Switching from one playable translation to another on the same chapter hands off the active audio session correctly instead of reusing stale playback state.
4. The repo documents a clean follow-up path for refreshing bundled BSB text artifacts from official Berean downloads instead of opaque local source files.
   **Plans:** 2 plans

Plans:

- [x] 13-01: Replace BSB runtime audio dependency with direct public-source chapter MP3s and normalize licensing/docs
- [ ] 13-02: Replace the BSB text refresh pipeline with official Berean download sources and regenerate bundled artifacts

### Phase 14: Backend-driven Bible content sync and offline pack delivery

**Goal:** Let the mobile app discover backend-managed Bible translations online, stream them immediately when needed, and install verified text/audio packs that remain fully usable offline.
**Requirements**: READ-01, READ-02, AUDIO-03, MULTI-01
**Depends on:** Phase 13
**Success Criteria** (what must be TRUE):

1. The app can fetch a runtime translation catalog from the backend and show remotely provisioned translations without breaking current bundled BSB/WEB behavior.
2. A translation can be installed as a verified versioned SQLite text pack plus downloadable audio assets, then read, searched, and played fully offline.
3. Failed downloads, bad signatures/checksums, interrupted installs, and stale updates never replace the last known good local pack.
4. Backgrounded downloads reattach cleanly on resume/app restart and surface honest progress, retry, and failure states in the Bible UI.
   **Plans:** 4 plans

Plans:

- [ ] 14-01: Define the runtime catalog, signed manifest verification, and background download foundation
- [ ] 14-02: Build the versioned SQLite text-pack registry, install flow, and rollback-safe query routing
- [ ] 14-03: Replace hardcoded audio providers with backend-driven sources and resilient offline/background audio downloads
- [ ] 14-04: Ship translation install/update UX, verification coverage, and release/device QA for the new content platform

### Phase 15: Reverential Theme & Typography

**Goal:** Replace the current generic "tech app" visual language with a reverential, typographically disciplined aesthetic. Strip AI-generated UI patterns (excessive rounded corners, shadows/glows, nested cards, system sans-serif) and replace with warm tones, custom bundled serif font, and three theme modes (Dark, Light, Low-light/Sepia). Apply the new design language across all individual screens.
**Depends on:** Phase 14
**Requirements**: M2-DESIGN-01
**Success Criteria** (what must be TRUE):

1. The app uses warm-toned color palettes across three theme modes (Dark primary, Light, Low-light/Sepia) instead of the current cool blue-grey palette with coral accent.
2. A custom bundled serif font replaces system serif for reading surfaces and extends into the typographic hierarchy where appropriate, with accent color reserved strictly for interactive affordances.
3. Generic UI patterns (excessive rounded corners, drop shadows/glows, nested cards, decorative color) are stripped across all screens and replaced with spacing, dividers, and typographic hierarchy.
4. All hardcoded colors are migrated to theme tokens and every screen in the app adopts the new visual language without changing layouts, navigation, or feature logic.
   **Plans:** 3 plans

Plans:

- [ ] 15-01-PLAN.md — Build reverential design foundation: three warm palettes, bundled Lora serif, print-editorial tokens, three-way theme selector
- [ ] 15-02-PLAN.md — Apply reverential visual language to Home, Bible browser/reader, audio components, and tab bar
- [ ] 15-03-PLAN.md — Complete screen sweep across Learn, More, auth, onboarding, and visual verification

### Phase 16: Backend Foundation & Theme Fix

**Goal:** Fix the low-light theme sync bug, create Supabase storage buckets (avatars, group-images, study-materials) with RLS policies, and add a user_devices table for push notification token storage. Quick backend wins that unblock subsequent feature phases.
**Requirements**: SYNC-01, PREF-01, INFRA-01
**Depends on:** Phase 15
**Success Criteria** (what must be TRUE):

1. The `user_preferences.theme` CHECK constraint allows `'low-light'` so the reverential theme syncs correctly without silent data loss.
2. Storage buckets exist for avatars, group images, and study materials with user-scoped and group-scoped RLS policies.
3. A `user_devices` table stores push notification tokens per device, ready for notification delivery in a future phase.
   **Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 16 to break down)

### Phase 17: Bookmarks, Highlights & Notes

**Goal:** Add verse-level annotations (bookmarks, highlights with color, freeform notes) with offline-first storage and bidirectional Supabase sync, enabling the core Bible study features users expect from a scripture app.
**Requirements**: STUDY-01, SYNC-01
**Depends on:** Phase 16
**Success Criteria** (what must be TRUE):

1. Users can bookmark, highlight (with color selection), and add notes to individual verses or verse ranges in the Bible reader.
2. Annotations persist locally (offline-first) and sync bidirectionally with Supabase using additive merge (never losing annotations from either side).
3. Users can view, filter, and search their annotations from a dedicated annotations list screen.
   **Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 17 to break down)

### Phase 18: Reading Plans

**Goal:** Add structured multi-day Bible reading plans with pre-seeded plan data, user enrollment, daily completion tracking, streak management, and group plan assignments so leaders can guide their groups through coordinated reading.
**Requirements**: ENG-01, GROUP-01
**Depends on:** Phase 17
**Success Criteria** (what must be TRUE):

1. Users can browse available reading plans, enroll in a plan, and track daily completion with streak and progress indicators.
2. Pre-seeded plans (M'Cheyne, Chronological Bible, Gospels & Epistles, etc.) are available from first launch, sourced from open-source plan data.
3. Group leaders can assign a reading plan to their group, and group members see shared progress.
   **Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 18 to break down)

### Phase 19: Prayer Community

**Goal:** Add group-scoped prayer request walls where members can submit prayer requests, mark prayers as answered, and interact with "prayed" and "encouraged" responses, building community within existing study groups.
**Requirements**: GROUP-01, COMMUNITY-01
**Depends on:** Phase 18
**Success Criteria** (what must be TRUE):

1. Group members can submit prayer requests (max 500 chars) visible to all members of that group.
2. Members can interact with requests via "prayed" and "encouraged" actions, with counts visible on each request.
3. Request creators can mark prayers as answered, and only creators or group leaders can delete requests.
   **Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 19 to break down)

### Phase 20: Analytics & Engagement Metrics

**Goal:** Add lightweight client-side event tracking with server-side aggregation via Supabase Edge Functions, providing user-facing engagement metrics (reading stats, streaks, listening time, engagement score) and a foundation for admin insights.
**Requirements**: ENG-01, INFRA-01
**Depends on:** Phase 19
**Success Criteria** (what must be TRUE):

1. The app emits standardized analytics events (chapter_opened, audio_played, plan_day_completed, etc.) that batch locally and flush to Supabase on sync intervals.
2. A daily Edge Function cron aggregates events into per-user engagement summaries (chapters read, listening minutes, streak, engagement score 0-100).
3. Users can see their engagement metrics in an enhanced profile/stats surface with meaningful reading and listening insights.
   **Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 20 to break down)

### Phase 21: Content Versioning & Multiple Translations

**Goal:** Extend Phase 14's translation catalog with version tracking, user translation preferences (primary, secondary, audio), and a data sourcing pipeline from scrollmapper/bible_databases (MIT, 140+ translations) to expand the app's available Bible translations beyond BSB and WEB.
**Requirements**: MULTI-01, READ-01
**Depends on:** Phase 20
**Success Criteria** (what must be TRUE):

1. Translation content has version tracking so updates can be delivered and applied without breaking existing installed packs.
2. Users can set primary, secondary (for future comparison mode), and audio translation preferences that sync across devices.
3. At least 5 additional public-domain translations (ASV, KJV, YLT, BBE + one non-English) are importable through the Phase 14 pack system using scrollmapper data.
   **Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 21 to break down)

### Phase 22: Gather Tab — Waha-style Foundations, Topics & Meeting Format

**Goal:** Replace the current Harvest tab with a Waha-inspired Gather tab featuring Discovery Bible Study foundations, topical studies, and a meeting-format lesson viewer with Fellowship/Story/Application sections and integrated audio playback.
**Requirements**: GATHER-01, GATHER-02, GATHER-03, GATHER-04, GATHER-05
**Depends on:** Phase 21
**Success Criteria** (what must be TRUE):

1. The Harvest tab is renamed to Gather across all 4 locales with updated icon, and the old Four Fields course/harvest study content is replaced.
2. Users can browse 9 foundation sets and topic categories, drill into a foundation to see numbered lessons with progress, and share invitations.
3. Users can open a lesson in the Discovery Bible Study meeting format with Fellowship questions, Bible passage text from BSB, and Application questions.
4. The Story section pulls live verse text from the BSB SQLite database and the audio player plays the referenced chapter audio.
5. Users can mark lessons complete, share lesson content, and see progress tracked persistently.
   **Plans:** 4 plans

Plans:

- [ ] 22-01-PLAN.md — Define Gather types, Foundation/Topic data, standardized question templates, and gatherStore
- [ ] 22-02-PLAN.md — Rename tab to Gather, rewire navigation, build GatherScreen with Foundations/Topics sub-tabs
- [ ] 22-03-PLAN.md — Build FoundationDetailScreen with lesson list, share invitation, and LessonBottomSheet
- [ ] 22-04-PLAN.md — Build LessonDetailScreen with meeting format, Bible text rendering, and audio playback

### Phase 23: Foundations Content Restructure

**Goal:** Replace the current 9-foundation placeholder structure in gatherFoundations.ts with the authoritative 7-foundation, 67-lesson content spec using single full-chapter Bible references per lesson.
**Requirements**: GATHER-01, GATHER-02
**Depends on:** Phase 22
**Success Criteria** (what must be TRUE):

1. Exactly 7 foundations exist with correct titles, descriptions, and icon names matching the authoritative spec.
2. All 67 lessons are populated with correct titles, lesson IDs, and single full-chapter Bible references (no startVerse/endVerse).
3. Foundations 8 and 9 (Growing as Disciples, Growing as a Jesus Community, Growing as Leaders) are removed.
4. TypeScript compiles without errors and existing tests pass.
   **Plans:** 1 plan

Plans:

- [ ] 23-01-PLAN.md — Replace gatherFoundations data with authoritative 7-foundation, 67-lesson content and update type comments

### Phase 24: topics-content-populate

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 23
**Plans:** 0/0 plans complete

Plans:
- [x] TBD (run /gsd:plan-phase 24 to break down) (completed 2026-03-23)

### Phase 26: UX Completeness — Navigation Gaps

**Goal:** Remove broken navigation stubs and dead-end screens so every tappable element leads somewhere intentional.
**Depends on:** Phase 24
**Plans:** 1/1 plans complete

Plans:
- [x] 26-01-PLAN.md — Fix navigation stubs: AnnotationsScreen placeholder, LessonDetailScreen note button removal

### Phase 27: Translation Downloads — WEB & ASV

**Goal:** Wire WEB and ASV translations (already bundled in bible-bsb-v2.db) so they are selectable and immediately readable in the Translation Browser with offline catalog fallback.
**Depends on:** Phase 26
**Plans:** 1/1 plans complete

Plans:
- [x] 27-01-PLAN.md — Fix downloadTranslation stub, wire TranslationBrowserScreen to bibleStore, add offline catalog fallback

### Phase 28: Multi-Translation Supabase Library

**Goal:** Build a Supabase-backed multi-translation Bible library: import public-domain full Bibles (OT+NT) from eBible.org into Supabase Postgres, add download-on-demand flow in the app so users can browse and install any translation offline.
**Requirements**: MULTI-01
**Depends on:** Phase 27
**Plans:** 2/2 plans complete

Plans:
- [x] 28-01-PLAN.md — Supabase bible_verses table migration, anon RLS, and TypeScript eBible.org import script
- [x] 28-02-PLAN.md — Cloud translation download service, bibleStore wiring, and TranslationBrowserScreen download UI
