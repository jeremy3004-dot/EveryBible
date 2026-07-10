import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchChapterFeedbackForTranslatorReview,
  fetchChapterFeedbackReviewSummaryForTranslation,
  reopenTranslatorFeedbackOnServer,
  resolveTranslatorFeedbackOnServer,
  validateTranslatorReviewPasscode,
} from './chapterFeedbackReviewService';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');
const REVIEW_FUNCTION_PATH = path.join(REPO_ROOT, 'supabase/functions/review-chapter-feedback/index.ts');

test('fetchChapterFeedbackForTranslatorReview calls the review edge function with the translator passcode', async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown> }> = [];
  const result = await fetchChapterFeedbackForTranslatorReview(
    {
      translationId: 'bsb',
      bookId: 'GEN',
      chapter: 1,
      passcode: ' entered-review-passcode ',
    },
    {
      invoke: async (functionName, options) => {
        calls.push({ functionName, body: { ...options.body } });
        return {
          data: {
            success: true,
            feedback: [],
          },
          error: null,
        };
      },
    }
  );

  assert.equal(result.success, true);
  assert.equal(calls[0]?.functionName, 'review-chapter-feedback');
  assert.equal(calls[0]?.body.passcode, 'entered-review-passcode');
  assert.equal(calls[0]?.body.translationId, 'bsb');
  assert.equal(calls[0]?.body.bookId, 'GEN');
  assert.equal(calls[0]?.body.chapter, 1);
});

test('validateTranslatorReviewPasscode checks translator access through the review edge function', async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown> }> = [];
  const result = await validateTranslatorReviewPasscode(
    ' entered-review-passcode ',
    'bsb',
    {
      invoke: async (functionName, options) => {
        calls.push({ functionName, body: { ...options.body } });
        return {
          data: {
            success: true,
          },
          error: null,
        };
      },
    },
  );

  assert.equal(result.success, true);
  assert.equal(calls[0]?.functionName, 'review-chapter-feedback');
  assert.equal(calls[0]?.body.passcode, 'entered-review-passcode');
  assert.equal(calls[0]?.body.validateOnly, true);
  assert.equal(calls[0]?.body.translationId, 'bsb');
});

test('validateTranslatorReviewPasscode reads the review edge function error body', async () => {
  const result = await validateTranslatorReviewPasscode('wrong-passcode', undefined, {
    invoke: async () => ({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            success: false,
            error: 'Translator access denied',
          }),
        },
      },
    }),
  });

  assert.deepEqual(result, {
    success: false,
    error: 'Translator access denied',
  });
});

test('review-chapter-feedback disables the public edge JWT gate', () => {
  const config = readFileSync(CONFIG_PATH, 'utf8');

  assert.match(
    config,
    /\[functions\.review-chapter-feedback\][\s\S]*verify_jwt\s*=\s*false/,
    'Expected review-chapter-feedback to rely on the translator passcode instead of the runtime JWT gate'
  );
});

test('review-chapter-feedback requires the Supabase translator passcode secret', () => {
  const source = readFileSync(REVIEW_FUNCTION_PATH, 'utf8');

  assert.match(
    source,
    /getRequiredSecret\('TRANSLATOR_REVIEW_PASSCODE'\)/,
    'Expected translator review passcode validation to read from a Supabase secret'
  );
  assert.doesNotMatch(
    source,
    /\|\|\s*['"][0-9]+['"]/,
    'Expected translator review passcode validation to avoid a bundled numeric fallback'
  );
  assert.match(
    source,
    /validateOnly === true[\s\S]*success: true/,
    'Expected Settings unlocks to validate the passcode without requiring a chapter request'
  );
});

test('fetchChapterFeedbackReviewSummaryForTranslation requests translator-only summary data', async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown> }> = [];
  const result = await fetchChapterFeedbackReviewSummaryForTranslation(
    {
      translationId: 'bsb',
      passcode: 'entered-review-passcode',
    },
    {
      invoke: async (functionName, options) => {
        calls.push({ functionName, body: { ...options.body } });
        return {
          data: {
            success: true,
            chapters: [
              {
                bookId: 'GEN',
                chapter: 1,
                total: 2,
                unresolvedDown: 1,
                unresolvedUp: 0,
              },
            ],
          },
          error: null,
        };
      },
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.chapters[0]?.bookId, 'GEN');
  assert.equal(result.chapters[0]?.unresolvedDown, 1);
  assert.equal(calls[0]?.functionName, 'review-chapter-feedback');
  assert.equal(calls[0]?.body.passcode, 'entered-review-passcode');
  assert.equal(calls[0]?.body.translationId, 'bsb');
  assert.equal(calls[0]?.body.chapter, undefined);
});

test('resolveTranslatorFeedbackOnServer sends a resolve action with the passcode', async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown> }> = [];
  const result = await resolveTranslatorFeedbackOnServer(
    {
      passcode: ' entered-review-passcode ',
      translationId: 'bsb',
      feedbackId: 'feedback-1',
      resolution: 'fixed',
      note: 'Corrected the verb tense.',
    },
    {
      invoke: async (functionName, options) => {
        calls.push({ functionName, body: { ...options.body } });
        return { data: { success: true, resolution: 'fixed' }, error: null };
      },
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.resolution, 'fixed');
  assert.equal(calls[0]?.functionName, 'review-chapter-feedback');
  assert.equal(calls[0]?.body.passcode, 'entered-review-passcode');
  assert.equal(calls[0]?.body.action, 'resolve');
  assert.equal(calls[0]?.body.feedbackId, 'feedback-1');
  assert.equal(calls[0]?.body.resolution, 'fixed');
  assert.equal(calls[0]?.body.note, 'Corrected the verb tense.');
});

test('resolveTranslatorFeedbackOnServer surfaces the edge function error body', async () => {
  const result = await resolveTranslatorFeedbackOnServer(
    {
      passcode: 'entered-review-passcode',
      translationId: 'bsb',
      feedbackId: 'missing',
      resolution: 'fixed',
    },
    {
      invoke: async () => ({
        data: null,
        error: {
          message: 'Edge Function returned a non-2xx status code',
          context: {
            json: async () => ({ success: false, error: 'Feedback item not found' }),
          },
        },
      }),
    }
  );

  assert.deepEqual(result, { success: false, error: 'Feedback item not found' });
});

test('resolveTranslatorFeedbackOnServer refuses to call the backend without a passcode', async () => {
  let invoked = false;
  const result = await resolveTranslatorFeedbackOnServer(
    {
      passcode: '   ',
      translationId: 'bsb',
      feedbackId: 'feedback-1',
      resolution: 'fixed',
    },
    {
      invoke: async () => {
        invoked = true;
        return { data: { success: true }, error: null };
      },
    }
  );

  assert.equal(result.success, false);
  assert.equal(invoked, false);
});

test('reopenTranslatorFeedbackOnServer sends a reopen action and clears the resolution', async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown> }> = [];
  const result = await reopenTranslatorFeedbackOnServer(
    {
      passcode: 'entered-review-passcode',
      translationId: 'bsb',
      feedbackId: 'feedback-1',
    },
    {
      invoke: async (functionName, options) => {
        calls.push({ functionName, body: { ...options.body } });
        return { data: { success: true, resolution: null }, error: null };
      },
    }
  );

  assert.equal(result.success, true);
  assert.equal(result.resolution, null);
  assert.equal(calls[0]?.body.action, 'reopen');
  assert.equal(calls[0]?.body.feedbackId, 'feedback-1');
});
