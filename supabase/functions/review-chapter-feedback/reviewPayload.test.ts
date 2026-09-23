import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIO_URL_TTL_SECONDS,
  LEGACY_LIST_AUDIO_URL_TTL_SECONDS,
  type ChapterFeedbackReviewRow,
  signsListAudio,
  toReviewFeedbackItem,
} from './reviewPayload.ts';

const row: ChapterFeedbackReviewRow = {
  contributor_category: 'community',
  id: 'feedback-1',
  created_at: '2026-09-20T10:00:00.000Z',
  translation_id: 'bsb',
  translation_language: 'English',
  book_id: 'JHN',
  chapter: 3,
  sentiment: 'down',
  comment: 'Verse 16 reads awkwardly.',
  participant_name: 'Asha',
  participant_role: 'Village elder',
  participant_id_number: 'NP-4471-22',
  user_id: null,
  source_screen: 'bible_reader',
  audio_response_bucket: 'chapter-feedback-audio',
  audio_response_path: 'anonymous/feedback-1.m4a',
  audio_response_mime_type: 'audio/mp4',
  audio_response_size_bytes: 48000,
  audio_response_duration_ms: 12000,
  audio_response_created_at: '2026-09-20T10:00:05.000Z',
  scripture_council_resolution: null,
  scripture_council_fixed_at: null,
  scripture_council_fixed_note: null,
};

test('v2 review items carry only what the review screen shows', () => {
  assert.deepEqual(toReviewFeedbackItem(row, 2, null), {
    contributorCategory: 'community',
    id: 'feedback-1',
    createdAt: '2026-09-20T10:00:00.000Z',
    translationId: 'bsb',
    translationLanguage: 'English',
    bookId: 'JHN',
    chapter: 3,
    sentiment: 'down',
    comment: 'Verse 16 reads awkwardly.',
    participantName: 'Asha',
    participantRole: null,
    participantIdNumber: null,
    sourceScreen: 'bible_reader',
    resolution: null,
    resolvedAt: null,
    resolutionNote: null,
    audioResponse: {
      createdAt: '2026-09-20T10:00:05.000Z',
      durationMs: 12000,
      mimeType: 'audio/mp4',
      playbackUrl: null,
      sizeBytes: 48000,
    },
  });
});

test('v2 lists never carry a recording URL, even if one is passed in', () => {
  assert.equal(signsListAudio(2), false);
  assert.equal(
    toReviewFeedbackItem(row, 2, 'https://signed.example/a')?.audioResponse?.playbackUrl,
    null
  );
});

test('installed pre-v2 clients keep their response shape, including list playback URLs', () => {
  assert.equal(signsListAudio(undefined), true);
  const legacy = toReviewFeedbackItem(row, undefined, 'https://signed.example/a');
  assert.equal(legacy.participantRole, 'Village elder');
  assert.equal(legacy.participantIdNumber, 'NP-4471-22');
  assert.equal(legacy.audioResponse?.playbackUrl, 'https://signed.example/a');
});

test('a legacy id number that is really the submitter auth UUID is never returned', () => {
  const uuid = '0b8f6a52-4c1e-4a57-9d8e-6f1b2c3d4e5f';
  const item = toReviewFeedbackItem(
    { ...row, user_id: uuid, participant_id_number: uuid },
    undefined,
    null
  );
  assert.equal(item.participantIdNumber, null);
});

test('on-demand recording links are short-lived; legacy list links keep one hour', () => {
  assert.equal(AUDIO_URL_TTL_SECONDS, 600);
  assert.equal(LEGACY_LIST_AUDIO_URL_TTL_SECONDS, 3600);
});
