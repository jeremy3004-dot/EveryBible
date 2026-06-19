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
  assert.match(
    source,
    /validateTranslatorReviewPasscode\(\s*translatorAccessPasscode,\s*currentTranslation\s*\)/
  );
  assert.match(source, /enableTranslatorReviewMode\(translatorAccessPasscode\)/);
  assert.match(source, /translatorAccessIncorrect/);
});

test('SettingsScreen lets translators toggle review mode off and requires passcode to turn it back on', () => {
  assert.match(source, /disableTranslatorReviewMode/);
  assert.match(source, /handleTranslatorReviewToggle/);
  assert.match(
    source,
    /if \(enabled\) \{[\s\S]*openTranslatorAccessModal\(\);[\s\S]*return;[\s\S]*\}/,
    'Turning translator review mode on should reopen the passcode modal'
  );
  assert.match(
    source,
    /disableTranslatorReviewMode\(\);/,
    'Turning translator review mode off should persist disabled translator mode'
  );
  assert.match(
    source,
    /value=\{translatorReviewEnabled\}[\s\S]*onValueChange=\{handleTranslatorReviewToggle\}/,
    'Translator Access should expose a real Settings switch'
  );
  assert.match(
    source,
    /value=\{translatorReviewEnabled\}[\s\S]*trackColor=\{settingSwitchTrackColor\}[\s\S]*ios_backgroundColor=\{settingSwitchOffColor\}/,
    'Translator Access should use the shared higher-contrast settings switch colors'
  );
});
