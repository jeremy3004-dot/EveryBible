import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('SettingsScreen keeps the calculator disguise shortcut visible from More settings', () => {
  const source = readRelativeSource('./SettingsScreen.tsx');

  assert.equal(
    source.includes("navigation.navigate('PrivacyPreferences')"),
    true,
    'SettingsScreen should keep routing the disguise shortcut into PrivacyPreferences'
  );

  assert.equal(
    source.includes("name=\"calculator-outline\""),
    true,
    'SettingsScreen should use a calculator icon so the disguise setting is easy to spot'
  );

  assert.equal(
    source.includes("t('onboarding.discreetIconTitle')"),
    true,
    'SettingsScreen should mention the discreet calculator mode on the shortcut row'
  );

  assert.equal(
    source.includes("name=\"lock-closed-outline\""),
    false,
    'SettingsScreen should not hide the disguise shortcut behind a generic lock icon'
  );
});

test('SettingsScreen exposes an opt-in chapter feedback toggle that syncs preferences', () => {
  const source = readRelativeSource('./SettingsScreen.tsx');

  assert.match(
    source,
    /chapterFeedbackEnabled/,
    'SettingsScreen should read the chapterFeedbackEnabled preference'
  );
  assert.match(
    source,
    /setPreferences\(\{\s*chapterFeedbackEnabled:/,
    'SettingsScreen should update chapterFeedbackEnabled from the settings toggle'
  );
  assert.match(
    source,
    /syncPreferences\(\)\.catch\(\(\) => \{\}\)/,
    'SettingsScreen should keep syncing preferences after the chapter feedback toggle changes'
  );
});

test('SettingsScreen asks for a feedback identity before enabling chapter feedback and exposes an edit row', () => {
  const source = readRelativeSource('./SettingsScreen.tsx');

  assert.match(
    source,
    /showChapterFeedbackIdentityModal/,
    'SettingsScreen should keep a dedicated identity modal for chapter feedback'
  );
  assert.match(
    source,
    /openChapterFeedbackIdentityModal\(true\)/,
    'SettingsScreen should prompt for identity before enabling chapter feedback when the identity is missing'
  );
  assert.match(
    source,
    /settings\.chapterFeedbackIdentity/,
    'SettingsScreen should surface a dedicated feedback identity row in the settings list'
  );
  assert.match(
    source,
    /handleSaveChapterFeedbackIdentity/,
    'SettingsScreen should persist the reviewer name and role from the identity modal'
  );
  assert.equal(
    source.includes('chapterFeedbackIdentityIdNumber'),
    false,
    'SettingsScreen should not ask reviewers for a manual ID number once auth already provides a UUID-backed identifier'
  );
  assert.equal(
    source.includes('chapterFeedbackIdNumber'),
    false,
    'SettingsScreen should not persist a manual feedback ID number in local preferences'
  );
});

test('SettingsScreen keeps the locale preferences row labeled as Nation and Bible', () => {
  const settingsSource = readRelativeSource('./SettingsScreen.tsx');
  const englishLocaleSource = readRelativeSource('../../i18n/locales/en.ts');

  assert.equal(
    settingsSource.includes("t('settings.nationAndLanguage')"),
    true,
    'SettingsScreen should keep using the shared nationAndLanguage translation key'
  );

  assert.equal(
    englishLocaleSource.includes("nationAndLanguage: 'Nation and Bible'"),
    true,
    'The English settings copy should label the locale row as Nation and Bible'
  );
});
