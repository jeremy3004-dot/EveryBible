import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const reader = readFileSync('src/screens/bible/BibleReaderScreen.tsx', 'utf8');
const summary = readFileSync('src/components/feedback/ChapterFeedbackSummary.tsx', 'utf8');
const review = readFileSync('src/screens/bible/ChapterFeedbackReviewScreen.tsx', 'utf8');
test('chapters contain only a gated summary and an entry to dedicated review', () => {
  assert.match(reader, /<ChapterFeedbackSummary/);
  assert.doesNotMatch(reader, /translatorFeedbackItems\.map/);
  assert.match(summary, /if \(!enabled\) return null/);
  assert.match(summary, /fetchChapterFeedbackReviewSummaryForTranslation/);
  assert.match(summary, /navigate\('ChapterFeedbackReview'/);
  assert.match(review, /FlatList/);
});
test('dedicated review uses server outcomes without claiming chapter accuracy', () => {
  assert.match(review, /resolveTranslatorFeedbackOnServer/);
  assert.match(review, /reopenTranslatorFeedbackOnServer/);
  assert.match(review, /feedback\.markReviewed/);
  assert.match(review, /feedback\.markAddressed/);
  assert.doesNotMatch(review, /ConfirmAccurate|ConfirmedAccurate/);
});
test('chapter and review surfaces contain no participation switching controls', () => {
  assert.doesNotMatch(
    reader + review + summary,
    /enableCommunityFeedback|enableCouncilWithPasscode|enableWithPasscode/
  );
});
test('review audio preserves explicit play and pause controls', () => {
  assert.match(review, /pauseAsync/);
  assert.match(review, /playAsync/);
  assert.match(review, /markListened/);
});
