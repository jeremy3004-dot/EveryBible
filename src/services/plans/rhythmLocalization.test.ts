import test from 'node:test';
import assert from 'node:assert/strict';
import type { TFunction } from 'i18next';
import { getLocalizedRhythmTitle } from './rhythmLocalization';

const t = ((key: string, options?: Record<string, unknown>) =>
  options ? `${key}(${JSON.stringify(options)})` : key) as unknown as TFunction;

test('automatic rhythm titles follow the interface language', () => {
  assert.equal(getLocalizedRhythmTitle('Morning Rhythm', t), 'readingPlans.morningRhythm');
  assert.equal(getLocalizedRhythmTitle('Afternoon Rhythm', t), 'readingPlans.afternoonRhythm');
  assert.equal(getLocalizedRhythmTitle('Evening Rhythm', t), 'readingPlans.eveningRhythm');
  assert.equal(getLocalizedRhythmTitle('Rhythm 3', t), 'readingPlans.rhythmNumber({"number":3})');
});

test('titles a reader typed are shown exactly as written', () => {
  assert.equal(getLocalizedRhythmTitle('My morning prayers', t), 'My morning prayers');
  assert.equal(getLocalizedRhythmTitle('Rhythm of grace', t), 'Rhythm of grace');
});
