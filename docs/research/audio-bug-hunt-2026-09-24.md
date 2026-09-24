# Audio bug hunt (2026-09-24)

Scope: `src/services/audio/*`, `audioStore`, `useAudioPlayer`, the reader's audio wiring,
chapter audio downloads, the Android media session (`androidMediaSession*.ts`, the
expo-media-control patch), iOS now-playing and `readerListenNavigation.ts`. Base:
`origin/main` @ `195717e1`. Device-only items already listed in
`android-background-audio-2026-09-24.md` are not repeated here.

## Fixed (test-first, one commit each)

| #   | Severity | Bug                                                                                                                                                                                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                                                                                                                                   |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High     | Leaving the reader (back to the book browser) while a chapter plays unmounted `useAudioPlayer`. Audio and auto-advance continued through the retained native callbacks, but the hook's cleanup removed the lock-screen / notification / headset command subscription and the sleep-timer interval. The Android notification's buttons went dead, iOS remote commands did nothing, and the sleep timer never fired. | The command subscription outlives the screen and is handed over when another player mounts. Actions read track, queue, plan session and rate from the store at call time, so late commands act on the chapter playing now. The sleep timer's expiry is also enforced from native progress (about 1 Hz while playing). |
| 2   | High     | At the end of playback (Revelation 22, the end of a plan session, or auto-advance off) the wrapper emitted queue-ended and then a Ready state. The finish handler had set the player idle and cleared the lock screen. The trailing state set it back to paused and re-published the entry, so the Android media notification stayed up.                                                                           | `trackPlayer` reports the stopped state first, then ends the queue.                                                                                                                                                                                                                                                   |
| 3   | Medium   | Play after a finished chapter resumed at, or sought to, its end and finished again at once, with no sound. The persisted resume point did the same after a relaunch.                                                                                                                                                                                                                                               | Finishing clears the resume point. An idle player with a loaded sound starts the chapter from 0. Applies to the in-app and lock-screen/headset Play.                                                                                                                                                                  |
| 4   | Medium   | Switching translation while paused on the playing chapter started the new translation at once. The reader's one-shot `autoplayAudio` param also stayed set, so a later translation switch replayed audio after a pause or stop.                                                                                                                                                                                    | The reader switches through the player's intent-keeping navigation (playing continues, paused stays paused). The autoplay param is consumed when it fires.                                                                                                                                                            |
| 5   | Low      | A lock-screen or notification scrub past the end became the visible position and the persisted resume point.                                                                                                                                                                                                                                                                                                       | Seeks are clamped to [0, duration].                                                                                                                                                                                                                                                                                   |

Tests: `trackPlayer.test.ts` (event order) and `useAudioPlayer.test.ts` (14 new cases). The
remote-command test double now delivers to every live subscription, so a subscription that
was not handed over would show up as a double action. The screen-side changes for #4
(`handleTranslationActivated`, autoplay param consumption) cannot be unit-tested without a
component renderer. Verify them on device.

## Checked, no change

- **Auto-resume on relaunch.** Nothing plays on mount. The hook, `AudioReturnTab` (shown only while
  playing, no autoplay), the Bible tab resume (`preferredMode` only), and Home's daily
  audio (an explicit Play) were all checked. The plan screens were fixed earlier today. There is no
  navigation-state persistence that could restore a stale `autoplayAudio`.
- **Chapter and book boundaries.** Single-chapter books, crossing into the next book, the end of the Bible,
  repeat-book wrap, and sparse Every Language sets are all covered by existing tests.
- **Interruptions.** expo-av owns focus, noisy-unplug and call interruptions (see the
  Android doc). The hook follows the native snapshots.
- **Playback speed.** It is persisted and applied on every load (`setRateAsync(rate, true)`).
- **Progress flooding.** Native progress runs at 1 s. Interpolation runs at 250 ms, only while mounted,
  in the foreground and playing. The audio store skips unchanged persists. Download progress is
  still coalesced to whole-percent or completed-chapter changes, per book and per collection.
- **Listener leaks.** AppState and interpolation are removed on unmount. The trackPlayer listeners are
  wired once. The Android session's `subscribe` returns its remover.
- **Deleting a translation during its download.** Fixed in the follow-up below; Delete is now
  offered during an audio download.
- **Background downloader writes.** Files go to `.tmp` and are moved on completion (both platforms), so an
  in-flight partial is never at the final path.

## Open findings (not fixed)

- **Prefetch** resolves URLs only. It does not cross into the next book and does not consult the
  sparse chapter map. This is harmless: it builds a URL for, or does a manifest lookup on, a missing chapter.
- **Repeat tap on Home's daily audio after Stop** does not replay the same chapter (existing autoplay
  key dedupe). This did not change here.
- **Chapters downloaded by the background downloader, or before the fallback fix, from a source that
  publishes no size** (everything except Every Language) cannot be re-checked later: only the 1 KB
  floor applies to a file already on disk.

## Follow-up fixes (same day)

- **Sleep timer while paused.** The timer now pauses with playback (podcast/audiobook convention).
  Pausing or stopping freezes the remaining time in `audioStore`; resuming moves the end time. A timer
  set while paused waits for playback. Buffering counts as playing.
- **Fallback download path.** The in-app download writes to `<chapter>.download` and moves the file
  into place only after it passes validation, including a size check against Content-Length (or the
  total the transfer reported). A leftover partial is deleted before the next attempt. An existing
  chapter whose size differs from the source's published `bytes` is deleted and downloaded again.
- **Deleting during a download.** `deleteTranslation` stops the translation's in-JS download loops
  (`cancelAudioDownloadsForTranslation`, which waits for them to settle), then its native tasks, and
  only then deletes the audio folder (which holds any partials). The picker offers Delete while an
  audio download runs.
- **Telemetry.** `trackPlayer` reports `State.Ended` for a finished track, and the final segment is
  reported with reason `finish` again.

## Device QA to add

1. Play a chapter, go back to the book list, lock the phone: pause, play and next from the lock
   screen or notification work, and next goes to the chapter after the one playing.
2. Set a 5-minute sleep timer, go back to the book list, lock the phone: audio pauses at 5 minutes.
3. Listen to Revelation 22 (or the last chapter of a plan day) to the end: the notification or lock-screen
   entry disappears, and in-app Play restarts the chapter from 0:00.
4. Pause, then switch translation in the reader: nothing plays until Play, and Play starts the new
   translation.
5. Set a 5-minute sleep timer, pause after 2 minutes, wait 10 minutes: the timer still shows 3 min,
   and after Play audio pauses about 3 minutes later.
6. Start a whole-Bible audio download, open the translation's manage sheet, Delete: the download
   stops, and no chapters or books reappear afterwards.
