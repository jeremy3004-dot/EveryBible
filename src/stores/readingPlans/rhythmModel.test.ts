import test from 'node:test';
import assert from 'node:assert/strict';

import type { ReadingPlanRhythm, ReadingPlanRhythmItem } from '../../services/plans/types';
import {
  moveRhythmItemByIndex,
  normalizeRhythmCollections,
  normalizeRhythmItems,
  removePlanFromRhythms,
  resolveRhythmTitle,
  RHYTHM_MUTATION_ERROR_CODES,
  validateRhythmItems,
} from './rhythmModel';

const plan = (id: string, planId: string): ReadingPlanRhythmItem => ({ id, type: 'plan', planId });

const rhythm = (
  id: string,
  title: string,
  items: ReadingPlanRhythmItem[],
  updatedAt = 'then'
): ReadingPlanRhythm => ({ id, title, items, createdAt: 'then', updatedAt });

test('rhythm items are trimmed, de-duplicated and given passage titles', () => {
  const items = normalizeRhythmItems({
    items: [
      plan('a', ' plan-a '),
      plan('b', 'plan-a'),
      plan('a', 'plan-b'),
      { id: 'p', type: 'passage', title: ' ', bookId: 'PSA', startChapter: 3.7, endChapter: 1 },
      { id: 'q', type: 'passage', title: 'Mine', bookId: ' ', startChapter: 1, endChapter: 1 },
    ],
  });

  assert.deepEqual(items, [
    plan('a', 'plan-a'),
    { id: 'p', type: 'passage', title: 'PSA 3', bookId: 'PSA', startChapter: 3, endChapter: 3 },
  ]);
});

test('plan ids stand in for items when no items are given', () => {
  const items = normalizeRhythmItems({ planIds: [' plan-a ', 'plan-a', '', 'plan-b'] });

  assert.deepEqual(
    items.map((item) => (item.type === 'plan' ? item.planId : item.title)),
    ['plan-a', 'plan-b']
  );
  assert.equal(new Set(items.map((item) => item.id)).size, 2);
});

test('a blank title falls back to the first unused slot title, then "Rhythm N"', () => {
  const taken = {
    m: rhythm('m', 'Morning Rhythm', []),
    a: rhythm('a', 'afternoon rhythm', []),
  };

  assert.equal(resolveRhythmTitle('  Dawn ', taken), 'Dawn');
  assert.equal(resolveRhythmTitle(' ', taken, undefined, 'morning'), 'Evening Rhythm');
  assert.equal(resolveRhythmTitle(undefined, taken, 'm', 'morning'), 'Morning Rhythm');
  assert.equal(
    resolveRhythmTitle(null, { ...taken, e: rhythm('e', 'Evening Rhythm', []) }),
    'Rhythm 1'
  );
});

test('a plan may belong to only one rhythm', () => {
  const rhythmsById = { r1: rhythm('r1', 'One', [plan('a', 'plan-a')]) };

  assert.equal(
    validateRhythmItems(rhythmsById, [plan('x', 'plan-a')]),
    RHYTHM_MUTATION_ERROR_CODES.planInAnotherRhythm
  );
  assert.equal(validateRhythmItems(rhythmsById, [plan('x', 'plan-a')], 'r1'), null);
});

test('the rhythm order keeps existing rhythms once and appends any it omits', () => {
  const rhythmsById = { r1: rhythm('r1', 'One', []), r2: rhythm('r2', 'Two', []) };

  assert.deepEqual(normalizeRhythmCollections(rhythmsById, ['r2', 'gone', 'r2']).rhythmOrder, [
    'r2',
    'r1',
  ]);
});

test('an item moves one place and never off either end', () => {
  const items = [plan('a', 'plan-a'), plan('b', 'plan-b')];

  assert.deepEqual(moveRhythmItemByIndex(items, 1, 'up'), [items[1], items[0]]);
  assert.equal(moveRhythmItemByIndex(items, 0, 'up'), null);
  assert.equal(moveRhythmItemByIndex(items, 1, 'down'), null);
  assert.equal(moveRhythmItemByIndex(items, -1, 'down'), null);
  assert.deepEqual(items, [plan('a', 'plan-a'), plan('b', 'plan-b')]);
});

test('removing a plan from rhythms deletes a rhythm it empties and restamps the rest', () => {
  const kept = rhythm('r3', 'Three', [plan('c', 'plan-c')]);
  const next = removePlanFromRhythms(
    {
      rhythmsById: {
        r1: rhythm('r1', 'One', [plan('a', 'plan-a')]),
        r2: rhythm('r2', 'Two', [plan('a2', 'plan-a'), plan('b', 'plan-b')]),
        r3: kept,
      },
      rhythmOrder: ['r3', 'r1', 'r2'],
    },
    'plan-a'
  );

  assert.deepEqual(next.rhythmOrder, ['r3', 'r2']);
  assert.equal(next.rhythmsById.r3, kept);
  assert.deepEqual(next.rhythmsById.r2?.items, [plan('b', 'plan-b')]);
  assert.notEqual(next.rhythmsById.r2?.updatedAt, 'then');
});
