import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as sanitizers from './persistedStateSanitizers';
import * as authState from './sanitizers/authState';
import * as audioState from './sanitizers/audioState';
import * as bibleState from './sanitizers/bibleState';
import * as libraryState from './sanitizers/libraryState';
import * as progressState from './sanitizers/progressState';
import * as runtimeTranslation from './sanitizers/runtimeTranslation';
import {
  SANITIZER_IDENTITY_CASES,
  SANITIZER_IDENTITY_NOW,
} from './__tests__/sanitizerIdentityCorpus';
import {
  decodeSanitizerIdentityOutcome,
  runSanitizerIdentityCase,
} from './__tests__/sanitizerIdentityEncoding';
import { SANITIZER_IDENTITY_EXPECTED } from './__tests__/sanitizerIdentity.expected';

// Outputs were captured from the single-file implementation before it was split into
// src/stores/sanitizers/. Every case must still produce exactly the same value.
mock.method(Date, 'now', () => SANITIZER_IDENTITY_NOW);

test('the identity corpus and its captured outputs cover the same cases', () => {
  assert.deepEqual(
    SANITIZER_IDENTITY_CASES.map(({ name }) => name).sort(),
    Object.keys(SANITIZER_IDENTITY_EXPECTED).sort()
  );
});

test('the old import path re-exports the per-store modules unchanged', () => {
  const modules = [authState, audioState, bibleState, libraryState, progressState];
  const publicRuntime = {
    isRuntimeCatalogSnapshotEntry: runtimeTranslation.isRuntimeCatalogSnapshotEntry,
    sanitizeLegacyPersistedRuntimeTranslations:
      runtimeTranslation.sanitizeLegacyPersistedRuntimeTranslations,
    sanitizeRuntimeCatalogSnapshotEntries: runtimeTranslation.sanitizeRuntimeCatalogSnapshotEntries,
  };
  const expected: Record<string, unknown> = Object.assign({}, ...modules, publicRuntime);
  assert.deepEqual(Object.keys(sanitizers).sort(), Object.keys(expected).sort());
  for (const [name, value] of Object.entries(sanitizers)) {
    assert.equal(value, expected[name], name);
  }
});

for (const identityCase of SANITIZER_IDENTITY_CASES) {
  test(`sanitizer output is unchanged: ${identityCase.name}`, () => {
    const expected = SANITIZER_IDENTITY_EXPECTED[identityCase.name];
    assert.ok(expected !== undefined, `no captured output for ${identityCase.name}`);
    assert.equal(runSanitizerIdentityCase(identityCase, sanitizers), expected);
    assert.deepStrictEqual(identityCase.run(sanitizers), decodeSanitizerIdentityOutcome(expected));
  });
}
