import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mockModule, sourcePath } from '../../testing/mockModules';
import { createSupabaseFake } from '../../testing/supabaseFake';

// One mock configuration for the whole file; `backend.configured` and the fake's
// scripted edge-function responder drive every scenario.
const supabaseFake = createSupabaseFake();
const backend = { configured: true };

const supabaseExports = {
  supabase: supabaseFake.client,
  isSupabaseConfigured: () => backend.configured,
  getCurrentUserId: async () => null,
};
mockModule(mock, sourcePath('services/supabase/index.ts'), supabaseExports);
mockModule(mock, sourcePath('services/supabase/client.ts'), supabaseExports);

type ReviewModule = typeof import('./chapterFeedbackReviewService');
let review: ReviewModule;

const NOT_CONFIGURED = 'EveryBible backend is not configured for this build yet.';
const ACCESS_DENIED = 'Translator access denied';

const reviewInput = { translationId: 'bsb', bookId: 'JHN', chapter: 3, passcode: '  123456  ' };
const summaryInput = { translationId: 'bsb', bookId: 'JHN', passcode: '123456' };
const resolveInput = {
  passcode: '123456',
  translationId: 'bsb',
  feedbackId: 'feedback-1',
  resolution: 'fixed' as const,
  note: 'Reworded verse 16',
};
const reopenInput = { passcode: '123456', translationId: 'bsb', feedbackId: 'feedback-1' };

/** The body the service sent to `review-chapter-feedback` on the first invoke. */
const sentBody = () => supabaseFake.functionCalls[0]?.options as { body: Record<string, unknown> };

const edgeError = (overrides: Record<string, unknown> = {}) => ({
  data: null,
  error: { message: 'Edge Function returned a non-2xx status code', ...overrides },
});

test.before(async () => {
  review = await import('./chapterFeedbackReviewService');
});

test.beforeEach(() => {
  supabaseFake.reset();
  backend.configured = true;
});

// ---------------------------------------------------------------------------
// Passcode gate
// ---------------------------------------------------------------------------

test('a blank passcode is refused before the review endpoint is called', async () => {
  const results = await Promise.all([
    review.validateTranslatorReviewPasscode('   '),
    review.fetchChapterFeedbackForTranslatorReview({ ...reviewInput, passcode: '' }),
    review.fetchChapterFeedbackReviewSummaryForTranslation({ ...summaryInput, passcode: '  ' }),
    review.resolveTranslatorFeedbackOnServer({ ...resolveInput, passcode: '' }),
    review.reopenTranslatorFeedbackOnServer({ ...reopenInput, passcode: '\t' }),
  ]);

  assert.deepEqual(
    results.map((result) => result.error),
    [ACCESS_DENIED, ACCESS_DENIED, ACCESS_DENIED, ACCESS_DENIED, ACCESS_DENIED]
  );
  assert.deepEqual(
    results.map((result) => result.success),
    [false, false, false, false, false]
  );
  assert.equal(supabaseFake.functionCalls.length, 0);
});

test('the passcode is trimmed before it reaches the review endpoint', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true, feedback: [] } }));

  await review.fetchChapterFeedbackForTranslatorReview(reviewInput);

  assert.equal(sentBody().body.passcode, '123456');
});

// ---------------------------------------------------------------------------
// Unconfigured backend
// ---------------------------------------------------------------------------

test('every review call reports an unconfigured backend without inventing data', async () => {
  backend.configured = false;

  const [validation, feedback, summary, resolved, reopened] = await Promise.all([
    review.validateTranslatorReviewPasscode('123456'),
    review.fetchChapterFeedbackForTranslatorReview(reviewInput),
    review.fetchChapterFeedbackReviewSummaryForTranslation(summaryInput),
    review.resolveTranslatorFeedbackOnServer(resolveInput),
    review.reopenTranslatorFeedbackOnServer(reopenInput),
  ]);

  assert.deepEqual(validation, { success: false, error: NOT_CONFIGURED });
  assert.deepEqual(feedback, { success: false, feedback: [], error: NOT_CONFIGURED });
  assert.deepEqual(summary, { success: false, chapters: [], error: NOT_CONFIGURED });
  assert.deepEqual(resolved, { success: false, error: NOT_CONFIGURED });
  assert.deepEqual(reopened, { success: false, error: NOT_CONFIGURED });
  assert.equal(supabaseFake.functionCalls.length, 0);
});

// ---------------------------------------------------------------------------
// Passcode validation
// ---------------------------------------------------------------------------

