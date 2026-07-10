import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fetchMyChapterFeedback,
  mapMyChapterFeedbackRow,
} from './myChapterFeedbackService';

test('mapMyChapterFeedbackRow derives status and audio presence from the row', () => {
  assert.deepEqual(
    mapMyChapterFeedbackRow({
      id: 'feedback-1',
      book_id: 'GEN',
      chapter: 1,
      sentiment: 'down',
      comment: 'Needs a clearer verb.',
      audio_response_path: 'user/clip.m4a',
      created_at: '2026-05-22T01:00:00Z',
      scripture_council_resolution: 'fixed',
    }),
    {
      id: 'feedback-1',
      bookId: 'GEN',
      chapter: 1,
      sentiment: 'down',
      comment: 'Needs a clearer verb.',
      hasAudio: true,
      createdAt: '2026-05-22T01:00:00Z',
      status: 'fixed',
    }
  );
});

test('unresolved submissions surface as "received"', () => {
  assert.equal(
    mapMyChapterFeedbackRow({
      id: 'feedback-2',
      book_id: 'EXO',
      chapter: 3,
      sentiment: 'up',
      comment: null,
      audio_response_path: null,
      created_at: '2026-05-22T01:00:00Z',
      scripture_council_resolution: null,
    }).status,
    'received'
  );
});

test('fetchMyChapterFeedback maps the signed-in user rows on success', async () => {
  const result = await fetchMyChapterFeedback({
    fetchOwnSubmissions: async () => ({
      data: [
        {
          id: 'feedback-1',
          book_id: 'GEN',
          chapter: 1,
          sentiment: 'down',
          comment: 'note',
          audio_response_path: null,
          created_at: '2026-05-22T01:00:00Z',
          scripture_council_resolution: 'no_change_needed',
        },
      ],
      error: null,
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.feedback.length, 1);
  assert.equal(result.feedback[0]?.status, 'no_change_needed');
  assert.equal(result.feedback[0]?.hasAudio, false);
});

test('fetchMyChapterFeedback surfaces query errors without throwing', async () => {
  const result = await fetchMyChapterFeedback({
    fetchOwnSubmissions: async () => ({
      data: null,
      error: { message: 'permission denied' },
    }),
  });

  assert.equal(result.success, false);
  assert.equal(result.feedback.length, 0);
  assert.equal(result.error, 'permission denied');
});
