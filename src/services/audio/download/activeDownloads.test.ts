import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelAudioDownloadsForTranslation,
  captureIdleAudioBookWriter,
  hasPendingAudioDownloadCancellationCleanup,
  registerAudioDownloadAbortController,
  releaseAudioDownloadAbortController,
  requestAudioDownloadCancellation,
  runAudioBookExclusively,
  runAudioBookCleanupIfUnchanged,
  runAudioDownloadCancellationCleanup,
  waitForAudioDownloadCancellationCleanup,
  waitForAudioDownloadOwnersToSettle,
} from './activeDownloads';

test('a pending UI cancellation tail is visible only for its exact job until cleanup settles', async () => {
  const jobId = 'audio-download:pending:translation:all';
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  runAudioDownloadCancellationCleanup(jobId, () => pending);
  assert.equal(hasPendingAudioDownloadCancellationCleanup(jobId), true);
  assert.equal(
    hasPendingAudioDownloadCancellationCleanup('audio-download:pending:book:PHM'),
    false
  );
  release();
  await waitForAudioDownloadCancellationCleanup(jobId);
  assert.equal(hasPendingAudioDownloadCancellationCleanup(jobId), false);
});

test('cancellation reaches every running instance of a reused job id', async () => {
  const jobId = 'audio-download:overlap:book:PHM';
  const first = registerAudioDownloadAbortController(jobId);
  const second = registerAudioDownloadAbortController(jobId);
  requestAudioDownloadCancellation(jobId);
  const aborted = [first.controller.signal.aborted, second.controller.signal.aborted];
  let settled = false;
  const cancelling = cancelAudioDownloadsForTranslation('overlap').then(() => {
    settled = true;
  });
  releaseAudioDownloadAbortController(jobId, second);
  await new Promise((resolve) => setImmediate(resolve));
  const settledBeforeFirstWriter = settled;
  releaseAudioDownloadAbortController(jobId, first);
  await cancelling;

  assert.deepEqual(aborted, [true, true]);
  assert.equal(settledBeforeFirstWriter, false, 'deletion must still wait for the older writer');
});

test('releasing an older job instance leaves its newer instance cancellable', () => {
  const jobId = 'audio-download:reused:book:PHM';
  const first = registerAudioDownloadAbortController(jobId);
  const second = registerAudioDownloadAbortController(jobId);
  releaseAudioDownloadAbortController(jobId, first);
  requestAudioDownloadCancellation(jobId);
  releaseAudioDownloadAbortController(jobId, second);

  assert.equal(second.controller.signal.aborted, true);
});

test('job cancellation reaches its pending request descendants without prefix collisions', () => {
  const jobId = 'audio-download:cancel-scope:book:PHM';
  const ids = [
    jobId,
    `${jobId}:request:one`,
    `${jobId}:request:two`,
    `${jobId}2:request:other`,
    'audio-download:cancel-scope2:book:PHM:request:one',
    'audio-download:cancel-scope:book:JUD:request:one',
  ];
  const entries = ids.map((id) => registerAudioDownloadAbortController(id));
  requestAudioDownloadCancellation(jobId);
  const aborted = entries.map((entry) => entry.controller.signal.aborted);
  entries.forEach((entry, index) => releaseAudioDownloadAbortController(ids[index]!, entry));
  assert.deepEqual(aborted, [true, true, true, false, false, false]);
});

test('a cancelled book waiting for ownership never starts and leaves later retries unblocked', async () => {
  const directoryUri = 'file:///waiting-book/';
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = runAudioBookExclusively(directoryUri, new AbortController().signal, () => pending);
  const controller = new AbortController();
  let runs = 0;
  const cancelled = runAudioBookExclusively(directoryUri, controller.signal, async () => {
    runs += 1;
  }).catch((error: unknown) => error);
  controller.abort();
  finish();
  await first;
  assert.match(String(await cancelled), /cancelled/);
  assert.equal(runs, 0);

  await runAudioBookExclusively(directoryUri, new AbortController().signal, async () => {
    runs += 1;
  });
  assert.equal(runs, 1);
});

