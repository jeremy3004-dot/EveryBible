import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { assertDefined } from '../../../utils/assertDefined';
import {
  audioDownloadTaskIdMatchesJob,
  completeAudioDownloadJob,
  createAudioDownloadJobId,
  failAudioDownloadJob,
  reattachAudioDownloadJob,
  startAudioDownloadJob,
} from './jobRegistry';
import type {
  AudioDownloadJobRecord,
  AudioDownloadJobStore,
  AudioDownloadLifecycleHooks,
} from './types';

const CREATED_AT = 1_000;
const NOW = 5_000;
const BSB_ALL = 'audio-download:bsb:translation:all';
const BSB_GEN = 'audio-download:bsb:book:GEN';

function jobStoreWith(...seed: AudioDownloadJobRecord[]) {
  const jobs = new Map(seed.map((job) => [job.id, job]));
  const store: AudioDownloadJobStore = {
    listJobs: async () => [...jobs.values()],
    getJob: async (jobId) => jobs.get(jobId) ?? null,
    upsertJob: async (job) => {
      jobs.set(job.id, job);
    },
    removeJob: async (jobId) => {
      jobs.delete(jobId);
    },
  };
  return { store, jobs };
}

function lifecycle() {
  const events: string[] = [];
  const hooks: AudioDownloadLifecycleHooks = {
    onStart: (job) => events.push(`start ${job.id}`),
    onReattach: (job) => events.push(`reattach ${job.id}`),
    onFailure: (job, error) => events.push(`failure ${job.id}: ${error.message}`),
    onComplete: (job) => events.push(`complete ${job.id}`),
  };
  return { events, hooks };
}

const translationJob = (
  overrides: Partial<AudioDownloadJobRecord> = {}
): AudioDownloadJobRecord => ({
  id: BSB_ALL,
  translationId: 'bsb',
  scope: 'translation',
  requestedBookIds: ['GEN', 'EXO'],
  status: 'downloading',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  attemptCount: 2,
  runId: 'run-1',
  ...overrides,
});

const bookJob = (overrides: Partial<AudioDownloadJobRecord> = {}): AudioDownloadJobRecord => ({
  id: BSB_GEN,
  translationId: 'bsb',
  scope: 'book',
  bookId: 'GEN',
  status: 'downloading',
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
  attemptCount: 1,
  runId: 'run-1',
  parentRunId: 'collection-1',
  ...overrides,
});

const clockAt = (t: TestContext, now: number) => t.mock.timers.enable({ apis: ['Date'], now });

const devFlag = globalThis as { __DEV__?: boolean };

// --- ids and task matching ----------------------------------------------------------------

test('a job id names the translation, the scope and the book, or "all" for a translation', () => {
  assert.deepEqual(
    [
      createAudioDownloadJobId({ translationId: 'bsb', scope: 'book', bookId: 'GEN' }),
      createAudioDownloadJobId({ translationId: 'bsb', scope: 'book' }),
      createAudioDownloadJobId({ translationId: 'bsb', scope: 'translation' }),
      createAudioDownloadJobId({ translationId: 'bsb', scope: 'translation', bookId: 'GEN' }),
    ],
    [BSB_GEN, 'audio-download:bsb:book:unknown', BSB_ALL, BSB_ALL]
  );
});

test('a book job claims only its own chapter tasks', () => {
  assert.deepEqual(
    [
      BSB_GEN,
      `${BSB_GEN}:1`,
      `${BSB_GEN}:50`,
      'audio-download:bsb:book:GENX:1',
      'audio-download:bsb:book:EXO:1',
      'audio-download:web:book:GEN:1',
    ].map((taskId) => audioDownloadTaskIdMatchesJob(taskId, BSB_GEN)),
    [true, true, true, false, false, false]
  );
});

test('a translation job claims the chapter tasks of every book in its own translation only', () => {
  assert.deepEqual(
    [
      `${BSB_GEN}:1`,
      'audio-download:bsb:book:REV:22',
      'audio-download:web:book:GEN:1',
      'audio-download:bsbx:book:GEN:1',
    ].map((taskId) => audioDownloadTaskIdMatchesJob(taskId, BSB_ALL)),
    [true, true, false, false]
  );
});

test('a truncated translation job id does not claim the whole translation', () => {
  // Cancelling with it must not stop every book download of the translation.
  assert.equal(
    audioDownloadTaskIdMatchesJob(`${BSB_GEN}:1`, 'audio-download:bsb:translation'),
    false
  );
});

// --- startAudioDownloadJob ----------------------------------------------------------------

