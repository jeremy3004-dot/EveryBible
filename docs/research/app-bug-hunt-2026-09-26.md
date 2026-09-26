# App bug hunt — 2026-09-26

Base: `5db03b38`. Focused review of reader navigation and playback commands,
with the complete workspace verification gate as the baseline. Fixes were
delegated to GPT-6 Sol with high reasoning. Unrelated work was preserved.

## Confirmed defects

1. **Daily audio could ignore another Play request.** Home opens the existing
   reader with `autoplayAudio: true`. The reader remembered the chapter's autoplay
   key after consuming that request, so another request for the same chapter
   after Stop was discarded. It also rejected a matching paused chapter without
   considering whether playback had stopped. Already-playing chapters left the
   request unconsumed, allowing it to affect later translation changes.
   Reproduced through the real reader component in
   `BibleReaderScreen.autoplay.render.test.tsx`.
2. **A delayed seek or skip could corrupt another chapter's resume point.**
   Start a seek in Genesis 1, select John 3 while the native seek is pending,
   then let the old seek finish. The old completion wrote its position into
   John 3. The failing tests observed 120,000 ms after a scrub and 70,000 ms after
   a forward skip, where the newly selected chapter should have remained at 0.
   Reproduced through the real player hook in `useAudioPlayer.test.ts`.

## Fixes

- Each new explicit daily-audio request can start playback, even for the same
  stopped, finished, or paused chapter.
- A request for a matching chapter already playing or loading is consumed
  without restarting it. Ordinary rerenders and translation changes cannot
  reuse a consumed request.
- An old seek or skip cannot write a position into a different playback session.
  Normal seeks, skips, interpolation, and saved resume points keep working.

The reader now tracks consumption of the current request, resetting it after
the route param becomes false, and checks playback status as well as chapter
identity. Seek and skip use the existing playback request generation to reject
stale position writes, including when the same chapter has been started again.

## Verification

- Baseline `npm run release:verify`: passed; 8,696 tests, no failures.
- Both transport regression tests failed before the fix, with the incorrect
  positions described above. Reader autoplay regressions also failed before
  the fix.
- Independent review reran 11 reader render tests and four targeted player
  tests successfully. The Sol agent also ran the broader focused suite and
  checked the new render and player tests under Node 22.
- iOS and Android production bundle exports: passed.
- Final `npm run release:verify`: passed, including workspace lint, typechecking,
  all 8,706 tests (10 new regressions), and Expo configuration verification.
  The existing admin layout font warning remains; there were no lint errors.
- Changed-file formatting and `git diff --check`: passed. No commit, push, or
  deployment was performed.

## Device follow-up

Automated rendering uses native-module fakes. A physical-device check remains
useful for actual playback timing: play daily audio, pause or stop, request it
again from Home, then rapidly scrub and switch chapters. This audit does not
claim physical-device or distributed-build verification.
