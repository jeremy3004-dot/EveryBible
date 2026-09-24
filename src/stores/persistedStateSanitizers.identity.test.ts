import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as sanitizers from './persistedStateSanitizers';
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

for (const identityCase of SANITIZER_IDENTITY_CASES) {
  test(`sanitizer output is unchanged: ${identityCase.name}`, () => {
    const expected = SANITIZER_IDENTITY_EXPECTED[identityCase.name];
    assert.ok(expected !== undefined, `no captured output for ${identityCase.name}`);
    assert.equal(runSanitizerIdentityCase(identityCase, sanitizers), expected);
    assert.deepStrictEqual(identityCase.run(sanitizers), decodeSanitizerIdentityOutcome(expected));
  });
}
