import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { en } from '../../i18n/locales/en';
import {
  getPlanDayRowAccessibility,
  getPlanSessionAccessibilityValue,
} from './planDayRowAccessibility';

async function englishT() {
  const instance = createInstance();
  await instance.init({ lng: 'en', fallbackLng: false, resources: { en: { translation: en } } });
  return instance.getFixedT('en');
}

const row = {
  dayNumber: 4,
  dateLabel: null,
  refs: 'Genesis 7, Genesis 8',
  isCurrent: false,
  isCompleted: false,
  isNext: false,
};

test('a ledger day reads its number and chapters, with no state while it is open', async () => {
  const t = await englishT();
  assert.deepEqual(getPlanDayRowAccessibility(t, row), {
    label: 'Day 4: Genesis 7, Genesis 8',
    value: undefined,
  });
});

test('a scheduled day keeps its date and says when it is finished', async () => {
  const t = await englishT();
  assert.deepEqual(
    getPlanDayRowAccessibility(t, { ...row, dateLabel: 'Sep 3', isCompleted: true }),
    { label: 'Day 4, Sep 3: Genesis 7, Genesis 8', value: { text: 'Completed' } }
  );
});

test('the day after today is announced as tomorrow', async () => {
  const t = await englishT();
  assert.deepEqual(getPlanDayRowAccessibility(t, { ...row, isNext: true }).value, {
    text: 'Tomorrow',
  });
});

// The Today card sets its own label, which replaced the target line inside it.
test('the Today card keeps its target line and says when it is finished', async () => {
  const t = await englishT();
  assert.deepEqual(
    getPlanDayRowAccessibility(t, {
      ...row,
      isCurrent: true,
      isCompleted: true,
      subtitle: "Today's target: 1/3 chapters",
    }),
    {
      label: "Current plan day 4: Genesis 7, Genesis 8, Today's target: 1/3 chapters",
      value: { text: 'Completed' },
    }
  );
});

test('only a finished session pill carries a state', async () => {
  const t = await englishT();
  assert.deepEqual(
    (['done', 'next', 'upcoming', 'available'] as const).map((state) =>
      getPlanSessionAccessibilityValue(t, state)
    ),
    [{ text: 'Completed' }, undefined, undefined, undefined]
  );
});
