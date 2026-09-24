import assert from 'node:assert/strict';
import test from 'node:test';
import { isSleepTimerOptionSelected } from './sleepTimerSelection';
import { SLEEP_TIMER_OPTIONS } from '../../types/audio';

const selectedValues = (
  minutes: (typeof SLEEP_TIMER_OPTIONS)[number]['value'],
  remaining: number | null
) =>
  SLEEP_TIMER_OPTIONS.filter((option) =>
    isSleepTimerOptionSelected(option.value, minutes, remaining)
  ).map((option) => option.value);

test('with no timer running only Off is selected', () => {
  assert.deepEqual(selectedValues(null, null), [null]);
});

test('a running timer selects the option that started it', () => {
  assert.deepEqual(selectedValues(15, 12), [15]);
});

test('a paused timer keeps its option selected', () => {
  assert.deepEqual(selectedValues(30, 30), [30]);
});

test('a length remembered from an earlier session does not select anything but Off', () => {
  // sleepTimerMinutes is persisted, but the countdown is not: after a relaunch there is no
  // timer, so the remembered length must not read as the active option.
  assert.deepEqual(selectedValues(60, null), [null]);
});
