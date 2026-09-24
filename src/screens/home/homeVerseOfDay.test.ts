import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import type { DailyScripture } from '../../types';
import {
  formatHomeDateLabel,
  loadVerseOfDay,
  startVerseOfDayRefresh,
  type VerseOfDayLoad,
  type VerseOfDayLoadOptions,
} from './homeVerseOfDay';

mock.method(console, 'error', () => undefined);

afterEach(() => {
  mock.timers.reset();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const scripture = (text: string) => ({ text }) as unknown as DailyScripture;
const BSB = { id: 'bsb', hasText: true, hasAudio: true, audioGranularity: 'chapter' as const };

function home({ withTranslation = true } = {}) {
  const moduleLoads: ReturnType<typeof deferred<void>>[] = [];
  const scriptureRequests: ReturnType<typeof deferred<DailyScripture>>[] = [];
  const scriptureCalls: { translation: unknown; allowInitialization: boolean | undefined }[] = [];
  const state = { scripture: null as DailyScripture | null, loading: false };
  const load: VerseOfDayLoad = {
    requestIdRef: { current: 0 },
    translation: withTranslation ? BSB : undefined,
    remoteAudioAvailable: false,
    loadBibleService: async () => {
      const moduleLoad = deferred<void>();
      moduleLoads.push(moduleLoad);
      await moduleLoad.promise;
      return {
        getDailyScripture: (requested, _audioAvailable, options) => {
          scriptureCalls.push({
            translation: requested,
            allowInitialization: options?.allowInitialization,
          });
          const request = deferred<DailyScripture>();
          scriptureRequests.push(request);
          return request.promise;
        },
      };
    },
    setIsLoadingVerse: (value) => {
      state.loading = value;
    },
    setDailyScripture: (value) => {
      state.scripture = value;
    },
  };
  // Resolve the lazy Bible module for every load started so far, then let the loader reach
  // getDailyScripture (an observable fixture event, per docs/testing.md).
  const settleModuleLoads = async () => {
    const expected = scriptureRequests.length + moduleLoads.length;
    moduleLoads.splice(0).forEach((moduleLoad) => moduleLoad.resolve());
    for (let turn = 0; turn < 10 && scriptureRequests.length < expected; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  return {
    load: (options?: VerseOfDayLoadOptions) => loadVerseOfDay(load, options),
    requestIdRef: load.requestIdRef,
    moduleLoads,
    scriptureRequests,
    scriptureCalls,
    settleModuleLoads,
    state,
  };
}

test('Home loads the selected Bible locally without any network request', async () => {
  const h = home();
  const loading = h.load();
  await h.settleModuleLoads();

  assert.equal(h.scriptureRequests.length, 1);
  assert.deepEqual(h.scriptureCalls, [{ translation: BSB, allowInitialization: true }]);
  const local = scripture('Local Scripture');
  h.scriptureRequests[0].resolve(local);
  await loading;
  assert.equal(h.state.scripture, local);
  assert.equal(h.state.loading, false);
});

test('a slower Bible lookup cannot overwrite Scripture from the newer translation', async () => {
  const h = home();
  const first = h.load();
  await h.settleModuleLoads();
  const second = h.load();
  await h.settleModuleLoads();
  const newest = scripture('new verse');
  h.scriptureRequests[1].resolve(newest);
  await second;
  h.scriptureRequests[0].resolve(scripture('old verse'));
  await first;

  assert.equal(h.state.scripture, newest);
});

test('an older failure cannot hide the spinner or clear the newer pending load', async () => {
  const h = home();
  const first = h.load();
  await h.settleModuleLoads();
  const second = h.load();
  await h.settleModuleLoads();
  h.scriptureRequests[0].reject(new Error('old request failed'));
  await first;
  assert.equal(h.state.loading, true);

  const newest = scripture('new verse');
  h.scriptureRequests[1].resolve(newest);
  await second;
  assert.equal(h.state.scripture, newest);
  assert.equal(h.state.loading, false);
});

test('a silent foreground refresh settles an initial loading spinner', async () => {
  const h = home();
  const first = h.load();
  await h.settleModuleLoads();
  const second = h.load({ silent: true });
  await h.settleModuleLoads();
  h.scriptureRequests[1].resolve(scripture('new verse'));
  await second;
  assert.equal(h.state.loading, false);
  h.scriptureRequests[0].resolve(scripture('old verse'));
  await first;
  assert.equal(h.state.loading, false);
});

test('a load superseded while the Bible module loads starts no database work', async () => {
  const h = home();
  const first = h.load();
  h.requestIdRef.current += 1;
  await h.settleModuleLoads();
  const started = h.scriptureRequests.length;
  h.scriptureRequests.forEach((request) => request.resolve(scripture('stale')));
  await first;

  assert.equal(started, 0);
  assert.equal(h.state.scripture, null);
});

test('Home settles safely when no translation is available', async () => {
  const h = home({ withTranslation: false });
  await h.load();

  assert.equal(h.moduleLoads.length, 0);
  assert.equal(h.state.scripture, null);
  assert.equal(h.state.loading, false);
});

// ---------------------------------------------------------------------------
// Foreground and midnight refresh
// ---------------------------------------------------------------------------

function refreshHarness(initialAppState = 'active', msUntilMidnight = 5_000) {
  const loads: (VerseOfDayLoadOptions | undefined)[] = [];
  const interactions: { run: () => void; cancelled: boolean }[] = [];
  let appStateListener: ((next: string) => void) | null = null;
  let removed = 0;
  const requestIdRef = { current: 0 };
  const midnightTimerRef: { current: ReturnType<typeof setTimeout> | null } = { current: null };
  const cleanup = startVerseOfDayRefresh({
    load: async (options) => {
      loads.push(options);
    },
    requestIdRef,
    appStateRef: { current: initialAppState },
    midnightTimerRef,
    addAppStateListener: (listener) => {
      appStateListener = listener;
      return {
        remove: () => {
          removed += 1;
        },
      };
    },
    runAfterInteractions: (run) => {
      const task = { run, cancelled: false };
      interactions.push(task);
      return {
        cancel: () => {
          task.cancelled = true;
        },
      };
    },
    msUntilNextLocalMidnight: () => msUntilMidnight,
  });
  return {
    cleanup,
    loads,
    interactions,
    requestIdRef,
    midnightTimerRef,
    emitAppState: (next: string) => appStateListener?.(next),
    removed: () => removed,
  };
}

test('the first verse load waits for interactions and shows the spinner', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness();

  assert.deepEqual(h.loads, []);
  h.interactions[0].run();
  assert.deepEqual(h.loads, [undefined]);
  h.cleanup();
});

test('returning to the foreground refreshes the verse silently; staying active does not', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness('active');

  h.emitAppState('active');
  assert.deepEqual(h.loads, []);
  h.emitAppState('background');
  h.emitAppState('active');
  assert.deepEqual(h.loads, [{ silent: true }]);
  h.emitAppState('inactive');
  h.emitAppState('active');
  assert.deepEqual(h.loads, [{ silent: true }, { silent: true }]);
  h.cleanup();
});

test('each local midnight refreshes the verse silently and schedules the next one', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness('active', 5_000);

  mock.timers.tick(4_999);
  assert.deepEqual(h.loads, []);
  mock.timers.tick(1);
  assert.deepEqual(h.loads, [{ silent: true }]);
  mock.timers.tick(5_000);
  assert.deepEqual(h.loads, [{ silent: true }, { silent: true }]);
  h.cleanup();
});

test('coming back to the foreground re-arms the midnight timer instead of adding one', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness('background', 5_000);

  mock.timers.tick(3_000);
  h.emitAppState('active');
  assert.deepEqual(h.loads, [{ silent: true }]);
  mock.timers.tick(2_000);
  assert.deepEqual(h.loads, [{ silent: true }], 'the earlier timer was cleared');
  mock.timers.tick(3_000);
  assert.deepEqual(h.loads, [{ silent: true }, { silent: true }]);
  h.cleanup();
});

test('cleanup stops the timer, the listener and the pending load', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness('active', 5_000);

  h.cleanup();

  assert.equal(h.interactions[0].cancelled, true);
  assert.equal(h.removed(), 1);
  assert.equal(h.requestIdRef.current, 1, 'an in-flight load is made stale');
  assert.equal(h.midnightTimerRef.current, null);
  mock.timers.tick(10_000);
  assert.deepEqual(h.loads, []);
});

// ---------------------------------------------------------------------------
// Date eyebrow
// ---------------------------------------------------------------------------

const SATURDAY = new Date(2026, 8, 5, 12);

test('the date follows the interface language, not the device locale', () => {
  assert.equal(formatHomeDateLabel('fr', SATURDAY), 'samedi · 5 septembre');
  assert.equal(formatHomeDateLabel('en', SATURDAY), 'Saturday · September 5');
});

test('the weekday and date are joined by the EL separator, never a comma, without a year', () => {
  for (const language of ['en', 'fr', 'de', 'es']) {
    const label = formatHomeDateLabel(language, SATURDAY);
    assert.match(label, /^[^,]+ · [^,]+$/, `${language} should render "weekday · date"`);
    assert.equal(/\d{4}/.test(label), false, `${language} should not carry the year`);
  }
});
