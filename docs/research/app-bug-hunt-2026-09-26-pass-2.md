# App bug hunt — 2026-09-26, second pass

Base: `b0bfd89f`, which saved the first pass on local `main`. This pass reviewed
notes, saved content, reading-plan launches, rhythm playback, and reminder/date
refresh logic. GPT-6 Sol with high reasoning implemented the confirmed fixes.

## Confirmed defects

1. **A note draft could overwrite a different verse's saved note.** Open a new
   note for John 3:1, type a draft, tap verse 3 above the inline editor, and press
   Done. The draft stayed in the editor, but its save callback followed the new
   selection and overwrote verse 3's existing note. The composer must keep its
   original target, reference, preview, and save action together.
2. **An unsuccessful note save discarded the draft.** The reader displayed an
   error after the annotation service returned `success: false`, but returned
   no result to the editor. The editor then closed as if saving had succeeded.
   The save result must reach the editor so the draft remains available to retry.
3. **Overlapping plans gave rhythm audio the wrong stopping point.** A rhythm
   containing Gospels in 60 Days followed by Gospels in 30 Days has overlapping
   first-day chapters: Matthew 1–2 and Matthew 1–3. Opening the second plan on
   Matthew 1 selected the first matching segment's audio sequence, omitting
   Matthew 3. Segment selection must honor the active plan and day before
   falling back to chapter matching.

## Fixes

- The note editor snapshots its original selection and save callback when
  composing starts. Returning to actions and choosing another verse resets a
  canceled draft even when both verses have no existing note.
- The reader returns the annotation save outcome. A false result keeps the
  editor and draft open, allowing a retry.
- Rhythm playback uses the existing sequence resolver's preferred plan/day
  handling before selecting the segment. The first plan and chapter-only
  fallback keep their prior behavior.

## Regression evidence

- `BibleReaderScreen.noteTarget.render.test.tsx` reproduces the wrong-target
  overwrite and failed-save draft loss through the real reader component.
- `BibleReaderScreen.rhythmPlayback.render.test.tsx` uses the bundled plan
  catalog and the real reader. Before the fix, the selected second plan's audio
  sequence contained only Matthew 1 and 2; the expected sequence includes 3.
- The rhythm renderer also checks that an ordinary, non-rhythm plan retains its
  own chapter boundary. These behavioral assertions replace an obsolete test
  that required the previous implementation's exact source text.
- Full repository tests passed: 8,712 tests, zero failures or skips.
- Root/workspace lint, mobile/strict/workspace typechecks, and Expo configuration
  verification passed. The final test edits also passed lint and typechecking.
- iOS and Android production exports passed. Changed-file formatting and
  `git diff --check` passed before the scoped local save.

## Scope and limits

The older findings about plan pages staying on yesterday, monthly progress
always using 31 days, and reminders lacking tap routing are already addressed
in current code; they were not counted as new defects. This is a focused audit,
not a claim that the app has no remaining issues. Native keyboard and playback
behavior still need physical-device checks; the automated rendering harness
uses native-module fakes.
