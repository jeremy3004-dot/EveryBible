// Source-shape guard by design: the remaining assertions cover ordering and wiring inside
// useAudioPlayer.ts and BibleReaderScreen.tsx, which have no behavioural test seam here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('playChapter stops the active sound before resolving the next chapter source', () => {
  const useAudioPlayerSource = readRelativeSource('../../hooks/useAudioPlayer.ts');

  assert.match(
    useAudioPlayerSource,
    /await audioPlayer\.stop\(\);[\s\S]*let audioData = await getChapterAudioUrl/,
    'useAudioPlayer should stop the current sound before loading the next chapter source'
  );
});

test('reader chapter navigation keeps read mode separate from audio playback controls', () => {
  const readerSource = readRelativeSource('../../screens/bible/BibleReaderScreen.tsx');

  assert.match(
    readerSource,
    /shouldAutoplayChapterAudio\(\{/,
    'BibleReaderScreen should guard autoplay when the requested chapter is already the active audio session'
  );

  assert.match(
    readerSource,
    /const handlePreviousListenChapter = async \(\) => \{[\s\S]*if \(isCurrentAudioChapter\) \{[\s\S]*await previousChapter\(\);[\s\S]*return;[\s\S]*\}/,
    'BibleReaderScreen should hand active playback to previousChapter when the current reader chapter is already playing in listen mode'
  );

  assert.match(
    readerSource,
    /const handleNextListenChapter = async \(\) => \{[\s\S]*if \(isCurrentAudioChapter\) \{[\s\S]*await nextChapter\(\);[\s\S]*return;[\s\S]*\}/,
    'BibleReaderScreen should hand active playback to nextChapter when the current reader chapter is already playing in listen mode'
  );

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
