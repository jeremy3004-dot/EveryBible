# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## audio-player-hidden-old-book-keeps-playing — old chapter audio keeps playing while mini player disappears on new chapter
- **Date:** 2026-04-03
- **Error patterns:** galatians audio keeps playing, background audio, mini player disappears, bottom player hidden, bible reader, hebrews, cannot pause old audio, navigate chapter
- **Root cause:** MiniPlayer was hidden for all BibleReader routes regardless of whether the reader was showing the active audio session, so navigating to a different chapter removed the only global pause/control surface while old audio continued.
- **Fix:** Passed current route params from RootNavigator into MiniPlayer and replaced unconditional BibleReader hide logic with a route-aware check that hides only when BibleReader is already showing the active audio chapter.
- **Files changed:** src/navigation/RootNavigator.tsx, src/components/audio/MiniPlayer.tsx, src/components/audio/miniPlayerNavigationSource.test.ts
---

