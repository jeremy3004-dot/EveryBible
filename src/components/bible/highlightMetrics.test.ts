import test from 'node:test';
import assert from 'node:assert/strict';
import { getCompactHighlightVerticalInset } from './highlightMetrics';

test('compact highlight insets stay close to the verse text', () => {
  assert.equal(getCompactHighlightVerticalInset(20, 28), 4);
  assert.equal(getCompactHighlightVerticalInset(12, 14), 2);
  assert.equal(getCompactHighlightVerticalInset(18, undefined), 2);
  assert.equal(getCompactHighlightVerticalInset(undefined, undefined), 2);
});
