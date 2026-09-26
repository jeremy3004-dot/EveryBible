import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPlaybackRate,
  playbackControlsLayout,
  repeatLabelKey,
  selectedBackgroundMusicId,
  sleepTimerOptionLabel,
} from './playbackControlsModel';

test('each variant shows its own rows and buttons', () => {
  assert.deepEqual(playbackControlsLayout('default', true), {
    showChapterButtons: true,
    showSkipControls: true,
    isChapterOnly: false,
  });
  assert.deepEqual(playbackControlsLayout('chapter-only', true), {
    showChapterButtons: true,
    showSkipControls: false,
    isChapterOnly: true,
  });
});

test('only the chapter-only transport can hide the chapter buttons', () => {
  assert.equal(playbackControlsLayout('chapter-only', false).showChapterButtons, false);
  assert.equal(playbackControlsLayout('default', false).showChapterButtons, true);
});

test('the repeat button is named for its mode', () => {
  assert.deepEqual((['off', 'chapter', 'book'] as const).map(repeatLabelKey), [
    'audio.repeatOff',
    'audio.repeatChapter',
    'audio.repeatBook',
  ]);
});

test('rates read as a multiplier', () => {
  assert.equal(formatPlaybackRate(1.0), '1x');
  assert.equal(formatPlaybackRate(1.25), '1.25x');
  assert.equal(formatPlaybackRate(2.5), '2.5x');
});

test('the chosen layer is looked up in the catalogue, falling back to its first entry', () => {
  const options = [{ id: 'off' as const }, { id: 'piano' as const }];
  assert.equal(selectedBackgroundMusicId('piano', options), 'piano');
  assert.equal(selectedBackgroundMusicId('ambient', options), 'off');
  assert.equal(selectedBackgroundMusicId('piano', []), undefined);
});

test('the sleep-timer options are Off or a minute count', () => {
  assert.deepEqual(sleepTimerOptionLabel(null), { key: 'interface.music.off.label' });
  assert.deepEqual(sleepTimerOptionLabel(15), { key: 'interface.minutesShort', count: 15 });
});
