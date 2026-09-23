import assert from 'node:assert/strict';
import test from 'node:test';

import { assertEnv, getMissingEnvKeys } from './shared-contracts';

test('getMissingEnvKeys reports unset and whitespace-only keys in the requested order', () => {
  assert.deepEqual(getMissingEnvKeys(['A', 'B', 'C', 'D'], { A: 'value', B: '  ', D: '' }), [
    'B',
    'C',
    'D',
  ]);
});

test('getMissingEnvKeys treats a padded value as present', () => {
  assert.deepEqual(getMissingEnvKeys(['A'], { A: ' value ' }), []);
});

test('assertEnv passes silently when every key is set', () => {
  assert.doesNotThrow(() => assertEnv(['A', 'B'], { A: '1', B: '2' }, 'Scope'));
});

test('assertEnv names the scope and every missing key', () => {
  assert.throws(() => assertEnv(['A', 'B', 'C'], { B: 'set' }, 'Site server env'), {
    message: 'Site server env is missing required environment variables: A, C',
  });
});
