import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/bible/BibleReaderScreen.tsx', 'utf8');

test('BibleReaderScreen renders translator feedback review tools only in translator mode', () => {
  assert.match(source, /translatorReviewEnabled/);
  assert.match(source, /renderTranslatorFeedbackReviewTools/);
  assert.match(source, /fetchChapterFeedbackForTranslatorReview/);
  assert.match(source, /translatorReviewPasscode/);
  assert.match(source, /getTranslatorFeedbackReviewStatus/);
});

test('BibleReaderScreen lets translators resolve or reopen each feedback item', () => {
  assert.match(source, /translatorReviewSummaryComplete/);
  assert.match(source, /isAccurateReview \? \(/);
  assert.match(source, /translatorReviewConfirmAccurate/);
  assert.match(source, /translatorReviewConfirmedAccurate/);
  assert.match(source, /resolveTranslatorFeedback\(item\.id, 'fixed'\)/);
  assert.match(source, /resolveTranslatorFeedback\(item\.id, 'reviewed'\)/);
  assert.match(source, /reopenTranslatorFeedback\(item\.id\)/);
  assert.match(source, /playTranslatorFeedbackAudio\(\s*item\.id/);
  assert.match(source, /markTranslatorFeedbackListened\(feedbackId\)/);
});

test('BibleReaderScreen presents accuracy reviews with check and x icons', () => {
  assert.match(source, /checkmark-circle-outline/);
  assert.match(source, /close-circle-outline/);
  assert.doesNotMatch(source, /thumbs-up-outline|thumbs-down-outline/);
});

test('BibleReaderScreen lets translators pause the active feedback audio', () => {
  assert.match(source, /translatorReviewPlayingFeedbackId/);
  assert.match(source, /translatorReviewAudioSoundRef\.current\?\.pauseAsync\(\)/);
  assert.match(source, /isTranslatorFeedbackAudioPlaying \? 'pause-outline' : 'play-outline'/);
  assert.match(source, /isTranslatorFeedbackAudioPlaying\s*\? t\('bible\.translatorReviewPause'\)/);
});

test('BibleReaderScreen places translator feedback review before chapter content', () => {
  assert.match(
    source,
    /ListHeaderComponent=\{renderTranslatorFeedbackReviewTools\}/,
    'Premium reader content should show translator feedback review before virtualized verses'
  );
  assert.match(
    source,
    /\{renderTranslatorFeedbackReviewTools\(\)\}[\s\S]*\{renderLegacyContent\(\)\}/,
    'Legacy reader content should show translator feedback review before the chapter body'
  );
});
