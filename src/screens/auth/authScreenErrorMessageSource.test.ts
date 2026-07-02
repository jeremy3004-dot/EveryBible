import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AuthScreen never shows the raw untranslated AuthResult.error string to the user', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  assert.doesNotMatch(
    source,
    /result\.error\s*\|\|/,
    'AuthScreen should not fall back to raw result.error text — it is always untranslated English from the auth service layer'
  );
});

test('AuthScreen maps every AuthErrorCode with a dedicated message to a translated string', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  const helperMatch = source.match(
    /const getAuthFailureMessage = \(result: AuthResult, fallbackMessage: string\): string => \{([\s\S]*?)\n {2}\};/
  );
  assert.ok(helperMatch, 'AuthScreen should define a getAuthFailureMessage(result, fallbackMessage) helper');

  const helperBody = helperMatch[1];

  for (const [code, key] of [
    ['in_progress', 'auth.signInAlreadyInProgress'],
    ['provider_unavailable', 'auth.providerUnavailable'],
    ['service_unavailable', 'auth.serviceUnavailable'],
    ['configuration', 'auth.backendNotConfigured'],
  ]) {
    assert.match(
      helperBody,
      new RegExp(`case '${code}':\\s*\\n\\s*return t\\('${key.replace('.', '\\.')}'\\);`),
      `getAuthFailureMessage should map code '${code}' to t('${key}')`
    );
  }

  assert.match(
    helperBody,
    /default:\s*\n\s*return fallbackMessage;/,
    'getAuthFailureMessage should fall back to the caller-provided translated fallbackMessage for unmapped codes'
  );
});

test('AuthScreen routes both showAuthFailure and the forgot-password failure alert through getAuthFailureMessage', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  assert.match(
    source,
    /Alert\.alert\(\s*mode === 'signUp' \? t\('auth\.signUpFailed'\) : t\('auth\.signInFailed'\),\s*getAuthFailureMessage\(result, fallbackMessage\)\s*\);/,
    'showAuthFailure should pass its Alert message through getAuthFailureMessage'
  );

  assert.match(
    source,
    /Alert\.alert\(t\('common\.error'\), getAuthFailureMessage\(result, t\('auth\.resetEmailError'\)\)\);/,
    'handleForgotPassword should route its failure alert through getAuthFailureMessage instead of raw result.error'
  );
});
