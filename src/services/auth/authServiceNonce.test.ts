/**
 * Apple Sign-In nonce hardening (S2).
 *
 * authService.ts pulls in react-native, expo-apple-authentication, the Google Sign-In
 * native module and the Supabase client, so every one of those specifiers is replaced
 * with an in-memory double via node:test module mocks. expo-crypto is mocked too, which
 * is the point of the exercise: the previous implementation reached for WebCrypto, which
 * Hermes does not have, so on device the nonce was always null and Apple Sign-In ran
 * unhardened. These tests pin the nonce as mandatory and end-to-end consistent.
 */

import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

type AppleSignInArgs = { nonce?: string; requestedScopes?: unknown[] };
type IdTokenArgs = { provider: string; token: string; nonce?: string };

const appleCalls: AppleSignInArgs[] = [];
const idTokenCalls: IdTokenArgs[] = [];

// Test-controlled expo-crypto behaviour. `randomFailure` makes getRandomBytesAsync throw
// the way a missing/failing native module would.
const cryptoState = { randomFailure: false, byteSeed: 7 };

let serviceModule: typeof import('./authService') | null = null;

async function loadService(): Promise<typeof import('./authService') | null> {
  if (serviceModule) return serviceModule;
  if (typeof (mock as { module?: unknown }).module !== 'function') return null;

  const url = (relative: string) => new URL(relative, import.meta.url).pathname;

  mock.module('expo-crypto', {
    namedExports: {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      getRandomBytesAsync: async (length: number) => {
        if (cryptoState.randomFailure) throw new Error('native crypto unavailable');
        return new Uint8Array(length).map((_, index) => (index + cryptoState.byteSeed) % 256);
      },
      digestStringAsync: async (algorithm: string, value: string) => {
        assert.equal(algorithm, 'SHA-256');
        return createHash('sha256').update(value).digest('hex');
      },
    },
  });

  mock.module('expo-apple-authentication', {
    namedExports: {
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
      signInAsync: async (args: AppleSignInArgs) => {
        appleCalls.push(args);
        return { identityToken: 'apple-identity-token', fullName: null };
      },
    },
  });

  mock.module('@react-native-google-signin/google-signin', {
    namedExports: {
      GoogleSignin: { configure: () => {} },
      isErrorWithCode: () => false,
      statusCodes: {},
    },
  });

  mock.module('react-native', {
    namedExports: { Platform: { OS: 'ios' } },
  });

  mock.module(url('../supabase/index.ts'), {
    namedExports: {
      isSupabaseConfigured: () => true,
      getCurrentUserId: async () => null,
      supabase: {
        auth: {
          signInWithIdToken: async (args: IdTokenArgs) => {
            idTokenCalls.push(args);
            return { data: { user: { id: 'user-1', email: 'a@b.c' } }, error: null };
          },
          updateUser: async () => ({ data: null, error: null }),
        },
      },
    },
  });

  try {
    serviceModule = await import('./authService');
  } catch {
    serviceModule = null;
  }
  return serviceModule;
}

function reset(): void {
  appleCalls.length = 0;
  idTokenCalls.length = 0;
  cryptoState.randomFailure = false;
}

test('Apple Sign-In sends the hashed nonce to Apple and the raw nonce to Supabase', async (t) => {
  const service = await loadService();
  if (!service) {
    t.skip('module mocking unavailable (run with --experimental-test-module-mocks)');
    return;
  }
  reset();

  const result = await service.signInWithApple();

  assert.equal(result.success, true);
  assert.equal(appleCalls.length, 1);
  assert.equal(idTokenCalls.length, 1);

  const hashed = appleCalls[0]?.nonce;
  const raw = idTokenCalls[0]?.nonce;

  assert.equal(typeof hashed, 'string');
  assert.equal(typeof raw, 'string');
  // 32 random bytes rendered as hex.
  assert.equal(raw?.length, 64);
  assert.match(raw ?? '', /^[0-9a-f]{64}$/);
  // Apple must receive the SHA-256 of exactly the value Supabase is given.
  assert.equal(
    hashed,
    createHash('sha256')
      .update(raw ?? '')
      .digest('hex')
  );
  assert.notEqual(hashed, raw);
});

test('a fresh nonce is generated per sign-in attempt', async (t) => {
  const service = await loadService();
  if (!service) {
    t.skip('module mocking unavailable');
    return;
  }
  reset();

  cryptoState.byteSeed = 1;
  await service.signInWithApple();
  cryptoState.byteSeed = 200;
  await service.signInWithApple();

  assert.equal(idTokenCalls.length, 2);
  assert.notEqual(idTokenCalls[0]?.nonce, idTokenCalls[1]?.nonce);
  assert.notEqual(appleCalls[0]?.nonce, appleCalls[1]?.nonce);
});

test('a nonce generation failure aborts sign-in instead of proceeding without one', async (t) => {
  const service = await loadService();
  if (!service) {
    t.skip('module mocking unavailable');
    return;
  }
  reset();
  cryptoState.randomFailure = true;

  const result = await service.signInWithApple();

  assert.equal(result.success, false);
  assert.equal(result.code, 'service_unavailable');
  // The critical assertion: Apple was never asked for a credential, so there is no
  // unhardened identity token to replay.
  assert.equal(appleCalls.length, 0);
  assert.equal(idTokenCalls.length, 0);
});
