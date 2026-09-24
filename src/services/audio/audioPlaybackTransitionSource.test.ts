// UI-only source check: the remaining assertions cover wiring inside BibleReaderScreen.tsx,
// which has no component renderer in this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readBibleReaderSource } from '../../screens/bible/bibleReaderSourceFiles';

// 'playChapter stops the active sound before resolving the next chapter source' now runs on
// the real hook in useAudioPlayer.test.ts.
test('reader chapter navigation keeps read mode separate from audio playback controls', () => {
  const readerSource = readBibleReaderSource();

  assert.match(
    readerSource,
    /shouldAutoplayChapterAudio\(\{/,
    'BibleReaderScreen should guard autoplay when the requested chapter is already the active audio session'
  );

  // The listen arrows' hand-off to the player's own next/previous step is covered
  // behaviourally in screens/bible/readerListenNavigation.test.ts.
  assert.match(
    readerSource,
    /navigation\.setParams\(\s*buildReaderChapterRouteParams\(\{[\s\S]*bookId:\s*activeAudioBookId \?\? bookId,[\s\S]*chapter:\s*activeAudioChapter,[\s\S]*preferredMode:\s*chapterSessionMode,[\s\S]*\}\)\s*\);/s,
    'BibleReaderScreen should sync the active audio chapter into the reader route without replaying stale autoplay params'
  );

  assert.doesNotMatch(
    readerSource,
    /handleReadChapterNavigation[\s\S]*await playChapter\(target\.bookId, target\.chapter\);/s,
    'BibleReaderScreen should not start audio playback when the read-tab chapter arrows move the visible chapter'
  );
});
