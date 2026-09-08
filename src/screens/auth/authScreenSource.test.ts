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

test('authenticated auth flows pass the hydrated uid into cloud restoration', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  assert.match(
    source,
    /return session\.user\.id/,
    'the hydrated session should expose the exact authenticated uid'
  );
  assert.match(
    source,
    /pullFromCloud\(userId\)/,
    'sign-in and sign-up cloud pulls should bind to the hydrated uid'
  );
});

test('password recovery passes its hydrated uid into cloud restoration', () => {
  const source = readRelativeSource('./ResetPasswordScreen.tsx');

  assert.match(
    source,
    /pullFromCloud\(session\.user\.id\)/,
    'password recovery cloud restoration should bind to the recovery session uid'
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

test('AuthScreen renders the Every Language sign-in surface', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  assert.equal(
    source.includes('@expo/vector-icons'),
    false,
    'AuthScreen should draw its glyphs with Lucide, not Ionicons'
  );
  assert.match(
    source,
    /from 'lucide-react-native'/,
    'AuthScreen should import its glyphs from lucide-react-native'
  );
  assert.match(
    source,
    /<IconButton icon=\{X\}/,
    'the header should dismiss through the shared paper IconButton'
  );
  assert.match(
    source,
    /t\('auth\.accountEyebrow'\)/,
    'the header should carry the centred ACCOUNT eyebrow'
  );
  assert.match(
    source,
    /t\('auth\.orWithEmail'\)/,
    'the provider block and the email form should be split by the OR WITH EMAIL rule'
  );
  assert.match(
    source,
    /t\('auth\.tagline'\)/,
    'the page should close on the FREE FOREVER · NO ADS · EVERY LANGUAGE eyebrow'
  );
  assert.match(
    source,
    /height: layout\.pillHeight/,
    'the Apple and Google strips are 50pt pills, the same height as the primary CTA'
  );
});

test('AuthScreen keeps the create-account mode on the same restyled surface', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  assert.match(
    source,
    /title: t\('auth\.createAnAccount'\)/,
    'sign-up mode should title the page "Create an account"'
  );
  assert.match(
    source,
    /primaryLabel: t\('auth\.createAccount'\)/,
    'sign-up mode should label its primary pill "Create account"'
  );
  assert.match(
    source,
    /switchLead: t\('auth\.alreadyHaveAccount'\)/,
    'sign-up mode should offer the way back to sign in'
  );
  assert.match(
    source,
    /switchLead: t\('auth\.newHere'\)/,
    'sign-in mode should invite new accounts with "New here?"'
  );
});

test('AuthScreen keeps password autofill and the reveal toggle accessible', () => {
  const source = readRelativeSource('./AuthScreen.tsx');

  assert.match(
    source,
    /textContentType=\{mode === 'signUp' \? 'newPassword' : 'password'\}/,
    'the password field should keep its platform autofill hint'
  );
  assert.match(
    source,
    /accessibilityLabel=\{\s*showPassword \? t\('auth\.hidePassword'\) : t\('auth\.showPassword'\)\s*\}/,
    'the eye toggle carries no text, so it must name its state for screen readers'
  );
});
