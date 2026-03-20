# Phase 07: Premium Reader And Personal Study - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** User request in active session, screenshot comparison against Dwell, and codebase audit

<domain>
## Phase Boundary

Deliver the chapter-level Dwell parity work first: one chapter session that can move between `Listen` and `Read`, plus a follow-along text mode from the listen experience that feels like synced lyrics instead of a separate disconnected screen.

Scope includes:
- a shared chapter-session state model that can drive both listen and read chrome
- a segmented `Listen / Read` entry point on the chapter screen
- a follow-along text surface launched from listen mode that auto-scrolls/highlights current content
- calmer read-mode controls that preserve current translation and display state while fitting the premium reader goal

Out of scope:
- the richer book landing page that sits before the chapter session
- favorites, playlists, queue/history, and other saved-library actions
- large content modules like devotionals, plans, figures, or playlists around a book
- licensing/branding replication of Dwell artwork or exact copy
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Reuse the existing Expo / React Native Bible reader and audio stack instead of building a second player flow.
- Treat `Listen` and `Read` as two modes of one chapter session, not as unrelated screens.
- Follow-along text must be reachable from the player itself and preserve playback state when opened or dismissed.
- If verse-level timing does not exist for a translation, the UI must degrade gracefully to section-level or current-focus behavior instead of pretending exact sync.

### Claude's Discretion
- Whether the follow-along surface is a sheet, overlay, or full-screen mode, as long as it launches from listen mode and keeps the same session alive.
- Whether the first implementation highlights by verse or by larger timed segment when metadata is sparse.
- Exact typography and layout treatment for read mode so long as it is calmer and more intentional than the current screen.
</decisions>

<specifics>
## Specific Ideas

- The repo already has the primitives we want to preserve: local chapter data, `useAudioPlayer`, translation selection, playback rate, sleep timer, and chapter navigation.
- Current gap is not infrastructure; it is session cohesion and premium presentation. Build new pure view-model helpers for the chapter-session mode, then let both listen/read surfaces consume that state.
- The listen mode should expose one obvious action to show text while keeping the player alive, mirroring the Dwell screenshot where the text button reveals synchronized reading.
- The plan should explicitly test three transitions: `Read -> Listen`, `Listen -> text overlay`, and `overlay dismissed -> back to player`.
</specifics>

<deferred>
## Deferred Ideas

- Dwell-style companion sections around each book such as figures, passages, plans, and devotionals
- Favorites, playlists, queue/history, and sharing actions
- Global mini-player outside the chapter session
- Voice and ambient-audio selection unless Phase 9 pulls them in later
</deferred>

---

*Phase: 07-premium-reader-and-personal-study*
*Context gathered: 2026-03-20 via user request, screenshots, and code audit*
