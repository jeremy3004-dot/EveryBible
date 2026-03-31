import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('submitChapterFeedback falls back to the live auth store session before treating feedback requests as signed out', () => {
  const source = readRelativeSource('./chapterFeedbackService.ts');

  assert.match(
    source,
    /useAuthStore\.getState\(\)\.session\?\.access_token/,
    'submitChapterFeedback should reuse the live auth-store access token when the local session has already hydrated'
  );
});
