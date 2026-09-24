// Hermes exposes no `globalThis.crypto` at all. Without it, auth-js builds the
// PKCE code verifier from Math.random(), which is not a cryptographic RNG. This
// supplies only `crypto.getRandomValues`, backed by the platform CSPRNG through
// expo-crypto, so the verifier is unguessable.
//
// `crypto.subtle` is deliberately NOT provided. auth-js then sends the verifier
// as a `plain` challenge, which still defeats a scheme-hijacking app: the
// challenge travels only in the app's own HTTPS request to Supabase, and the
// email link carries just the auth code. A partial `subtle` would also make
// auth-js getClaims() and other WebCrypto users take paths that call methods a
// digest-only shim does not have.

export type IntegerTypedArray =
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array;

export type RandomFiller = <T extends IntegerTypedArray>(array: T) => T;

interface CryptoHost {
  crypto?: unknown;
}

/**
 * Installs `crypto.getRandomValues` on `target` when it is missing. The
 * provider is loaded only in that case, so runtimes with WebCrypto (Node, web)
 * never touch the native module. Returns whether anything was installed.
 */
export function installSecureRandomValues(
  target: CryptoHost,
  loadProvider: () => RandomFiller
): boolean {
  const existing = target.crypto as { getRandomValues?: unknown } | undefined;
  if (existing && typeof existing.getRandomValues === 'function') {
    return false;
  }

  let getRandomValues: RandomFiller;
  try {
    getRandomValues = loadProvider();
  } catch {
    // Without the native module auth-js falls back to its own generator; that
    // is weaker but still better than failing to build the auth client.
    return false;
  }

  if (existing && typeof existing === 'object') {
    (existing as { getRandomValues?: RandomFiller }).getRandomValues = getRandomValues;
  } else {
    target.crypto = { getRandomValues };
  }
  return true;
}