test('starting a new job records it as downloading and reports the start', async (t) => {
  clockAt(t, NOW);
  const { store, jobs } = jobStoreWith();
  const { events, hooks } = lifecycle();
  const requested = ['GEN', 'EXO'];

  const job = await startAudioDownloadJob({
    translationId: 'bsb',
    scope: 'translation',
    requestedBookIds: requested,
    jobStore: store,
    hooks,
  });
  requested.push('LEV');

  assert.equal(typeof job.runId, 'string');
  assert.notEqual(job.runId, '');
  assert.deepEqual(job, {
    id: BSB_ALL,
    translationId: 'bsb',
    scope: 'translation',
    bookId: undefined,
    status: 'downloading',
    createdAt: NOW,
    updatedAt: NOW,
    attemptCount: 1,
    requestedBookIds: ['GEN', 'EXO'],
    runId: job.runId,
    parentRunId: undefined,
  });
  assert.deepEqual(jobs.get(BSB_ALL), job);
  assert.deepEqual(events, [`start ${BSB_ALL}`]);
});

for (const status of ['queued', 'downloading'] as const) {
  test(`starting a translation whose job is still ${status} recovers it, keeping its run`, async (t) => {
    // Its book rows name that run as their parent; a new run id would orphan them.
    clockAt(t, NOW);
    const { store, jobs } = jobStoreWith(translationJob({ status }));
    const { events, hooks } = lifecycle();

    const job = await startAudioDownloadJob({
      translationId: 'bsb',
      scope: 'translation',
      requestedBookIds: ['GEN', 'EXO', 'LEV'],
      jobStore: store,
      hooks,
    });

    assert.deepEqual(
      job,
      translationJob({
        status: 'downloading',
        updatedAt: NOW,
        requestedBookIds: ['GEN', 'EXO', 'LEV'],
        parentRunId: undefined,
        bookId: undefined,
        error: undefined,
      })
    );
    assert.deepEqual(jobs.get(BSB_ALL), job);
    assert.deepEqual(events, [`reattach ${BSB_ALL}`]);
  });
}

test('recovering an active translation recorded before run ids existed gives it one', async () => {
  const { store, jobs } = jobStoreWith(translationJob({ runId: undefined }));

  const job = await startAudioDownloadJob({
    translationId: 'bsb',
    scope: 'translation',
    jobStore: store,
  });

  assert.equal(typeof job.runId, 'string');
  assert.notEqual(job.runId, '');
  assert.equal(jobs.get(BSB_ALL)?.runId, job.runId);
});

for (const status of ['completed', 'failed'] as const) {
  test(`restarting a ${status} translation download admits a new run`, async (t) => {
    clockAt(t, NOW);
    const { store } = jobStoreWith(translationJob({ status, error: 'HTTP 500' }));
    const { events, hooks } = lifecycle();

    const job = await startAudioDownloadJob({
      translationId: 'bsb',
      scope: 'translation',
      jobStore: store,
      hooks,
    });

    assert.notEqual(job.runId, 'run-1', 'books left from the old run are not owned by the new one');
    assert.equal(typeof job.runId, 'string');
    assert.deepEqual(
      job,
      translationJob({
        status: 'downloading',
        updatedAt: NOW,
        error: undefined,
        runId: job.runId,
        parentRunId: undefined,
        bookId: undefined,
      })
    );
    assert.deepEqual(events, [`start ${BSB_ALL}`]);
  });
}

test('a new admission of an active book job takes its row over with a fresh run', async () => {
  const { store } = jobStoreWith(bookJob());
  const { events, hooks } = lifecycle();

  const job = await startAudioDownloadJob({
    translationId: 'bsb',
    scope: 'book',
    bookId: 'GEN',
    parentRunId: 'collection-2',
    jobStore: store,
    hooks,
  });

  assert.notEqual(job.runId, 'run-1');
  assert.equal(job.parentRunId, 'collection-2');
  assert.deepEqual(events, [`reattach ${BSB_GEN}`]);
});

test('each new job gets a run id of its own', async () => {
  const runIds = new Set<string | undefined>();
  for (const bookId of ['GEN', 'EXO', 'LEV']) {
    const { store } = jobStoreWith();
    const job = await startAudioDownloadJob({
      translationId: 'bsb',
      scope: 'book',
      bookId,
      jobStore: store,
    });
    runIds.add(job.runId);
  }
  assert.equal(runIds.size, 3);
});

// --- reattach / fail / complete -----------------------------------------------------------

