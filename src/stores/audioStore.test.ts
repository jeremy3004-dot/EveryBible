import test, { before, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../testing/mockModules';

/**
 * The persisted snapshot the store hydrates from at import time. Every field is
 * deliberately wrong in a different way (out-of-range setting, legacy casing,
 * fractional chapter, unknown book) so the import-time merge exercises the real
 * sanitizer. Later scenarios are driven through `persist.rehydrate()`.
 */
const MALFORMED_SNAPSHOT = JSON.stringify({
  state: {
    playbackRate: 3,
    autoAdvanceChapter: 'yes',
    repeatMode: 'shuffle',
    sleepTimerMinutes: 45,
    backgroundMusicChoice: 'banjo',
    queue: [
      { id: 'stale-id', translationId: 'BSB', bookId: 'GEN', chapter: 1, addedAt: 10 },
      { translationId: 'not-a-translation', bookId: 'GEN', chapter: 2, addedAt: 11 },
      { translationId: 'bsb', bookId: 'ZZZ', chapter: 2, addedAt: 12 },
      { translationId: 'bsb', bookId: 'GEN', chapter: 1.5, addedAt: 13 },
      { translationId: 'bsb', bookId: 'EXO', chapter: 3, addedAt: null },
      'not-an-object',
    ],
    queueIndex: 7,
    lastPlayedTranslationId: '  WEB ',
    lastPlayedBookId: 'JHN',
    lastPlayedChapter: 0,
    lastPosition: -5,
  },
  version: 0,
});

const mmkv = mockMmkvStorage(mock, { 'audio-storage': MALFORMED_SNAPSHOT });

// tsx compiles this file to CJS, so the module under test is loaded in a
// `before` hook rather than with a top-level await.
let useAudioStore: (typeof import('./audioStore'))['useAudioStore'];

before(async () => {
  ({ useAudioStore } = await import('./audioStore'));
});

type PersistedSnapshot = {
  state: Record<string, unknown>;
  version: number;
};

const readPersisted = (): PersistedSnapshot =>
  JSON.parse(mmkv.store.get('audio-storage') ?? 'null') as PersistedSnapshot;

const writePersisted = (state: Record<string, unknown>, version = 0) => {
  mmkv.store.set('audio-storage', JSON.stringify({ state, version }));
};

/**
 * Restores the pristine initial state and drops both the persisted snapshot and
 * the store's private "already saved this" cache (removeItem clears it), so each
 * test starts from a store that will genuinely write on its next change.
 */
const resetStore = () => {
  useAudioStore.setState(useAudioStore.getInitialState(), true);
  useAudioStore.persist.clearStorage();
  mmkv.store.clear();
};

const actions = () => useAudioStore.getState();

// ---------------------------------------------------------------------------
// Hydration and the custom persist storage
// ---------------------------------------------------------------------------

test('hydration replaces out-of-range persisted settings with their defaults', () => {
  const state = useAudioStore.getState();

  assert.deepEqual(
    {
      playbackRate: state.playbackRate,
      autoAdvanceChapter: state.autoAdvanceChapter,
      repeatMode: state.repeatMode,
      sleepTimerMinutes: state.sleepTimerMinutes,
      backgroundMusicChoice: state.backgroundMusicChoice,
    },
    {
      playbackRate: 1.0,
      autoAdvanceChapter: true,
      repeatMode: 'off',
      sleepTimerMinutes: null,
      backgroundMusicChoice: 'off',
    }
  );
});

test('hydration keeps only well-formed queue entries and rebuilds their ids', () => {
  assert.deepEqual(useAudioStore.getState().queue, [
    { id: 'bsb:GEN:1', translationId: 'bsb', bookId: 'GEN', chapter: 1, addedAt: 10 },
  ]);
});

test('hydration clamps a queue index that points past the sanitised queue', () => {
  assert.equal(useAudioStore.getState().queueIndex, 0);
});

test('hydration normalises the last played translation id and drops an impossible chapter', () => {
  const state = useAudioStore.getState();

  assert.deepEqual(
    {
      lastPlayedTranslationId: state.lastPlayedTranslationId,
      lastPlayedBookId: state.lastPlayedBookId,
      lastPlayedChapter: state.lastPlayedChapter,
      lastPosition: state.lastPosition,
    },
    {
      lastPlayedTranslationId: 'web',
      lastPlayedBookId: 'JHN',
      lastPlayedChapter: null,
      lastPosition: 0,
    }
  );
});

test('hydration leaves the non-persisted playback fields at their initial values', () => {
  const state = useAudioStore.getState();

  assert.deepEqual(
    {
      status: state.status,
      currentBookId: state.currentBookId,
      currentChapter: state.currentChapter,
      currentPosition: state.currentPosition,
      duration: state.duration,
      showPlayer: state.showPlayer,
      playbackSequence: state.playbackSequence,
      audioReturnTarget: state.audioReturnTarget,
      sleepTimerEndTime: state.sleepTimerEndTime,
    },
    {
      status: 'idle',
      currentBookId: null,
      currentChapter: null,
      currentPosition: 0,
      duration: 0,
      showPlayer: false,
      playbackSequence: [],
      audioReturnTarget: null,
      sleepTimerEndTime: null,
    }
  );
});

test('rehydrating a valid snapshot restores every persisted field', async () => {
  resetStore();
  writePersisted({
    playbackRate: 1.5,
    autoAdvanceChapter: false,
    repeatMode: 'book',
    sleepTimerMinutes: 30,
    backgroundMusicChoice: 'harp',
    queue: [
      { id: 'ignored', translationId: 'bsb', bookId: 'PSA', chapter: 23, addedAt: 5 },
      { id: 'ignored', translationId: 'web', bookId: 'PSA', chapter: 24, addedAt: 6 },
    ],
    queueIndex: 1,
    lastPlayedTranslationId: 'bsb',
    lastPlayedBookId: 'PSA',
    lastPlayedChapter: 23,
    lastPosition: 12000,
  });

  await useAudioStore.persist.rehydrate();
  const state = useAudioStore.getState();

  assert.deepEqual(
    {
      playbackRate: state.playbackRate,
      autoAdvanceChapter: state.autoAdvanceChapter,
      repeatMode: state.repeatMode,
      sleepTimerMinutes: state.sleepTimerMinutes,
      backgroundMusicChoice: state.backgroundMusicChoice,
      queueIndex: state.queueIndex,
      lastPlayedChapter: state.lastPlayedChapter,
      lastPosition: state.lastPosition,
    },
    {
      playbackRate: 1.5,
      autoAdvanceChapter: false,
      repeatMode: 'book',
      sleepTimerMinutes: 30,
      backgroundMusicChoice: 'harp',
      queueIndex: 1,
      lastPlayedChapter: 23,
      lastPosition: 12000,
    }
  );
  assert.deepEqual(
    state.queue.map((entry) => entry.id),
    ['bsb:PSA:23', 'web:PSA:24']
  );
});

test('rehydrating keeps live playback state that was never persisted', async () => {
  resetStore();
  actions().setCurrentTrack('bsb', 'GEN', 1);
  actions().setStatus('playing');
  writePersisted({ playbackRate: 1.25 });

  await useAudioStore.persist.rehydrate();
  const state = useAudioStore.getState();

  assert.equal(state.status, 'playing');
  assert.equal(state.currentBookId, 'GEN');
  assert.equal(state.playbackRate, 1.25);
});

test('rehydrating with no stored snapshot falls back to the default settings', async () => {
  resetStore();
  actions().setPlaybackRate(2.0);
  actions().setRepeatMode('chapter');
  mmkv.store.delete('audio-storage');

  await useAudioStore.persist.rehydrate();

  assert.equal(useAudioStore.getState().playbackRate, 1.0);
  assert.equal(useAudioStore.getState().repeatMode, 'off');
});

test('hydration does not write the sanitised snapshot back over the stored one', async () => {
  resetStore();
  writePersisted({ playbackRate: 99 });

  await useAudioStore.persist.rehydrate();

  assert.equal(useAudioStore.getState().playbackRate, 1.0);
  assert.equal(readPersisted().state.playbackRate, 99);
});

test('an action after hydration overwrites the malformed stored snapshot', async () => {
  resetStore();
  writePersisted({ playbackRate: 99 });
  await useAudioStore.persist.rehydrate();

  actions().setPlaybackRate(1.75);

  assert.equal(readPersisted().state.playbackRate, 1.75);
});

test('clearing the persisted storage removes the stored snapshot', () => {
  resetStore();
  actions().setPlaybackRate(1.25);
  assert.ok(mmkv.store.has('audio-storage'));

  useAudioStore.persist.clearStorage();

  assert.equal(mmkv.store.has('audio-storage'), false);
});

test('a change confined to non-persisted fields never reaches storage', () => {
  resetStore();
  actions().setPlaybackRate(1.5);
  mmkv.store.set('audio-storage', 'untouched-by-the-dedupe');

  actions().setPosition(1200);
  actions().setDuration(600000);
  actions().setStatus('playing');
  actions().setShowPlayer(true);

  assert.equal(useAudioStore.getState().currentPosition, 1200);
  assert.equal(mmkv.store.get('audio-storage'), 'untouched-by-the-dedupe');
});

test('a resume checkpoint past the 5s hysteresis is written to storage', () => {
  resetStore();
  actions().setPlaybackRate(1.5);
  mmkv.store.set('audio-storage', 'untouched-by-the-dedupe');

  actions().setPosition(9000);

  assert.equal(readPersisted().state.lastPosition, 9000);
});

test('the persisted snapshot carries only the settings and resume fields', () => {
  resetStore();
  actions().setCurrentTrack('bsb', 'GEN', 3);
  actions().setStatus('playing');
  actions().setDuration(1000);
  actions().setShowPlayer(true);
  actions().setPlaybackSequence([{ bookId: 'GEN', chapter: 3 }]);

  assert.deepEqual(Object.keys(readPersisted().state).sort(), [
    'autoAdvanceChapter',
    'backgroundMusicChoice',
    'lastPlayedBookId',
    'lastPlayedChapter',
    'lastPlayedTranslationId',
    'lastPosition',
    'playbackRate',
    'queue',
    'queueIndex',
    'repeatMode',
    'sleepTimerMinutes',
  ]);
});

// ---------------------------------------------------------------------------
// Playback state actions
// ---------------------------------------------------------------------------

test('setStatus to error surfaces a playback error message', () => {
  resetStore();

  actions().setStatus('error');

  assert.equal(useAudioStore.getState().status, 'error');
  assert.equal(useAudioStore.getState().error, 'Playback error');
});

test('setStatus away from error clears the error message', () => {
  resetStore();
  actions().setStatus('error');

  actions().setStatus('playing');

  assert.equal(useAudioStore.getState().error, null);
});

test('setStatus does not notify subscribers when nothing changes', () => {
  resetStore();
  let notifications = 0;
  const unsubscribe = useAudioStore.subscribe(() => {
    notifications += 1;
  });

  actions().setStatus('idle');
  assert.equal(notifications, 0);

  actions().setStatus('loading');
  unsubscribe();

  assert.equal(notifications, 1);
});

test('setCurrentTrack records the track as both current and last played', () => {
  resetStore();
  actions().setPosition(30000);
  actions().setDuration(600000);

  actions().setCurrentTrack('web', 'JHN', 3);
  const state = useAudioStore.getState();

  assert.deepEqual(
    {
      currentTranslationId: state.currentTranslationId,
      currentBookId: state.currentBookId,
      currentChapter: state.currentChapter,
      currentPosition: state.currentPosition,
      duration: state.duration,
      lastPlayedTranslationId: state.lastPlayedTranslationId,
      lastPlayedBookId: state.lastPlayedBookId,
      lastPlayedChapter: state.lastPlayedChapter,
      lastPosition: state.lastPosition,
    },
    {
      currentTranslationId: 'web',
      currentBookId: 'JHN',
      currentChapter: 3,
      currentPosition: 0,
      duration: 0,
      lastPlayedTranslationId: 'web',
      lastPlayedBookId: 'JHN',
      lastPlayedChapter: 3,
      lastPosition: 0,
    }
  );
});

test('setCurrentTrack accepts a cleared track', () => {
  resetStore();
  actions().setCurrentTrack('bsb', 'GEN', 1);

  actions().setCurrentTrack(null, null, null);

  assert.equal(useAudioStore.getState().currentBookId, null);
  assert.equal(useAudioStore.getState().lastPlayedBookId, null);
});

test('setPosition holds the resume anchor steady inside the 5s hysteresis', () => {
  resetStore();
  actions().setPosition(9000);

  actions().setPosition(11000);

  assert.equal(useAudioStore.getState().currentPosition, 11000);
  assert.equal(useAudioStore.getState().lastPosition, 9000);
});

test('setPosition moves the resume anchor once the position jumps 5s', () => {
  resetStore();
  actions().setPosition(9000);

  actions().setPosition(14000);

  assert.equal(useAudioStore.getState().lastPosition, 14000);
});

test('setPosition back to zero resets the resume anchor', () => {
  resetStore();
  actions().setPosition(9000);

  actions().setPosition(0);

  assert.equal(useAudioStore.getState().lastPosition, 0);
});

test('setPosition does not notify subscribers when the position is unchanged', () => {
  resetStore();
  actions().setPosition(4000);
  let notifications = 0;
  const unsubscribe = useAudioStore.subscribe(() => {
    notifications += 1;
  });

  actions().setPosition(4000);
  unsubscribe();

  assert.equal(notifications, 0);
});

test('setDuration ignores a repeated duration report', () => {
  resetStore();
  actions().setDuration(500);
  let notifications = 0;
  const unsubscribe = useAudioStore.subscribe(() => {
    notifications += 1;
  });

  actions().setDuration(500);
  actions().setDuration(900);
  unsubscribe();

  assert.equal(notifications, 1);
  assert.equal(useAudioStore.getState().duration, 900);
});

test('setError puts the store into the error status', () => {
  resetStore();

  actions().setError('Chapter unavailable');

  assert.equal(useAudioStore.getState().status, 'error');
  assert.equal(useAudioStore.getState().error, 'Chapter unavailable');
});

test('clearing the error returns the store to idle', () => {
  resetStore();
  actions().setError('Chapter unavailable');

  actions().setError(null);

  assert.equal(useAudioStore.getState().status, 'idle');
  assert.equal(useAudioStore.getState().error, null);
});

test('resetPlayback clears the current track but keeps the queue and resume point', () => {
  resetStore();
  actions().addToQueue('bsb', 'GEN', 1);
  actions().setCurrentTrack('bsb', 'GEN', 1);
  actions().setPosition(20000);
  actions().setStatus('playing');
  actions().setAudioReturnTarget({
    translationId: 'bsb',
    bookId: 'GEN',
    chapter: 1,
    preferredMode: 'listen',
  });

  actions().resetPlayback();
  const state = useAudioStore.getState();

  assert.deepEqual(
    {
      status: state.status,
      currentBookId: state.currentBookId,
      currentPosition: state.currentPosition,
      error: state.error,
      audioReturnTarget: state.audioReturnTarget,
    },
    {
      status: 'idle',
      currentBookId: null,
      currentPosition: 0,
      error: null,
      audioReturnTarget: null,
    }
  );
  assert.equal(state.queue.length, 1);
  assert.equal(state.lastPlayedBookId, 'GEN');
  assert.equal(state.lastPosition, 20000);
});

// ---------------------------------------------------------------------------
// Queue management
// ---------------------------------------------------------------------------

test('syncQueueToTrack replaces an unrelated queue with the track being played', (t) => {
  resetStore();
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  actions().addToQueue('bsb', 'PSA', 1);

  actions().syncQueueToTrack('bsb', 'GEN', 1);

  assert.deepEqual(useAudioStore.getState().queue, [
    {
      id: 'bsb:GEN:1',
      translationId: 'bsb',
      bookId: 'GEN',
      chapter: 1,
      addedAt: 1_700_000_000_000,
    },
  ]);
  assert.equal(useAudioStore.getState().queueIndex, 0);
});

test('syncQueueToTrack selects an existing entry instead of dropping the queue', () => {
  resetStore();
  actions().addToQueue('bsb', 'GEN', 1);
  actions().addToQueue('bsb', 'GEN', 2);
  const queueBefore = useAudioStore.getState().queue;

  actions().syncQueueToTrack('bsb', 'GEN', 2);

  assert.equal(useAudioStore.getState().queue, queueBefore);
  assert.equal(useAudioStore.getState().queueIndex, 1);
});

test('addToQueue appends a chapter with a stable track id', (t) => {
  resetStore();
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  actions().addToQueue('web', 'MRK', 4);

  assert.deepEqual(useAudioStore.getState().queue, [
    {
      id: 'web:MRK:4',
      translationId: 'web',
      bookId: 'MRK',
      chapter: 4,
      addedAt: 1_700_000_000_000,
    },
  ]);
});

test('addToQueue ignores a chapter that is already queued', () => {
  resetStore();
  actions().addToQueue('web', 'MRK', 4);

  actions().addToQueue('web', 'MRK', 4);

  assert.equal(useAudioStore.getState().queue.length, 1);
});

test('addToQueue keeps the same chapter of a different translation', () => {
  resetStore();
  actions().addToQueue('web', 'MRK', 4);

  actions().addToQueue('bsb', 'MRK', 4);

  assert.deepEqual(
    useAudioStore.getState().queue.map((entry) => entry.id),
    ['web:MRK:4', 'bsb:MRK:4']
  );
});

test('removeFromQueue keeps the queue index inside the shortened queue', () => {
  resetStore();
  actions().addToQueue('bsb', 'GEN', 1);
  actions().addToQueue('bsb', 'GEN', 2);
  actions().addToQueue('bsb', 'GEN', 3);
  actions().setQueueIndex(2);

  actions().removeFromQueue('bsb:GEN:1');

  assert.deepEqual(
    useAudioStore.getState().queue.map((entry) => entry.id),
    ['bsb:GEN:2', 'bsb:GEN:3']
  );
  assert.equal(useAudioStore.getState().queueIndex, 1);
});

test('removeFromQueue resets the index when the last entry goes', () => {
  resetStore();
  actions().addToQueue('bsb', 'GEN', 1);
  actions().setQueueIndex(0);

  actions().removeFromQueue('bsb:GEN:1');

  assert.deepEqual(useAudioStore.getState().queue, []);
  assert.equal(useAudioStore.getState().queueIndex, 0);
});

test('removeFromQueue leaves the queue alone for an unknown entry id', () => {
  resetStore();
  actions().addToQueue('bsb', 'GEN', 1);

  actions().removeFromQueue('bsb:GEN:99');

  assert.equal(useAudioStore.getState().queue.length, 1);
});

test('clearQueue empties the queue and rewinds the index', () => {
  resetStore();
  actions().addToQueue('bsb', 'GEN', 1);
  actions().addToQueue('bsb', 'GEN', 2);
  actions().setQueueIndex(1);

  actions().clearQueue();

  assert.deepEqual(useAudioStore.getState().queue, []);
  assert.equal(useAudioStore.getState().queueIndex, 0);
});

test('the queue and its index are persisted for the next launch', () => {
  resetStore();
  actions().addToQueue('bsb', 'GEN', 1);
  actions().addToQueue('bsb', 'GEN', 2);
  actions().setQueueIndex(1);

  const persisted = readPersisted().state;

  assert.equal(persisted.queueIndex, 1);
  assert.deepEqual(
    (persisted.queue as { id: string }[]).map((entry) => entry.id),
    ['bsb:GEN:1', 'bsb:GEN:2']
  );
});

// ---------------------------------------------------------------------------
// Playback sequence and return target
// ---------------------------------------------------------------------------

test('setPlaybackSequence pins playback to a plan session', () => {
  resetStore();

  actions().setPlaybackSequence([
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'GEN', chapter: 2 },
  ]);

  assert.deepEqual(useAudioStore.getState().playbackSequence, [
    { bookId: 'GEN', chapter: 1 },
    { bookId: 'GEN', chapter: 2 },
  ]);
});

