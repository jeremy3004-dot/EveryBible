# Phase 09: Saved Library And Audio Personalization - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** User request in active session, screenshot comparison against Dwell, and codebase audit

<domain>
## Phase Boundary

Add the media-product actions around listening that the Dwell screenshots make visible: favorites, playlists, sharing, queue/history, persistent resume behavior, and honest personalization surfaces for voice or ambient layers where content allows it.

Scope includes:
- local-first data models for saved items, playlists, and queue/history
- overflow/player action menus for favorite, add to playlist, download, share, and queue/history
- a persistent mini-player or resume surface outside the immediate chapter screen
- voice/ambient selection UI with accurate fallback states

Out of scope:
- the initial book hub and chapter session shell
- large companion-content modules around books
- introducing unsupported audio personalization if the underlying catalog cannot honor it
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Saved-library features must start local-first and not block on a new backend schema.
- The UI must not imply narrator or ambient options that the asset layer cannot actually provide.
- Queue/history should be treated as part of the listening session model, not as a disconnected settings screen.

### Claude's Discretion
- Whether playlists are chapter-based, book-based, or mixed in the first iteration.
- Exact placement of mini-player/resume chrome as long as it survives leaving the chapter screen.
- Which saved actions land in the first cut versus follow-up polish inside the phase.
</decisions>

<specifics>
## Specific Ideas

- Current code already supports downloads, rate, and sleep timer, so Phase 9 should extend the existing player contract instead of replacing it.
- Queue/history can begin as simple recent-session storage with deterministic ordering, then grow later if a synced library becomes necessary.
- Sharing should be scoped to what the app can already deep-link or reopen safely.
</specifics>

<deferred>
## Deferred Ideas

- Cross-device synced playlists or favorites
- Social sharing or collaborative listening features
- Companion-content recommendations driven by analytics or backend personalization
</deferred>

---

*Phase: 09-saved-library-and-audio-personalization*
*Context gathered: 2026-03-20 via user request, screenshots, and code audit*
