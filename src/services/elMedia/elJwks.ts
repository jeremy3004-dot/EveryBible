import type { ElJwk } from './elEnvelope';

// Pinned trust store. These two EC P-256 (ES256) public keys are compiled into the app
// build and are the ONLY trust anchor for every EL envelope (contract A2/B3):
// `lqd-prod-2026-a` signs all live catalogs/manifests; `lqd-dev-2026-a` signs the offline
// fixture pack. Re-verified against the live JWKS on 2026-08-03.
//
// There is deliberately NO runtime JWKS discovery any more. The previous implementation
// fetched `/.well-known/keys.json` from the SAME origin that serves the envelopes and
// merged whatever keys it found into the trust set (caching them for 24h). That made the
// ES256 layer worthless: anyone who controlled that origin — or a TLS-terminating
// middlebox — could mint their own P-256 key, sign a forged catalog/manifest, advertise it
// under a fresh `kid`, and have it verify. Key rotation therefore requires an APP UPDATE
// that adds the new key to this array; an envelope signed with any other `kid` fails
// verification rather than triggering a fetch.
export const EL_PINNED_JWKS: ElJwk[] = [
  {
    kty: 'EC',
    crv: 'P-256',
    x: 'FyhHALhdb5rwNprknv4bpqL7CL7MTiIRWE3dCgTGYYU',
    y: 'Tyw55Sl_n-9NEbTUzUl3HGB18lGMXTTYxkdTbAFkjbM',
    kid: 'lqd-prod-2026-a',
    alg: 'ES256',
    use: 'sig',
  },
  {
    kty: 'EC',
    crv: 'P-256',
    x: 'a6Wa5f9HTdnDALAfWytZJUfoI0ZORwyoiOANmdtqYaU',
    y: 'QakRiI46mgqVpTaAl3_H66FOE3szL0Xs58PLDbrxibQ',
    kid: 'lqd-dev-2026-a',
    alg: 'ES256',
    use: 'sig',
  },
];

// Storage key written by the removed remote-JWKS discovery cache. It is never read again;
// we delete it once per launch so a key poisoned by the old discovery path cannot linger
// on disk on an upgraded install.
const LEGACY_JWKS_CACHE_KEY = 'el-media:jwks-cache';

let purgedLegacyCache = false;

function purgeLegacyJwksCache(): void {
  if (purgedLegacyCache) return;
  purgedLegacyCache = true;
  try {
    // Guarded require so this module keeps zero import-time side effects and stays usable
    // under the Node test runner, where the native MMKV module is absent.
    const { mmkvInstance } = require('../../stores/mmkvStorage') as {
      mmkvInstance: { delete(key: string): void };
    };
    mmkvInstance.delete(LEGACY_JWKS_CACHE_KEY);
  } catch {
    // Best-effort. The cache is never read any more either way.
  }
}

// The trust set for every EL envelope: the pinned keys, nothing else. Async only so the
// injectable `getKeys` seams in elCatalogService / elManifestService keep one shape.
export async function getElKeys(): Promise<ElJwk[]> {
  purgeLegacyJwksCache();
  return [...EL_PINNED_JWKS];
}

// Test-only: clears per-launch in-memory state so each test starts cold.
export function __resetElJwksRuntimeForTests(): void {
  purgedLegacyCache = false;
}