test('clearPlaybackSequence releases the session pin', () => {
  resetStore();
  actions().setPlaybackSequence([{ bookId: 'GEN', chapter: 1 }]);

  actions().clearPlaybackSequence();

  assert.deepEqual(useAudioStore.getState().playbackSequence, []);
});

test('the playback sequence is never persisted', () => {
  resetStore();
  actions().setPlaybackRate(1.25);
  actions().setPlaybackSequence([{ bookId: 'GEN', chapter: 1 }]);

  assert.equal('playbackSequence' in readPersisted().state, false);
});

test('setAudioReturnTarget remembers where the listener came from', () => {
  resetStore();

  actions().setAudioReturnTarget({
    translationId: 'bsb',
    bookId: 'PSA',
    chapter: 23,
    preferredMode: 'read',
    planId: 'plan-1',
    planDayNumber: 4,
  });

  assert.deepEqual(useAudioStore.getState().audioReturnTarget, {
    translationId: 'bsb',
    bookId: 'PSA',
    chapter: 23,
    preferredMode: 'read',
    planId: 'plan-1',
    planDayNumber: 4,
  });
});

test('clearAudioReturnTarget forgets the return destination', () => {
  resetStore();
  actions().setAudioReturnTarget({
    translationId: 'bsb',
    bookId: 'PSA',
    chapter: 23,
    preferredMode: 'read',
  });

  actions().clearAudioReturnTarget();

  assert.equal(useAudioStore.getState().audioReturnTarget, null);
});

