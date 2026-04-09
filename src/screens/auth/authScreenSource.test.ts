import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('AuthScreen hydrates the live session into auth state after successful auth', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  assert.match(
    source,
    /getCurrentSession/,
    'AuthScreen should read the live auth session after successful auth'
  );
  assert.match(
    source,
    /setSession/,
    'AuthScreen should write the live auth session into the auth store'
  );
  assert.match(
    source,
    /signInWithApple|signInWithGoogle/,
    'AuthScreen should keep provider auth flows available on the unified surface'
  );
  assert.match(
    source,
    /signInWithEmail|signUpWithEmail/,
    'AuthScreen should support both sign-in and create-account email flows'
  );
});

test('AuthStack registers one shared auth route instead of split sign-in and sign-up screens', () => {
  const authStackSource = readRelativeSource('../../navigation/AuthStack.tsx');

  assert.match(
    authStackSource,
    /name="AuthScreen"/,
    'AuthStack should expose a single shared AuthScreen route'
  );

  assert.equal(
    authStackSource.includes('name="SignIn"'),
    false,
    'AuthStack should stop registering a dedicated SignIn screen'
  );

  assert.equal(
    authStackSource.includes('name="SignUp"'),
    false,
    'AuthStack should stop registering a dedicated SignUp screen'
  );
});
