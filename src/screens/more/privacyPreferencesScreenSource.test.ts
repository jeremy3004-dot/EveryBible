import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('PrivacyPreferencesScreen keeps the discreet secure-code form above the keyboard', () => {
  const source = readRelativeSource('./PrivacyPreferencesScreen.tsx');

  assert.equal(
    source.includes('KeyboardAvoidingView'),
    true,
    'PrivacyPreferencesScreen should wrap the form area in a KeyboardAvoidingView'
  );

  assert.equal(
    source.includes("behavior={Platform.OS === 'ios' ? 'padding' : 'height'}"),
    true,
    'PrivacyPreferencesScreen should use platform-specific keyboard avoidance behavior'
  );

  assert.equal(
    source.includes('keyboardShouldPersistTaps="handled"'),
    true,
    'PrivacyPreferencesScreen should allow secure-code inputs to remain usable while the keyboard is open'
  );

  assert.equal(
    source.includes('paddingBottom: spacing.xxl') || source.includes('paddingBottom: 32'),
    true,
    'PrivacyPreferencesScreen should keep extra bottom breathing room so the secure-code card can scroll fully above the keyboard'
  );
});

test('PrivacyPreferencesScreen activates the calculator lock after enabling discreet mode', () => {
  const source = readRelativeSource('./PrivacyPreferencesScreen.tsx');

  assert.equal(
    source.includes('InteractionManager'),
    true,
    'PrivacyPreferencesScreen should defer calculator lock activation until after leaving preferences'
  );

  assert.match(
    source,
    /const lockPrivacy = usePrivacyStore\(\(state\) => state\.lock\);/,
    'PrivacyPreferencesScreen should subscribe to the existing privacy lock action'
  );

  assert.match(
    source,
    /navigation\.goBack\(\);\s+if \(savePlan\.input\.mode === 'discreet'\) \{\s+InteractionManager\.runAfterInteractions\(\(\) => \{\s+lockPrivacy\(\);/s,
    'PrivacyPreferencesScreen should lock only after a successful discreet-mode save and navigation'
  );
});
