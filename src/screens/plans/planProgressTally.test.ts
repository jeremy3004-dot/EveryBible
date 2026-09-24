import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { en } from '../../i18n/locales/en';
import { formatPlanProgressTally } from './planProgressTally';

async function englishT() {
  const instance = createInstance();
  await instance.init({ lng: 'en', fallbackLng: false, resources: { en: { translation: en } } });
  return instance.getFixedT('en');
}

// The card's eyebrow reads "COMPLETED"; the value under it has to say what is
// being counted. "0 read" left readers guessing between chapters and days.
test('the progress tally counts days against the length of the plan', async () => {
  const t = await englishT();
  assert.equal(formatPlanProgressTally(t, { done: 0, missed: 0, totalDays: 365 }), '0 of 365 days');
  assert.equal(formatPlanProgressTally(t, { done: 1, missed: 0, totalDays: 1 }), '1 of 1 day');
});

test('the progress tally keeps missed days, also counted in days', async () => {
  const t = await englishT();
  assert.equal(
    formatPlanProgressTally(t, { done: 4, missed: 2, totalDays: 31 }),
    '4 of 31 days · 2 missed'
  );
});
