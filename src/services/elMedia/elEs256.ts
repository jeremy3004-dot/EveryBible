import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';

import type { ElJwk } from './elEnvelope';

/**
 * Pure-JS ES256 (ECDSA / P-256 / SHA-256) verification and SHA-256 hashing.
 *
 * WHY THIS EXISTS: React Native's Hermes engine exposes no `globalThis.crypto` at all — not
 * `crypto.subtle`, not even `crypto.getRandomValues` (confirmed by evaluating in a running app
 * on an iOS 26.5 simulator). `jose`, which this replaced, requires WebCrypto, so on-device the
 * EL catalog silently failed verification and no EL translation ever reached the picker. The
 * Node test runner DOES provide WebCrypto, which is why the whole suite passed against a
 * runtime the app does not actually have.
 *
 * @noble/curves + @noble/hashes are audited, dependency-free, and pure JS, so they behave
 * identically under Hermes, Node, and web. Deliberately no crypto.subtle fast path: one code
 * path means what tests exercise is exactly what ships.
 */

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// charCode → 6-bit value, -1 for anything outside the base64url alphabet.
const BASE64URL_REVERSE: Int8Array = (() => {
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < BASE64URL_ALPHABET.length; i += 1) {
    table[BASE64URL_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Non-throwing base64url → bytes, implemented by hand.
 *
 * Deliberately does NOT use `atob`: React Native ships no atob polyfill (neither RN nor Expo
 * defines one), so relying on it would be a guess about the engine. This has no runtime
 * dependency and behaves the same everywhere.
 */
export function base64UrlToBytes(value: string): Uint8Array | null {
  // Tolerate (but do not require) '=' padding; JWS segments are unpadded.
  const input = value.replace(/=+$/, '');
  // A remainder of 1 cannot arise from any byte sequence.
  if (input.length % 4 === 1) return null;

  const out = new Uint8Array(Math.floor((input.length * 3) / 4));
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    const sextet = code < 128 ? BASE64URL_REVERSE[code] : -1;
    if (sextet < 0) return null;
    buffer = (buffer << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex] = (buffer >> bits) & 0xff;
      outIndex += 1;
    }
  }

  // Leftover bits (< 8) are the encoder's zero padding and are discarded, per base64.
  return outIndex === out.length ? out : out.subarray(0, outIndex);
}

export function sha256Bytes(bytes: Uint8Array): Uint8Array {
  return sha256(bytes);
}

export function sha256HexSync(bytes: Uint8Array): string {
  const digest = sha256(bytes);
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

// A P-256 JWK carries the affine coordinates as two 32-byte base64url values. noble wants the
// SEC1 uncompressed encoding: 0x04 || X || Y.
function jwkToUncompressedPoint(jwk: ElJwk): Uint8Array | null {
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return null;
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return null;

  const x = base64UrlToBytes(jwk.x);
  const y = base64UrlToBytes(jwk.y);
  // Reject any other length outright rather than left-padding: a coordinate that is not exactly
  // 32 bytes is a malformed key, not one we should try to repair.
  if (!x || !y || x.length !== 32 || y.length !== 32) return null;

  const point = new Uint8Array(65);
  point[0] = 0x04;
  point.set(x, 1);
  point.set(y, 33);
  return point;
}

/**
 * Verifies a compact JWS with ES256 and returns the raw payload bytes, or null.
 *
 * Never throws: every malformed-input path returns null so callers can treat "unverified" and
 * "malformed" identically.
 */
export function verifyEs256CompactJws(
  compactJws: string,
  jwk: ElJwk
): { payload: Uint8Array; protectedHeader: Record<string, unknown> } | null {
  const segments = compactJws.split('.');
  if (segments.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = segments;

  const publicKey = jwkToUncompressedPoint(jwk);
  if (!publicKey) return null;

  const signature = base64UrlToBytes(encodedSignature);
  // ES256 is fixed-width R||S over P-256: exactly 64 bytes. A DER-encoded signature is NOT
  // valid here per RFC 7518 and must be rejected rather than coerced.
  if (!signature || signature.length !== 64) return null;

  const payload = base64UrlToBytes(encodedPayload);
  const headerBytes = base64UrlToBytes(encodedHeader);
  if (!payload || !headerBytes) return null;

  let protectedHeader: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(headerBytes));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    protectedHeader = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  // Enforce the algorithm from the signed header itself; never trust the envelope's claim alone.
  if (protectedHeader.alg !== 'ES256') return null;

  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);

  let isValid = false;
  try {
    isValid = p256.verify(signature, sha256(signingInput), publicKey, {
      // JWS/WebCrypto do not require the signature's s value to be in the lower half of the
      // curve order, but noble enforces that by default. Leaving it on would reject roughly
      // half of all otherwise-valid signatures. Malleability is irrelevant here: we verify a
      // signature over a payload we then parse, we do not use the signature as an identifier.
      lowS: false,
    });
  } catch {
    return null;
  }

  return isValid ? { payload, protectedHeader } : null;
}