// ---------------------------------------------------------------------------
// Player visibility
// ---------------------------------------------------------------------------

test('setShowPlayer opens the full player', () => {
  resetStore();

  actions().setShowPlayer(true);

  assert.equal(useAudioStore.getState().showPlayer, true);
});

test('togglePlayer flips the player between open and closed', () => {
  resetStore();

  actions().togglePlayer();
  assert.equal(useAudioStore.getState().showPlayer, true);

  actions().togglePlayer();
  assert.equal(useAudioStore.getState().showPlayer, false);
});

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

test('setPlaybackRate persists the chosen speed', () => {
  resetStore();

  actions().setPlaybackRate(1.75);

  assert.equal(useAudioStore.getState().playbackRate, 1.75);
  assert.equal(readPersisted().state.playbackRate, 1.75);
});

test('setAutoAdvanceChapter persists the auto-advance preference', () => {
  resetStore();

  actions().setAutoAdvanceChapter(false);

  assert.equal(useAudioStore.getState().autoAdvanceChapter, false);
  assert.equal(readPersisted().state.autoAdvanceChapter, false);
});

test('setRepeatMode persists the chosen repeat mode', () => {
  resetStore();

  actions().setRepeatMode('book');

  assert.equal(readPersisted().state.repeatMode, 'book');
});

