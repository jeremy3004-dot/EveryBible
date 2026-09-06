import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCRIPTURE_COLORS,
  SCRIPTURE_PRESENTATION,
  SCRIPTURE_VISUAL_ORDER,
  scriptureVisualCategory,
} from './presentation';

test('Scripture presentation uses FIELD labels and canonical theme colors', () => {
  assert.deepEqual(SCRIPTURE_VISUAL_ORDER, [
    'bible',
    'nt',
    'portions',
    'no-scripture',
    'unknown',
  ]);
  assert.deepEqual(SCRIPTURE_PRESENTATION, {
    bible: { label: 'Full Bible', color: '#1e8a7a' },
    nt: { label: 'New Testament', color: '#db9b1a' },
    portions: { label: 'Portions', color: '#bf6d3b' },
    'no-scripture': { label: 'No known Scripture', color: '#c62a3a' },
    unknown: { label: 'Unknown', color: '#7e7972' },
  });
  assert.deepEqual(SCRIPTURE_COLORS.dark, {
    bible: '#36c9b3',
    nt: '#efb748',
    portions: '#d68b5c',
    'no-scripture': '#e34f5b',
    unknown: '#a39b8a',
  });
});

test('stored progress states share presentation without turning unknown red', () => {
  assert.equal(scriptureVisualCategory('started'), 'no-scripture');
  assert.equal(scriptureVisualCategory('needed'), 'no-scripture');
  assert.equal(scriptureVisualCategory('unknown'), 'unknown');
});


test('unverified dialects start red while exact verified availability determines their color', () => {
  assert.equal(scriptureVisualCategory('unknown', 'dialect'), 'no-scripture');
  for (const status of ['bible', 'nt', 'portions'] as const) {
    assert.equal(scriptureVisualCategory(status, 'dialect'), status);
  }
  assert.equal(scriptureVisualCategory('unknown', 'language'), 'unknown');
  assert.equal(scriptureVisualCategory('unknown', 'people-group'), 'unknown');
});
