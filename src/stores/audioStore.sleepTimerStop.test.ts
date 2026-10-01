import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';

// A pause freezes the sleep timer for the same listening session (podcast convention). A full
// stop ends that session, so the leftover time must not carry into an unrelated later one.

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
const timer = () => {
  const { sleepTimerEndTime, sleepTimerRemainingMs, sleepTimerMinutes } = useAudioStore.getState();
  return { sleepTimerEndTime, sleepTimerRemainingMs, sleepTimerMinutes };
};
const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

function playWithTimer(): void {
  actions().setCurrentTrack('bsb', 'JHN', 3);
  actions().setStatus('playing');
  actions().setSleepTimer(15);
}

test('a timer left by a full stop is cleared when the next session starts playing', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  playWithTimer();
  t.mock.timers.tick(5 * MINUTE);
  actions().resetPlayback();
  assert.equal(timer().sleepTimerRemainingMs, 10 * MINUTE, 'frozen while stopped');

  t.mock.timers.tick(60 * MINUTE);
  actions().setCurrentTrack('bsb', 'PSA', 23);
  actions().setStatus('loading');

  assert.deepEqual(timer(), {
    sleepTimerEndTime: null,
    sleepTimerRemainingMs: null,
    sleepTimerMinutes: null,
  });
});

test('a timer left by playback ending (idle) is cleared when a new session starts', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  playWithTimer();
  actions().setStatus('idle');

  actions().setStatus('loading');

  assert.equal(timer().sleepTimerEndTime, null);
  assert.equal(timer().sleepTimerRemainingMs, null);
});

test('a timer frozen by pause then stop is also cleared by the next session', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  playWithTimer();
  actions().setStatus('paused');
  actions().resetPlayback();

  actions().setStatus('playing');

  assert.equal(timer().sleepTimerEndTime, null);
  assert.equal(timer().sleepTimerRemainingMs, null);
});

test('resuming after a pause still continues with the time that was left', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  playWithTimer();
  t.mock.timers.tick(5 * MINUTE);
  actions().setStatus('paused');
  t.mock.timers.tick(30 * MINUTE);

  actions().setStatus('playing');

  assert.equal(timer().sleepTimerEndTime, NOW + 35 * MINUTE + 10 * MINUTE);
  assert.equal(timer().sleepTimerRemainingMs, null);
});

test('a timer set while stopped waits for playback instead of being cleared', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  actions().setSleepTimer(15);
  assert.equal(timer().sleepTimerRemainingMs, 15 * MINUTE);

  actions().setCurrentTrack('bsb', 'JHN', 3);
  actions().setStatus('loading');

  assert.equal(timer().sleepTimerEndTime, NOW + 15 * MINUTE);
  assert.equal(timer().sleepTimerMinutes, 15);
});

test('a timer chosen after a stop starts fresh with the next session', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: NOW });
  playWithTimer();
  actions().resetPlayback();

  actions().setSleepTimer(30);
  actions().setStatus('playing');

  assert.equal(timer().sleepTimerEndTime, NOW + 30 * MINUTE);
  assert.equal(timer().sleepTimerMinutes, 30);
});
