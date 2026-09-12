import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyTextPackInstallJournal,
  removeTextPackDeletion,
  removeTextPackInstall,
  upsertTextPackDeletion,
  upsertTextPackInstall,
} from './textPackInstallJournalModel';

test('text pack journal records and removes installs and deletion tombstones independently', () => {
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
  const deletion = {
    operationId: 'op-2',
    translationId: 'npiulb',
    paths: ['/translations/npiulb.db'],
    updatedAt: 2,
  };

  let journal = upsertTextPackInstall(emptyTextPackInstallJournal(), install);
  journal = upsertTextPackDeletion(journal, deletion);
  assert.deepEqual(journal.installs.npiulb, install);
  assert.deepEqual(journal.deletions.npiulb, deletion);

  journal = removeTextPackInstall(journal, 'npiulb');
  assert.equal(journal.installs.npiulb, undefined);
  assert.deepEqual(journal.deletions.npiulb, deletion);

  journal = removeTextPackDeletion(journal, 'npiulb');
  assert.deepEqual(journal, emptyTextPackInstallJournal());
});
