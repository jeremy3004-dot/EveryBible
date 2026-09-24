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

test('corrupt stored bytes read as an empty journal rather than throwing', async () => {
  const { readTextPackInstallJournal } = await loadJournal();
  mmkv.store.set(JOURNAL_KEY, '{"installs":');

  assert.deepEqual(readTextPackInstallJournal(), emptyTextPackInstallJournal());
});
