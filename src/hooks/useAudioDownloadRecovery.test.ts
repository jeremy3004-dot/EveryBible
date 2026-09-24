import assert from 'node:assert/strict';
import test, { afterEach, before, beforeEach, mock } from 'node:test';
import { mockModule, mockReactNative, sourcePath } from '../testing/mockModules';
import { createReactHookRuntime } from '../testing/reactHookRuntime';

const runtime = createReactHookRuntime();
mockModule(mock, 'react', runtime.react);
const rn = mockReactNative(mock, { os: 'ios' });

let reattachCalls = 0;
let reattachFailure: Error | null = null;
mockModule(mock, sourcePath('stores/bibleStore.ts'), {
  useBibleStore: {
    getState: () => ({
      reattachAudioDownloads: async () => {
        reattachCalls += 1;
        if (reattachFailure) throw reattachFailure;
      },
    }),
  },
});
const loggedErrors: unknown[][] = [];
mock.method(console, 'error', (...args: unknown[]) => loggedErrors.push(args));

type Hook = typeof import('./useAudioDownloadRecovery').useAudioDownloadRecovery;
let useAudioDownloadRecovery: Hook;

before(async () => {
  ({ useAudioDownloadRecovery } = await import('./useAudioDownloadRecovery'));
  await import('../stores/bibleStore');
});

const scheduled: { run: () => void; cancelled: boolean }[] = [];
const schedule = (task: () => void) => {
  const entry = { run: task, cancelled: false };
  scheduled.push(entry);
  return () => {
    entry.cancelled = true;
  };
};

beforeEach(() => {
  rn.AppState.currentState = 'active';
  scheduled.length = 0;
  reattachCalls = 0;
  reattachFailure = null;
  loggedErrors.length = 0;
});

afterEach(() => {
  runtime.unmountAll();
});

const settle = async () => {
  for (let turn = 0; turn < 5; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};

function mountApp(enabled = true) {
  const view = runtime.mount(useAudioDownloadRecovery, enabled, schedule);
  view.flushEffects();
  return view;
}

test('once the app is ready, downloads are reattached through the scheduler', async () => {
  mountApp();
  assert.equal(scheduled.length, 1);
  assert.equal(reattachCalls, 0, 'nothing runs until the scheduled slot');

  scheduled[0].run();
  await settle();
  assert.equal(reattachCalls, 1);
});

test('nothing is scheduled before the app is ready', () => {
  mountApp(false);
  rn.AppState.emit('background');
  rn.AppState.emit('active');

  assert.equal(scheduled.length, 0);
});

test('returning to the foreground reattaches again and supersedes a pending run', async () => {
  mountApp();
  rn.AppState.emit('active');
  assert.equal(scheduled.length, 1, 'staying active is not a foreground return');

  rn.AppState.emit('background');
  rn.AppState.emit('active');
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].cancelled, true);

  scheduled[1].run();
  await settle();
  assert.equal(reattachCalls, 1);
});

test('unmounting cancels a pending run and stops listening for the foreground', () => {
  const view = mountApp();
  view.unmount();

  assert.equal(scheduled[0].cancelled, true);
  rn.AppState.emit('background');
  rn.AppState.emit('active');
  assert.equal(scheduled.length, 1);
});

test('a failed reattach is logged rather than thrown', async () => {
  reattachFailure = new Error('downloader unavailable');
  mountApp();

  scheduled[0].run();
  await settle();

  assert.equal(reattachCalls, 1);
  assert.equal(loggedErrors.length, 1);
});
