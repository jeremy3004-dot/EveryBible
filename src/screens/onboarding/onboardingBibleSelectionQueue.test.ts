import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOnboardingBibleSelectionQueue,
  type OnboardingBibleSelectionState,
} from './onboardingBibleSelectionQueue';

interface FakeTranslation {
  id: string;
  installed?: boolean;
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
  const completed: FakeTranslation[] = [];
  const failures: Array<{ id: string; error: unknown }> = [];
  const completeFailures: Array<{ translation: FakeTranslation; error: unknown }> = [];
  const states: OnboardingBibleSelectionState[] = [];
  let downloadStarted = deferred<string>();

  const queue = createOnboardingBibleSelectionQueue<FakeTranslation>(() => ({
    download: (translation) => {
      events.push(`start:${translation.id}`);
      const pending = deferred<DownloadResult>();
      downloads.set(translation.id, pending);
      downloadStarted.resolve(translation.id);
      return pending.promise.finally(() => events.push(`settle:${translation.id}`));
    },
    getInstalled: (translation) => ({ ...translation, installed: true }),
    complete: async (translation) => {
      events.push(`complete:${translation.id}`);
      completed.push(translation);
    },
    onDownloadFailed: (translation, error) => {
      failures.push({ id: translation.id, error });
    },
    onCompleteFailed: (translation, error) => {
      completeFailures.push({ translation, error });
    },
    onStateChange: (state) => states.push(state),
  }));

  return {
    queue,
    events,
    completed,
    failures,
    completeFailures,
    states,
    /** Waits until the next download starts, so a test never races the queue. */
    nextDownloadStart: () => {
      const started = downloadStarted.promise;
      return started.then((id) => {
        downloadStarted = deferred<string>();
        return id;
      });
    },
    finish: (id: string, result: DownloadResult = 'installed') =>
      downloads.get(id)?.resolve(result),
    fail: (id: string, error: unknown) => downloads.get(id)?.reject(error),
  };
}

test('a Bible tapped during a download waits its turn, then onboarding finishes once with it', async () => {
  const harness = createHarness();

  const first = harness.queue.chooseDownload({ id: 'hincv' });
  await harness.nextDownloadStart();
  const second = harness.queue.chooseDownload({ id: 'npiulb' });

  assert.deepEqual(harness.events, ['start:hincv'], 'the second download must not start yet');
  assert.deepEqual(harness.states.at(-1), { downloadingId: 'hincv', queuedId: 'npiulb' });

  harness.finish('hincv');
  assert.equal(await harness.nextDownloadStart(), 'npiulb');
  harness.finish('npiulb');
  await Promise.all([first, second]);

  assert.deepEqual(harness.events, [
    'start:hincv',
    'settle:hincv',
    'start:npiulb',
    'settle:npiulb',
    'complete:npiulb',
  ]);
  assert.deepEqual(harness.completed, [{ id: 'npiulb', installed: true }]);
  assert.deepEqual(harness.states.at(-1), { downloadingId: null, queuedId: null });
});

test('a download with nothing queued behind it finishes onboarding with the installed Bible', async () => {
  const harness = createHarness();

  const selection = harness.queue.chooseDownload({ id: 'hincv' });
  await harness.nextDownloadStart();
  assert.deepEqual(harness.states.at(-1), { downloadingId: 'hincv', queuedId: null });
  harness.finish('hincv');
  await selection;

  assert.deepEqual(harness.completed, [{ id: 'hincv', installed: true }]);
});

test('only the latest waiting choice is kept', async () => {
  const harness = createHarness();

  const selections = [harness.queue.chooseDownload({ id: 'hincv' })];
  await harness.nextDownloadStart();
  selections.push(harness.queue.chooseDownload({ id: 'npiulb' }));
  selections.push(harness.queue.chooseDownload({ id: 'urdirv' }));
  assert.deepEqual(harness.states.at(-1), { downloadingId: 'hincv', queuedId: 'urdirv' });

  harness.finish('hincv');
  assert.equal(await harness.nextDownloadStart(), 'urdirv');
  harness.finish('urdirv');
  await Promise.all(selections);

  assert.deepEqual(
    harness.events.filter((event) => event.startsWith('start:')),
    ['start:hincv', 'start:urdirv']
  );
  assert.deepEqual(
    harness.completed.map((translation) => translation.id),
    ['urdirv']
  );
});

test('tapping the downloading Bible again drops the waiting choice', async () => {
  const harness = createHarness();

  const selections = [harness.queue.chooseDownload({ id: 'hincv' })];
  await harness.nextDownloadStart();
  selections.push(harness.queue.chooseDownload({ id: 'npiulb' }));
  selections.push(harness.queue.chooseDownload({ id: 'hincv' }));
  assert.deepEqual(harness.states.at(-1), { downloadingId: 'hincv', queuedId: null });

  harness.finish('hincv');
  await Promise.all(selections);

  assert.deepEqual(
    harness.completed.map((translation) => translation.id),
    ['hincv']
  );
  assert.equal(
    harness.events.includes('start:npiulb'),
    false,
    'the dropped choice must never download'
  );
});

