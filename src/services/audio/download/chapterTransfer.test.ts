import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { assertDefined } from '../../../utils/assertDefined';
import {
  clampProgress,
  downloadChapterWithInactivityTimeoutAndRetry,
  runWithConcurrency,
} from './chapterTransfer';
import {
  AudioDownloadCancelledError,
  AudioDownloadInsufficientSpaceError,
  AudioDownloadStopError,
} from './errors';

type Outcome =
  | { status: 'pending' }
  | { status: 'fulfilled' }
  | { status: 'rejected'; error: unknown };

// Records how a promise settled without awaiting it, so a test can also assert that it has
// NOT settled yet, or that it settled without the clock moving.
function track(promise: Promise<void>): { readonly current: Outcome } {
  const state: { current: Outcome } = { current: { status: 'pending' } };
  promise.then(
    () => {
      state.current = { status: 'fulfilled' };
    },
    (error: unknown) => {
      state.current = { status: 'rejected', error };
    }
  );
  return state;
}

function rejectionOf(outcome: { readonly current: Outcome }): unknown {
  const current = outcome.current;
  assert.ok(current.status === 'rejected', `expected a rejection, got ${current.status}`);
  return current.error;
}

// Only setTimeout is faked, so a real setImmediate lets pending promise chains run.
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

const fakeTimers = (t: TestContext) => t.mock.timers.enable({ apis: ['setTimeout'] });

async function advance(t: TestContext, ms: number) {
  t.mock.timers.tick(ms);
  await settle();
}

// One transport call per attempt, each settled by the test.
interface Attempt {
  onActivity: () => boolean;
  signal: AbortSignal;
  succeed: () => Promise<void>;
  fail: (error: unknown) => Promise<void>;
}

function scriptedTransport() {
  const attempts: Attempt[] = [];
  const run = (onActivity: () => boolean, signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      attempts.push({
        onActivity,
        signal,
        succeed: async () => {
          resolve();
          await settle();
        },
        fail: async (error) => {
          reject(error);
          await settle();
        },
      });
    });
  const attempt = (index: number) => assertDefined(attempts[index], `attempt ${index + 1}`);
  return { attempts, run, attempt };
}

// --- downloadChapterWithInactivityTimeoutAndRetry ---------------------------------------------

test('a chapter whose first attempt succeeds resolves without a retry', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();

  await transport.attempt(0).succeed();

  assert.deepEqual(outcome.current, { status: 'fulfilled' });
  assert.equal(transport.attempts.length, 1);
});

test('a finished attempt is not aborted when its inactivity window later runs out', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();
  await transport.attempt(0).succeed();

  await advance(t, 120_000);

  assert.equal(transport.attempt(0).signal.aborted, false);
});

test('a failed attempt is retried after 1 s, and a second failure after 2 s more', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();

  await transport.attempt(0).fail(new Error('HTTP 503'));
  await advance(t, 999);
  assert.equal(transport.attempts.length, 1, 'the second attempt waits the full first backoff');
  await advance(t, 1);
  assert.equal(transport.attempts.length, 2);

  await transport.attempt(1).fail(new Error('HTTP 503'));
  await advance(t, 1_999);
  assert.equal(transport.attempts.length, 2, 'the second backoff is twice the first');
  await advance(t, 1);
  assert.equal(transport.attempts.length, 3);

  await transport.attempt(2).succeed();
  assert.deepEqual(outcome.current, { status: 'fulfilled' });
});

test('after the third failed attempt it gives up with that attempt’s own error', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();
  const lastError = new Error('HTTP 404');

  await transport.attempt(0).fail(new Error('HTTP 500'));
  await advance(t, 1_000);
  await transport.attempt(1).fail(new Error('HTTP 502'));
  await advance(t, 2_000);
  await transport.attempt(2).fail(lastError);

  assert.equal(rejectionOf(outcome), lastError);
  await advance(t, 60_000);
  assert.equal(transport.attempts.length, 3);
});

test('a transport that rejects with a non-Error value fails with an Error carrying its text', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();

  await transport.attempt(0).fail('socket hang up');
  await advance(t, 1_000);
  await transport.attempt(1).fail('socket hang up');
  await advance(t, 2_000);
  await transport.attempt(2).fail('socket hang up');

  const error = rejectionOf(outcome);
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'socket hang up');
});

test('an attempt with no progress for the inactivity window is aborted and retried', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  track(
    downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined, {
      inactivityTimeoutMs: 5_000,
    })
  );
  await settle();

  await advance(t, 4_999);
  assert.equal(transport.attempt(0).signal.aborted, false);
  await advance(t, 1);
  assert.equal(transport.attempt(0).signal.aborted, true, 'the stalled attempt is told to stop');

  // The transport settles only once its writer has stopped; the retry waits for that.
  await advance(t, 10_000);
  assert.equal(transport.attempts.length, 1);
  await transport.attempt(0).fail(new AudioDownloadCancelledError());
  await advance(t, 1_000);
  assert.equal(transport.attempts.length, 2, 'a stall is retried, not treated as a cancel');
});

