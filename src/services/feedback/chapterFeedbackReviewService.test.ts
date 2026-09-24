// Supabase config check (config.toml, not TypeScript): the review function relies on its
// own passcode, not the runtime JWT gate. Service behaviour lives in
// chapterFeedbackReviewService.behavior.test.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG_PATH = path.join(REPO_ROOT, 'supabase/config.toml');

test('review-chapter-feedback disables the public edge JWT gate', () => {
  const config = readFileSync(CONFIG_PATH, 'utf8');

  assert.match(
    config,
    /\[functions\.review-chapter-feedback\][\s\S]*verify_jwt\s*=\s*false/,
    'Expected review-chapter-feedback to rely on the translator passcode instead of the runtime JWT gate'
  );
});

// The function's own passcode handling (shared secret read from TRANSLATOR_REVIEW_PASSCODE,
// no bundled fallback, validateOnly unlocks) runs on the real edge function in
// supabase/functions/review-chapter-feedback/teamAccess.test.ts.
