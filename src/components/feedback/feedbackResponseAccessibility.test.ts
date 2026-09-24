import test from 'node:test';
import assert from 'node:assert/strict';
import { createInstance } from 'i18next';
import { en } from '../../i18n/locales/en';
import type { ChapterFeedbackReviewItem } from '../../services/feedback/chapterFeedbackReviewService';
import {
  buildFeedbackResponseAccessibilityLabel,
  feedbackDecisionAnnouncement,
  getFeedbackCardActions,
} from './feedbackResponseAccessibility';

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

const voiceNote = {
  createdAt: null,
  durationMs: 12_000,
  mimeType: 'audio/m4a',
  playbackUrl: null,
  sizeBytes: null,
};

test('an open card reads verdict, source, comment, sender and date', async () => {
  const t = await englishT();
  assert.equal(
    buildFeedbackResponseAccessibilityLabel(t, item(), '3/28/2026'),
    'Needs work, Scripture Council, Offspring should stay singular, Anna, 3/28/2026'
  );
});

test('a card says a voice note is attached, names an unknown sender, and gives its outcome', async () => {
  const t = await englishT();
  assert.equal(
    buildFeedbackResponseAccessibilityLabel(
      t,
      item({
        sentiment: 'up',
        comment: null,
        participantName: null,
        contributorCategory: 'community',
        audioResponse: voiceNote,
        resolution: 'no_change_needed',
      }),
      '3/28/2026'
    ),
    'Accurate, Community, Voice note attached, Unknown contributor, 3/28/2026, Reviewed'
  );
});

test('an open card offers its nested controls as custom actions', async () => {
  const t = await englishT();
  assert.deepEqual(
    getFeedbackCardActions(t, item({ sentiment: 'up', audioResponse: voiceNote }), {
      isPlaying: false,
      busy: false,
    }),
    [
      { name: 'play', label: 'Listen' },
      { name: 'markReviewed', label: 'Mark reviewed' },
    ]
  );
  assert.deepEqual(
    getFeedbackCardActions(t, item({ audioResponse: voiceNote }), { isPlaying: true, busy: true }),
    [{ name: 'play', label: 'Pause' }]
  );
});

test('a settled card is not pressable, so it offers no custom actions', async () => {
  const t = await englishT();
  assert.deepEqual(
    getFeedbackCardActions(t, item({ resolution: 'fixed', audioResponse: voiceNote }), {
      isPlaying: false,
      busy: false,
    }),
    []
  );
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
