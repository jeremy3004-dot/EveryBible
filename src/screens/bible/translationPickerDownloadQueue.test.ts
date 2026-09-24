import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTranslationPickerDownloadQueue,
  type TranslationPickerDownloadState,
} from './translationPickerDownloadQueue';

interface FakeTranslation {
  id: string;
}

type DownloadResult = 'installed' | 'cancelled';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness() {
  const downloads = new Map<string, ReturnType<typeof deferred<DownloadResult>>>();
  const events: string[] = [];
  const failures: Array<{ id: string; error: unknown }> = [];
  const states: TranslationPickerDownloadState[] = [];
  let downloadStarted = deferred<string>();

  const queue = createTranslationPickerDownloadQueue<FakeTranslation>(() => ({
    download: (translation) => {
      events.push(`start:${translation.id}`);
      const pending = deferred<DownloadResult>();
      downloads.set(translation.id, pending);
      downloadStarted.resolve(translation.id);
      return pending.promise.finally(() => events.push(`settle:${translation.id}`));
    },
    activate: async (translation) => {
      events.push(`activate:${translation.id}`);
    },
    onDownloadFailed: (translation, error) => {
      failures.push({ id: translation.id, error });
    },
    onStateChange: (state) => states.push(state),
  }));

  return {
    queue,
    events,
    failures,
    states,
    lastState: () => states[states.length - 1],
    /** Waits until the next download starts, so a test never races the queue. */
    nextDownloadStart: () => {
      const started = downloadStarted.promise;
      return started.then((id) => {
        downloadStarted = deferred<string>();
        return id;
      });
    },
    settle: (id: string, result: DownloadResult) => downloads.get(id)!.resolve(result),
    fail: (id: string, error: unknown) => downloads.get(id)!.reject(error),
  };
}

test('a single download activates its Bible once installed', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  assert.deepEqual(harness.lastState(), { downloadingId: 'kjv', queuedId: null });

  harness.settle('kjv', 'installed');
  await run;

  assert.deepEqual(harness.events, ['start:kjv', 'settle:kjv', 'activate:kjv']);
  assert.deepEqual(harness.lastState(), { downloadingId: null, queuedId: null });
});

test('a second Bible chosen during a download waits its turn instead of downloading beside it', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  await harness.queue.request({ id: 'web' });

  assert.deepEqual(harness.events, ['start:kjv']);
  assert.deepEqual(harness.lastState(), { downloadingId: 'kjv', queuedId: 'web' });

  harness.settle('kjv', 'installed');
  await harness.nextDownloadStart();
  assert.deepEqual(harness.lastState(), { downloadingId: 'web', queuedId: null });

  harness.settle('web', 'installed');
  await run;

  // The first Bible stays installed but only the reader's latest choice is opened.
  assert.deepEqual(harness.events, [
    'start:kjv',
    'settle:kjv',
    'start:web',
    'settle:web',
    'activate:web',
  ]);
});

test('a newer choice replaces the one waiting in line', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  await harness.queue.request({ id: 'web' });
  await harness.queue.request({ id: 'asv' });
  assert.deepEqual(harness.lastState(), { downloadingId: 'kjv', queuedId: 'asv' });

  harness.settle('kjv', 'installed');
  await harness.nextDownloadStart();
  harness.settle('asv', 'installed');
  await run;

  assert.deepEqual(harness.events, [
    'start:kjv',
    'settle:kjv',
    'start:asv',
    'settle:asv',
    'activate:asv',
  ]);
});

test('choosing the running Bible again drops the waiting choice', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  await harness.queue.request({ id: 'web' });
  await harness.queue.request({ id: 'kjv' });
  assert.deepEqual(harness.lastState(), { downloadingId: 'kjv', queuedId: null });

  harness.settle('kjv', 'installed');
  await run;

  assert.deepEqual(harness.events, ['start:kjv', 'settle:kjv', 'activate:kjv']);
});

test('cancelling the waiting Bible removes it from the line', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  await harness.queue.request({ id: 'web' });
  harness.queue.cancelQueued('web');
  assert.deepEqual(harness.lastState(), { downloadingId: 'kjv', queuedId: null });

  harness.settle('kjv', 'installed');
  await run;

  assert.deepEqual(harness.events, ['start:kjv', 'settle:kjv', 'activate:kjv']);
});

test('cancelling the running download starts the waiting one', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  await harness.queue.request({ id: 'web' });

  harness.settle('kjv', 'cancelled');
  await harness.nextDownloadStart();
  harness.settle('web', 'installed');
  await run;

  assert.deepEqual(harness.events, [
    'start:kjv',
    'settle:kjv',
    'start:web',
    'settle:web',
    'activate:web',
  ]);
});

test('a cancelled download with nothing waiting opens nothing', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  harness.settle('kjv', 'cancelled');
  await run;

  assert.deepEqual(harness.events, ['start:kjv', 'settle:kjv']);
  assert.deepEqual(harness.failures, []);
});

test('a failed download is reported and can be requested again', async () => {
  const harness = createHarness();
  const error = new Error('offline');

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  harness.fail('kjv', error);
  await run;

  assert.deepEqual(harness.failures, [{ id: 'kjv', error }]);
  assert.deepEqual(harness.lastState(), { downloadingId: null, queuedId: null });

  const retry = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  harness.settle('kjv', 'installed');
  await retry;

  assert.deepEqual(harness.events, [
    'start:kjv',
    'settle:kjv',
    'start:kjv',
    'settle:kjv',
    'activate:kjv',
  ]);
});

test('a failed download superseded by a waiting choice moves on without an error', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  await harness.queue.request({ id: 'web' });
  harness.fail('kjv', new Error('offline'));
  await harness.nextDownloadStart();
  harness.settle('web', 'installed');
  await run;

  assert.deepEqual(harness.failures, []);
  assert.deepEqual(harness.events.at(-1), 'activate:web');
});

test('choosing a ready Bible mid-download drops the waiting choice and does not open the download', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  await harness.queue.request({ id: 'web' });
  harness.queue.supersede();
  assert.deepEqual(harness.lastState(), { downloadingId: 'kjv', queuedId: null });

  harness.settle('kjv', 'installed');
  await run;

  assert.deepEqual(harness.events, ['start:kjv', 'settle:kjv']);
});

test('a superseded download that fails stays silent', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  harness.queue.supersede();
  harness.fail('kjv', new Error('offline'));
  await run;

  assert.deepEqual(harness.failures, []);
});

test('a download chosen after a supersede still opens when it finishes', async () => {
  const harness = createHarness();

  const run = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  harness.queue.supersede();
  await harness.queue.request({ id: 'web' });

  harness.settle('kjv', 'installed');
  await harness.nextDownloadStart();
  harness.settle('web', 'installed');
  await run;

  assert.deepEqual(harness.events.at(-1), 'activate:web');
  assert.equal(harness.events.includes('activate:kjv'), false);
});

test('the picker stays usable after a download opens its Bible', async () => {
  const harness = createHarness();

  const first = harness.queue.request({ id: 'kjv' });
  await harness.nextDownloadStart();
  harness.settle('kjv', 'installed');
  await first;

  const second = harness.queue.request({ id: 'web' });
  await harness.nextDownloadStart();
  harness.settle('web', 'installed');
  await second;

  assert.deepEqual(
    harness.events.filter((event) => event.startsWith('activate:')),
    ['activate:kjv', 'activate:web']
  );
});
