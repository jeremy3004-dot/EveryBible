import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canResumeLoadedChapter,
  resolvePlaybackStart,
  type PlaybackStartState,
} from './audioPlaybackStartModel';

const paused: PlaybackStartState = {
  status: 'paused',
  currentTranslationId: 'web',
  currentBookId: 'JHN',
  currentChapter: 3,
  currentPosition: 42_000,
  duration: 300_000,
  lastPosition: 40_000,
  lastPlayedTranslationId: 'bsb',
  lastPlayedBookId: 'GEN',
  lastPlayedChapter: 1,
};

const loaded = () => true;
const unloaded = () => false;

test('a paused, loaded chapter part way through resumes', () => {
  assert.equal(canResumeLoadedChapter(paused, loaded), true);
  assert.deepEqual(resolvePlaybackStart(paused, 'bsb', loaded), { kind: 'resume' });
});

test('a chapter heard to the end starts again instead of resuming at its end', () => {
  assert.equal(canResumeLoadedChapter({ ...paused, status: 'idle' }, loaded), false);
  assert.equal(canResumeLoadedChapter({ ...paused, currentPosition: 300_000 }, loaded), false);
});

test('a loaded chapter with an unknown duration can resume', () => {
  assert.equal(canResumeLoadedChapter({ ...paused, duration: 0 }, loaded), true);
});

test('a chapter at its start is loaded again rather than resumed', () => {
  assert.equal(canResumeLoadedChapter({ ...paused, currentPosition: 0 }, loaded), false);
});

test('the native player is asked whether it is loaded only once a chapter is selected', () => {
  let asked = 0;
  const isLoaded = () => {
    asked += 1;
    return true;
  };

  canResumeLoadedChapter({ ...paused, currentBookId: null }, isLoaded);
  canResumeLoadedChapter({ ...paused, status: 'idle' }, isLoaded);
  assert.equal(asked, 0);

  canResumeLoadedChapter(paused, isLoaded);
  assert.equal(asked, 1);
});

test('an unloaded selected chapter plays again from its resume point', () => {
  assert.deepEqual(resolvePlaybackStart(paused, 'bsb', unloaded), {
    kind: 'play',
    translationId: 'web',
    bookId: 'JHN',
    chapter: 3,
    startPositionMs: 40_000,
  });
});

test('a selected chapter without a translation plays in the fallback translation', () => {
  assert.deepEqual(
    resolvePlaybackStart({ ...paused, currentTranslationId: null }, 'bsb', unloaded),
    { kind: 'play', translationId: 'bsb', bookId: 'JHN', chapter: 3, startPositionMs: 40_000 }
  );
});

test('with nothing selected the last played chapter plays', () => {
  assert.deepEqual(
    resolvePlaybackStart(
      { ...paused, status: 'idle', currentBookId: null, currentChapter: null },
      'web',
      loaded
    ),
    { kind: 'play', translationId: 'bsb', bookId: 'GEN', chapter: 1, startPositionMs: 40_000 }
  );
  assert.deepEqual(
    resolvePlaybackStart(
      {
        ...paused,
        currentBookId: null,
        currentChapter: null,
        lastPlayedTranslationId: null,
      },
      'web',
      loaded
    ),
    { kind: 'play', translationId: 'web', bookId: 'GEN', chapter: 1, startPositionMs: 40_000 }
  );
});

test('with nothing selected or played before there is nothing to start', () => {
  assert.equal(
    resolvePlaybackStart(
      {
        ...paused,
        status: 'idle',
        currentBookId: null,
        currentChapter: null,
        lastPlayedBookId: null,
        lastPlayedChapter: null,
      },
      'bsb',
      loaded
    ),
    null
  );
});
