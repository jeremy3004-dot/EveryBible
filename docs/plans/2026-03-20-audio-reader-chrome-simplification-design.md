# Audio Reader Chrome Simplification Design

## Goal

Turn the audio-first Bible chapter screen into a cleaner, more Dwell-like listening surface while keeping EveryBible's existing palette and player behavior. The user wants a near-pixel match for layout hierarchy, not a color clone.

## Approaches Considered

### Option A: Minimal trim on the existing audio-first card

Remove the most obvious extra copy and controls, but keep the current card structure and shared playback controls mostly intact.

**Pros**
- Fastest implementation
- Lowest risk to shared audio components

**Cons**
- Likely still feels like the current UI with pieces hidden
- Harder to reach the cleaner Dwell-like silhouette because the nested shells and shared transport remain

### Option B: Dedicated audio-first listen-shell using current playback logic

Keep the existing player hooks and navigation, but give the audio-first Bible surface its own stripped header treatment and a simpler transport variant.

**Pros**
- Best match for the requested screen
- Contains the visual changes to the audio-first branch
- Preserves existing playback/state architecture

**Cons**
- Slightly more UI work than a trim-only pass
- Needs targeted regression tests for the new variant seams

### Option C: Replace all Bible listen surfaces with one new universal player shell

Use one new UI structure for both text-backed listen mode and audio-first chapters.

**Pros**
- Long-term visual consistency if we later restyle every listen surface

**Cons**
- Much broader than the request
- Higher regression risk across the already-working text/listen experience

## Recommendation

Use **Option B**.

This keeps the scope aligned to the user feedback: the audio-first Bible screen is what feels too busy right now, so we should simplify that branch directly instead of reopening the whole reader architecture. The current code already gives us the right seam because `BibleReaderScreen` branches into `AudioFirstChapterCard` for audio-only chapters. That means we can preserve playback continuity, chapter handoff, overflow actions, and theme colors while replacing only the chrome and body structure that feel redundant.

## Planned UI Changes

- Remove the top chapter title, translation chip, and `AA` button on audio-first chapters.
- Keep only back, `Listen / Read`, and overflow in the top rail.
- Remove the 10-second skip controls from the audio-first transport row.
- Keep previous chapter, play/pause, and next chapter controls.
- Keep the progress scrubber and time row.
- Keep the existing voice/translation and ambient pills, because the reference still has bottom utility pills.
- Remove the background watermark icon and the nested hero framing so the main cover-art box stands on its own.
- Remove the audio-only explanation copy such as “WEB is currently available as audio...”.
- Keep the current palette and general spacing language from EveryBible.

## Architecture And Component Plan

- `src/screens/bible/BibleReaderScreen.tsx`
  - Add an audio-first header variant.
  - Continue routing audio-first chapters through the dedicated card path.
  - Keep text-reader behavior unchanged.

- `src/components/audio/AudioFirstChapterCard.tsx`
  - Simplify the structure to match the cleaner art-first layout.
  - Replace the current copy stack with a concise title and verse-count treatment.
  - Remove watermark art and extra shells.

- `src/components/audio/PlaybackControls.tsx`
  - Add a variant or a dedicated audio-first path that hides skip-10 controls while preserving chapter navigation and utility controls.
  - Avoid changing the underlying `useAudioPlayer` contract.

## Testing Strategy

- Add source-level regression tests to prove the audio-first branch no longer renders the removed header chrome, explanatory copy, watermark, or skip-10 controls.
- Keep the existing chapter-transition regression coverage so the simpler transport does not regress playback handoff.
- Run lint, typecheck, and the targeted/node-based source tests before broader repo tests.

## Device QA Focus

- Small iPhone spacing with the simplified header and bottom controls
- Chapter changes from the simplified previous/next transport
- Overflow/favorite/share/download actions still reachable
- `Listen / Read` toggle still behaves correctly when entering or leaving audio-first chapters
