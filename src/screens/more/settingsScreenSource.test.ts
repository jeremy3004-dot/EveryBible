import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

// The shortcut row is now a ListRow, so its glyph and affordance are props
// rather than nested <Ionicons> elements — the guarantees are unchanged.
function findListRow(source: string, titleExpression: string): string {
  const pattern = new RegExp(
    `<ListRow\\s+title=\\{${titleExpression.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}[\\s\\S]*?\\/>`
  );
  const match = source.match(pattern);
  assert.ok(match, `expected a ListRow titled ${titleExpression}`);
  return match[0];
}

test('SettingsScreen keeps the calculator disguise shortcut visible from More settings', () => {
  const source = readRelativeSource('./SettingsScreen.tsx');
  const shortcutRow = findListRow(source, "t('onboarding.privacyTitle')");

  assert.equal(
    source.includes("navigation.navigate('PrivacyPreferences')"),
    true,
    'SettingsScreen should keep routing the disguise shortcut into PrivacyPreferences'
  );

  assert.match(
    shortcutRow,
    /navigation\.navigate\('PrivacyPreferences'\)/,
    'the disguise shortcut row itself should be the thing that opens PrivacyPreferences'
  );

  assert.match(
    shortcutRow,
    /leadingIcon=\{Calculator\}/,
    'SettingsScreen should use a calculator icon so the disguise setting is easy to spot'
  );

  assert.match(
    source,
    /import \{[\s\S]*?\bCalculator,[\s\S]*?\} from 'lucide-react-native';/,
    'the calculator glyph should come from the Lucide set the redesign standardised on'
  );

  assert.match(
    shortcutRow,
    /showChevron/,
    'SettingsScreen should keep only the chevron affordance on the shortcut row'
  );

  assert.equal(
    /value=/.test(shortcutRow),
    false,
    'the shortcut row should carry no trailing value text beside its chevron'
  );

  assert.equal(
    source.includes('privacyModeLabel'),
    false,
    'SettingsScreen should not show the current privacy mode text on the shortcut row'
  );

  assert.equal(
    source.includes("t('onboarding.discreetIconTitle')"),
    false,
    'SettingsScreen should not repeat the discreet icon label in the shortcut row'
  );
});

test('SettingsScreen draws Lucide glyphs rather than the retired Ionicons set', () => {
  const source = readRelativeSource('./SettingsScreen.tsx');

  assert.equal(
    source.includes('Ionicons'),
    false,
    'SettingsScreen should render Lucide glyphs, not the retired Ionicons set'
  );

  assert.match(
    source,
    /from 'lucide-react-native';/,
    'SettingsScreen should take its glyphs from lucide-react-native'
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

// The row no longer styles itself: it hands the summary to ListRow's `value`
// slot, so the three guarantees this test protects — one line, a bounded value
// column, a stable row height — now live in the shared primitive and are
// asserted there, at the call site and in ListRow together.
test('SettingsScreen keeps long locale labels truncated inside a bounded row', () => {
  const source = readRelativeSource('./SettingsScreen.tsx');
  const listRowSource = readRelativeSource('../../components/ui/ListRow.tsx');
  const localeRow = findListRow(source, "t('settings.nationAndLanguage')");

  assert.match(
    localeRow,
    /value=\{localeSummary\}/,
    'The locale row should pass its summary through the shared value slot'
  );
  assert.match(
    listRowSource,
    /numberOfLines=\{1\}\s*>\s*\{value\}/,
    'The locale summary should truncate long language names to a single line'
  );
  assert.match(
    listRowSource,
    /textColumn: \{\s*flex: 1/,
    'The value side of settings rows should stay bounded by a flexing text column'
  );
  assert.match(
    listRowSource,
    /const ROW_MIN_HEIGHT = 52;[\s\S]*minHeight: ROW_MIN_HEIGHT/,
    'Settings rows should keep a stable height instead of expanding for long values'
  );
});
