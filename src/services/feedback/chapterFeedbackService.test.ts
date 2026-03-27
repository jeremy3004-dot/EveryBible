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
  sourceScreen: 'reader',
  appPlatform: 'ios',
  appVersion: '1.0.0',
};

test('submitChapterFeedback calls the edge function with a trimmed payload', async () => {
  resetTrackedBibleExperienceEvents();
  const calls: Array<{ functionName: string; body: ChapterFeedbackSubmissionInput }> = [];

  const result = await submitChapterFeedback(baseInput, {
    invoke: async (functionName, { body }) => {
      calls.push({ functionName, body });
      return {
        data: {
          success: true,
          saved: true,
          exported: true,
          feedbackId: 'feedback-1',
        } satisfies ChapterFeedbackFunctionResponse,
        error: null,
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.functionName, 'submit-chapter-feedback');
  assert.equal(calls[0]?.body.comment, 'Great chapter');
  assert.equal(result.success, true);
  assert.equal(result.saved, true);
  assert.equal(result.exported, true);
  assert.equal(result.feedbackId, 'feedback-1');
  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    {
      name: 'chapter_feedback_submitted',
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      sentiment: 'up',
      source: 'reader-feedback',
      detail: 'exported',
    },
  ]);
});

test('submitChapterFeedback converts a blank comment to null before invoke', async () => {
  resetTrackedBibleExperienceEvents();
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

test('submitChapterFeedback preserves degraded success when the row was saved but not exported', async () => {
  resetTrackedBibleExperienceEvents();
  const result = await submitChapterFeedback(baseInput, {
    invoke: async () => ({
      data: {
        success: true,
        saved: true,
        exported: false,
        feedbackId: 'feedback-3',
        error: 'Missing required secret: GOOGLE_SHEETS_SPREADSHEET_ID',
      },
      error: null,
    }),
  });

  assert.equal(result.success, true);
  assert.equal(result.saved, true);
  assert.equal(result.exported, false);
  assert.equal(result.error, 'Missing required secret: GOOGLE_SHEETS_SPREADSHEET_ID');
  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    {
      name: 'chapter_feedback_submitted',
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      sentiment: 'up',
      source: 'reader-feedback',
      detail: 'saved-not-exported',
    },
  ]);
});

test('submitChapterFeedback returns a failure result when the function invoke errors', async () => {
  resetTrackedBibleExperienceEvents();
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
  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    {
      name: 'chapter_feedback_failed',
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      sentiment: 'up',
      source: 'reader-feedback',
      detail: 'network down',
    },
  ]);
});

test('submitChapterFeedback forwards the current bearer token to the edge function', async () => {
  resetTrackedBibleExperienceEvents();
  const calls: Array<{
    functionName: string;
    body: ChapterFeedbackSubmissionInput;
    headers?: Record<string, string>;
  }> = [];

  await submitChapterFeedback(
    baseInput,
    {
      invoke: async (functionName, { body, headers }) => {
        calls.push({ functionName, body, headers });
        return {
          data: {
            success: true,
            saved: true,
            exported: true,
            feedbackId: 'feedback-4',
          },
          error: null,
        };
      },
    },
    {
      resolveAccessToken: async () => 'session-token-123',
    }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.functionName, 'submit-chapter-feedback');
  assert.deepEqual(calls[0]?.headers, {
    Authorization: 'Bearer session-token-123',
  });
});

test('submitChapterFeedback fails fast with a sign-in message when no auth token is available', async () => {
  resetTrackedBibleExperienceEvents();
  let invokeCalled = false;

  const result = await submitChapterFeedback(
    baseInput,
    {
      invoke: async () => {
        invokeCalled = true;
        return {
          data: null,
          error: null,
        };
      },
    },
    {
      resolveAccessToken: async () => null,
    }
  );

  assert.equal(invokeCalled, false);
  assert.equal(result.success, false);
  assert.equal(result.saved, false);
  assert.equal(result.exported, false);
  assert.equal(result.error, 'Please sign in before sending chapter feedback.');
  assert.deepEqual(getTrackedBibleExperienceEvents(), [
    {
      name: 'chapter_feedback_failed',
      translationId: 'bsb',
      bookId: 'JHN',
      chapter: 3,
      sentiment: 'up',
      source: 'reader-feedback',
      detail: 'missing-auth-token',
    },
  ]);
});
