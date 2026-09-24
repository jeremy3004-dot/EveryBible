import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRhythmSlotDefaultTitle,
  inferRhythmSlotFromTitle,
  normalizeRhythmSlot,
  RHYTHM_SLOT_ORDER,
} from './rhythmSlots';

test('every slot in display order has its own default title', () => {
  assert.deepEqual(RHYTHM_SLOT_ORDER.map(getRhythmSlotDefaultTitle), [
    'Morning Rhythm',
    'Afternoon Rhythm',
    'Evening Rhythm',
  ]);
});

test('normalizeRhythmSlot keeps known slots and drops anything else', () => {
  assert.equal(normalizeRhythmSlot('evening'), 'evening');
  assert.equal(normalizeRhythmSlot('midnight'), undefined);
  assert.equal(normalizeRhythmSlot(''), undefined);
  assert.equal(normalizeRhythmSlot(null), undefined);
  assert.equal(normalizeRhythmSlot(undefined), undefined);
});

test('inferRhythmSlotFromTitle reads the slot out of a title regardless of case and padding', () => {
  assert.equal(inferRhythmSlotFromTitle('Morning Rhythm'), 'morning');
  assert.equal(inferRhythmSlotFromTitle('  my AFTERNOON walk '), 'afternoon');
  assert.equal(inferRhythmSlotFromTitle('Evening prayers'), 'evening');
});

test('inferRhythmSlotFromTitle finds no slot in a title that names none', () => {
  assert.equal(inferRhythmSlotFromTitle('Lunch break'), undefined);
  assert.equal(inferRhythmSlotFromTitle('   '), undefined);
  assert.equal(inferRhythmSlotFromTitle(null), undefined);
  assert.equal(inferRhythmSlotFromTitle(undefined), undefined);
});
