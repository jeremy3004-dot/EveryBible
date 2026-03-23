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
- [ ] **READ-05**: User can type common scripture references and jump directly to the intended passage from the Bible surface

### Audio

- [ ] **AUDIO-01**: User can stream chapter audio when a supported translation is available and the audio API is configured
- [ ] **AUDIO-02**: User can control playback with play, pause, seek, rate, auto-advance, and sleep timer behaviors
- [ ] **AUDIO-03**: User can download audio by book or translation and replay downloaded audio offline
- [ ] **AUDIO-04**: User can use an audio-only translation where chapter text is unavailable and still listen or download audio with clear UI feedback

### Discipleship And Groups

- [ ] **DISC-01**: User can access Four Fields discipleship journeys and lesson content from the mobile app
- [ ] **GROUP-01**: User can create, join, and manage study groups without losing existing local progress
- [ ] **GROUP-02**: Group leaders can record lesson progress and session activity with backend rules that protect group data when sync is enabled

### Engagement And Performance

- [ ] **ENG-01**: User can view daily reading activity and streak progress in a calendar surface backed by existing reading data
- [ ] **PERF-01**: Long Bible browse and scripture-result lists remain responsive on device without changing the current read/listen flow

### Release Quality

- [ ] **REL-01**: Startup, auth, sync, reading, and audio critical paths are covered by regression checks before TestFlight or production release
- [ ] **REL-02**: Native project settings, Expo config, and release metadata stay aligned across iOS and Android builds

## v2 Requirements

### Collaboration And Distribution

- **RT-01**: Group members see synced study updates in real time instead of only after refresh / reconnect
- **PUSH-01**: Reminder and group notifications are delivered from a backend-driven push pipeline
- **WEB-01**: The product offers a maintained web experience with meaningful feature parity
- **MULTI-01**: Users can download additional text translations beyond the bundled BSB baseline

### Premium Bible Experience

- **M2-READ-01**: User can switch between `Listen` and `Read` for the same chapter without losing their current context
- **M2-AUDIO-01**: User can open live follow-along text from listen mode and see playback progress reflected in the visible text
- **M2-AUDIO-02**: User can open an audio-first Bible chapter in a simplified Dwell-style listen layout with only essential chrome and chapter transport
- **M2-BROWSE-01**: User can open a rich book hub with artwork, synopsis, intro action, and chapter entry points before entering a chapter
- **M2-LIB-01**: User can favorite, share, download, and organize Bible listening content with persistent resume and history behavior
- **M2-CONTENT-01**: Book hubs can surface companion modules such as passages, devotionals, figures, plans, and playlists with graceful fallbacks
- **M2-DESIGN-01**: User experiences a unified, professional visual system across the main app surfaces with consistent typography, spacing, color tokens, and component chrome

### Gather Tab (Waha-style Discovery Bible Study)

- [x] **GATHER-01**: User sees a Gather tab (replacing Harvest) with Foundations and Topics sub-tabs across all 4 locales
- [x] **GATHER-02**: User can browse 9 foundation sets with progress tracking, drill into a foundation to see numbered lessons, and share invitations
- [ ] **GATHER-03**: User can open a lesson in Discovery Bible Study meeting format with Fellowship, Story, and Application section tabs
- [ ] **GATHER-04**: User can access lesson actions via bottom sheet: mark complete/incomplete, share audio/text/link, and download
- [ ] **GATHER-05**: Story section renders live Bible text from BSB database and audio player plays the referenced passage chapter audio

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
| READ-05 | Phase 6 | In verification |
| AUDIO-01 | Phase 3 | In verification |
| AUDIO-02 | Phase 3 | In verification |
| AUDIO-03 | Phase 3 | In verification |
| AUDIO-04 | Phase 05.1 | In verification |
| DISC-01 | Phase 4 | In verification |
| GROUP-01 | Phase 4 | In verification |
| GROUP-02 | Phase 4 | In verification |
| ENG-01 | Phase 6 | In verification |
| PERF-01 | Phase 6 | In verification |
| REL-01 | Phase 5 | In verification |
| REL-02 | Phase 5 | In verification |
| M2-READ-01 | Phase 7 | In verification |
| M2-AUDIO-01 | Phase 7 | In verification |
| M2-AUDIO-02 | Phase 11 | In verification |
| M2-BROWSE-01 | Phase 8 | In verification |
| M2-LIB-01 | Phase 9 | In verification |
| M2-CONTENT-01 | Phase 10 | In verification |
| M2-DESIGN-01 | Phase 12 | Planned |
| GATHER-01 | Phase 22 | Planned |
| GATHER-02 | Phase 22 | Planned |
| GATHER-03 | Phase 22 | Planned |
| GATHER-04 | Phase 22 | Planned |
| GATHER-05 | Phase 22 | Planned |

**Coverage:**
- v1 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0
- Gather requirements: 5 total (Phase 22)

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-23 after adding Phase 22 Gather Tab requirements (GATHER-01 through GATHER-05)*
