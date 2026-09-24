import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { en } from '../../i18n/locales/en';
import type { ChapterFeedbackReviewItem } from '../../services/feedback/chapterFeedbackReviewService';
import { feedbackDecisionAnnouncement } from './feedbackResponseAccessibility';

async function englishT() {
  const instance = createInstance();
  await instance.init({ lng: 'en', fallbackLng: false, resources: { en: { translation: en } } });
  return instance.getFixedT('en');
}

const item = (overrides: Partial<ChapterFeedbackReviewItem> = {}): ChapterFeedbackReviewItem => ({
  id: 'a',
  createdAt: '2026-03-28T10:00:00Z',
  translationId: 'bsb',
  translationLanguage: 'en',
  bookId: 'GEN',
  chapter: 3,
  sentiment: 'down',
  comment: 'Offspring should stay singular',
  participantName: 'Anna',
  participantRole: null,
  participantIdNumber: null,
  sourceScreen: 'reader',
  resolution: null,
  resolvedAt: null,
  resolutionNote: null,
  audioResponse: null,
  contributorCategory: 'scripture_council',
  ...overrides,
});

test('a decision announces the outcome the card moves to', async () => {
  const t = await englishT();
  assert.deepEqual(
    [
      feedbackDecisionAnnouncement(t, item({ sentiment: 'up' }), 'no_change_needed'),
      feedbackDecisionAnnouncement(t, item(), 'fixed'),
      feedbackDecisionAnnouncement(t, item(), 'no_change_needed'),
      feedbackDecisionAnnouncement(t, item({ resolution: 'fixed' }), null),
    ],
    ['Reviewed', 'Addressed', 'No change needed', 'Needs review']
  );
});