test('choosing a Bible that is already on the device finishes at once, and the running download cannot finish onboarding again', async () => {
  const harness = createHarness();

  const download = harness.queue.chooseDownload({ id: 'hincv' });
  await harness.nextDownloadStart();
  harness.queue.chooseDownload({ id: 'npiulb' });
  await harness.queue.chooseReady({ id: 'bsb' });

  assert.deepEqual(
    harness.completed.map((translation) => translation.id),
    ['bsb']
  );

  harness.finish('hincv');
  await download;

  assert.deepEqual(
    harness.completed.map((translation) => translation.id),
    ['bsb']
  );
  assert.equal(harness.events.includes('start:npiulb'), false);

  await harness.queue.chooseDownload({ id: 'urdirv' });
  await harness.queue.chooseReady({ id: 'web' });
  assert.deepEqual(
    harness.completed.map((translation) => translation.id),
    ['bsb'],
    'once onboarding has finished, later taps are ignored'
  );
});

test('a failed download reports the failure once and leaves onboarding open for a retry', async () => {
  const harness = createHarness();
  const error = new Error('Network request failed');

  const selection = harness.queue.chooseDownload({ id: 'hincv' });
  await harness.nextDownloadStart();
  harness.fail('hincv', error);
  await selection;

  assert.deepEqual(harness.failures, [{ id: 'hincv', error }]);
  assert.deepEqual(harness.completed, []);
  assert.deepEqual(harness.states.at(-1), { downloadingId: null, queuedId: null });

  const retry = harness.queue.chooseDownload({ id: 'hincv' });
  await harness.nextDownloadStart();
  harness.finish('hincv');
  await retry;

  assert.deepEqual(harness.completed, [{ id: 'hincv', installed: true }]);
});

test('a failed download with a choice waiting behind it moves on without reporting the failure', async () => {
  const harness = createHarness();

  const selections = [harness.queue.chooseDownload({ id: 'hincv' })];
  await harness.nextDownloadStart();
  selections.push(harness.queue.chooseDownload({ id: 'npiulb' }));
  harness.fail('hincv', new Error('Network request failed'));
  assert.equal(await harness.nextDownloadStart(), 'npiulb');
  harness.finish('npiulb');
  await Promise.all(selections);

  assert.deepEqual(harness.failures, []);
  assert.deepEqual(
    harness.completed.map((translation) => translation.id),
    ['npiulb']
  );
});

test('a cancelled download does not finish onboarding', async () => {
  const harness = createHarness();

  const selection = harness.queue.chooseDownload({ id: 'hincv' });
  await harness.nextDownloadStart();
  harness.finish('hincv', 'cancelled');
  await selection;

  assert.deepEqual(harness.completed, []);
  assert.deepEqual(harness.failures, []);
  assert.deepEqual(harness.states.at(-1), { downloadingId: null, queuedId: null });
});

function createFailingCompletionQueue() {
  let attempts = 0;
  const completeFailures: Array<{ translation: FakeTranslation; error: unknown }> = [];
  const downloadFailures: string[] = [];
  const queue = createOnboardingBibleSelectionQueue<FakeTranslation>(() => ({
    download: async () => 'installed',
    getInstalled: (translation) => ({ ...translation, installed: true }),
    complete: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('locale chunk failed');
      }
    },
    onDownloadFailed: (translation) => {
      downloadFailures.push(translation.id);
    },
    onCompleteFailed: (translation, error) => {
      completeFailures.push({ translation, error });
    },
    onStateChange: () => {},
  }));
  return { queue, completeFailures, downloadFailures, attempts: () => attempts };
}

test('if finishing onboarding throws, the failure is reported and the user can still choose again', async () => {
  const harness = createFailingCompletionQueue();

  await harness.queue.chooseReady({ id: 'bsb' });

  assert.equal(harness.completeFailures.length, 1);
  assert.deepEqual(harness.completeFailures[0]?.translation, { id: 'bsb' });
  assert.match(String(harness.completeFailures[0]?.error), /locale chunk failed/);

  await harness.queue.chooseReady({ id: 'bsb' });
  assert.equal(harness.attempts(), 2);
  assert.equal(harness.completeFailures.length, 1);
});

test('if finishing onboarding throws after a download, the installed Bible is reported for a retry', async () => {
  const harness = createFailingCompletionQueue();

  // Resolves: the failure goes to the screen, not to an unhandled rejection.
  await harness.queue.chooseDownload({ id: 'hincv' });

  assert.deepEqual(harness.downloadFailures, [], 'the download itself succeeded');
  assert.equal(harness.completeFailures.length, 1);
  const reported = harness.completeFailures[0]!.translation;
  assert.deepEqual(reported, { id: 'hincv', installed: true });

  await harness.queue.chooseReady(reported);
  assert.equal(harness.attempts(), 2);
  assert.equal(harness.completeFailures.length, 1);
});
