import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation, TranslationDownloadProgress } from '../../../types';
import {
  getDownloadStatusAnnouncements,
  getTranslationDownloadActivity,
  getTranslationRowDownloadState,
  selectDownloadTarget,
  selectRowDownloadProgress,
  type TranslationRowDownloadStatus,
} from './translationDownloadStatusModel';

type Job = NonNullable<BibleTranslation['activeDownloadJob']>;
const job = (state: Job['state'], progress = 30): Job => ({
  id: 'job',
  kind: 'translation-audio',
  state,
  progress,
  startedAt: 0,
  updatedAt: 0,
});

const runtime = {
  id: 'engnet',
  name: 'NET Bible',
  isDownloaded: false,
  textPackLocalPath: null,
  activeDownloadJob: null,
  hasAudio: false,
  catalog: {
    version: '1',
    updatedAt: '2026-09-01',
    text: { format: 'sqlite', version: '1', downloadUrl: 'https://example.test/net', sha256: 'x' },
  },
} as Pick<
  BibleTranslation,
  | 'id'
  | 'name'
  | 'isDownloaded'
  | 'textPackLocalPath'
  | 'activeDownloadJob'
  | 'hasAudio'
  | 'catalog'
>;

const textTick = (progress: number, extra: Partial<TranslationDownloadProgress> = {}) => ({
  translationId: 'engnet',
  progress,
  ...extra,
});

test('the row selector keeps only its own Bible and drops byte counts', () => {
  const banner: TranslationDownloadProgress = {
    translationId: 'engnet',
    progress: 40,
    status: 'downloading',
    bytesDownloaded: 404,
    bytesTotal: 1000,
  };
  assert.deepEqual(selectRowDownloadProgress(banner, 'engnet'), {
    translationId: 'engnet',
    bookId: undefined,
    progress: 40,
    isIndeterminate: undefined,
  });
  assert.equal(selectRowDownloadProgress(banner, 'kjv'), null);
  assert.equal(selectRowDownloadProgress(null, 'engnet'), null);
});

test('an idle Bible that needs its text shows the download glyph and nothing else', () => {
  assert.deepEqual(getTranslationRowDownloadState(runtime, null, false), {
    isActiveAudioJob: false,
    isTextDownloadActive: false,
    isTextDownloaded: false,
    activeDownloadProgress: null,
    isTextDownloadIndeterminate: false,
    showsQueued: false,
    status: 'idle',
    needsTextDownload: true,
  });
});

test('text progress counts only when it names the Bible and carries no book', () => {
  const state = getTranslationRowDownloadState(runtime, textTick(40), false);
  assert.equal(state.status, 'downloading');
  assert.equal(state.activeDownloadProgress, 40);

  const bookTick = getTranslationRowDownloadState(runtime, textTick(40, { bookId: 'GEN' }), false);
  assert.equal(bookTick.isTextDownloadActive, false, 'a book tick is audio, not the text pack');
  assert.equal(bookTick.activeDownloadProgress, null);

  const indeterminate = getTranslationRowDownloadState(
    runtime,
    textTick(0, { isIndeterminate: true }),
    false
  );
  assert.equal(indeterminate.isTextDownloadIndeterminate, true);
});

test('a running audio job wins over the text banner and shows its own progress', () => {
  const state = getTranslationRowDownloadState(
    { ...runtime, activeDownloadJob: job('running', 25) },
    textTick(90),
    false
  );
  assert.equal(state.isActiveAudioJob, true);
  assert.equal(state.isTextDownloadActive, false);
  assert.equal(state.activeDownloadProgress, 25);
});

test('finished and failed audio jobs are not active', () => {
  for (const settled of ['completed', 'failed'] as const) {
    const activity = getTranslationDownloadActivity(
      { ...runtime, activeDownloadJob: job(settled) },
      null
    );
    assert.equal(activity.isActiveAudioJob, false, settled);
  }
});

test('queued shows only while the Bible is not itself downloading', () => {
  assert.equal(getTranslationRowDownloadState(runtime, null, true).status, 'queued');
  const running = getTranslationRowDownloadState(runtime, textTick(5), true);
  assert.equal(running.status, 'downloading');
  assert.equal(running.showsQueued, false);
});

test('an installed text pack or an audio Bible never asks for a text download', () => {
  assert.equal(
    getTranslationRowDownloadState({ ...runtime, textPackLocalPath: '/p' }, null, false)
      .needsTextDownload,
    false
  );
  assert.equal(
    getTranslationRowDownloadState({ ...runtime, hasAudio: true }, null, false).needsTextDownload,
    false
  );
  assert.equal(
    getTranslationDownloadActivity({ ...runtime, isDownloaded: true }, null).isTextDownloaded,
    true
  );
});

test('the download target drops percent and bytes, so ticks keep the same shape', () => {
  const banner: TranslationDownloadProgress = {
    translationId: 'bsb',
    bookId: 'GEN',
    progress: 40,
    status: 'downloading',
    bytesDownloaded: 404,
  };
  assert.deepEqual(selectDownloadTarget(banner), { translationId: 'bsb', bookId: 'GEN' });
  assert.equal(selectDownloadTarget(null), null);
});

const statuses = (entries: [string, TranslationRowDownloadStatus][]) => new Map(entries);
const keys = (result: { announcements: { key: string }[] }) =>
  result.announcements.map((announcement) => announcement.key);
const kjv = { ...runtime, id: 'kjv', name: 'King James Version' };

test('starting, queueing and settling are each announced once, by Bible id', () => {
  const started = getDownloadStatusAnnouncements(statuses([]), [runtime, kjv], textTick(0), 'kjv');
  assert.deepEqual(keys(started), ['translations.downloading', 'translations.queued']);
  assert.deepEqual(
    started.announcements.map((announcement) => announcement.name),
    [runtime.name, kjv.name],
    'each announcement names its Bible'
  );
  assert.deepEqual(
    [...started.statuses],
    [
      ['engnet', 'downloading'],
      ['kjv', 'queued'],
    ]
  );

  const unchanged = getDownloadStatusAnnouncements(
    started.statuses,
    [runtime, kjv],
    textTick(0),
    'kjv'
  );
  assert.deepEqual(keys(unchanged), []);

  // The finished Bible arrives as a new object (under a new row) with its pack installed.
  const settled = getDownloadStatusAnnouncements(
    unchanged.statuses,
    [kjv, { ...runtime, textPackLocalPath: '/packs/engnet' }],
    null,
    null
  );
  assert.deepEqual(keys(settled), ['translations.installed']);
});

test('a download that stops without installing says available; a cancelled wait says nothing', () => {
  const stopped = getDownloadStatusAnnouncements(
    statuses([
      ['engnet', 'downloading'],
      ['kjv', 'queued'],
    ]),
    [runtime, kjv],
    null,
    null
  );
  assert.deepEqual(keys(stopped), ['translations.available']);
});

test('an audio job is announced while it runs, and a Bible that left the list is forgotten', () => {
  const audioRunning = { ...runtime, activeDownloadJob: job('running') };
  const running = getDownloadStatusAnnouncements(statuses([]), [audioRunning], null, null);
  assert.deepEqual(keys(running), ['translations.downloading']);

  const hidden = getDownloadStatusAnnouncements(running.statuses, [kjv], null, null);
  assert.deepEqual(keys(hidden), []);
  assert.equal(hidden.statuses.has('engnet'), false);

  const shownAgain = getDownloadStatusAnnouncements(hidden.statuses, [audioRunning], null, null);
  assert.deepEqual(keys(shownAgain), ['translations.downloading']);
});