test('validateTranslatorReviewPasscode asks the default client for a validate-only check', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true } }));

  const result = await review.validateTranslatorReviewPasscode('123456', 'bsb');

  assert.deepEqual(result, { success: true, error: undefined });
  assert.equal(supabaseFake.functionCalls[0]?.name, 'review-chapter-feedback');
  assert.deepEqual(sentBody().body, {
    passcode: '123456',
    translationId: 'bsb',
    validateOnly: true,
  });
});

test('validateTranslatorReviewPasscode surfaces a lockout message from the server', async () => {
  supabaseFake.respondToFunction(() =>
    edgeError({
      context: { json: async () => ({ error: 'Too many attempts. Try again in 15 minutes.' }) },
    })
  );

  const result = await review.validateTranslatorReviewPasscode('000000');

  assert.deepEqual(result, {
    success: false,
    error: 'Too many attempts. Try again in 15 minutes.',
  });
});

test('validateTranslatorReviewPasscode falls back when the error body has no error field', async () => {
  supabaseFake.respondToFunction(() => edgeError({ context: { json: async () => ({}) } }));

  const result = await review.validateTranslatorReviewPasscode('000000');

  assert.equal(result.error, 'Unable to verify translator access right now.');
});

test('validateTranslatorReviewPasscode keeps a specific wrapper message over the fallback', async () => {
  supabaseFake.respondToFunction(() => ({
    data: null,
    error: { message: 'Failed to send a request to the Edge Function' },
  }));

  const result = await review.validateTranslatorReviewPasscode('123456');

  assert.equal(result.error, 'Failed to send a request to the Edge Function');
});

test('validateTranslatorReviewPasscode falls back when the error carries a blank message', async () => {
  supabaseFake.respondToFunction(() => ({ data: null, error: { message: '   ' } }));

  const result = await review.validateTranslatorReviewPasscode('123456');

  assert.equal(result.error, 'Unable to verify translator access right now.');
});

test('validateTranslatorReviewPasscode falls back when the error body cannot be parsed', async () => {
  supabaseFake.respondToFunction(() =>
    edgeError({
      context: {
        json: async () => {
          throw new Error('not json');
        },
      },
    })
  );

  const result = await review.validateTranslatorReviewPasscode('000000');

  assert.equal(result.error, 'Unable to verify translator access right now.');
});

test('validateTranslatorReviewPasscode rejects a response that carries no verdict', async () => {
  supabaseFake.respondToFunction(() => ({ data: null }));

  const result = await review.validateTranslatorReviewPasscode('123456');

  assert.deepEqual(result, { success: false, error: 'Unable to verify translator access.' });
});

test('validateTranslatorReviewPasscode reports a thrown transport failure', async () => {
  const result = await review.validateTranslatorReviewPasscode('123456', undefined, {
    invoke: async () => {
      throw new Error('Network request failed');
    },
  });

  assert.deepEqual(result, { success: false, error: 'Network request failed' });
});

test('validateTranslatorReviewPasscode uses generic copy when a non-Error value is thrown', async () => {
  const result = await review.validateTranslatorReviewPasscode('123456', undefined, {
    invoke: async () => {
      throw 'boom';
    },
  });

  assert.equal(result.error, 'Unable to verify translator access.');
});

// ---------------------------------------------------------------------------
// Feedback queue
// ---------------------------------------------------------------------------

test('fetchChapterFeedbackForTranslatorReview returns the server queue for one chapter', async () => {
  const feedback = [
    {
      id: 'feedback-1',
      createdAt: '2026-05-01T00:00:00.000Z',
      translationId: 'bsb',
      translationLanguage: 'English',
      bookId: 'JHN',
      chapter: 3,
      sentiment: 'down' as const,
      comment: 'Verse 16 reads oddly',
      participantName: 'Miriam',
      participantRole: 'Church leader',
      participantIdNumber: null,
      userId: 'user-a',
      sourceScreen: 'reader',
      resolution: null,
      resolvedAt: null,
      resolutionNote: null,
      audioResponse: null,
    },
  ];
  supabaseFake.respondToFunction(() => ({ data: { success: true, feedback } }));

  const result = await review.fetchChapterFeedbackForTranslatorReview(reviewInput);

  assert.deepEqual(result, { success: true, feedback });
  assert.deepEqual(sentBody().body, {
    translationId: 'bsb',
    bookId: 'JHN',
    chapter: 3,
    passcode: '123456',
  });
});

test('fetchChapterFeedbackForTranslatorReview reports a server error without a queue', async () => {
  supabaseFake.respondToFunction(() =>
    edgeError({ context: { json: async () => ({ error: 'Translator access denied' }) } })
  );

  const result = await review.fetchChapterFeedbackForTranslatorReview(reviewInput);

  assert.deepEqual(result, { success: false, feedback: [], error: ACCESS_DENIED });
});

