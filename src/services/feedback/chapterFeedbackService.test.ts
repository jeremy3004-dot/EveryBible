import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTrackedBibleExperienceEvents,
  resetTrackedBibleExperienceEvents,
} from '../analytics/bibleExperienceAnalytics';
import {
  submitChapterFeedback,
  type ChapterFeedbackFunctionResponse,
  type ChapterFeedbackSubmissionInput,
} from './chapterFeedbackService';

const baseInput: ChapterFeedbackSubmissionInput = {
  translationId: 'bsb',
  translationLanguage: 'English',
  bookId: 'JHN',
  chapter: 3,
  sentiment: 'up',
  comment: '  Great chapter  ',
  interfaceLanguage: 'en',
  contentLanguageCode: 'en',
  contentLanguageName: 'English',
  participantName: '  Miriam  ',
  participantRole: '  Church leader  ',
  sourceScreen: 'reader',
  appPlatform: 'ios',
  appVersion: '1.0.1',
};

test('submitChapterFeedback calls the edge function with a trimmed payload', async () => {
  const calls: Array<{
    functionName: string;
    body: ChapterFeedbackSubmissionInput;
    headers?: Record<string, string>;
  }> = [];

  const result = await submitChapterFeedback(baseInput, {
    invoke: async (functionName, { body, headers }) => {
      calls.push({ functionName, body, headers });
      return {
        data: {
          success: true,
          saved: true,
          exported: false,
          feedbackId: 'feedback-1',
        } satisfies ChapterFeedbackFunctionResponse,
        error: null,
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.functionName, 'submit-chapter-feedback');
  assert.equal(calls[0]?.body.comment, 'Great chapter');
  assert.equal(calls[0]?.body.participantName, 'Miriam');
  assert.equal(calls[0]?.body.participantRole, 'Church leader');
  assert.equal(
    Object.hasOwn(calls[0]?.body ?? {}, 'participantIdNumber'),
    false,
    'submitChapterFeedback should not send a reviewer-entered participantIdNumber'
  );
  assert.equal(result.success, true);
  assert.equal(result.saved, true);
  assert.equal(result.exported, false);
  assert.equal(result.feedbackId, 'feedback-1');
});

test('submitChapterFeedback sends the live access token explicitly when one is available', async () => {
  const calls: Array<{ headers?: Record<string, string> }> = [];

  const result = await submitChapterFeedback(
    baseInput,
    {
      invoke: async (_functionName, options) => {
        calls.push({ headers: options.headers });
        return {
          data: {
            success: true,
            saved: true,
            exported: false,
            feedbackId: 'feedback-auth-header',
          },
          error: null,
        };
      },
    },
    {
      getAccessToken: async () => 'live-access-token',
      refreshAccessToken: async () => null,
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(calls, [
    {
      headers: {
        Authorization: 'Bearer live-access-token',
      },
    },
  ]);
});

test('submitChapterFeedback converts a blank comment to null before invoke', async () => {
  const calls: Array<ChapterFeedbackSubmissionInput> = [];

  await submitChapterFeedback(
    {
      ...baseInput,
      comment: '   ',
    },
    {
      invoke: async (_functionName, { body }) => {
        calls.push(body);
        return {
          data: {
            success: true,
            saved: true,
            exported: true,
            feedbackId: 'feedback-2',
          },
          error: null,
        };
      },
    }
  );

  assert.equal(calls[0]?.comment, null);
});

test('submitChapterFeedback forwards uploaded audio response metadata', async () => {
  const calls: Array<ChapterFeedbackSubmissionInput> = [];

  const result = await submitChapterFeedback(
    {
      ...baseInput,
      comment: null,
      audioResponse: {
        bucket: 'chapter-feedback-audio',
        path: 'user-1/bsb/jhn/3/audio.m4a',
        durationMs: 42000,
        mimeType: 'audio/mp4',
        sizeBytes: 345678,
        createdAt: '2026-05-21T12:00:00.000Z',
      },
    },
    {
      invoke: async (_functionName, { body }) => {
        calls.push(body);
        return {
          data: {
            success: true,
            saved: true,
            exported: false,
            feedbackId: 'feedback-audio',
          },
          error: null,
        };
      },
    }
  );

  assert.equal(result.success, true);
  assert.deepEqual(calls[0]?.audioResponse, {
    bucket: 'chapter-feedback-audio',
    path: 'user-1/bsb/jhn/3/audio.m4a',
    durationMs: 42000,
    mimeType: 'audio/mp4',
    sizeBytes: 345678,
    createdAt: '2026-05-21T12:00:00.000Z',
  });
});

test('submitChapterFeedback allows anonymous reviewer identity', async () => {
  const calls: Array<ChapterFeedbackSubmissionInput> = [];

  const result = await submitChapterFeedback(
    {
      ...baseInput,
      participantName: null,
      participantRole: null,
    },
    {
      invoke: async (_functionName, { body }) => {
        calls.push(body);
        return {
          data: {
            success: true,
            saved: true,
            exported: false,
            feedbackId: 'feedback-anonymous',
          },
          error: null,
        };
      },
    }
  );

  assert.equal(result.success, true);
  assert.equal(calls[0]?.participantName, null);
  assert.equal(calls[0]?.participantRole, null);
});

test('submitChapterFeedback treats the saved database row as the successful outcome', async () => {
  const result = await submitChapterFeedback(baseInput, {
    invoke: async () => ({
      data: {
        success: true,
        saved: true,
        exported: false,
        feedbackId: 'feedback-3',
      },
      error: null,
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.saved, true);
  assert.equal(result.exported, false);
  assert.equal(result.error, undefined);
});

test('submitChapterFeedback accepts the listener source screen', async () => {
  const result = await submitChapterFeedback(
    {
      ...baseInput,
      sourceScreen: 'listener',
    },
    {
      invoke: async () => ({
        data: {
          success: true,
          saved: true,
          exported: false,
          feedbackId: 'feedback-listener',
        },
        error: null,
      }),
    }
  );

  assert.equal(result.success, true);
});

test('submitChapterFeedback returns a failure result when the function invoke errors', async () => {
  const result = await submitChapterFeedback(baseInput, {
    invoke: async () => ({
      data: null,
      error: { message: 'network down' },
    }),
  });

  assert.equal(result.success, false);
  assert.equal(result.saved, false);
  assert.equal(result.exported, false);
  assert.equal(result.error, 'network down');
});

test('submitChapterFeedback maps a 401 edge-function response into a sign-in retry message', async () => {
  const result = await submitChapterFeedback(baseInput, {
    invoke: async () => ({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ error: 'Not authenticated' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      } as { message?: string; context?: Response },
    }),
  });

  assert.equal(result.success, false);
  assert.equal(result.saved, false);
  assert.equal(result.exported, false);
  assert.equal(result.error, 'Please sign in again before sending chapter feedback.');
  // The UI uses this flag to show a localized sign-in prompt instead of the raw message.
  assert.equal(result.requiresSignIn, true);
});

test('submitChapterFeedback surfaces backend auth misconfiguration when the edge runtime rejects the JWT', async () => {
  const result = await submitChapterFeedback(baseInput, {
    invoke: async () => ({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: new Response(JSON.stringify({ code: 401, message: 'Invalid JWT' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      } as { message?: string; context?: Response },
    }),
  });

  assert.equal(result.success, false);
  assert.equal(result.saved, false);
  assert.equal(result.exported, false);
  assert.equal(
    result.error,
    'Chapter feedback is temporarily unavailable right now. Please try again soon.'
  );
});

test('submitChapterFeedback refreshes the session and retries once after a 401 edge-function response', async () => {
  const calls: Array<{ headers?: Record<string, string> }> = [];

  const result = await submitChapterFeedback(
    baseInput,
    {
      invoke: async (_functionName, options) => {
        calls.push({ headers: options.headers });

        if (calls.length === 1) {
          return {
            data: null,
            error: {
              message: 'Edge Function returned a non-2xx status code',
              context: new Response(JSON.stringify({ error: 'Not authenticated' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
              }),
            },
          };
        }

        return {
          data: {
            success: true,
            saved: true,
            exported: true,
            feedbackId: 'feedback-retried',
          },
          error: null,
        };
      },
    },
    {
      getAccessToken: async () => 'stale-access-token',
      refreshAccessToken: async () => 'fresh-access-token',
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.feedbackId, 'feedback-retried');
  assert.deepEqual(calls, [
    {
      headers: {
        Authorization: 'Bearer stale-access-token',
      },
    },
    {
      headers: {
        Authorization: 'Bearer fresh-access-token',
      },
    },
  ]);
});

// Chapter feedback is deliberately NOT analytics-forwarded: the submit pipeline
// writes the feedback row itself, so a duplicate usage event carries no value
// (see the FORWARDED_EVENTS allowlist in bibleExperienceAnalytics.ts). This
// guards the integration point — before 400f1df2 these tests asserted the
// opposite, and were left asserting a buffer that no longer records these names.
test('submitChapterFeedback does not analytics-forward chapter feedback events', async () => {
  resetTrackedBibleExperienceEvents();

  await submitChapterFeedback(baseInput, {
    invoke: async () => ({
      data: { success: true, saved: true, exported: false, feedbackId: 'feedback-forward' },
      error: null,
    }),
  });

  await submitChapterFeedback(baseInput, {
    invoke: async () => ({ data: null, error: { message: 'network down' } }),
  });

  assert.deepEqual(
    getTrackedBibleExperienceEvents(),
    [],
    'neither the success nor the failure path may forward a bible-experience event'
  );
});
