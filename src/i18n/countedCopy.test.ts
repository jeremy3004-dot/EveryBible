import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance, type TFunction } from 'i18next';
import { en } from './locales/en';
import { localeLoaders } from './localeLoaders';
import { formatRelativeTime } from './interfaceFormatting';
import { describeSyncStatus } from '../utils/syncStatus';

async function translatorFor(code: 'en' | keyof typeof localeLoaders): Promise<TFunction> {
  const locale = code === 'en' ? en : await localeLoaders[code]();
  const instance = createInstance();
  await instance.init({
    lng: code,
    fallbackLng: false,
    resources: { [code]: { translation: locale } },
  });
  return instance.getFixedT(code);
}

const NOW = Date.UTC(2026, 8, 1, 12);
const minutesAgo = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

test('English copy that sits beside a count of one uses the singular noun', async () => {
  const t = await translatorFor('en');

  // The 1st of every month has one elapsed day.
  assert.equal(t('readingActivity.legendProgress', { read: 0, count: 1 }), '0 of 1 day');
  assert.equal(t('readingActivity.legendProgress', { read: 3, count: 12 }), '3 of 12 days');
  assert.equal(
    t('home.ledgerThisMonth', { month: 'September', active: 0, count: 1 }),
    'September · 0 of 1 day'
  );
  assert.equal(
    t('home.ledgerThisMonth', { month: 'September', active: 4, count: 9 }),
    'September · 4 of 9 days'
  );
  // A translator queue with one chapter left, and a one-psalm rhythm passage.
  assert.equal(t('translatorQueue.pendingCount', { count: 1 }), '1 chapter to review');
  assert.equal(t('translatorQueue.pendingCount', { count: 4 }), '4 chapters to review');
  assert.equal(t('readingPlans.chapterCount', { count: 1 }), '1 chapter');
  assert.equal(t('readingPlans.chapterCount', { count: 3 }), '3 chapters');
});

test('relative times can agree with a count of one in languages that inflect the unit', async () => {
  const t = await translatorFor('mr');

  assert.equal(formatRelativeTime(minutesAgo(1), t, NOW), '1 मिनिटापूर्वी');
  assert.equal(formatRelativeTime(minutesAgo(5), t, NOW), '5 मिनिटांपूर्वी');
  assert.equal(formatRelativeTime(minutesAgo(60), t, NOW), '1 तासापूर्वी');
  assert.equal(formatRelativeTime(minutesAgo(24 * 60), t, NOW), '1 दिवसापूर्वी');

  const status = describeSyncStatus({
    isAuthenticated: true,
    lastSyncedAt: minutesAgo(1),
    t,
    now: NOW,
  });
  assert.match(status.label, /1 मिनिटापूर्वी/);
});
