# Phase 11: Audio reader chrome simplification and Dwell-style listen layout polish - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** User device feedback, supplied Dwell reference screenshot, and code audit of `BibleReaderScreen`, `AudioFirstChapterCard`, and `PlaybackControls`

<domain>
## Phase Boundary

Refine the audio-first Bible chapter screen so it feels like a deliberate listen destination instead of a generic reader with extra shells layered on top. The target is the supplied Dwell screenshot, but with EveryBible's current color palette kept intact.

Scope includes:
- removing redundant top chrome on audio-first chapters
- removing explanatory copy and background watermark art from the audio-only card
- replacing the current five-control transport row with chapter back, play/pause, and chapter forward only
- simplifying nested shells so the user sees the book cover box and core player elements, not multiple stacked frames
- preserving the existing overflow actions, playback continuity, and `Listen / Read` session behavior

Out of scope:
- redesigning the text reader surface
- replacing EveryBible's current color palette with Dwell's
- changing chapter-switching logic or saved-library architecture beyond what is needed to keep playback stable
</domain>

<decisions>
## Implementation Decisions

### Locked Decisions
- The requested polish applies to the audio-first Bible chapter surface first.
- The screen should keep the existing color palette, not import Dwell colors verbatim.
- The player must still expose previous chapter, play/pause, next chapter, progress seek, playback rate, and sleep timer.
- The top title/version/`AA` chrome should disappear for audio-first chapters because the body already carries the listening context.

### Claude's Discretion
- Whether the reduced transport is implemented as a new playback-control variant or as a dedicated audio-first transport component.
- Whether the audio-first screen keeps a tiny verse-progress label under the scrubber or shifts that entirely into the progress row.
- Exactly how much shell framing remains around the cover art and utility pills as long as the result stays visually cleaner and closer to the reference.
</decisions>

<specifics>
## Specific Ideas

- `BibleReaderScreen` already branches for `chapterPresentationMode === 'audio-first'`; this should become the primary seam for the simplified chrome instead of changing every reader mode.
- `PlaybackControls` currently bakes in 10-second skip buttons, which is convenient for other player surfaces but too busy for this screen. A variant-based approach keeps the rest of the app honest.
- The current `AudioFirstChapterCard` has both a nested hero panel and a watermark icon behind the content. The screenshot feedback explicitly asks for the shells and watermark to be removed.
- The Dwell reference still uses a segmented `Listen / Read` rail and top-left/top-right buttons, so those should remain.
</specifics>

<deferred>
## Deferred Ideas

- Re-theming the wider app toward a more finance-like aesthetic
- Reworking the text-reader `Listen` layout if later screenshots call for that too
- Building screenshot-based visual regression for native surfaces if device QA keeps surfacing spacing-only issues
</deferred>

---

*Phase: 11-audio-reader-chrome-simplification-and-dwell-style-listen-layout-polish*
*Context gathered: 2026-03-20 via user screenshot feedback and code audit*