test('a failed owner releases its book while downloads of other books stay independent', async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const first = runAudioBookExclusively(
    'file:///failed-book/',
    new AbortController().signal,
    async () => {
      await pending;
      throw new Error('first transfer failed');
    }
  ).catch((error: unknown) => error);
  let otherRan = false;
  await runAudioBookExclusively(
    'file:///different-book/',
    new AbortController().signal,
    async () => {
      otherRan = true;
    }
  );
  assert.equal(otherRan, true);
  finish();
  assert.match(String(await first), /first transfer failed/);
  let retried = false;
  await runAudioBookExclusively('file:///failed-book/', new AbortController().signal, async () => {
    retried = true;
  });
  assert.equal(retried, true);
});

test('same-job cancellation cleanup queues repeated calls and releases failed cleanup without blocking other jobs', async () => {
  const jobId = 'audio-download:cleanup:book:PHM';
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const calls: string[] = [];
  runAudioDownloadCancellationCleanup(jobId, async () => {
    calls.push('first');
    await pending;
    throw new Error('native module unavailable');
  });
  runAudioDownloadCancellationCleanup(jobId, async () => {
    calls.push('second');
  });
  await waitForAudioDownloadCancellationCleanup(`${jobId}2`);
  assert.deepEqual(calls, ['first'], 'other job IDs do not wait for this cleanup');
  const waiting = waitForAudioDownloadCancellationCleanup(jobId);
  finish();
  await waiting;
  assert.deepEqual(calls, ['first', 'second']);
  await waitForAudioDownloadCancellationCleanup(jobId);
});

