import test from 'node:test';
import assert from 'node:assert/strict';
import { asStringArray, mergeSanitizedState } from './persistedShapeGuards';

const current = { ids: ['current'], label: 'current', count: 1 };

test('a persisted value that is not an object leaves the current state untouched', () => {
  for (const persisted of [undefined, null, 'text', 3, ['ids']]) {
    assert.equal(mergeSanitizedState(persisted, current, { ids: asStringArray }), current);
  }
});

test('fields the blob does not carry keep their current value; carried ones are coerced', () => {
  const merged = mergeSanitizedState({ ids: 'not-a-list', label: 'stored' }, current, {
    ids: asStringArray,
  });

  assert.deepEqual(merged, { ids: [], label: 'stored', count: 1 });
});

test('unsanitized fields pass through exactly as zustand’s default merge would', () => {
  const merged = mergeSanitizedState({ count: 9, extra: true }, current, { ids: asStringArray });

  assert.deepEqual(merged, { ids: ['current'], label: 'current', count: 9, extra: true });
});
