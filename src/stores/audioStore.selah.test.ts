import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';

// Selah holds the narration paused while the music bed plays on. The store owns the
// flag, and keeps the sleep timer counting while it is on: the listener still hears
// something, so the timer that is meant to end the listening still runs.

const mmkv = mockMmkvStorage(mock);

let useAudioStore: (typeof import('./audioStore'))['useAudioStore'];

before(async () => {
  ({ useAudioStore } = await import('./audioStore'));
});

beforeEach(() => {
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  useAudioStore.persist.clearStorage();
  mmkv.store.clear();
});

const actions = () => useAudioStore.getState();
const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

/** A chapter playing with a 15-minute sleep timer, then held by Selah. */
function holdPlayingChapterInSelah(): void {
  actions().setCurrentTrack('bsb', 'JHN', 3);
  actions().setStatus('playing');
  actions().setSleepTimer(15);
  actions().setSelahActive(true);
  actions().setStatus('paused');
}

test('Selah starts off and is never saved', () => {
  actions().setCurrentTrack('bsb', 'JHN', 3);
  actions().setStatus('paused');
  actions().setSelahActive(true);
  actions().setPlaybackRate(1.25);

  const saved = JSON.parse(mmkv.store.get('audio-storage') ?? 'null') as {
    state: Record<string, unknown>;
  };
  assert.equal(useAudioStore.getInitialState().selahActive, false);
  assert.equal(useAudioStore.getState().selahActive, true);
  assert.equal('selahActive' in saved.state, false);
});

test('the sleep timer keeps running while Selah holds the narration paused', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  holdPlayingChapterInSelah();

  assert.equal(useAudioStore.getState().sleepTimerEndTime, NOW + 15 * MINUTE);
  assert.equal(useAudioStore.getState().sleepTimerRemainingMs, null);
});

test('ending Selah with the narration still paused freezes the sleep timer', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  holdPlayingChapterInSelah();
  t.mock.timers.tick(5 * MINUTE);

  actions().setSelahActive(false);

  assert.equal(useAudioStore.getState().sleepTimerEndTime, null);
  assert.equal(useAudioStore.getState().sleepTimerRemainingMs, 10 * MINUTE);
});

test('Selah turned on over a paused chapter starts the frozen sleep timer', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  actions().setCurrentTrack('bsb', 'JHN', 3);
  actions().setStatus('paused');
  actions().setSleepTimer(15);
  t.mock.timers.tick(MINUTE);

  actions().setSelahActive(true);

  assert.equal(useAudioStore.getState().sleepTimerEndTime, NOW + MINUTE + 15 * MINUTE);
});

test('resuming the narration out of Selah leaves the sleep timer running', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  holdPlayingChapterInSelah();
  t.mock.timers.tick(MINUTE);

  actions().setSelahActive(false);
  actions().setStatus('playing');

  assert.equal(useAudioStore.getState().sleepTimerEndTime, NOW + 15 * MINUTE);
});

test('a sleep timer set during Selah starts counting at once', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  actions().setCurrentTrack('bsb', 'JHN', 3);
  actions().setStatus('playing');
  actions().setSelahActive(true);
  actions().setStatus('paused');

  actions().setSleepTimer(5);

  assert.equal(useAudioStore.getState().sleepTimerEndTime, NOW + 5 * MINUTE);
});

test('selecting another chapter (or the same one again) ends Selah', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  holdPlayingChapterInSelah();

  actions().setCurrentTrack('bsb', 'JHN', 4);

  assert.equal(useAudioStore.getState().selahActive, false);
  // The narration is paused, so without Selah the timer is frozen again.
  assert.equal(useAudioStore.getState().sleepTimerEndTime, null);
  assert.equal(useAudioStore.getState().sleepTimerRemainingMs, 15 * MINUTE);
});

test('stopping, a playback error and going idle each end Selah', () => {
  const endings: Array<[string, () => void]> = [
    ['resetPlayback', () => actions().resetPlayback()],
    ['setError', () => actions().setError('Playback error')],
    ['idle', () => actions().setStatus('idle')],
    ['error status', () => actions().setStatus('error')],
  ];
  const left = endings.map(([name, end]) => {
    holdPlayingChapterInSelah();
    end();
    return [name, useAudioStore.getState().selahActive];
  });

  assert.deepEqual(left, [
    ['resetPlayback', false],
    ['setError', false],
    ['idle', false],
    ['error status', false],
  ]);
});

test('setting Selah to what it already is changes nothing', () => {
  let notifications = 0;
  const unsubscribe = useAudioStore.subscribe(() => {
    notifications += 1;
  });

  actions().setSelahActive(false);

  unsubscribe();
  assert.equal(notifications, 0);
});
