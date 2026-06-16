import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchChapterFeedbackForTranslatorReview,
  fetchChapterFeedbackReviewSummaryForTranslation,
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
  const result = await validateTranslatorReviewPasscode(' entered-review-passcode ', {
    invoke: async (functionName, options) => {
      calls.push({ functionName, body: { ...options.body } });
      return {
        data: {
          success: true,
        },
        error: null,
      };
    },
  });

  assert.equal(result.success, true);
  assert.equal(calls[0]?.functionName, 'review-chapter-feedback');
  assert.equal(calls[0]?.body.passcode, 'entered-review-passcode');
  assert.equal(calls[0]?.body.validateOnly, true);
  assert.equal(calls[0]?.body.translationId, undefined);
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
                feedback: [{ id: 'feedback-1', hasAudio: false }],
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
  assert.equal(calls[0]?.functionName, 'review-chapter-feedback');
  assert.equal(calls[0]?.body.passcode, 'entered-review-passcode');
  assert.equal(calls[0]?.body.translationId, 'bsb');
  assert.equal(calls[0]?.body.chapter, undefined);
});
