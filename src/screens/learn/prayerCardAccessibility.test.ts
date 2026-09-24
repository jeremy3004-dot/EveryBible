import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { en } from '../../i18n/locales/en';
import {
  buildPrayerCardAccessibilityLabel,
  prayerInteractionAnnouncement,
  prayerRequestActionAnnouncement,
} from './prayerCardAccessibility';

async function englishT() {
  const instance = createInstance();
  await instance.init({ lng: 'en', fallbackLng: false, resources: { en: { translation: en } } });
  return instance.getFixedT('en');
}

const baseCard = {
  displayName: 'Group member',
  relativeTime: '2 hr ago',
  isAnswered: false,
  content: 'Pray for my mother',
  prayedCount: 3,
  encouragedCount: 1,
  hasPrayed: false,
  hasEncouraged: false,
};

test('the prayer card reads author, time, request and both counts as one stop', async () => {
  const t = await englishT();
  assert.equal(
    buildPrayerCardAccessibilityLabel(t, baseCard),
    'Group member, 2 hr ago, Pray for my mother, 3 prayed, 1 encouraged'
  );
});

test('the prayer card says when the viewer has already prayed and encouraged', async () => {
  const t = await englishT();
  assert.equal(
    buildPrayerCardAccessibilityLabel(t, {
      ...baseCard,
      isAnswered: true,
      hasPrayed: true,
      hasEncouraged: true,
    }),
    'Group member, 2 hr ago, Answered, Pray for my mother, 3 prayed, You prayed for this, 1 encouraged, You encouraged this'
  );
});

test('a toggle announces the state it lands in, for both interactions', async () => {
  const t = await englishT();
  assert.deepEqual(
    [
      prayerInteractionAnnouncement(t, 'prayed', true),
      prayerInteractionAnnouncement(t, 'prayed', false),
      prayerInteractionAnnouncement(t, 'encouraged', true),
      prayerInteractionAnnouncement(t, 'encouraged', false),
    ],
    ['You prayed for this', 'Prayer mark removed', 'You encouraged this', 'Encouragement removed']
  );
});

test('marking a request answered and removing one are both spoken', async () => {
  const t = await englishT();
  assert.deepEqual(
    [
      prayerRequestActionAnnouncement(t, 'markAnswered'),
      prayerRequestActionAnnouncement(t, 'delete'),
    ],
    ['Marked as answered', 'Prayer request removed']
  );
});
