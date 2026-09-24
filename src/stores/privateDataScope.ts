/**
 * Account-scoped persistence for private data that exists only on this device.
 *
 * Highlights, notes and bookmarks, the audio library, Gather lesson marks and
 * Four Fields progress and groups are never synced, so wiping them at an auth
 * boundary would delete the only copy. Each of these stores instead persists
 * into one bucket per owner: one per signed-in account, plus the guest bucket
 * used while signed out. Only the active owner's bucket is ever read.
 *
 * Owner rules (product decision 2026-09-24, sync review finding 10):
 * - Guest -> first sign-in as A: the guest bucket is merged into A's bucket and
 *   then emptied, so nobody loses notes by signing in.
 * - A -> signed out: the guest bucket is shown; A's bucket stays on disk.
 * - A -> B, directly or via a sign-out: B's bucket. A's data returns when A
 *   signs in again. Nothing is deleted.
 * - A launch that cannot refresh the session offline is not a boundary: nobody
 *   calls switchPrivateDataOwner, so the persisted owner's data stays visible.
 *
 * The guest bucket keeps the store's original key, so signed-out installs need
 * no migration. Account buckets are `<store>:user:<uid>`.
 *
 * Everything here is synchronous MMKV work: zustand persist hydrates
 * synchronously from it, so a switch completes before the next render.
 */
import type { StateStorage } from 'zustand/middleware';
import type { StoreApi } from 'zustand';
import { mmkvInstance } from './mmkvStorage';

/** MMKV key holding whose bucket is active: `{ owner: uid | null }`. */
export const PRIVATE_DATA_OWNER_KEY = 'private-data-owner';

// Mirrors AUTH_STORAGE_KEY in mmkvStorage.ts. Kept local because several test
// files replace mmkvStorage with a mock that exports only the MMKV instance.
const AUTH_STORAGE_KEY = 'auth-storage';

/**
 * Every private store's persist name. Before account scoping these keys held
 * the device's data regardless of who was signed in; now they are the guest
 * bucket. Listed here (not only via registration) because the existing-install
 * migration must move a store's data even if that store has not loaded yet.
 */
export const PRIVATE_DATA_STORE_NAMES = [
  'annotation-storage',
  'library-storage',
  'gather-storage',
  'four-fields-storage',
] as const;

export const privateDataStorageKey = (name: string, owner: string | null): string =>
  owner === null ? name : `${name}:user:${owner}`;

interface OwnerMarker {
  owner: string | null;
  // Written between merging the guest bucket into an account and deleting it,
  // so a kill in that window cannot leave the adopted notes visible to the next
  // signed-out reader or account.
  clearGuest?: boolean;
}

type PersistedStore<S> = StoreApi<S> & {
  persist: {
    getOptions: () => { name?: string };
    rehydrate: () => Promise<void> | void;
  };
};

interface RegisteredPrivateStore {
  // Replace the in-memory state with the active owner's bucket.
  reload: () => void;
  // Snapshot the in-memory (guest) state; the returned function merges it into
  // whatever the store holds when it is called.
  captureGuest: () => () => void;
}

const registry = new Map<string, RegisteredPrivateStore>();

// undefined until the first read resolves it from disk.
let activeOwner: string | null | undefined;
let writesSuspended = false;

