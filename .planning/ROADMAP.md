# Roadmap: EveryBible

## Overview

This roadmap treats EveryBible as a brownfield mobile product that already has most of its feature surface in code, but still needs a disciplined pass to align startup, sync, onboarding, reading/audio polish, learn flows, and release safety. The goal is not to reinvent the app; it is to turn the existing foundation into a coherent, dependable v1.0 baseline that GSD can plan and execute phase by phase.

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

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Startup And Backend Hardening | 2/2 | Awaiting device verification | - |
| 2. Onboarding And Preference Cohesion | 2/2 | Awaiting device verification | - |
| 3. Core Reading And Audio Polish | 2/2 | Awaiting device verification | - |
| 4. Discipleship And Group Rollout | 3/3 | Awaiting device verification | - |
| 5. Release Hardening And Distribution | 2/2 | Awaiting signed-build verification | - |
