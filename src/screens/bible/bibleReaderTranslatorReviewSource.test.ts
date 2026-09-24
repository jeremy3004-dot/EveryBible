// UI-only source check on BibleReaderScreen.tsx. These remain because BibleReaderScreen render
// tests are owned by the reader-chrome conversion; the summary and review behaviour is covered by
// ChapterFeedbackSummary.render.test.tsx and ChapterFeedbackReviewScreen.render.test.tsx.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const reader = readFileSync('src/screens/bible/BibleReaderScreen.tsx', 'utf8');
test('the reader mounts only the gated chapter summary, not the feedback list', () => {
  assert.match(reader, /<ChapterFeedbackSummary/);
  assert.doesNotMatch(reader, /translatorFeedbackItems\.map/);
});
test('the reader contains no participation switching controls', () => {
  assert.doesNotMatch(
    reader,
    /enableCommunityFeedback|enableCouncilWithPasscode|enableWithPasscode/
  );
});
