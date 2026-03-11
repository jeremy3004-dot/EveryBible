# Requirements: EveryBible

**Defined:** 2026-03-11
**Core Value:** When someone opens the app, they can reliably read or listen to scripture and continue their discipleship journey even when network conditions are weak or backend features are partially unavailable.

## v1 Requirements

### Authentication And Sync

- [ ] **AUTH-01**: User can create an account with email and password
- [ ] **AUTH-02**: User can sign in with Apple on iOS and Google on supported builds
- [ ] **AUTH-03**: User session persists securely across app restarts
- [ ] **SYNC-01**: Signed-in user can sync reading progress and current reading position across devices
- [ ] **SYNC-02**: Signed-in user can sync user preferences such as theme, language, locale, and reminder settings

### Onboarding And Preferences

- [ ] **LOCL-01**: First launch guides user through interface language, country, and content-language setup
- [ ] **LOCL-02**: User can update locale and language choices later from settings without breaking existing data
- [ ] **PRIV-01**: User can enable discreet mode with a PIN and have the app relock after backgrounding
- [ ] **PREF-01**: User can manage theme, font size, and daily reminder preferences from settings

### Reading

- [ ] **READ-01**: User can browse books and chapters and open bundled Berean Standard Bible content offline
- [ ] **READ-02**: User can search scripture locally without network access
- [ ] **READ-03**: User can keep and restore current reading position and reading streak across app sessions
- [ ] **READ-04**: User sees a reliable daily scripture / verse-of-the-day surface that degrades gracefully when optional text or audio is unavailable

### Audio

- [ ] **AUDIO-01**: User can stream chapter audio when a supported translation is available and the audio API is configured
- [ ] **AUDIO-02**: User can control playback with play, pause, seek, rate, auto-advance, and sleep timer behaviors
- [ ] **AUDIO-03**: User can download audio by book or translation and replay downloaded audio offline

### Discipleship And Groups

- [ ] **DISC-01**: User can access Four Fields discipleship journeys and lesson content from the mobile app
- [ ] **GROUP-01**: User can create, join, and manage study groups without losing existing local progress
- [ ] **GROUP-02**: Group leaders can record lesson progress and session activity with backend rules that protect group data when sync is enabled

### Release Quality

- [ ] **REL-01**: Startup, auth, sync, reading, and audio critical paths are covered by regression checks before TestFlight or production release
- [ ] **REL-02**: Native project settings, Expo config, and release metadata stay aligned across iOS and Android builds

## v2 Requirements

### Collaboration And Distribution

- **RT-01**: Group members see synced study updates in real time instead of only after refresh / reconnect
- **PUSH-01**: Reminder and group notifications are delivered from a backend-driven push pipeline
- **WEB-01**: The product offers a maintained web experience with meaningful feature parity
- **MULTI-01**: Users can download additional text translations beyond the bundled BSB baseline

## Out of Scope

| Feature | Reason |
|---------|--------|
| Custom backend outside Supabase | Existing auth, sync, and SQL-policy architecture already centers on Supabase |
| Full web parity in the current milestone | Mobile reliability is the immediate product focus |
| Realtime chat or video meeting features | High complexity and not required for the core read/listen/discipleship loop |
| Social feed or public community layer | Would broaden the product away from the current study-first value |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | In verification |
| AUTH-02 | Phase 1 | In verification |
| AUTH-03 | Phase 1 | In verification |
| SYNC-01 | Phase 1 | In verification |
| SYNC-02 | Phase 1 | In verification |
| LOCL-01 | Phase 2 | In verification |
| LOCL-02 | Phase 2 | In verification |
| PRIV-01 | Phase 2 | In verification |
| PREF-01 | Phase 2 | In verification |
| READ-01 | Phase 3 | In verification |
| READ-02 | Phase 3 | In verification |
| READ-03 | Phase 3 | In verification |
| READ-04 | Phase 3 | In verification |
| AUDIO-01 | Phase 3 | In verification |
| AUDIO-02 | Phase 3 | In verification |
| AUDIO-03 | Phase 3 | In verification |
| DISC-01 | Phase 4 | In verification |
| GROUP-01 | Phase 4 | In verification |
| GROUP-02 | Phase 4 | Pending |
| REL-01 | Phase 5 | Pending |
| REL-02 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after Phase 4 plan 02 execution evidence was recorded*