for (const status of ['queued', 'downloading'] as const) {
  test(`reattaching a ${status} job marks it downloading and keeps its run`, async (t) => {
    clockAt(t, NOW);
    const { store, jobs } = jobStoreWith(bookJob({ status }));
    const { events, hooks } = lifecycle();

    const job = await reattachAudioDownloadJob({ jobId: BSB_GEN, jobStore: store, hooks });

    assert.deepEqual(job, bookJob({ status: 'downloading', updatedAt: NOW, error: undefined }));
    assert.deepEqual(jobs.get(BSB_GEN), job);
    assert.deepEqual(events, [`reattach ${BSB_GEN}`]);
  });
}

test('a finished or missing job cannot be reattached', async () => {
  const completed = bookJob({ status: 'completed' });
  const failed = translationJob({ status: 'failed', error: 'HTTP 500' });
  const { store, jobs } = jobStoreWith(completed, failed);
  const { events, hooks } = lifecycle();

  for (const jobId of [BSB_GEN, BSB_ALL, 'audio-download:web:book:GEN']) {
    assert.equal(await reattachAudioDownloadJob({ jobId, jobStore: store, hooks }), null);
  }

  assert.deepEqual([...jobs.values()], [completed, failed]);
  assert.deepEqual(events, []);
});

test('failing a job records the error and reports it', async (t) => {
  clockAt(t, NOW);
  const { store, jobs } = jobStoreWith(bookJob());
  const { events, hooks } = lifecycle();

  const job = await failAudioDownloadJob({
    jobId: BSB_GEN,
    jobStore: store,
    hooks,
    error: new Error('HTTP 500'),
  });

  assert.deepEqual(job, bookJob({ status: 'failed', updatedAt: NOW, error: 'HTTP 500' }));
  assert.deepEqual(jobs.get(BSB_GEN), job);
  assert.deepEqual(events, [`failure ${BSB_GEN}: HTTP 500`]);
});

test('completing a job clears an earlier error and reports it', async (t) => {
  clockAt(t, NOW);
  const { store, jobs } = jobStoreWith(bookJob({ error: 'HTTP 500' }));
  const { events, hooks } = lifecycle();

  const job = await completeAudioDownloadJob({ jobId: BSB_GEN, jobStore: store, hooks });

  assert.deepEqual(job, bookJob({ status: 'completed', updatedAt: NOW, error: undefined }));
  assert.deepEqual(jobs.get(BSB_GEN), job);
  assert.deepEqual(events, [`complete ${BSB_GEN}`]);
});

test('a late fail or complete for a job no longer in the store writes nothing', async (t) => {
  const debug = t.mock.method(console, 'debug', () => {});
  const { store, jobs } = jobStoreWith();
  const { events, hooks } = lifecycle();

  const failed = await failAudioDownloadJob({
    jobId: BSB_ALL,
    jobStore: store,
    hooks,
    error: new Error('HTTP 500'),
  });
  const completed = await completeAudioDownloadJob({ jobId: BSB_ALL, jobStore: store, hooks });

  assert.deepEqual([failed, completed], [null, null]);
  assert.equal(jobs.size, 0, 'no record is invented for the removed job');
  assert.deepEqual(events, []);
  assert.equal(debug.mock.callCount(), 0, 'a release build stays quiet about it');
});

test('a dev build logs which late transition it dropped, and for which job', async (t) => {
  const devBefore = devFlag.__DEV__;
  devFlag.__DEV__ = true;
  t.after(() => {
    if (devBefore === undefined) delete devFlag.__DEV__;
    else devFlag.__DEV__ = devBefore;
  });
  const debug = t.mock.method(console, 'debug', () => {});
  const { store } = jobStoreWith();

  await failAudioDownloadJob({ jobId: BSB_ALL, jobStore: store, error: new Error('HTTP 500') });
  await completeAudioDownloadJob({ jobId: BSB_GEN, jobStore: store });

  const messages = debug.mock.calls.map((call) => String(call.arguments[0]));
  assert.equal(messages.length, 2);
  const [failMessage, completeMessage] = messages;
  assert.match(
    assertDefined(failMessage, 'the fail log'),
    /\bfail\b.*audio-download:bsb:translation:all/
  );
  assert.match(
    assertDefined(completeMessage, 'the complete log'),
    /\bcomplete\b.*audio-download:bsb:book:GEN/
  );
});

test('without a job store the records are kept in memory between transitions', async () => {
  const started = await startAudioDownloadJob({
    translationId: 'memory-only',
    scope: 'translation',
  });

  const failed = await failAudioDownloadJob({ jobId: started.id, error: new Error('HTTP 500') });

  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.runId, started.runId);
});