test('fetchChapterFeedbackForTranslatorReview rejects a response shaped like a summary', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true, chapters: [] } }));

  const result = await review.fetchChapterFeedbackForTranslatorReview(reviewInput);

  assert.deepEqual(result, {
    success: false,
    feedback: [],
    error: 'Unable to load translator feedback.',
  });
});

test('fetchChapterFeedbackForTranslatorReview reports a thrown transport failure', async () => {
  const result = await review.fetchChapterFeedbackForTranslatorReview(reviewInput, {
    invoke: async () => {
      throw new Error('Network request failed');
    },
  });

  assert.deepEqual(result, { success: false, feedback: [], error: 'Network request failed' });
});

test('fetchChapterFeedbackForTranslatorReview uses generic copy when a non-Error value is thrown', async () => {
  const result = await review.fetchChapterFeedbackForTranslatorReview(reviewInput, {
    invoke: async () => {
      throw 'boom';
    },
  });

  assert.equal(result.error, 'Unable to load translator feedback.');
});

// ---------------------------------------------------------------------------
// Chapter summaries
// ---------------------------------------------------------------------------

test('fetchChapterFeedbackReviewSummaryForTranslation returns the per-chapter counts', async () => {
  const chapters = [{ bookId: 'JHN', chapter: 3, total: 4, unresolvedDown: 2, unresolvedUp: 1 }];
  supabaseFake.respondToFunction(() => ({ data: { success: true, chapters } }));

  const result = await review.fetchChapterFeedbackReviewSummaryForTranslation(summaryInput);

  assert.deepEqual(result, { success: true, chapters });
  assert.deepEqual(sentBody().body, {
    translationId: 'bsb',
    bookId: 'JHN',
    passcode: '123456',
  });
});

test('fetchChapterFeedbackReviewSummaryForTranslation asks for a whole translation when no book is given', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true, chapters: [] } }));

  await review.fetchChapterFeedbackReviewSummaryForTranslation({
    translationId: 'bsb',
    passcode: '123456',
  });

  assert.deepEqual(sentBody().body, { translationId: 'bsb', passcode: '123456' });
});

test('fetchChapterFeedbackReviewSummaryForTranslation reports a server error without counts', async () => {
  supabaseFake.respondToFunction(() => edgeError({ context: { json: async () => ({}) } }));

  const result = await review.fetchChapterFeedbackReviewSummaryForTranslation(summaryInput);

  assert.deepEqual(result, {
    success: false,
    chapters: [],
    error: 'Unable to load translator feedback right now.',
  });
});

test('fetchChapterFeedbackReviewSummaryForTranslation rejects a response shaped like a queue', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true, feedback: [] } }));

  const result = await review.fetchChapterFeedbackReviewSummaryForTranslation(summaryInput);

  assert.deepEqual(result, {
    success: false,
    chapters: [],
    error: 'Unable to load translator feedback.',
  });
});

test('fetchChapterFeedbackReviewSummaryForTranslation reports a thrown transport failure', async () => {
  const result = await review.fetchChapterFeedbackReviewSummaryForTranslation(summaryInput, {
    invoke: async () => {
      throw new Error('Network request failed');
    },
  });

  assert.deepEqual(result, { success: false, chapters: [], error: 'Network request failed' });
});

test('fetchChapterFeedbackReviewSummaryForTranslation uses generic copy when a non-Error value is thrown', async () => {
  const result = await review.fetchChapterFeedbackReviewSummaryForTranslation(summaryInput, {
    invoke: async () => {
      throw 'boom';
    },
  });

  assert.equal(result.error, 'Unable to load translator feedback.');
});

// ---------------------------------------------------------------------------
// Resolving and reopening
// ---------------------------------------------------------------------------

test('resolveTranslatorFeedbackOnServer sends the resolution and note through the default client', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true, resolution: 'fixed' } }));

  const result = await review.resolveTranslatorFeedbackOnServer(resolveInput);

  assert.deepEqual(result, { success: true, resolution: 'fixed', error: undefined });
  assert.deepEqual(sentBody().body, {
    passcode: '123456',
    translationId: 'bsb',
    feedbackId: 'feedback-1',
    action: 'resolve',
    resolution: 'fixed',
    note: 'Reworded verse 16',
  });
});

