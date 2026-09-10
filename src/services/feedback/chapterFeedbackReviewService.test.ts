// Backend-contract guard by design: asserts the Supabase config and Edge Function
// the translator review flow depends on. Service behaviour lives in
// chapterFeedbackReviewService.behavior.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');
const REVIEW_FUNCTION_PATH = path.join(
  REPO_ROOT,
  'supabase/functions/review-chapter-feedback/index.ts'
);

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
