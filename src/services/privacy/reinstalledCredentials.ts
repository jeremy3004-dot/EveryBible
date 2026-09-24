import * as SecureStore from 'expo-secure-store';
import {
  COUNCIL_PASSCODE_SECURE_KEY,
  TRANSLATOR_REVIEW_PASSCODE_SECURE_KEY,
} from '../feedback/translatorFeedbackReviewModel';
import { publicRuntimeConfig } from '../startup/publicRuntimeConfig';

/**
 * supabase-js's default auth storage key is `sb-<first host label>-auth-token`, derived with
 * `new URL(url).hostname` (lowercased, no userinfo or port). auth-js also stores the PKCE
 * verifier and, when present, the user under that key plus a suffix. Derived by hand rather
 * than with `new URL()` (pure JS on Hermes); reinstalledCredentials.test.ts pins it to the
 * installed supabase-js.
 */
export function getSupabaseAuthStorageKeys(supabaseUrl: string | undefined): string[] {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(supabaseUrl?.trim() ?? '');
  if (!match) {
    return [];
  }
  const host = match[1].slice(match[1].lastIndexOf('@') + 1).replace(/:\d*$/, '');
  const label = host.split('.')[0].toLowerCase();
  if (!label) {
    return [];
  }
  const storageKey = `sb-${label}-auth-token`;
  return [storageKey, `${storageKey}-code-verifier`, `${storageKey}-user`];
}

/**
 * iOS keeps keychain items after the app is uninstalled, while the app container (MMKV) is
 * wiped. On a reinstall this deletes the credentials a previous install left in the
 * keychain — the Supabase session and the translator/council passcodes — so they cannot be
 * resurrected. Runs from the fresh-install branch of the privacy installation check, which
 * finishes before auth restores a session. Harmless on Android, where uninstall already
 * removes them. Rejects if the keychain refuses, so the marker stays unwritten and the next
 * launch retries.
 */
export async function clearReinstalledCredentials(): Promise<void> {
  const keys = [
    ...getSupabaseAuthStorageKeys(publicRuntimeConfig.EXPO_PUBLIC_SUPABASE_URL),
    TRANSLATOR_REVIEW_PASSCODE_SECURE_KEY,
    COUNCIL_PASSCODE_SECURE_KEY,
  ];
  await Promise.all(keys.map((key) => SecureStore.deleteItemAsync(key)));
}
