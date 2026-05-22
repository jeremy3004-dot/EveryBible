import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fetchChapterFeedbackForTranslatorReview,
  fetchChapterFeedbackReviewSummaryForTranslation,
} from './chapterFeedbackReviewService';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');

test('fetchChapterFeedbackForTranslatorReview calls the review edge function with the translator passcode', async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown> }> = [];
  const result = await fetchChapterFeedbackForTranslatorReview(
    {
      translationId: 'bsb',
      bookId: 'GEN',
      chapter: 1,
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
  assert.equal(calls[0]?.body.passcode, '342121');
  assert.equal(calls[0]?.body.translationId, 'bsb');
  assert.equal(calls[0]?.body.bookId, 'GEN');
  assert.equal(calls[0]?.body.chapter, 1);
});

test('review-chapter-feedback disables the public edge JWT gate', () => {
  const config = readFileSync(CONFIG_PATH, 'utf8');

  assert.match(
    config,
    /\[functions\.review-chapter-feedback\][\s\S]*verify_jwt\s*=\s*false/,
    'Expected review-chapter-feedback to rely on the translator passcode instead of the runtime JWT gate'
  );
});

test('fetchChapterFeedbackReviewSummaryForTranslation requests translator-only summary data', async () => {
  const calls: Array<{ functionName: string; body: Record<string, unknown> }> = [];
  const result = await fetchChapterFeedbackReviewSummaryForTranslation(
    {
      translationId: 'bsb',
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
  assert.equal(calls[0]?.body.passcode, '342121');
  assert.equal(calls[0]?.body.translationId, 'bsb');
  assert.equal(calls[0]?.body.chapter, undefined);
});
