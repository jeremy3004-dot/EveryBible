import test from 'node:test';
import assert from 'node:assert/strict';
import type { BibleTranslation } from '../../../types';
import {
  buildTranslationManageModel,
  getManageRowAccessibilityValue,
  getNewTestamentAudioBookIds,
  type TranslationManageModelInput,
} from './translationManageModel';

function bible(overrides: Partial<BibleTranslation> = {}): BibleTranslation {
  return {
    id: 'bsb',
    name: 'Berean Standard Bible',
    abbreviation: 'BSB',
    language: 'English',
    description: '',
    copyright: '',
    isDownloaded: true,
    downloadedBooks: [],
    downloadedAudioBooks: [],
    totalBooks: 66,
    sizeInMB: 4,
    hasText: true,
    hasAudio: true,
    audioGranularity: 'chapter',
    source: 'bundled',
    ...overrides,
  };
}

const ALL_BOOKS = ['GEN', 'EXO', 'MAT', 'MRK', 'REV'];

const model = (overrides: Partial<TranslationManageModelInput> = {}) =>
  buildTranslationManageModel({
    translation: bible(),
    downloadProgress: null,
    activeAudioDownloadKey: null,
    pinned: false,
    hidden: false,
    isSelected: false,
    canManageAudio: true,
    canDownloadAudio: true,
    canDownloadBookAudio: () => true,
    audioBookIds: ALL_BOOKS,
    collectionActions: ['full-bible', 'new-testament'],
    ...overrides,
  });

const runningJob = (kind: 'translation-audio' | 'audio-book', progress: number) => ({
  id: 'job',
  kind,
  state: 'running' as const,
  progress,
  startedAt: 0,
  updatedAt: 0,
});

test('New Testament audio books are listed in canon order', () => {
  assert.deepEqual(getNewTestamentAudioBookIds(['REV', 'GEN', 'MAT']), ['MAT', 'REV']);
});

test('library actions: pin or unpin, hide for an installed or pinned Bible, never the one being read', () => {
  assert.deepEqual(model().libraryActions, ['pin', 'hide']);
  assert.deepEqual(model({ pinned: true }).libraryActions, ['unpin', 'hide']);
  assert.deepEqual(model({ isSelected: true }).libraryActions, ['pin']);
  assert.deepEqual(model({ hidden: true }).libraryActions, ['pin']);
  assert.deepEqual(
    model({ translation: bible({ isDownloaded: false }) }).libraryActions,
    ['pin'],
    'nothing installed and not pinned: nothing to hide'
  );
});

test('delete is offered for stored data or a running audio download, but not mid text download', () => {
  const withAudio = bible({ downloadedAudioBooks: ['GEN'] });
  assert.ok(model({ translation: withAudio }).libraryActions.includes('delete'));
  assert.ok(model({ activeAudioDownloadKey: 'all' }).libraryActions.includes('delete'));
  assert.ok(
    model({
      translation: bible({ activeDownloadJob: runningJob('audio-book', 1) }),
    }).libraryActions.includes('delete')
  );
  assert.ok(
    !model({
      translation: bible({ id: 'engnet', textPackLocalPath: '/old' }),
      downloadProgress: { translationId: 'engnet', progress: 10 },
    }).libraryActions.includes('delete')
  );
});

test('the text row: installed, downloadable with its size, or busy with progress', () => {
  assert.deepEqual(model().textRows, [
    {
      key: 'text',
      meta: undefined,
      state: 'done',
      progress: null,
      indeterminate: false,
      canStart: false,
    },
  ]);

  const runtime = bible({
    id: 'engnet',
    isDownloaded: false,
    hasAudio: false,
    source: 'runtime',
    catalog: {
      version: '1',
      updatedAt: '2026-09-01',
      text: { format: 'sqlite', version: '1', downloadUrl: 'https://example.test/n', sha256: 'x' },
    },
  });
  const [idle] = model({ translation: runtime }).textRows;
  assert.deepEqual([idle?.state, idle?.meta, idle?.canStart], ['download', '~4 MB', true]);

  const [busy] = model({
    translation: runtime,
    downloadProgress: { translationId: 'engnet', progress: 60, isIndeterminate: true },
  }).textRows;
  assert.deepEqual(
    [busy?.state, busy?.progress, busy?.indeterminate, busy?.canStart],
    ['busy', 60, true, false]
  );
});

test('audio collections count downloaded books and go busy with the running job', () => {
  const translation = bible({
    downloadedAudioBooks: ['MAT'],
    activeDownloadJob: runningJob('translation-audio', 25),
  });
  const { audioRows } = model({ translation });
  assert.deepEqual(
    audioRows.map((row) => [row.key, row.meta, row.state, row.progress, row.canStart]),
    [
      ['full-bible', '1/5', 'busy', 25, false],
      ['new-testament', '1/3', 'download', null, false],
    ]
  );
});

test('with nothing streamable, collections and books are unavailable but still listed', () => {
  const result = model({ canDownloadAudio: false, canDownloadBookAudio: () => false });
  assert.deepEqual(
    result.audioRows.map((row) => row.state),
    ['unavailable', 'unavailable']
  );
  assert.ok(result.audioBookRows.every((row) => row.state === 'unavailable' && !row.canStart));
});

test('book rows: done, busy for the book being fetched, and nothing startable while busy', () => {
  const result = model({
    translation: bible({ downloadedAudioBooks: ['GEN'] }),
    activeAudioDownloadKey: 'book:EXO',
    canDownloadBookAudio: (bookId) => bookId !== 'REV',
  });
  assert.deepEqual(
    result.audioBookRows.map((row) => [row.bookId, row.state, row.canStart]),
    [
      ['GEN', 'done', false],
      ['EXO', 'busy', false],
      ['MAT', 'download', false],
      ['MRK', 'download', false],
      ['REV', 'unavailable', false],
    ]
  );
});

test('no audio section without manageable audio or known book coverage', () => {
  for (const overrides of [{ canManageAudio: false }, { audioBookIds: [] }]) {
    const result = model(overrides);
    assert.equal(result.showsAudio, false);
    assert.deepEqual([result.audioRows, result.audioBookRows], [[], []]);
  }
});

test('a manage row states its download status in words, since it is otherwise only a glyph', () => {
  const t = (key: string) => `<${key}>`;

  assert.deepEqual(
    [
      getManageRowAccessibilityValue({ state: 'done' }, t),
      getManageRowAccessibilityValue({ state: 'unavailable' }, t),
      getManageRowAccessibilityValue({ state: 'download' }, t),
      getManageRowAccessibilityValue({ state: 'download', meta: '1.2 GB' }, t),
      getManageRowAccessibilityValue({ state: 'busy', progress: 40 }, t),
      getManageRowAccessibilityValue({ state: 'busy', progress: 40, indeterminate: true }, t),
      getManageRowAccessibilityValue({ state: 'busy' }, t),
    ],
    [
      '<translations.installed>',
      '<bible.notAvailableYet>',
      '<translations.download>',
      '<translations.download>, 1.2 GB',
      '40%',
      '<translations.downloading>',
      '<translations.downloading>',
    ]
  );
});
