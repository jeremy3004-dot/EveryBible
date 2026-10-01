import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRuntimeTranslation } from '../__tests__/bibleStoreDoubles';
import type { TextPackInstallJournalEntry } from '../../services/bible/textPackInstallJournalModel';
import {
  collectTextPackArtifactPaths,
  installStateAfterTextCancel,
  isBundledSeedTranslation,
  journalRecoveredVersion,
  journalRecoveryExpectedSha256,
  mapTextPackDownloadProgress,
  markTextPackInstalled,
  rebaseTextPackJournalPaths,
  rebaseTextPackPath,
  rebaseTranslationPackPaths,
  restoreTextPackAfterFailedReadback,
} from './textPackInstallModel';

const CURRENT_DOCS = 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/';

test('rebaseTextPackPath moves a pack path from an old app container onto the current one', () => {
  assert.equal(
    rebaseTextPackPath(
      'file:///var/mobile/Containers/Data/Application/OLD-UUID/Documents/translations/esv1.db',
      CURRENT_DOCS
    ),
    `${CURRENT_DOCS}translations/esv1.db`
  );
});

test('rebaseTextPackPath leaves current, unrelated and unresolvable paths alone', () => {
  const current = `${CURRENT_DOCS}translations/esv1.db`;
  assert.equal(rebaseTextPackPath(current, CURRENT_DOCS), current);
  assert.equal(rebaseTextPackPath('file:///packs/esv1.db', CURRENT_DOCS), 'file:///packs/esv1.db');
  assert.equal(
    rebaseTextPackPath('file:///old/Documents/translations/esv1.db', undefined),
    'file:///old/Documents/translations/esv1.db'
  );
});

test('rebaseTranslationPackPaths rewrites every pack path field and is a no-op when current', () => {
  const old = 'file:///var/OLD/Documents/translations/';
  const translations = [
    makeRuntimeTranslation({
      id: 'esv1',
      textPackLocalPath: `${old}esv1.db`,
      pendingTextPackLocalPath: `${old}esv1.p.db`,
      rollbackTextPackLocalPath: `${old}esv1.db.rollback`,
    }),
    makeRuntimeTranslation({ id: 'bsb2', textPackLocalPath: null }),
  ];
  const rebased = rebaseTranslationPackPaths(translations, CURRENT_DOCS);
  assert.equal(rebased[0]?.textPackLocalPath, `${CURRENT_DOCS}translations/esv1.db`);
  assert.equal(rebased[0]?.pendingTextPackLocalPath, `${CURRENT_DOCS}translations/esv1.p.db`);
  assert.equal(
    rebased[0]?.rollbackTextPackLocalPath,
    `${CURRENT_DOCS}translations/esv1.db.rollback`
  );
  assert.equal(rebased[1], translations[1]);
  assert.equal(rebaseTranslationPackPaths(rebased, CURRENT_DOCS), rebased);
});

test('rebaseTextPackPath leaves a current path alone even when the container itself has a translations folder', () => {
  const docs = 'file:///data/translations/app/Documents/';
  const current = `${docs}translations/esv1.db`;

  assert.equal(rebaseTextPackPath(current, docs), current);
});

test('rebaseTextPackPath re-anchors a path that starts at the translations folder', () => {
  assert.equal(
    rebaseTextPackPath('/translations/esv1.db', CURRENT_DOCS),
    `${CURRENT_DOCS}translations/esv1.db`
  );
});

test('rebaseTranslationPackPaths returns the same list when every saved path is already current', () => {
  const translations = [
    makeRuntimeTranslation({
      id: 'esv1',
      textPackLocalPath: `${CURRENT_DOCS}translations/esv1.db`,
    }),
  ];

  assert.equal(rebaseTranslationPackPaths(translations, CURRENT_DOCS), translations);
});

function makeJournalInstall(
  overrides: Partial<TextPackInstallJournalEntry> = {}
): TextPackInstallJournalEntry {
  return {
    operationId: 'esv1:1:1',
    translationId: 'esv1',
    version: '3',
    expectedSha256: 'new-sha',
    previousPath: 'file:///packs/esv1.v2.db',
    previousVersion: '2',
    finalPath: 'file:///packs/esv1.db',
    stagingPath: 'file:///packs/esv1.staging.db',
    rollbackPath: 'file:///packs/esv1.rollback.db',
    phase: 'downloading',
    updatedAt: 1,
    ...overrides,
  };
}

test('byte progress is reported as a percentage of the expected size', () => {
  assert.deepEqual(
    mapTextPackDownloadProgress('esv1', {
      phase: 'fetching',
      totalVerses: 0,
      versesDownloaded: 0,
      bytesDownloaded: 250,
      bytesTotal: 1_000,
    }),
    {
      translationId: 'esv1',
      progress: 25,
      status: 'downloading',
      error: undefined,
      bytesDownloaded: 250,
      bytesTotal: 1_000,
    }
  );
});

