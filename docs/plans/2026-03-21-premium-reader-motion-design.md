# Premium Reader Motion Design

## Reference Lock

The source of truth for this redesign is the supplied iPhone screen recording at `~/Downloads/ScreenRecording_03-21-2026 10-33-48_1.MP4`. The earlier screenshot is no longer authoritative for the resting read-mode layout.

## Resting State

Read mode opens as a calm reading canvas rather than a conventional app screen. The content sits on a dark editorial background with serif typography. Chrome is minimal and floating:

- top left: back button in a glass circle
- top center: `Listen / Read` segmented glass control
- top right: overflow button in a glass circle
- center: large serif chapter title with a smaller section heading beneath it
- bottom: floating glass controls, with left and right utility buttons bracketing a central chapter pill

The old static header, top `AA`, top audio button, translation chip, and bottom audio bar do not belong to this state.

## Collapse Motion

The motion in the video behaves in stages:

1. The chapter title starts fading and translating upward first.
2. Supporting controls remain visible briefly while the text content scrolls beneath them.
3. Continued scrolling removes the top chrome entirely.
4. The bottom utility buttons fade away and the large chapter pill compresses to a small centered pill that stays pinned near the bottom.

This means the redesign should use one continuous scroll progress value, but different elements should consume different portions of that progress curve.

## Implementation Notes

- Use overlay architecture rather than trying to animate the current static header in place.
- Use blur-backed surfaces for the pills/buttons so the chrome feels like liquid glass instead of tinted cards.
- Keep the existing `Listen`/`Read` session continuity and reader data flow intact; this phase is a chrome/motion rebuild, not a routing rewrite.
