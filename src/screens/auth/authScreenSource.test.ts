import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('SignInScreen hydrates the live session into auth state after successful sign-in', () => {
  const source = readRelativeSource('./SignInScreen.tsx');

  assert.match(
    source,
    /getCurrentSession/,
    'SignInScreen should read the live auth session after a successful sign-in'
  );
  assert.match(
    source,
    /setSession/,
    'SignInScreen should write the live auth session into the auth store'
  );
});

test('SignUpScreen hydrates the live session into auth state after provider auth success', () => {
  const source = readRelativeSource('./SignUpScreen.tsx');

  assert.match(
    source,
    /getCurrentSession/,
    'SignUpScreen should read the live auth session after provider auth success'
  );
  assert.match(
    source,
    /setSession/,
    'SignUpScreen should write the live auth session into the auth store after provider auth'
  );
});