const readOwnerMarker = (): OwnerMarker | null => {
  try {
    const raw = mmkvInstance.getString(PRIVATE_DATA_OWNER_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { owner?: unknown; clearGuest?: unknown };
    if (parsed.owner !== null && (typeof parsed.owner !== 'string' || parsed.owner === '')) {
      return null;
    }
    return { owner: parsed.owner, clearGuest: parsed.clearGuest === true };
  } catch {
    return null;
  }
};

const writeOwnerMarker = (marker: OwnerMarker): void => {
  mmkvInstance.set(PRIVATE_DATA_OWNER_KEY, JSON.stringify(marker));
};

// The account whose data the device's stores held before scoping existed:
// authStore keeps it as lastSyncedUserId (set on sign-in, cleared on sign-out).
// The live session is only known after an async restore, and hydration cannot
// wait for that, so this is the owner of record for existing installs.
const readPersistedAuthOwner = (): string | null => {
  try {
    const raw = mmkvInstance.getString(AUTH_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { state?: { lastSyncedUserId?: unknown } };
    const owner = parsed?.state?.lastSyncedUserId;
    return typeof owner === 'string' && owner.length > 0 ? owner : null;
  } catch {
    return null;
  }
};

const clearGuestBuckets = (): void => {
  for (const name of PRIVATE_DATA_STORE_NAMES) {
    mmkvInstance.delete(privateDataStorageKey(name, null));
  }
};

// Moves existing-install data into the owner's bucket. Every step is safe to
// repeat: a kill after the copy leaves identical copies, which the rerun
// resolves by deleting the device key; the marker is written last.
const migrateDeviceDataTo = (owner: string): void => {
  for (const name of PRIVATE_DATA_STORE_NAMES) {
    const deviceValue = mmkvInstance.getString(name);
    if (deviceValue === undefined) {
      continue;
    }

    const accountKey = privateDataStorageKey(name, owner);
    const accountValue = mmkvInstance.getString(accountKey);
    if (accountValue === undefined) {
      mmkvInstance.set(accountKey, deviceValue);
      mmkvInstance.delete(name);
    } else if (accountValue === deviceValue) {
      mmkvInstance.delete(name);
    }
    // Otherwise the account already has different data here. Neither copy is
    // discarded: the device copy simply stays in the guest bucket.
  }
};

const resolveActiveOwner = (): string | null => {
  if (activeOwner !== undefined) {
    return activeOwner;
  }

  const marker = readOwnerMarker();
  if (marker) {
    activeOwner = marker.owner;
    if (marker.clearGuest && marker.owner !== null) {
      clearGuestBuckets();
      writeOwnerMarker({ owner: marker.owner });
    }
    return activeOwner;
  }

  const owner = readPersistedAuthOwner();
  if (owner !== null) {
    migrateDeviceDataTo(owner);
  }
  activeOwner = owner;
  writeOwnerMarker({ owner });
  return owner;
};

const withWritesSuspended = (run: () => void): void => {
  writesSuspended = true;
  try {
    run();
  } finally {
    writesSuspended = false;
  }
};

/**
 * StateStorage for the private stores: reads and writes the active owner's
 * bucket. Pass it to `createJSONStorage` in place of `zustandStorage`.
 */
export const privateDataStorage: StateStorage = {
  getItem: (name) =>
    mmkvInstance.getString(privateDataStorageKey(name, resolveActiveOwner())) ?? null,
  setItem: (name, value) => {
    if (writesSuspended) {
      return;
    }
    const key = privateDataStorageKey(name, resolveActiveOwner());
    if (mmkvInstance.getString(key) === value) {
      return;
    }
    mmkvInstance.set(key, value);
  },
  removeItem: (name) => {
    if (writesSuspended) {
      return;
    }
    mmkvInstance.delete(privateDataStorageKey(name, resolveActiveOwner()));
  },
};

/**
 * Registers a persisted store that uses `privateDataStorage` so an owner switch
 * can swap its in-memory state. `mergeGuest` combines an account's state with
 * the guest state it adopts; it must be idempotent (merging the same guest
 * state twice changes nothing), because an interrupted adoption is retried.
 */
export function registerPrivateDataStore<S>(
  store: PersistedStore<S>,
  mergeGuest: (account: S, guest: S) => Partial<S>
): void {
  const name = store.persist.getOptions().name;
  if (!name) {
    throw new Error('registerPrivateDataStore: the store has no persist name');
  }

  registry.set(name, {
    reload: () =>
      withWritesSuspended(() => {
        // Start from the initial state first: persist merges a missing bucket
        // into the current state, which would carry the previous owner's data
        // into the next owner's view (and, once written, into their bucket).
        store.setState(store.getInitialState(), true);
        void store.persist.rehydrate();
      }),
    captureGuest: () => {
      const guest = store.getState();
      return () => {
        store.setState(mergeGuest(store.getState(), guest));
      };
    },
  });
}

export interface SwitchPrivateDataOwnerOptions {
  // Loads every private store module. Called only before a guest adoption so
  // that stores not yet imported still have their guest bucket adopted.
  loadStores?: () => void;
}

/**
 * Makes `nextOwner`'s bucket the visible private data (null = signed out).
 * Call it at every auth boundary; it is a no-op when the owner is unchanged.
 */
export function switchPrivateDataOwner(
  nextOwner: string | null,
  options: SwitchPrivateDataOwnerOptions = {}
): void {
  const currentOwner = resolveActiveOwner();
  if (currentOwner === nextOwner) {
    return;
  }

  if (currentOwner === null && nextOwner !== null) {
    options.loadStores?.();
    const applyGuest = Array.from(registry.values(), (store) => store.captureGuest());
    activeOwner = nextOwner;
    for (const store of registry.values()) {
      store.reload();
    }
    // Writes the merged state into the account's bucket.
    for (const apply of applyGuest) {
      apply();
    }
    writeOwnerMarker({ owner: nextOwner, clearGuest: true });
    clearGuestBuckets();
    writeOwnerMarker({ owner: nextOwner });
    return;
  }

  activeOwner = nextOwner;
  writeOwnerMarker({ owner: nextOwner });
  for (const store of registry.values()) {
    store.reload();
  }
}

/** The owner whose private data is visible (null = the guest bucket). */
export const getPrivateDataOwner = (): string | null => resolveActiveOwner();

/**
 * Test seam: forgets the cached owner and reloads every registered store, which
 * is what a cold start does (the owner is re-read from disk, any pending
 * migration or adoption cleanup runs, and each store hydrates its bucket).
 */
export function restartPrivateDataScopeForTests(): void {
  activeOwner = undefined;
  for (const store of registry.values()) {
    store.reload();
  }
}
