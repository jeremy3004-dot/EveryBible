import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelAudioDownloadsForTranslation,
  registerAudioDownloadAbortController,
  releaseAudioDownloadAbortController,
  requestAudioDownloadCancellation,
  runAudioBookExclusively,
} from './activeDownloads';

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
