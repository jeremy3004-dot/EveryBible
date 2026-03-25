/**
 * Shared MMKV instance and Zustand StateStorage adapter.
 *
 * react-native-mmkv v2.12.2 is pinned because this project runs with
 * newArchEnabled: false (old architecture). v3+ requires TurboModules and v4
 * requires Nitro — both are incompatible with old arch.
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