// The expected size is the response's advertised length, which the bytes written can pass
// (a compressed response, say). The picker renders this value as `${progress}%`.
test('a transfer that overshoots its expected size is reported as 100%, never more', () => {
  assert.deepEqual(
    [
      mapTextPackDownloadProgress('esv1', {
        phase: 'fetching',
        totalVerses: 0,
        versesDownloaded: 0,
        bytesDownloaded: 1_340,
        bytesTotal: 1_000,
      }).progress,
      mapTextPackDownloadProgress('esv1', {
        phase: 'indexing',
        totalVerses: 100,
        versesDownloaded: 120,
      }).progress,
    ],
    [100, 100]
  );
});

test('without a byte total, progress falls back to verses indexed', () => {
  const progress = mapTextPackDownloadProgress('esv1', {
    phase: 'indexing',
    totalVerses: 400,
    versesDownloaded: 100,
  });

  assert.deepEqual(
    {
      progress: progress.progress,
      status: progress.status,
      indeterminate: progress.isIndeterminate,
    },
    { progress: 25, status: 'installing', indeterminate: undefined }
  );
});

test('a transfer whose length is unknown (-1) reports verses indexed instead', () => {
  const progress = mapTextPackDownloadProgress('esv1', {
    phase: 'fetching',
    totalVerses: 400,
    versesDownloaded: 100,
    bytesDownloaded: 5_000,
    bytesTotal: -1,
  });

  assert.equal(progress.progress, 25);
});

test('a transfer that knows its size but has written nothing yet is at 0%', () => {
  const progress = mapTextPackDownloadProgress('esv1', {
    phase: 'fetching',
    totalVerses: 0,
    versesDownloaded: 0,
    bytesTotal: 100,
  });

  assert.equal(progress.progress, 0);
});

test('the smallest possible totals still measure progress', () => {
  assert.deepEqual(
    [
      mapTextPackDownloadProgress('esv1', {
        phase: 'fetching',
        totalVerses: 0,
        versesDownloaded: 0,
        bytesDownloaded: 1,
        bytesTotal: 1,
      }).progress,
      mapTextPackDownloadProgress('esv1', {
        phase: 'indexing',
        totalVerses: 1,
        versesDownloaded: 1,
      }).progress,
    ],
    [100, 100]
  );
});

test('a transfer with no size to measure against is shown as indeterminate', () => {
  const progress = mapTextPackDownloadProgress('esv1', {
    phase: 'fetching',
    totalVerses: 0,
    versesDownloaded: 0,
    bytesDownloaded: 512,
  });

  assert.deepEqual(
    { progress: progress.progress, indeterminate: progress.isIndeterminate },
    { progress: 0, indeterminate: true }
  );
});

test('finished and failed transfers are never indeterminate and carry their outcome', () => {
  const done = mapTextPackDownloadProgress('esv1', {
    phase: 'complete',
    totalVerses: 0,
    versesDownloaded: 0,
  });
  const failed = mapTextPackDownloadProgress('esv1', {
    phase: 'error',
    error: 'checksum mismatch',
    totalVerses: 0,
    versesDownloaded: 0,
  });

  assert.deepEqual(
    [done, failed].map(({ status, error, isIndeterminate }) => ({
      status,
      error,
      isIndeterminate,
    })),
    [
      { status: 'completed', error: undefined, isIndeterminate: undefined },
      { status: 'error', error: 'checksum mismatch', isIndeterminate: undefined },
    ]
  );
});

test('only a bundled translation with text and no installed pack counts as seeded', () => {
  assert.deepEqual(
    [
      makeRuntimeTranslation({ source: 'bundled', hasText: true, textPackLocalPath: null }),
      makeRuntimeTranslation({
        source: 'bundled',
        hasText: true,
        textPackLocalPath: 'file:///a.db',
      }),
      makeRuntimeTranslation({ source: 'runtime', hasText: true, textPackLocalPath: null }),
      makeRuntimeTranslation({ source: 'bundled', hasText: false }),
      undefined,
    ].map(isBundledSeedTranslation),
    [true, false, false, false, false]
  );
});

test('an installed pack marks the row downloaded, readable and installed at that path', () => {
  const row = makeRuntimeTranslation({ id: 'esv1', hasText: false, lastInstallError: 'kept' });

  assert.deepEqual(markTextPackInstalled(row, 'file:///packs/esv1.db', '3'), {
    ...row,
    isDownloaded: true,
    hasText: true,
    installState: 'installed',
    textPackLocalPath: 'file:///packs/esv1.db',
    activeTextPackVersion: '3',
  });
});

test('a failed read-back returns the row to the pack it had before the download', () => {
  const previous = makeRuntimeTranslation({
    id: 'esv1',
    textPackLocalPath: 'file:///packs/esv1.v2.db',
    activeTextPackVersion: '2',
  });
  const candidate = markTextPackInstalled(previous, 'file:///packs/esv1.v3.db', '3');

  const restored = restoreTextPackAfterFailedReadback(candidate, previous);

  assert.deepEqual(
    {
      isDownloaded: restored.isDownloaded,
      installState: restored.installState,
      textPackLocalPath: restored.textPackLocalPath,
      activeTextPackVersion: restored.activeTextPackVersion,
    },
    {
      isDownloaded: true,
      installState: 'installed',
      textPackLocalPath: 'file:///packs/esv1.v2.db',
      activeTextPackVersion: '2',
    }
  );
});

