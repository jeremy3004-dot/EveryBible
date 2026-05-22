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

test('BibleReaderScreen places translator feedback review before chapter content', () => {
  assert.match(
    source,
    /\{renderTranslatorFeedbackReviewTools\(\)\}[\s\S]*\{renderReaderVerses\(true\)\}/,
    'Premium reader content should show translator feedback review before verses'
  );
  assert.match(
    source,
    /\{renderTranslatorFeedbackReviewTools\(\)\}[\s\S]*\{renderLegacyContent\(\)\}/,
    'Legacy reader content should show translator feedback review before the chapter body'
  );
});
