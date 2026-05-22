import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/bible/BibleReaderScreen.tsx', 'utf8');

test('BibleReaderScreen renders translator feedback review tools only in translator mode', () => {
  assert.match(source, /translatorReviewEnabled/);
  assert.match(source, /renderTranslatorFeedbackReviewTools/);
  assert.match(source, /fetchChapterFeedbackForTranslatorReview/);
  assert.match(source, /getTranslatorFeedbackReviewStatus/);
});

test('BibleReaderScreen lets translators mark text read and audio listened', () => {
  assert.match(source, /markTranslatorFeedbackRead\(item\.id\)/);
  assert.match(source, /playTranslatorFeedbackAudio\(\s*item\.id/);
  assert.match(source, /markTranslatorFeedbackListened\(feedbackId\)/);
});
