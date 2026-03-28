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
    /await audioPlayer\.stop\(\);[\s\S]*const audioData = await getChapterAudioUrl/,
    'useAudioPlayer should stop the current sound before loading the next chapter source'
  );

  assert.match(
    useAudioPlayerSource,
    /const playRequestId = \+\+playRequestIdRef\.current;[\s\S]*if \(playRequestId !== playRequestIdRef\.current\) \{\s+return;\s+\}/,
    'useAudioPlayer should ignore stale chapter requests after a newer navigation request starts'
  );
});

test('track-player wrapper invalidates stale async loads before mounting the next sound', () => {
  const trackPlayerSource = readRelativeSource('./trackPlayer.ts');

  assert.match(
    trackPlayerSource,
    /let loadRequestId = 0;/,
    'TrackPlayer should track load requests so overlapping chapter loads cannot both attach sounds'
  );

  assert.match(
    trackPlayerSource,
    /const requestId = \+\+loadRequestId;/,
    'TrackPlayer should create a fresh request token for each load'
  );

  assert.match(
    trackPlayerSource,
    /if \(requestId !== loadRequestId\) \{\s+await newSound\.stopAsync\(\);\s+await newSound\.unloadAsync\(\);\s+return;\s+\}/,
    'TrackPlayer should discard stale sounds when a newer chapter load wins the race'
  );
});

test('reader chapter navigation hands active audio over instead of replaying the same chapter twice', () => {
  const readerSource = readRelativeSource('../../screens/bible/BibleReaderScreen.tsx');

  assert.match(
    readerSource,
    /shouldAutoplayChapterAudio\(\{/,
    'BibleReaderScreen should guard autoplay when the requested chapter is already the active audio session'
  );

  assert.match(
    readerSource,
    /const handlePreviousListenChapter = async \(\) => \{[\s\S]*if \(isCurrentAudioChapter\) \{[\s\S]*await previousChapter\(\);[\s\S]*return;[\s\S]*\}/,
    'BibleReaderScreen should hand active playback to previousChapter when the current reader chapter is already playing'
  );

  assert.match(
    readerSource,
    /const handleNextListenChapter = async \(\) => \{[\s\S]*if \(isCurrentAudioChapter\) \{[\s\S]*await nextChapter\(\);[\s\S]*return;[\s\S]*\}/,
    'BibleReaderScreen should hand active playback to nextChapter when the current reader chapter is already playing'
  );

  assert.match(
    readerSource,
    /navigation\.setParams\(\s*buildReaderChapterRouteParams\(\{\s*bookId:\s*activeAudioBookId \?\? bookId,\s*chapter:\s*activeAudioChapter,\s*preferredMode:\s*chapterSessionMode,\s*\}\)\s*\);/s,
    'BibleReaderScreen should sync the active audio chapter into the reader route without replaying stale autoplay params'
  );
});
