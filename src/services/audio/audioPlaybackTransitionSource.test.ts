// UI-only source check: the remaining assertions cover wiring inside BibleReaderScreen.tsx,
// which has no component renderer in this suite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

// 'playChapter stops the active sound before resolving the next chapter source' now runs on
// the real hook in useAudioPlayer.test.ts.
test('reader chapter navigation keeps read mode separate from audio playback controls', () => {
  const readerSource = readRelativeSource('../../screens/bible/BibleReaderScreen.tsx');

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
