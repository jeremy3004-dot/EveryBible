# Dwell Bible Parity Gap Analysis

**Date:** 2026-03-20
**Source inputs:** user-provided screenshots, existing GSD planning state, and code audit of the current Expo / React Native Bible surfaces

## Assumptions

- The goal is to copy the Dwell interaction model and product completeness, not Dwell's exact branded art, copy, or licensing-sensitive content.
- The current EveryBible Bible browser, chapter data, audio stack, download path, translation picker, playback rate, and sleep timer remain the implementation base.
- Because this is a React Native app and the evidence came from screenshots, native simulator/device QA remains the source of truth; gstack is best used later for supplemental screenshot evidence and any Expo web checks, not as a replacement for native audio verification.

## Gap Map

### Already present in EveryBible

- Bible book browser with local search and typed passage parsing
- Chapter selection and chapter navigation
- Local text reading and chapter audio playback
- Playback rate, sleep timer, audio downloads, and translation selection
- Reading-activity calendar and streak tracking

### Partial parity

- EveryBible can both read and listen, but not as one premium chapter session with a visible `Listen / Read` toggle
- The app has a chapter selector, but not the richer Dwell-style book hub between the book list and a chapter
- Audio controls exist, but the mini-player/player chrome is screen-local and does not yet behave like a media product across flows

### Missing or clearly below Dwell parity

- Dwell-style book landing page with cover art, synopsis, intro action, and chapter launch grid
- Chapter-level segmented `Listen / Read` experience with shared context
- Follow-along text button in listen mode that reveals auto-scrolling synchronized text
- Player actions for favorite, add to playlist, share, queue/history, and similar overflow flows
- Persistent mini-player/resume loop outside the immediate chapter screen
- Voice / ambient selection surfaces with accurate content availability handling
- Companion book sections for passages, devotionals, biblical figures, plans, and playlists

## Recommended Phase Sequence

### Phase 7: Premium Reader And Personal Study

Build the shared chapter session first. This is the smallest unit that unlocks the Dwell-style feeling the user called out directly: `Listen / Read` as one session plus the follow-along text reveal from listen mode.

### Phase 8: Bible Book Hub And Chapter Launch Experience

After the chapter session is premium enough, insert the richer book hub between the browser and chapter. That prevents the team from building a polished book page that still launches into an old, disconnected chapter experience.

### Phase 9: Saved Library And Audio Personalization

Once the primary chapter flow is coherent, add the media-product behaviors around it: favorites, playlists, sharing, queue/history, persistent mini-player, and honest narrator/ambient controls where supported.

### Phase 10: Book Companion Content And Ecosystem Surfaces

Finally, attach the broader book-adjacent discovery modules from the Dwell screenshots: passages, devotionals, figures, plans, and playlists. These depend on content sourcing and should ride on top of the stable hub/session primitives from earlier phases.

## Why This Order

- It preserves the current reliable Bible and audio foundation instead of rewriting the stack.
- It ships the user-visible "this now feels like Dwell" upgrade earliest.
- It separates interaction-shell work from content-sourcing work, which reduces risk and keeps each phase verifiable.
- It gives GSD a clean next step: Phase 7 can now be planned immediately with concrete screenshot-derived context.

## Immediate Next Command

`$gsd-plan-phase 7`
