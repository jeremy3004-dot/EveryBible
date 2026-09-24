import test, { beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockMmkvStorage } from '../../testing/mockModules';
import { emptyTextPackInstallJournal, upsertTextPackInstall } from './textPackInstallJournalModel';

const mmkv = mockMmkvStorage(mock);

const JOURNAL_KEY = 'bible.textPackInstallJournal.v1';
const loadJournal = () => import('./textPackInstallJournal');

const install = {
  operationId: 'op-1',
  translationId: 'npiulb',
  version: '2026.09.12',
  finalPath: '/translations/npiulb.db',
  stagingPath: '/translations/npiulb.staging.db',
  rollbackPath: '/translations/npiulb.db.rollback',
  phase: 'downloading' as const,
  updatedAt: 1,
};

beforeEach(() => {
  mmkv.store.clear();
});

test('a journal with work in flight survives a write and a fresh read', async () => {
  const { readTextPackInstallJournal, writeTextPackInstallJournal } = await loadJournal();
  const journal = upsertTextPackInstall(emptyTextPackInstallJournal(), install);

  writeTextPackInstallJournal(journal);

  assert.deepEqual(readTextPackInstallJournal(), journal);
});

test('writing an empty journal removes the stored key instead of persisting an empty object', async () => {
  const { readTextPackInstallJournal, writeTextPackInstallJournal } = await loadJournal();
  mmkv.store.set(JOURNAL_KEY, JSON.stringify({ installs: {}, deletions: {} }));

  writeTextPackInstallJournal(emptyTextPackInstallJournal());

  assert.equal(mmkv.store.has(JOURNAL_KEY), false);
  assert.deepEqual(readTextPackInstallJournal(), emptyTextPackInstallJournal());
});

test('reading with nothing stored yields an empty journal', async () => {
  const { readTextPackInstallJournal } = await loadJournal();
  assert.deepEqual(readTextPackInstallJournal(), emptyTextPackInstallJournal());
});

test('stored JSON that is not a journal shape reads as an empty journal', async () => {
  const { readTextPackInstallJournal } = await loadJournal();
  for (const raw of [
    '[]',
    'null',
    '{"installs":{}}',
    '{"installs":[],"deletions":{}}',
    '{"installs":{},"deletions":"x"}',
  ]) {
    mmkv.store.set(JOURNAL_KEY, raw);
    assert.deepEqual(readTextPackInstallJournal(), emptyTextPackInstallJournal(), raw);
  }
});

test('journal entries of the wrong shape are dropped and the well-formed ones are kept', async () => {
  const { readTextPackInstallJournal } = await loadJournal();
  const deletion = {
    operationId: 'del-1',
    translationId: 'esv1',
    paths: ['/translations/esv1.db'],
    updatedAt: 2,
  };
  // Recovery reads finalPath/stagingPath/rollbackPath and iterates paths. An entry without them
  // throws inside its try on every pass, is never retired, and so re-runs the whole recovery
  // (a filesystem sweep of every cloud translation) before every chapter read, forever.
  mmkv.store.set(
    JOURNAL_KEY,
    JSON.stringify({
      installs: {
        npiulb: install,
        nullEntry: null,
        noPaths: { operationId: 'op-2', translationId: 'noPaths', version: '1' },
        numericPath: { ...install, translationId: 'numericPath', finalPath: 42 },
        list: [install],
      },
      deletions: {
        esv1: deletion,
        pathsNotAList: { ...deletion, translationId: 'pathsNotAList', paths: '/x.db' },
        pathsWithJunk: { ...deletion, translationId: 'pathsWithJunk', paths: ['/y.db', 7] },
        noOperation: { translationId: 'noOperation', paths: [] },
      },
    })
  );

  assert.deepEqual(readTextPackInstallJournal(), {
    installs: { npiulb: install },
    deletions: { esv1: deletion },
  });
});

test('corrupt stored bytes read as an empty journal rather than throwing', async () => {
  const { readTextPackInstallJournal } = await loadJournal();
  mmkv.store.set(JOURNAL_KEY, '{"installs":');

  assert.deepEqual(readTextPackInstallJournal(), emptyTextPackInstallJournal());
});
