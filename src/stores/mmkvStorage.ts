/**
 * Shared MMKV instance and Zustand StateStorage adapter.
 *
 * react-native-mmkv v2.12.2 is pinned because this project runs with
 * newArchEnabled: false (old architecture). v3+ requires TurboModules and v4
 * requires Nitro — both are incompatible with old arch.
 *
 * The package is patched via patch-package so its Android native build emits
 * 16 KB-compatible ELF alignment for Play compliance on Android 15+ devices.
 *
 * Using a single MMKV instance for all stores is the standard pattern from
 * mrousavy's docs. Each store writes its own namespaced key (e.g. 'auth-storage').
 *
 * NOTE: v2 uses .delete() — v4 renamed this to .remove(). Do not use .remove() here.
 */
import { MMKV } from 'react-native-mmkv';
import type { StateStorage } from 'zustand/middleware';

export const mmkvInstance = new MMKV();

export const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    if (mmkvInstance.getString(name) === value) {
      return;
    }

    mmkvInstance.set(name, value);
  },
  getItem: (name) => {
    const value = mmkvInstance.getString(name);
    return value ?? null;
  },
  removeItem: (name) => {
    mmkvInstance.delete(name);
  },
};

/** MMKV key the auth store persists under (see authStore's persist config). */
export const AUTH_STORAGE_KEY = 'auth-storage';

/**
 * Reads the persisted interface-language preference straight out of MMKV.
 *
 * i18n bootstraps before any store hydrates, so it cannot ask useAuthStore
 * which language the user chose. Without this it preloaded the *device* locale
 * (a 90-190KB module) and App.tsx then switched to the persisted preference,
 * throwing the first load away. MMKV reads are synchronous and this payload is
 * just the preferences slice, so the parse is cheap next to a locale module.
 *
 * Returns null when nothing is persisted or the blob is unreadable — callers
 * must fall back to their own default.
 */
export function getPersistedLanguagePreference(): string | null {
  try {
    const raw = mmkvInstance.getString(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { state?: { preferences?: { language?: unknown } } };
    const language = parsed?.state?.preferences?.language;
    return typeof language === 'string' && language.length > 0 ? language : null;
  } catch {
    return null;
  }
}
