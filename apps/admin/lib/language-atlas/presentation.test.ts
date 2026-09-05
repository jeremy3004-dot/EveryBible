import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCRIPTURE_PRESENTATION,
  SCRIPTURE_VISUAL_ORDER,
  scriptureVisualCategory,
} from './presentation';

test('Scripture presentation uses the reference labels and exact fixed colors', () => {
  assert.deepEqual(SCRIPTURE_VISUAL_ORDER, [
    'bible',
    'nt',
    'portions',
    'no-scripture',
    'unknown',
  ]);
  assert.deepEqual(SCRIPTURE_PRESENTATION, {
    bible: { label: 'Full Bible', color: '#10b981' },
    nt: { label: 'New Testament', color: '#eab308' },
    portions: { label: 'Portions', color: '#eb6a38' },
    'no-scripture': { label: 'No Scripture', color: '#ef4444' },
    unknown: { label: 'Unknown', color: '#94a3b8' },
  });
});

test('stored progress states share presentation without turning unknown red', () => {
  assert.equal(scriptureVisualCategory('started'), 'no-scripture');
  assert.equal(scriptureVisualCategory('needed'), 'no-scripture');
  assert.equal(scriptureVisualCategory('unknown'), 'unknown');
});
