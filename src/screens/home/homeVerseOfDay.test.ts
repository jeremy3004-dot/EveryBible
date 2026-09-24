import assert from 'node:assert/strict';
import test, { afterEach, mock } from 'node:test';
import type { DailyScripture } from '../../types';
import {
  formatHomeDateLabel,
  getHomeGreetingKey,
  getMillisecondsUntilNextGreetingChange,
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

function refreshHarness(
  initialAppState = 'active',
  msUntilMidnight = 5_000,
  msUntilGreetingChange?: number
) {
  const loads: (VerseOfDayLoadOptions | undefined)[] = [];
  const interactions: { run: () => void; cancelled: boolean }[] = [];
  let appStateListener: ((next: string) => void) | null = null;
  let removed = 0;
  let clockAdvances = 0;
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
    ...(msUntilGreetingChange === undefined
      ? {}
      : { msUntilNextGreetingChange: () => msUntilGreetingChange }),
    onClockAdvance: () => {
      clockAdvances += 1;
    },
  });
  return {
    cleanup,
    loads,
    interactions,
    requestIdRef,
    midnightTimerRef,
    emitAppState: (next: string) => appStateListener?.(next),
    removed: () => removed,
    clockAdvances: () => clockAdvances,
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

test("midnight and each return to the foreground advance Home's clock, not the first load", () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness('active', 5_000);

  h.interactions[0].run();
  assert.equal(h.clockAdvances(), 0);
  h.emitAppState('background');
  h.emitAppState('active');
  assert.equal(h.clockAdvances(), 1, 'the greeting and date must not keep the hour Home opened at');
  mock.timers.tick(5_000);
  assert.equal(h.clockAdvances(), 2, 'the date eyebrow turns over with the verse at midnight');
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

test('the greeting turns over at noon and 17:00 while Home stays open, without reloading the verse', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness('active', 60_000, 2_000);

  mock.timers.tick(1_999);
  assert.equal(h.clockAdvances(), 0);
  mock.timers.tick(1);
  assert.equal(h.clockAdvances(), 1);
  assert.deepEqual(h.loads, [], 'the verse does not change at noon');
  mock.timers.tick(2_000);
  assert.equal(h.clockAdvances(), 2, 'the next boundary is scheduled after each one');
  h.cleanup();
  mock.timers.tick(10_000);
  assert.equal(h.clockAdvances(), 2, 'cleanup stops the greeting timer');
});

test('coming back to the foreground re-arms the greeting timer instead of adding one', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const h = refreshHarness('background', 60_000, 5_000);

  mock.timers.tick(3_000);
  h.emitAppState('active');
  assert.equal(h.clockAdvances(), 1);
  mock.timers.tick(2_000);
  assert.equal(h.clockAdvances(), 1, 'the earlier greeting timer was cleared');
  mock.timers.tick(3_000);
  assert.equal(h.clockAdvances(), 2);
  h.cleanup();
});

test('the greeting is morning before noon, afternoon until 17:00, then evening', () => {
  assert.equal(getHomeGreetingKey(new Date(2026, 8, 17, 0, 0)), 'home.goodMorning');
  assert.equal(getHomeGreetingKey(new Date(2026, 8, 17, 11, 59, 59)), 'home.goodMorning');
  assert.equal(getHomeGreetingKey(new Date(2026, 8, 17, 12, 0)), 'home.goodAfternoon');
  assert.equal(getHomeGreetingKey(new Date(2026, 8, 17, 16, 59, 59)), 'home.goodAfternoon');
  assert.equal(getHomeGreetingKey(new Date(2026, 8, 17, 17, 0)), 'home.goodEvening');
  assert.equal(getHomeGreetingKey(new Date(2026, 8, 17, 23, 59)), 'home.goodEvening');
});

test('the next greeting change is the next of 12:00, 17:00 and midnight', () => {
  const HOUR = 60 * 60 * 1000;
  assert.equal(getMillisecondsUntilNextGreetingChange(new Date(2026, 8, 17, 9, 0)), 3 * HOUR);
  assert.equal(getMillisecondsUntilNextGreetingChange(new Date(2026, 8, 17, 12, 0)), 5 * HOUR);
  assert.equal(getMillisecondsUntilNextGreetingChange(new Date(2026, 8, 17, 16, 59, 59, 500)), 500);
  assert.equal(getMillisecondsUntilNextGreetingChange(new Date(2026, 8, 17, 17, 0)), 7 * HOUR);
  assert.equal(getMillisecondsUntilNextGreetingChange(new Date(2026, 8, 17, 23, 0)), HOUR);
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

// Arabic and Urdu put the Arabic comma (U+060C) after the weekday, which the Latin
// comma trim missed: the release build on iOS showed "الخميس · ، 24 سبتمبر".
test('the Arabic-script comma after the weekday is dropped like any other separator', () => {
  for (const language of ['ar', 'ur']) {
    const label = formatHomeDateLabel(language, SATURDAY);
    assert.match(label, /^[^,،]+ · [^,،]+$/, `${language} should render "weekday · date"`);
  }
});
