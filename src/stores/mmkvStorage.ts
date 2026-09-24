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

// Keys whose stored blob could not be read this session. The store behind such a key hydrated
// from its defaults, so its next write would replace everything the user had saved; skipping
// those writes keeps the blob for a later launch whose read succeeds.
const unreadableKeys = new Set<string>();

// A native MMKV call can throw (a damaged or full file). Zustand calls setItem synchronously
// inside every set(), so a throw here would escape from whatever action ran it, which is a fatal
// error in a press handler. Storage failures degrade to "not persisted" instead.
export const zustandStorage: StateStorage = {
  setItem: (name, value) => {
    if (unreadableKeys.has(name)) {
      return;
    }

    try {
      if (mmkvInstance.getString(name) === value) {
        return;
      }
    } catch {
      // The unchanged-payload check is only an optimisation; fall through to the write.
    }

    try {
      mmkvInstance.set(name, value);
    } catch (error) {
      console.warn(`[MMKV] Failed to persist "${name}"; the change is kept in memory:`, error);
    }
  },
  getItem: (name) => {
    try {
      const value = mmkvInstance.getString(name);
      unreadableKeys.delete(name);
      return value ?? null;
    } catch (error) {
      unreadableKeys.add(name);
      console.warn(`[MMKV] Failed to read "${name}"; starting from defaults:`, error);
      return null;
    }
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
    const parsed = JSON.parse(raw) as {
      state?: { preferences?: { language?: unknown; onboardingCompleted?: unknown } };
    };
    // Until onboarding finishes, the stored language is the app default ('en'), written on
    // first launch and again by sign-out — not a choice. Boot must fall through to the device
    // language instead. (Pre-onboarding-gate snapshots have no flag and are trusted.)
    if (parsed?.state?.preferences?.onboardingCompleted === false) {
      return null;
    }
    const language = parsed?.state?.preferences?.language;
    return typeof language === 'string' && language.length > 0 ? language : null;
  } catch {
    return null;
  }
}
