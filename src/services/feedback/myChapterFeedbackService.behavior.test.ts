import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';
import type { MyChapterFeedbackRow } from './myChapterFeedbackService';

// One mock configuration for the whole file; `backend.configured` and the fake's
// scripted table responder drive every scenario.
const supabaseFake = createSupabaseFake();
const backend = { configured: true };

const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => backend.configured,
  getCurrentUserId: async () => 'user-a',
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

type MyFeedbackModule = typeof import('./myChapterFeedbackService');
let myFeedback: MyFeedbackModule;

const row = (overrides: Partial<MyChapterFeedbackRow> = {}): MyChapterFeedbackRow => ({
  id: 'feedback-1',
  book_id: 'JHN',
  chapter: 3,
  sentiment: 'down',
  comment: 'Verse 16 reads oddly',
  audio_response_path: null,
  created_at: '2026-05-01T00:00:00.000Z',
  scripture_council_resolution: null,
  ...overrides,
});

test.before(async () => {
  myFeedback = await import('./myChapterFeedbackService');
});

test.beforeEach(() => {
  supabaseFake.reset();
  backend.configured = true;
});

test('fetchMyChapterFeedback reports an unconfigured backend instead of an empty history', async () => {
  backend.configured = false;

  const result = await myFeedback.fetchMyChapterFeedback();

  assert.deepEqual(result, {
    success: false,
    feedback: [],
    error: 'EveryBible backend is not configured for this build yet.',
  });
  assert.deepEqual(supabaseFake.callsFor('chapter_feedback_submissions'), []);
});

test('fetchMyChapterFeedback reads the newest submissions the RLS policy allows', async () => {
  supabaseFake.respondTo('chapter_feedback_submissions', () => ({
    data: [row(), row({ id: 'feedback-2', scripture_council_resolution: 'fixed' })],
  }));

  const result = await myFeedback.fetchMyChapterFeedback();

  assert.equal(result.success, true);
  assert.deepEqual(
    result.feedback.map((item) => [item.id, item.status]),
    [
      ['feedback-1', 'received'],
      ['feedback-2', 'fixed'],
    ]
  );

  const [query] = supabaseFake.callsFor('chapter_feedback_submissions');
  assert.equal(query?.operation, 'select');
  assert.equal(
    query?.columns,
    'id, book_id, chapter, sentiment, comment, audio_response_path, created_at, scripture_council_resolution'
  );
  assert.deepEqual(query?.steps.find((step) => step.method === 'order')?.args, [
    'created_at',
    { ascending: false },
  ]);
  assert.deepEqual(query?.steps.find((step) => step.method === 'limit')?.args, [200]);
});

test('fetchMyChapterFeedback returns an empty history when the query yields no rows', async () => {
  supabaseFake.respondTo('chapter_feedback_submissions', () => ({ data: null }));

  const result = await myFeedback.fetchMyChapterFeedback();

  assert.deepEqual(result, { success: true, feedback: [] });
});

test('fetchMyChapterFeedback marks a submission with audio as having audio', async () => {
  supabaseFake.respondTo('chapter_feedback_submissions', () => ({
    data: [row({ audio_response_path: 'user-a/feedback-1.m4a' })],
  }));

  const result = await myFeedback.fetchMyChapterFeedback();

  assert.equal(result.feedback[0]?.hasAudio, true);
});

test('fetchMyChapterFeedback surfaces the PostgREST error message', async () => {
  supabaseFake.respondTo('chapter_feedback_submissions', () => ({
    data: null,
    error: { message: 'permission denied for table chapter_feedback_submissions' },
  }));

  const result = await myFeedback.fetchMyChapterFeedback();

  assert.deepEqual(result, {
    success: false,
    feedback: [],
    error: 'permission denied for table chapter_feedback_submissions',
  });
});

test('fetchMyChapterFeedback uses generic copy for an error with no message', async () => {
  supabaseFake.respondTo('chapter_feedback_submissions', () => ({
    data: null,
    error: {} as never,
  }));

  const result = await myFeedback.fetchMyChapterFeedback();

  assert.equal(result.error, 'Unable to load your feedback right now.');
});

test('fetchMyChapterFeedback reports a thrown transport failure', async () => {
  const result = await myFeedback.fetchMyChapterFeedback({
    fetchOwnSubmissions: async () => {
      throw new Error('Network request failed');
    },
  });

  assert.deepEqual(result, {
    success: false,
    feedback: [],
    error: 'Network request failed',
  });
});

test('fetchMyChapterFeedback uses generic copy when a non-Error value is thrown', async () => {
  const result = await myFeedback.fetchMyChapterFeedback({
    fetchOwnSubmissions: async () => {
      throw 'boom';
    },
  });

  assert.equal(result.error, 'Unable to load your feedback right now.');
});

test('fetchMyChapterFeedback reads through an injected client instead of Supabase', async () => {
  const result = await myFeedback.fetchMyChapterFeedback({
    fetchOwnSubmissions: async () => ({ data: [row({ id: 'injected-1' })], error: null }),
  });

  assert.equal(result.success, true);
  assert.deepEqual(
    result.feedback.map((item) => item.id),
    ['injected-1']
  );
  assert.deepEqual(supabaseFake.callsFor('chapter_feedback_submissions'), []);
});

test('mapMyChapterFeedbackRow reports a council resolution as the submission status', async () => {
  assert.deepEqual(
    myFeedback.mapMyChapterFeedbackRow(
      row({
        scripture_council_resolution: 'no_change_needed',
        audio_response_path: 'user-a/feedback-1.m4a',
      })
    ),
    {
      id: 'feedback-1',
      bookId: 'JHN',
      chapter: 3,
      sentiment: 'down',
      comment: 'Verse 16 reads oddly',
      hasAudio: true,
      createdAt: '2026-05-01T00:00:00.000Z',
      status: 'no_change_needed',
    }
  );
});
