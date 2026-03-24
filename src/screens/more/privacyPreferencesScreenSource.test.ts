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
