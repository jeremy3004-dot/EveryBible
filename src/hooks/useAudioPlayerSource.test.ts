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

test('useAudioPlayer resumes interrupted chapters from the stored last position instead of restarting from verse one', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /options\?: \{ startPositionMs\?: number \| null \}/,
    'useAudioPlayer should let playChapterForTranslation accept an explicit resume position'
  );

  assert.match(
    source,
    /const startPositionMs = Math\.max\(0, Math\.round\(options\?\.startPositionMs \?\? 0\)\);/,
    'useAudioPlayer should normalize the stored resume position before replaying a chapter'
  );

  assert.match(
    source,
    /if \(startPositionMs > 0\) \{[\s\S]*await audioPlayer\.seekTo\(startPositionMs\);[\s\S]*setPosition\(startPositionMs\);[\s\S]*\}/s,
    'useAudioPlayer should seek back into the chapter immediately after reloading interrupted audio'
  );

  assert.match(
    source,
    /startPositionMs: lastPosition/,
    'useAudioPlayer should reuse the stored lastPosition when replaying the current chapter from the local play toggle'
  );

  assert.match(
    source,
    /startPositionMs: store\.lastPosition/,
    'useAudioPlayer should reuse the stored lastPosition when the lock-screen or interruption recovery triggers play remotely'
  );
});

test('useAudioPlayer resumes interruptions from the saved chapter position instead of restarting the chapter', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /const resumePosition = Math\.max\(store\.currentPosition, store\.lastPosition\);[\s\S]*await audioPlayer\.seekTo\(resumePosition\);[\s\S]*await audioPlayer\.resume\(\);/s,
    'useAudioPlayer should re-seek to the stored offset before resuming audio so interruption recoveries do not restart at verse 1'
  );

  assert.match(
    source,
    /audioPlayer\.isLoaded\(\)[\s\S]*store\.currentPosition > 0[\s\S]*store\.currentPosition < store\.duration/s,
    'useAudioPlayer should treat an in-progress loaded chapter as resumable instead of replaying it from the beginning'
  );
});

test('useAudioPlayer retries the remote chapter stream when a downloaded local audio file fails to load', () => {
  const source = readRelativeSource('./useAudioPlayer.ts');

  assert.match(
    source,
    /const shouldRetryWithRemoteFallback = audioData\.url\.startsWith\('file:\/\/'\);/,
    'useAudioPlayer should only trigger the recovery path when the failed asset was a downloaded local file'
  );

  assert.match(
    source,
    /const remoteFallback = await fetchRemoteChapterAudio\(\s*targetTranslationId,\s*bookId,\s*chapter,\s*verse\s*\);/s,
    'useAudioPlayer should resolve the matching remote chapter asset before giving up on playback'
  );

  assert.match(
    source,
    /await audioPlayer\.loadAndPlay\(remoteFallback\.url, playbackRate\);/,
    'useAudioPlayer should retry playback immediately with the remote chapter asset'
  );

  assert.match(
    source,
    /await expoAudioFileSystemAdapter\.deleteFile\(initialAudioUrl\)\.catch\(\(\) => \{\}\);/,
    'useAudioPlayer should prune the broken local file after a successful remote fallback'
  );
});
