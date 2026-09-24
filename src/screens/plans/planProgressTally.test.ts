import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { en } from '../../i18n/locales/en';
import { formatPlanProgressAnnouncement, formatPlanProgressTally } from './planProgressTally';

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

// The day grid is hidden from screen readers, so the card's heading row has to
// say the whole of it in one stop rather than as "Day", "1", "/365" fragments.
test('the progress card announces the current day and the tally together', async () => {
  const t = await englishT();
  assert.equal(
    formatPlanProgressAnnouncement(t, { currentDay: 1, done: 0, missed: 0, totalDays: 365 }),
    'Day 1 of 365, Completed, 0 of 365 days'
  );
  assert.equal(
    formatPlanProgressAnnouncement(t, { currentDay: 9, done: 6, missed: 2, totalDays: 31 }),
    'Day 9 of 31, Completed, 6 of 31 days · 2 missed'
  );
});