test('each progress tick restarts the inactivity window', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  track(
    downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined, {
      inactivityTimeoutMs: 5_000,
    })
  );
  await settle();

  for (let tickCount = 0; tickCount < 4; tickCount += 1) {
    await advance(t, 4_000);
    assert.equal(transport.attempt(0).onActivity(), true);
  }
  assert.equal(transport.attempt(0).signal.aborted, false, '16 s of steady progress never stalls');

  await advance(t, 5_000);
  assert.equal(transport.attempt(0).signal.aborted, true);
});

test('a chapter that stalls on every attempt fails as stalled', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  const outcome = track(
    downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined, {
      inactivityTimeoutMs: 5_000,
    })
  );
  await settle();

  for (const [index, backoff] of [
    [0, 1_000],
    [1, 2_000],
    [2, 0],
  ] as const) {
    await advance(t, 5_000);
    // A transport that resolves once stopped has still stalled; it is never a success.
    await transport.attempt(index).succeed();
    await advance(t, backoff);
  }

  assert.equal(transport.attempts.length, 3);
  assert.match(String(rejectionOf(outcome)), /stalled \(no progress\)/);
});

test('a progress tick from an attempt that already failed is ignored', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();

  await transport.attempt(0).fail(new Error('HTTP 503'));

  assert.equal(transport.attempt(0).onActivity(), false, 'during the backoff');
  await advance(t, 1_000);
  assert.equal(transport.attempt(0).onActivity(), false, 'while the retry runs');
  assert.equal(transport.attempt(1).onActivity(), true);
});

test('cancelling the job aborts the running attempt and ends in cancellation', async (t) => {
  fakeTimers(t);
  const job = new AbortController();
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, job.signal));
  await settle();

  job.abort();
  assert.equal(transport.attempt(0).signal.aborted, true);
  await settle();
  assert.equal(outcome.current.status, 'pending', 'it waits for the transport to stop');

  await transport.attempt(0).fail(new Error('task stopped'));
  assert.ok(rejectionOf(outcome) instanceof AudioDownloadCancelledError);
  await advance(t, 10_000);
  assert.equal(transport.attempts.length, 1);
});

test('a transport that resolves after the job was cancelled still ends in cancellation', async (t) => {
  fakeTimers(t);
  const job = new AbortController();
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, job.signal));
  await settle();

  job.abort();
  await transport.attempt(0).succeed();

  assert.ok(
    rejectionOf(outcome) instanceof AudioDownloadCancelledError,
    'a cancelled chapter is never reported as done'
  );
});

test('a cancellation reported by the transport is not retried', async (t) => {
  fakeTimers(t);
  const job = new AbortController();
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, job.signal));
  await settle();

  // e.g. the native task was stopped from outside while the job itself still runs
  await transport.attempt(0).fail(new AudioDownloadCancelledError());

  assert.ok(rejectionOf(outcome) instanceof AudioDownloadCancelledError);
  await advance(t, 10_000);
  assert.equal(transport.attempts.length, 1);
});

test('cancelling during the retry backoff rejects at once and starts no further attempt', async (t) => {
  fakeTimers(t);
  const job = new AbortController();
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, job.signal));
  await settle();
  await transport.attempt(0).fail(new Error('HTTP 503'));
  await advance(t, 500);

  job.abort();
  await settle();

  assert.ok(
    rejectionOf(outcome) instanceof AudioDownloadCancelledError,
    'without waiting out the backoff'
  );
  await advance(t, 10_000);
  assert.equal(transport.attempts.length, 1);
});

test('a job that was already cancelled starts no attempt', async () => {
  const job = new AbortController();
  job.abort();
  let calls = 0;

  await assert.rejects(
    downloadChapterWithInactivityTimeoutAndRetry(async () => {
      calls += 1;
    }, job.signal),
    AudioDownloadCancelledError
  );
  assert.equal(calls, 0);
});

test('a settled chapter leaves no abort listeners on the job signal, even after a retry', async (t) => {
  // The job signal outlives every chapter of a translation, so a listener left behind per
  // attempt or per backoff would pile up across hundreds of chapters.
  fakeTimers(t);
  const job = new AbortController();
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, job.signal));
  await settle();
  await transport.attempt(0).fail(new Error('HTTP 503'));
  await advance(t, 1_000);
  await transport.attempt(1).succeed();

  assert.deepEqual(outcome.current, { status: 'fulfilled' });
  assert.deepEqual(getEventListeners(job.signal, 'abort'), []);
});

test('an attempt that ran out of space fails at once without a retry', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();
  const full = new Error('ENOSPC: no space left on device');

  await transport.attempt(0).fail(full);

  assert.equal(rejectionOf(outcome), full);
  await advance(t, 10_000);
  assert.equal(transport.attempts.length, 1);
});

test('a refused free-space check is not retried either', async (t) => {
  fakeTimers(t);
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, undefined));
  await settle();
  const refused = new AudioDownloadInsufficientSpaceError(2_000_000, 1_000);

  await transport.attempt(0).fail(refused);

  assert.equal(rejectionOf(outcome), refused);
});