test('resolveTranslatorFeedbackOnServer echoes the requested resolution when the server omits it', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true } }));

  const result = await review.resolveTranslatorFeedbackOnServer({
    ...resolveInput,
    resolution: 'no_change_needed',
  });

  assert.deepEqual(result, {
    success: true,
    resolution: 'no_change_needed',
    error: undefined,
  });
});

test('resolveTranslatorFeedbackOnServer reports a server error', async () => {
  supabaseFake.respondToFunction(() => edgeError({ context: { json: async () => ({}) } }));

  const result = await review.resolveTranslatorFeedbackOnServer(resolveInput);

  assert.deepEqual(result, { success: false, error: 'Unable to update this feedback right now.' });
});

test('resolveTranslatorFeedbackOnServer rejects a response that carries no verdict', async () => {
  supabaseFake.respondToFunction(() => ({ data: null }));

  const result = await review.resolveTranslatorFeedbackOnServer(resolveInput);

  assert.deepEqual(result, { success: false, error: 'Unable to update this feedback.' });
});

test('resolveTranslatorFeedbackOnServer reports a thrown transport failure', async () => {
  const result = await review.resolveTranslatorFeedbackOnServer(resolveInput, {
    invoke: async () => {
      throw new Error('Network request failed');
    },
  });

  assert.deepEqual(result, { success: false, error: 'Network request failed' });
});

test('resolveTranslatorFeedbackOnServer uses generic copy when a non-Error value is thrown', async () => {
  const result = await review.resolveTranslatorFeedbackOnServer(resolveInput, {
    invoke: async () => {
      throw 'boom';
    },
  });

  assert.equal(result.error, 'Unable to update this feedback.');
});

test('reopenTranslatorFeedbackOnServer sends a reopen action through the default client', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true } }));

  const result = await review.reopenTranslatorFeedbackOnServer(reopenInput);

  assert.deepEqual(result, { success: true, resolution: null, error: undefined });
  assert.deepEqual(sentBody().body, {
    passcode: '123456',
    translationId: 'bsb',
    feedbackId: 'feedback-1',
    action: 'reopen',
  });
});

test('reopenTranslatorFeedbackOnServer reports a server error', async () => {
  supabaseFake.respondToFunction(() =>
    edgeError({ context: { json: async () => ({ error: 'Feedback not found' }) } })
  );

  const result = await review.reopenTranslatorFeedbackOnServer(reopenInput);

  assert.deepEqual(result, { success: false, error: 'Feedback not found' });
});

test('reopenTranslatorFeedbackOnServer falls back when the error body has a blank error', async () => {
  supabaseFake.respondToFunction(() =>
    edgeError({ context: { json: async () => ({ error: '   ' }) } })
  );

  const result = await review.reopenTranslatorFeedbackOnServer(reopenInput);

  assert.equal(result.error, 'Unable to reopen this feedback right now.');
});

test('reopenTranslatorFeedbackOnServer rejects a response that carries no verdict', async () => {
  supabaseFake.respondToFunction(() => ({ data: null }));

  const result = await review.reopenTranslatorFeedbackOnServer(reopenInput);

  assert.deepEqual(result, { success: false, error: 'Unable to reopen this feedback.' });
});

test('reopenTranslatorFeedbackOnServer reports a thrown transport failure', async () => {
  const result = await review.reopenTranslatorFeedbackOnServer(reopenInput, {
    invoke: async () => {
      throw new Error('Network request failed');
    },
  });

  assert.deepEqual(result, { success: false, error: 'Network request failed' });
});

test('reopenTranslatorFeedbackOnServer uses generic copy when a non-Error value is thrown', async () => {
  const result = await review.reopenTranslatorFeedbackOnServer(reopenInput, {
    invoke: async () => {
      throw 'boom';
    },
  });

  assert.equal(result.error, 'Unable to reopen this feedback.');
});

test('validateTranslatorReviewPasscode omits the translation when the caller names none', async () => {
  const bodies: Array<Record<string, unknown>> = [];

  const result = await review.validateTranslatorReviewPasscode(' 123456 ', undefined, {
    invoke: async (_name, options) => {
      bodies.push((options as { body: Record<string, unknown> }).body);
      return { data: { success: true }, error: null };
    },
  });

  assert.equal(result.success, true);
  assert.deepEqual(bodies, [{ passcode: '123456', translationId: undefined, validateOnly: true }]);
});

test('fetchChapterFeedbackForTranslatorReview reports an empty queue as a success, not a failure', async () => {
  supabaseFake.respondToFunction(() => ({ data: { success: true, feedback: [] } }));

  const result = await review.fetchChapterFeedbackForTranslatorReview(reviewInput);

  assert.deepEqual(result, { success: true, feedback: [] });
});
