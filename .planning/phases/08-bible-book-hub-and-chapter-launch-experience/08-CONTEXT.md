# Phase 08: Bible Book Hub And Chapter Launch Experience - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** User request in active session, screenshot comparison against Dwell, and codebase audit

<domain>
## Phase Boundary

Replace the current jump from book grid to bare chapter selector with a richer book landing page that resembles the Dwell flow: cover art, synopsis, intro/play entry points, chapter access, and a clearer bridge into the shared chapter session built in Phase 7.

Scope includes:
- book-level metadata and artwork contracts with safe fallbacks
- a new book hub screen between the browser and chapter session
- intro/primary play affordances when supporting audio exists
- chapter entry that preserves session mode and resume expectations

Out of scope:
- saved-library features like favorites or playlists
- companion sections such as devotionals, plans, and biblical figures
- rebuilding the global Bible browser search/reference logic
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- Keep the existing Bible browser and search as the top-level entry point.
- Insert the richer book hub between browser and chapter instead of overloading the existing chapter grid screen.
- The book hub must still work for books with sparse metadata by falling back cleanly to title, chapter count, and play/open actions.

### Claude's Discretion
- Whether the existing `ChapterSelectorScreen` evolves into the hub or a new screen replaces it.
- How intro audio is represented when a dedicated intro asset is unavailable.
- Exact balance between summary text, artwork, and chapter grid density.
</decisions>

<specifics>
## Specific Ideas

- The Dwell screenshots show the book page acting like a bridge between browsing and the immersive chapter session. We should preserve that separation.
- The current app already has book icons and chapter counts; phase work is mainly about metadata, layout, and navigation.
- Keep the hub data-driven from the start so later companion modules can attach without rewriting the page structure.
</specifics>

<deferred>
## Deferred Ideas

- Companion modules such as biblical figures, plans, devotionals, passages, and playlists
- Saved-library actions and global queue/history
- Sharing/favoriting from the book hub if the action models do not yet exist
</deferred>

---

*Phase: 08-bible-book-hub-and-chapter-launch-experience*
*Context gathered: 2026-03-20 via user request, screenshots, and code audit*
