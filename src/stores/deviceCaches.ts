/**
 * What Settings > Clear cache removes: only data the app fetches again on its
 * own when it is missing.
 *
 * Everything else on the device is left alone, because it is either somebody's
 * only copy or state the app cannot rebuild:
 * - private notes, highlights, bookmarks, library, Gather and Four Fields data
 *   of every account on the phone and of the guest (privateDataScope), and the
 *   marker saying whose data is showing: without it the next launch would hand
 *   the guest's notes to whichever account was last signed in;
 * - downloaded translations and audio, reading plans, preferences and progress;
 * - install and security bookkeeping: the text-pack install journal, the
 *   AsyncStorage migration marker, the privacy-install marker and the EL
 *   catalog's last verified sequence (its rollback guard);
 * - analytics events and crash logs that have not been sent yet.
 *
 * Deliberately an allowlist: a key added later is kept until someone decides
 * it is a cache.
 */
import { mmkvInstance } from './mmkvStorage';

const CACHE_KEYS: readonly string[] = [
  // geoContext.ts: coarse location, refetched when older than a few hours.
  'analytics-geo-cache-v1',
  // elJwks.ts: written by the removed remote key cache; never read again.
  'el-media:jwks-cache',
];

const CACHE_KEY_PREFIXES: readonly string[] = [
  // elManifestService.ts: verified audio manifests, immutable by URL.
  'el-media:manifest:',
];

const isCacheKey = (key: string): boolean =>
  CACHE_KEYS.includes(key) || CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));

/** Removes the re-downloadable caches. Returns how many entries were removed. */
export function clearDeviceCaches(): number {
  const keys = mmkvInstance.getAllKeys().filter(isCacheKey);
  for (const key of keys) {
    mmkvInstance.delete(key);
  }
  return keys.length;
}