test('an aborted cleanup waiter settles and removes its listener before its own cancellation cleanup', async () => {
  const jobId = 'audio-download:wait-cancel:book:PHM';
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  runAudioDownloadCancellationCleanup(jobId, () => pending);
  const owner = registerAudioDownloadAbortController(`${jobId}:request:first`);
  const signal = owner.controller.signal;
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  let listeners = 0;
  signal.addEventListener = (...args: Parameters<AbortSignal['addEventListener']>) => {
    listeners += 1;
    add(...args);
  };
  signal.removeEventListener = (...args: Parameters<AbortSignal['removeEventListener']>) => {
    listeners -= 1;
    remove(...args);
  };
  const waiting = waitForAudioDownloadCancellationCleanup(jobId, signal);
  requestAudioDownloadCancellation(jobId);
  const oldOwnersSettled = waitForAudioDownloadOwnersToSettle(jobId);
  const laterRetry = registerAudioDownloadAbortController(`${jobId}:request:later`);
  runAudioDownloadCancellationCleanup(jobId, () => oldOwnersSettled);
  await waiting;
  releaseAudioDownloadAbortController(`${jobId}:request:first`, owner);
  await oldOwnersSettled;
  finish();
  await waitForAudioDownloadCancellationCleanup(jobId);
  releaseAudioDownloadAbortController(`${jobId}:request:later`, laterRetry);
  assert.equal(listeners, 0);
  assert.equal(
    laterRetry.controller.signal.aborted,
    false,
    'new retries are absent from the cancellation snapshot'
  );
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('a completed writer invalidates a prior idle cleanup snapshot', async () => {
  const directory = 'file:///cleanup-completed/';
  const snapshot = captureIdleAudioBookWriter(directory)!;
  let bytes = 'bad';
  await runAudioBookExclusively(directory, new AbortController().signal, async () => {
    bytes = 'repaired';
  });
  const deleted = await runAudioBookCleanupIfUnchanged(snapshot, async () => {
    bytes = '';
  });
  assert.equal(deleted, false);
  assert.equal(bytes, 'repaired');
});

test('active and queued writers prevent capture and invalidate cleanup even when cancelled', async () => {
  const directory = 'file:///cleanup-cancelled/';
  const snapshot = captureIdleAudioBookWriter(directory)!;
  const gate = deferred();
  const first = runAudioBookExclusively(
    directory,
    new AbortController().signal,
    () => gate.promise
  );
  assert.equal(captureIdleAudioBookWriter(directory), null);
  const controller = new AbortController();
  let ran = false;
  const queued = runAudioBookExclusively(directory, controller.signal, async () => {
    ran = true;
  });
  const rejected = assert.rejects(queued, /cancelled/);
  controller.abort();
  let deletes = 0;
  assert.equal(
    await runAudioBookCleanupIfUnchanged(snapshot, async () => {
      deletes += 1;
    }),
    false
  );
  gate.resolve();
  await Promise.all([first, rejected]);
  assert.equal(ran, false);
  assert.equal(
    await runAudioBookCleanupIfUnchanged(snapshot, async () => {
      deletes += 1;
    }),
    false
  );
  assert.equal(deletes, 0);
  assert.ok(captureIdleAudioBookWriter(directory));
});

test('cleanup rechecks ownership inside its lease when a writer is claimed before deletion starts', async () => {
  const directory = 'file:///cleanup-before-start/';
  const snapshot = captureIdleAudioBookWriter(directory)!;
  const calls: string[] = [];
  const cleanup = runAudioBookCleanupIfUnchanged(snapshot, async () => {
    calls.push('delete');
  });
  const writer = runAudioBookExclusively(directory, new AbortController().signal, async () => {
    calls.push('write');
  });
  assert.equal(await cleanup, false);
  await writer;
  assert.deepEqual(calls, ['write']);
});

test('a writer claimed after deletion starts waits for cleanup and preserves its replacement', async () => {
  const directory = 'file:///cleanup-first/';
  const snapshot = captureIdleAudioBookWriter(directory)!;
  const started = deferred();
  const gate = deferred();
  let bytes = 'bad';
  const calls: string[] = [];
  const cleanup = runAudioBookCleanupIfUnchanged(snapshot, async () => {
    calls.push('delete-start');
    started.resolve();
    await gate.promise;
    bytes = '';
    calls.push('delete-end');
  });
  await started.promise;
  assert.equal(captureIdleAudioBookWriter(directory), null);
  const writer = runAudioBookExclusively(directory, new AbortController().signal, async () => {
    bytes = 'fresh';
    calls.push('write');
  });
  assert.deepEqual(calls, ['delete-start']);
  gate.resolve();
  assert.equal(await cleanup, true);
  await writer;
  assert.deepEqual(calls, ['delete-start', 'delete-end', 'write']);
  assert.equal(bytes, 'fresh');
});

test('shared playback snapshots allow only one cleanup and cannot delete under a fresh snapshot', async () => {
  const directory = 'file:///cleanup-shared/';
  const first = captureIdleAudioBookWriter(directory)!;
  const second = captureIdleAudioBookWriter(directory)!;
  let deletes = 0;
  const cleanup = () =>
    runAudioBookCleanupIfUnchanged(first, async () => {
      deletes += 1;
    });
  assert.deepEqual(
    await Promise.all([
      cleanup(),
      runAudioBookCleanupIfUnchanged(second, async () => {
        deletes += 1;
      }),
    ]),
    [true, false]
  );
  const fresh = captureIdleAudioBookWriter(directory)!;
  assert.notEqual(fresh, first);
  assert.equal(await cleanup(), false);
  assert.equal(
    await runAudioBookCleanupIfUnchanged(fresh, async () => {
      deletes += 1;
    }),
    true
  );
  assert.equal(deletes, 2);
});

test('a failed cleanup retires its snapshot and releases the book for a fresh writer', async () => {
  const directory = 'file:///cleanup-failed/';
  const snapshot = captureIdleAudioBookWriter(directory)!;
  await assert.rejects(
    runAudioBookCleanupIfUnchanged(snapshot, async () => {
      throw new Error('delete failed');
    }),
    /delete failed/
  );
  let writes = 0;
  await runAudioBookExclusively(directory, new AbortController().signal, async () => {
    writes += 1;
  });
  assert.equal(
    await runAudioBookCleanupIfUnchanged(snapshot, async () => {
      throw new Error('stale');
    }),
    false
  );
  assert.equal(writes, 1);
});

test('an already-cancelled writer claim invalidates cleanup without touching the chapter', async () => {
  const directory = 'file:///cleanup-aborted-claim/';
  const snapshot = captureIdleAudioBookWriter(directory)!;
  const controller = new AbortController();
  controller.abort();
  let writes = 0;
  const writer = runAudioBookExclusively(directory, controller.signal, async () => {
    writes += 1;
  });
  assert.equal(
    await runAudioBookCleanupIfUnchanged(snapshot, async () => {
      throw new Error('stale cleanup must not run');
    }),
    false
  );
  await assert.rejects(writer, /cancelled/);
  assert.equal(writes, 0);
});