test('a failed read-back that falls back to an earlier pack marks the row readable again', () => {
  const previous = makeRuntimeTranslation({
    id: 'esv1',
    textPackLocalPath: 'file:///packs/esv1.v2.db',
    activeTextPackVersion: '2',
  });

  const restored = restoreTextPackAfterFailedReadback({ ...previous, hasText: false }, previous);

  assert.equal(restored.hasText, true);
});

test('a failed first read-back leaves the row remote-only with no pack path', () => {
  const candidate = markTextPackInstalled(
    makeRuntimeTranslation({ id: 'esv1' }),
    'file:///packs/esv1.db',
    '3'
  );

  const restored = restoreTextPackAfterFailedReadback(candidate, undefined);

  assert.deepEqual(
    {
      isDownloaded: restored.isDownloaded,
      installState: restored.installState,
      textPackLocalPath: restored.textPackLocalPath,
    },
    { isDownloaded: false, installState: 'remote-only', textPackLocalPath: null }
  );
});

test('a cancelled text transfer settles to installed only when a pack is already on disk', () => {
  assert.deepEqual(
    [
      makeRuntimeTranslation({ textPackLocalPath: 'file:///packs/a.db' }),
      makeRuntimeTranslation({ textPackLocalPath: null }),
    ].map(installStateAfterTextCancel),
    ['installed', 'remote-only']
  );
});

test('deletion collects every pack path from the row and the pending journal entry, once each', () => {
  const row = makeRuntimeTranslation({
    textPackLocalPath: 'file:///packs/esv1.db',
    pendingTextPackLocalPath: '',
    rollbackTextPackLocalPath: 'file:///packs/esv1.rollback.db',
  });

  assert.deepEqual(collectTextPackArtifactPaths(row, makeJournalInstall({ previousPath: null })), [
    'file:///packs/esv1.db',
    'file:///packs/esv1.rollback.db',
    'file:///packs/esv1.staging.db',
  ]);
  assert.deepEqual(collectTextPackArtifactPaths(makeRuntimeTranslation(), undefined), []);
});

test('recovery holds only a pack known to be the new download to the new checksum', () => {
  assert.deepEqual(
    [
      journalRecoveryExpectedSha256('current', makeJournalInstall()),
      journalRecoveryExpectedSha256(
        'current-without-rollback',
        makeJournalInstall({ phase: 'activating' })
      ),
      journalRecoveryExpectedSha256('current-without-rollback', makeJournalInstall()),
      journalRecoveryExpectedSha256('previous', makeJournalInstall()),
    ],
    ['new-sha', 'new-sha', undefined, undefined]
  );
});

test('recovery registers the version of whichever pack ended up at the final path', () => {
  assert.deepEqual(
    [
      journalRecoveredVersion('current', makeJournalInstall()),
      journalRecoveredVersion('previous', makeJournalInstall()),
      journalRecoveredVersion('current-without-rollback', makeJournalInstall()),
      journalRecoveredVersion(
        'current-without-rollback',
        makeJournalInstall({ phase: 'activating' })
      ),
      journalRecoveredVersion('previous', makeJournalInstall({ previousVersion: null })),
      journalRecoveredVersion('current', makeJournalInstall({ version: '' })),
    ],
    ['3', '2', '2', '3', undefined, undefined]
  );
});

test('rebaseTextPackJournalPaths moves every install path, including the previous pack', () => {
  const old = 'file:///var/OLD/Documents/translations/';
  const journal = {
    installs: {
      esv1: makeJournalInstall({
        previousPath: `${old}esv1.v2.db`,
        finalPath: `${old}esv1.db`,
        stagingPath: `${old}esv1.staging.db`,
        rollbackPath: `${old}esv1.rollback.db`,
      }),
    },
    deletions: {},
  };

  const rebased = rebaseTextPackJournalPaths(journal, CURRENT_DOCS);

  assert.deepEqual(rebased.installs.esv1, {
    ...journal.installs.esv1,
    previousPath: `${CURRENT_DOCS}translations/esv1.v2.db`,
    finalPath: `${CURRENT_DOCS}translations/esv1.db`,
    stagingPath: `${CURRENT_DOCS}translations/esv1.staging.db`,
    rollbackPath: `${CURRENT_DOCS}translations/esv1.rollback.db`,
  });
});

test('rebaseTextPackJournalPaths returns the same journal when nothing moved', () => {
  const journal = {
    installs: { esv1: makeJournalInstall({ previousPath: undefined }) },
    deletions: {
      bsb2: {
        operationId: 'bsb2:1',
        translationId: 'bsb2',
        paths: ['file:///packs/bsb2.db'],
        updatedAt: 1,
      },
    },
  };

  assert.equal(rebaseTextPackJournalPaths(journal, CURRENT_DOCS), journal);
});
