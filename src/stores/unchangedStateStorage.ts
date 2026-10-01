import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * zustand's `persist` calls storage after every `set`, even one that only touched fields
 * `partialize` leaves out, and `createJSONStorage` then JSON.stringifies the whole slice
 * before the MMKV adapter can notice nothing changed. On a large slice (the Bible catalog,
 * the read ledger) that is real JS-thread time per playback or download tick.
 *
 * This wraps a PersistStorage and compares the incoming slice with the last one it saved,
 * field by field with `Object.is`, so an unchanged slice costs a handful of comparisons
 * instead of a serialisation. That is sound because every persisted field is a primitive or
 * a value replaced wholesale by an immutable `set`; a slice that mutates a field in place
 * must not use it.
 *
 * Reads and removals forget the remembered slice: hydration and an owner switch change what
 * is stored without going through `setItem`.
 */
export function createUnchangedStateStorage<S>(base: PersistStorage<S>): PersistStorage<S> {
  let lastSaved: StorageValue<S> | undefined;

  return {
    getItem: (name) => {
      lastSaved = undefined;
      return base.getItem(name);
    },
    removeItem: (name) => {
      lastSaved = undefined;
      return base.removeItem(name);
    },
    setItem: (name, value) => {
      if (
        lastSaved &&
        lastSaved.version === value.version &&
        hasSameFields(lastSaved.state, value.state)
      ) {
        return;
      }
      const result = base.setItem(name, value);
      // MMKV is synchronous. Only remember successful synchronous saves; an async adapter
      // can still work, but must not suppress a write before it has finished.
      lastSaved = result === undefined ? value : undefined;
      return result;
    },
  };
}

function hasSameFields(left: unknown, right: unknown): boolean {
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const rightKeys = Object.keys(b);
  // partialize may omit a field (bibleStore's readingPositionUpdatedAt while null).
  if (Object.keys(a).length !== rightKeys.length) return false;
  return rightKeys.every((key) => Object.is(a[key], b[key]));
}