test('a native writer that failed to stop is reported as is and never retried', async (t) => {
  // Another attempt would write the same file while the old writer may still be running.
  fakeTimers(t);
  const job = new AbortController();
  const transport = scriptedTransport();
  const outcome = track(downloadChapterWithInactivityTimeoutAndRetry(transport.run, job.signal));
  await settle();
  const stopFailed = new AudioDownloadStopError(new Error('task.stop() threw'));

  job.abort();
  await transport.attempt(0).fail(stopFailed);

  assert.equal(rejectionOf(outcome), stopFailed);
});

// --- runWithConcurrency -------------------------------------------------------------------

// A worker per item, each held open until the test finishes or fails it.
function heldWorkers() {
  const started: string[] = [];
  const pending = new Map<string, { resolve: () => void; reject: (error: unknown) => void }>();
  let running = 0;
  let maxRunning = 0;
  const worker = (item: string) =>
    new Promise<void>((resolve, reject) => {
      started.push(item);
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      pending.set(item, {
        resolve: () => {
          running -= 1;
          resolve();
        },
        reject: (error) => {
          running -= 1;
          reject(error);
        },
      });
    });
  const held = (item: string) => assertDefined(pending.get(item), `the worker for ${item}`);
  return {
    started,
    worker,
    finish: async (item: string) => {
      held(item).resolve();
      await settle();
    },
    fail: async (item: string, error: unknown) => {
      held(item).reject(error);
      await settle();
    },
    get maxRunning() {
      return maxRunning;
    },
  };
}

test('never runs more workers at once than the limit, and starts items in order', async () => {
  const workers = heldWorkers();
  const outcome = track(runWithConcurrency(['a', 'b', 'c', 'd', 'e'], 2, workers.worker));
  await settle();
  assert.deepEqual(workers.started, ['a', 'b']);

  await workers.finish('b');
  assert.deepEqual(workers.started, ['a', 'b', 'c']);
  for (const item of ['a', 'c', 'd', 'e']) await workers.finish(item);

  assert.deepEqual(workers.started, ['a', 'b', 'c', 'd', 'e']);
  assert.equal(workers.maxRunning, 2);
  assert.deepEqual(outcome.current, { status: 'fulfilled' });
});

for (const concurrency of [1, 0, -3]) {
  test(`a concurrency of ${concurrency} still processes every item, one at a time`, async () => {
    const workers = heldWorkers();
    const outcome = track(runWithConcurrency(['a', 'b', 'c'], concurrency, workers.worker));
    await settle();
    assert.deepEqual(workers.started, ['a']);

    for (const item of ['a', 'b', 'c']) await workers.finish(item);

    assert.deepEqual(workers.started, ['a', 'b', 'c']);
    assert.equal(workers.maxRunning, 1);
    assert.deepEqual(outcome.current, { status: 'fulfilled' });
  });
}

test('no items means no work', async () => {
  let calls = 0;
  await runWithConcurrency([], 4, async () => {
    calls += 1;
  });
  assert.equal(calls, 0);
});

test('after a worker fails no new item starts, and the first failure is thrown', async () => {
  const workers = heldWorkers();
  const outcome = track(runWithConcurrency(['a', 'b', 'c', 'd'], 2, workers.worker));
  await settle();
  const first = new Error('a failed');

  await workers.fail('a', first);
  assert.equal(outcome.current.status, 'pending', 'the worker already in flight is awaited');
  await workers.finish('b');

  assert.deepEqual(workers.started, ['a', 'b']);
  assert.equal(rejectionOf(outcome), first);
});

test('a later sibling failure does not replace the first one', async () => {
  const workers = heldWorkers();
  const outcome = track(runWithConcurrency(['a', 'b'], 2, workers.worker));
  await settle();
  const first = new Error('lookup failed');

  await workers.fail('b', first);
  await workers.fail('a', new Error('cancelled afterwards'));

  assert.equal(rejectionOf(outcome), first);
});

test('after the signal aborts no new item starts', async () => {
  const workers = heldWorkers();
  const job = new AbortController();
  const outcome = track(runWithConcurrency(['a', 'b', 'c'], 1, workers.worker, job.signal));
  await settle();

  job.abort();
  await workers.finish('a');

  assert.deepEqual(workers.started, ['a']);
  assert.deepEqual(outcome.current, { status: 'fulfilled' });
});

test('a worker failing with a non-Error value is thrown as an Error with its text', async () => {
  const workers = heldWorkers();
  const outcome = track(runWithConcurrency(['a'], 1, workers.worker));
  await settle();

  await workers.fail('a', 'lookup timed out');

  const error = rejectionOf(outcome);
  assert.ok(error instanceof Error);
  assert.equal(error.message, 'lookup timed out');
});

// --- clampProgress ------------------------------------------------------------------------

test('progress is rounded into 0–100, and a non-finite value reads as 0', () => {
  assert.deepEqual(
    [-5, 0, 42.4, 42.5, 100, 140, Number.NaN, Number.POSITIVE_INFINITY].map(clampProgress),
    [0, 0, 42, 43, 100, 100, 0, 0]
  );
});