test('cycleRepeatMode walks off, chapter, book and back to off', () => {
  resetStore();
  const seen = [useAudioStore.getState().repeatMode];

  for (let step = 0; step < 3; step += 1) {
    actions().cycleRepeatMode();
    seen.push(useAudioStore.getState().repeatMode);
  }

  assert.deepEqual(seen, ['off', 'chapter', 'book', 'off']);
});

test('setSleepTimer schedules the stop time from now', (t) => {
  resetStore();
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  actions().setSleepTimer(15);

  assert.equal(useAudioStore.getState().sleepTimerMinutes, 15);
  assert.equal(useAudioStore.getState().sleepTimerEndTime, 1_700_000_000_000 + 15 * 60 * 1000);
});

test('setSleepTimer to off removes the scheduled stop time', (t) => {
  resetStore();
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  actions().setSleepTimer(15);

  actions().setSleepTimer(null);

  assert.equal(useAudioStore.getState().sleepTimerEndTime, null);
});

test('the sleep timer end time stays out of storage while the chosen length is saved', (t) => {
  resetStore();
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });

  actions().setSleepTimer(30);
  const persisted = readPersisted().state;

  assert.equal(persisted.sleepTimerMinutes, 30);
  assert.equal('sleepTimerEndTime' in persisted, false);
});

test('clearSleepTimer cancels both the length and the stop time', (t) => {
  resetStore();
  t.mock.timers.enable({ apis: ['Date'], now: 1_700_000_000_000 });
  actions().setSleepTimer(60);

  actions().clearSleepTimer();

  assert.equal(useAudioStore.getState().sleepTimerMinutes, null);
  assert.equal(useAudioStore.getState().sleepTimerEndTime, null);
});

test('setBackgroundMusicChoice persists the chosen bed', () => {
  resetStore();

  actions().setBackgroundMusicChoice('ocean-waves');

  assert.equal(useAudioStore.getState().backgroundMusicChoice, 'ocean-waves');
  assert.equal(readPersisted().state.backgroundMusicChoice, 'ocean-waves');
});
