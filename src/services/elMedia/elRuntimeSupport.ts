/**
 * Runtime capability gate for the EL verification path.
 *
 * This replaced an older WebCrypto-based check (`isManifestVerificationRuntimeSupported` in
 * bibleDataModel.ts, since deleted along with its `jose` verifier — nothing used it and `jose`
 * is no longer a dependency). That one required `globalThis.crypto.subtle`, which Hermes does
 * not provide AT ALL (verified
 * by evaluating in a running app: `typeof globalThis.crypto` is 'undefined' on iOS). Because the
 * old gate returned false on every device, `refreshElCatalog` bailed before its network request
 * and the EL catalog silently never loaded.
 *
 * EL verification is now pure JS (see elEs256.ts), so the only requirements are the text codecs,
 * which Hermes does provide. Kept dependency-free on purpose so callers can gate BEFORE pulling
 * in the noble crypto graph.
 */
export function isElVerificationRuntimeSupported(): boolean {
  return (
    typeof globalThis.TextDecoder === 'function' && typeof globalThis.TextEncoder === 'function'
  );
}
