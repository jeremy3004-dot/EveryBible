import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/screens/more/SettingsScreen.tsx', 'utf8');

test('SettingsScreen places translator access directly after chapter feedback', () => {
  assert.match(
    source,
    /t\('settings\.chapterFeedback'\)[\s\S]*t\('settings\.translatorAccess'\)[\s\S]*t\('settings\.chapterFeedbackIdentity'\)/,
    'Translator Access should be between Chapter Feedback and the feedback identity row'
  );
});

test('SettingsScreen unlocks translator review mode through a numeric passcode modal', () => {
  assert.match(source, /showTranslatorAccessModal/);
  assert.match(source, /keyboardType="number-pad"/);
  assert.match(source, /enableTranslatorReviewMode\(translatorAccessPasscode\)/);
  assert.match(source, /translatorAccessIncorrect/);
});
