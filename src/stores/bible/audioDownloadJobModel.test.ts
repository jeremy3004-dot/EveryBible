import test from 'node:test';
import assert from 'node:assert/strict';
import { makeAudioJob, makeRuntimeTranslation } from '../__tests__/bibleStoreDoubles';
import {
  appendDownloadedAudioBooks,
  clampPercent,
  getLatestPersistedAudioJobByTranslation,
  mapAudioDownloadJob,
  mapAudioDownloadProgress,
  mapAudioJobKind,
  mapAudioJobStatus,
  resolveAudioCancellationJobId,
  updateTranslationAudioJobProgress,
  updateTranslationAudioJobState,
} from './audioDownloadJobModel';

test('audio job statuses map onto the store job states', () => {
  assert.deepEqual(
    (['queued', 'downloading', 'completed', 'failed'] as const).map(mapAudioJobStatus),
    ['queued', 'running', 'completed', 'failed']
  );
});

test('a whole-translation job is a translation-audio job and anything narrower an audio-book job', () => {
  assert.deepEqual(
    [mapAudioJobKind('translation'), mapAudioJobKind('book')],
    ['translation-audio', 'audio-book']
  );
});

test('a running job maps to a store job at 0% with its timestamps and error', () => {
  assert.deepEqual(
    mapAudioDownloadJob(makeAudioJob({ id: 'job-9', status: 'downloading', error: 'slow' })),
    {
      id: 'job-9',
      kind: 'audio-book',
      state: 'running',
      progress: 0,
      startedAt: 1_000,
      updatedAt: 2_000,
      error: 'slow',
    }
  );
});

test('a completed job maps to a completed store job at 100%', () => {
  const mapped = mapAudioDownloadJob(makeAudioJob({ status: 'completed', scope: 'translation' }));

  assert.deepEqual(
    { kind: mapped.kind, state: mapped.state, progress: mapped.progress },
    { kind: 'translation-audio', state: 'completed', progress: 100 }
  );
});

test('the banner shows a failed job as an error and a queued one as downloading', () => {
  assert.deepEqual(
    [
      mapAudioDownloadProgress(makeAudioJob({ status: 'failed', error: 'offline' })),
      mapAudioDownloadProgress(makeAudioJob({ status: 'queued' })),
      mapAudioDownloadProgress(makeAudioJob({ status: 'completed' })),
    ].map(({ status, progress, error }) => ({ status, progress, error })),
    [
      { status: 'error', progress: 0, error: 'offline' },
      { status: 'downloading', progress: 0, error: undefined },
      { status: 'completed', progress: 100, error: undefined },
    ]
  );
});

test('the banner carries the job, translation and book it reports on', () => {
  const progress = mapAudioDownloadProgress(
    makeAudioJob({ id: 'job-3', translationId: 'web', bookId: 'MRK' })
  );

  assert.deepEqual(
    { translationId: progress.translationId, jobId: progress.jobId, bookId: progress.bookId },
    { translationId: 'web', jobId: 'job-3', bookId: 'MRK' }
  );
});

test('percentages are rounded into 0–100 and a non-number reads as 0', () => {
  assert.deepEqual(
    [-5, 12.4, 12.5, 250, Number.NaN, Number.POSITIVE_INFINITY].map(clampPercent),
    [0, 12, 13, 100, 0, 0]
  );
});

test("a job update fills the job slot of the job's own translation", () => {
  const row = makeRuntimeTranslation({ id: 'aud', activeDownloadJob: null });

  const next = updateTranslationAudioJobState(row, makeAudioJob({ translationId: 'aud' }));

  assert.equal(next.activeDownloadJob?.state, 'running');
});

test("a completed job clears its translation's job slot", () => {
  const row = makeRuntimeTranslation({
    id: 'aud',
    activeDownloadJob: mapAudioDownloadJob(makeAudioJob({ translationId: 'aud' })),
  });

  const next = updateTranslationAudioJobState(
    row,
    makeAudioJob({ translationId: 'aud', status: 'completed' })
  );

  assert.equal(next.activeDownloadJob, null);
});

test("another translation's job leaves a row with a job slot untouched, by identity", () => {
  const row = makeRuntimeTranslation({ id: 'other', activeDownloadJob: null });

  assert.equal(updateTranslationAudioJobState(row, makeAudioJob({ translationId: 'aud' })), row);
});

test('a row that never had a job slot is normalised to an empty one', () => {
  const row = makeRuntimeTranslation({ id: 'other', activeDownloadJob: undefined });

  const next = updateTranslationAudioJobState(row, null);

  assert.notEqual(next, row);
  assert.equal(next.activeDownloadJob, null);
});

test('progress on a row without a running job changes nothing', () => {
  const row = makeRuntimeTranslation({ activeDownloadJob: null });

  assert.equal(updateTranslationAudioJobProgress(row, 50), row);
});

test('progress on a running job is clamped and restamps the job', () => {
  const row = makeRuntimeTranslation({
    activeDownloadJob: mapAudioDownloadJob(makeAudioJob({ updatedAt: 1 })),
  });

  const next = updateTranslationAudioJobProgress(row, 140);

  assert.equal(next.activeDownloadJob?.progress, 100);
  assert.ok((next.activeDownloadJob?.updatedAt ?? 0) > 1);
});

test('only the most recently updated persisted job is kept per translation', () => {
  const latest = getLatestPersistedAudioJobByTranslation([
    makeAudioJob({ id: 'old', translationId: 'web', updatedAt: 10 }),
    makeAudioJob({ id: 'new', translationId: 'web', updatedAt: 20 }),
    makeAudioJob({ id: 'older-still', translationId: 'web', updatedAt: 5 }),
    makeAudioJob({ id: 'bsb-job', translationId: 'bsb', updatedAt: 1 }),
  ]);

  assert.deepEqual(
    Object.fromEntries([...latest].map(([translationId, job]) => [translationId, job.id])),
    { web: 'new', bsb: 'bsb-job' }
  );
});

test('completed books are appended once each, keeping the existing order', () => {
  assert.deepEqual(appendDownloadedAudioBooks(['MAT', 'GEN'], ['GEN', 'MRK', 'MRK', 'LUK']), [
    'MAT',
    'GEN',
    'MRK',
    'LUK',
  ]);
});

test("cancelling an audio banner targets the translation's active job over the banner's mirror", () => {
  const translations = [
    makeRuntimeTranslation({
      id: 'aud',
      activeDownloadJob: mapAudioDownloadJob(makeAudioJob({ id: 'collection-job' })),
    }),
  ];

  assert.equal(
    resolveAudioCancellationJobId(
      { translationId: 'aud', jobId: 'nested-book-job', progress: 10, status: 'downloading' },
      translations
    ),
    'collection-job'
  );
});

test("cancelling an audio banner falls back to the banner's job id when the row has none", () => {
  assert.equal(
    resolveAudioCancellationJobId(
      { translationId: 'aud', jobId: 'job-2', progress: 10, status: 'downloading' },
      [makeRuntimeTranslation({ id: 'aud', activeDownloadJob: null })]
    ),
    'job-2'
  );
});

test('a text banner never resolves to a stale audio job on the same translation', () => {
  const translations = [
    makeRuntimeTranslation({
      id: 'aud',
      activeDownloadJob: mapAudioDownloadJob(makeAudioJob({ id: 'stale' })),
    }),
  ];

  assert.deepEqual(
    [
      resolveAudioCancellationJobId(
        { translationId: 'aud', progress: 10, status: 'downloading' },
        translations
      ),
      resolveAudioCancellationJobId(null, translations),
    ],
    [null, null]
  );
});
