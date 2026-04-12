import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('useAudioPlayer imports only the stores it needs', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.equal(
    source.includes("from '../stores';"),
    false,
    'useAudioPlayer should not import the full stores barrel on the startup audio path'
  );

  assert.match(
    source,
    /import \{ useAudioStore \} from '\.\.\/stores\/audioStore';/,
    'useAudioPlayer should import the audio store directly'
  );

  assert.match(
    source,
    /import \{ useLibraryStore \} from '\.\.\/stores\/libraryStore';/,
    'useAudioPlayer should import the library store directly'
  );
});

test('useAudioPlayer uses canonical adjacent-book chapter resolution for manual and automatic chapter transitions', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /import \{ getAdjacentBibleChapter, getBookById \} from '\.\.\/constants';/,
    'useAudioPlayer should import the shared adjacent-chapter helper from the Bible constants module'
  );

  assert.match(
    source,
    /getAdjacentBibleChapter\(bookId, chapterNum, 1\)/,
    'useAudioPlayer playback-finished handling should resolve the next chapter across book boundaries'
  );

  assert.match(
    source,
    /getAdjacentBibleChapter\(currentBookId, currentChapter, -1\)/,
    'useAudioPlayer previousChapter should move into the prior book when the current chapter is chapter 1'
  );

  assert.match(
    source,
    /getAdjacentBibleChapter\(currentBookId, currentChapter, 1\)/,
    'useAudioPlayer nextChapter should move into the next book when the current chapter is the last chapter'
  );
});

test('useAudioPlayer stops at the end of an explicit playback sequence instead of leaking into the next Bible chapter', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /const reachedPlaybackSequenceBoundary =[\s\S]*hasAudioPlaybackSequenceEntry\(playbackSequence, bookId, chapterNum\)/,
    'useAudioPlayer should detect when playback finishes on the last entry of an explicit playback sequence'
  );

  assert.match(
    source,
    /if \(reachedPlaybackSequenceBoundary\) \{[\s\S]*clearBibleNowPlaying\(\);[\s\S]*setStatus\('idle'\);[\s\S]*return;[\s\S]*\}/s,
    'useAudioPlayer should stop cleanly at the end of a plan or rhythm playback sequence'
  );

  assert.match(
    source,
    /const isPinnedToPlaybackSequence =[\s\S]*hasAudioPlaybackSequenceEntry\(playbackSequence, currentBookId, currentChapter\)/,
    'useAudioPlayer should treat manual next/previous chapter actions as bounded when playback came from an explicit sequence'
  );
});

test('useAudioPlayer records completed listening progress when playback finishes even without a following chapter transition', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /const handlePlaybackFinished = useCallback\(async \(\) => \{[\s\S]*if \(bookId && chapterNum && finishedDuration > 0\) \{[\s\S]*useLibraryStore\.getState\(\)\.recordHistory\(bookId, chapterNum, 1\);[\s\S]*\}/s,
    'useAudioPlayer should persist finished chapter listening progress inside playback-finished handling so final chapters still count toward plan completion'
  );
});
