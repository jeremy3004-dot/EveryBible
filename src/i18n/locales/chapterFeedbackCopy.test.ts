import test from 'node:test';
import assert from 'node:assert/strict';
import { en } from './en';

test('chapter feedback confirmation copy uses the formal review wording', () => {
  const expected =
    'Thank you for your feedback. Your submission has been received and will be reviewed by our translation teams as soon as possible.';

  assert.equal(en.bible.chapterFeedbackSuccess, expected);
  assert.equal(en.bible.chapterFeedbackSavedFallback, expected);
});
