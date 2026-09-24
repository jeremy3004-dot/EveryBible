import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDefined } from './assertDefined';

test('assertDefined returns the value when it is defined, including falsy values', () => {
  assert.equal(assertDefined(0, 'count'), 0);
  assert.equal(assertDefined('', 'label'), '');
  assert.equal(assertDefined(null, 'row'), null);
  assert.deepEqual(assertDefined([1][0], 'first item'), 1);
});

test('assertDefined throws a message naming what was missing', () => {
  const empty: number[] = [];
  assert.throws(() => assertDefined(empty[0], 'first item'), {
    message: 'Expected first item to be defined',
  });
});
