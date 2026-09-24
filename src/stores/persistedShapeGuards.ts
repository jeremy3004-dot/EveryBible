/**
 * Shape guards for persisted Zustand state.
 *
 * zustand's persist already survives unparseable JSON and a throwing migrate or
 * merge (the store just stays at its initial state). What it does not survive is
 * JSON that parses into the wrong SHAPE: the default merge spreads it straight
 * into the store, and the crash comes later, from `.includes` in a render
 * selector or `.findIndex` in a tap handler (fatal in a release build). These
 * helpers coerce a persisted blob field by field, keeping every well-formed value.
 *
 * Deliberately dependency-free: the private-data stores load on the sign-in path,
 * and persistedStateSanitizers.ts pulls in the translation and book catalogs.
 */

export type PersistedRecord = Record<string, unknown>;

export const isPlainRecord = (value: unknown): value is PersistedRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const asRecord = (value: unknown): PersistedRecord => (isPlainRecord(value) ? value : {});

export const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

export const asStringArrayRecord = (value: unknown): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(asRecord(value)).map(([key, entry]) => [key, asStringArray(entry)])
  );

export const asBooleanRecord = (value: unknown): Record<string, boolean> =>
  Object.fromEntries(
    Object.entries(asRecord(value)).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === 'boolean'
    )
  );

export const asStringRecord = (value: unknown): Record<string, string> =>
  Object.fromEntries(
    Object.entries(asRecord(value)).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string'
    )
  );

export const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

/** The records of a persisted list that pass `isValid`; anything else is dropped. */
export const asRecordArray = <T>(
  value: unknown,
  isValid: (entry: PersistedRecord) => boolean
): T[] =>
  Array.isArray(value)
    ? (value.filter((entry) => isPlainRecord(entry) && isValid(entry)) as T[])
    : [];

/** The record-valued entries of a persisted map, each passed through `normalize`. */
export const mapRecordValues = <T>(
  value: unknown,
  normalize: (entry: PersistedRecord, key: string) => T
): Record<string, T> =>
  Object.fromEntries(
    Object.entries(asRecord(value))
      .filter((entry): entry is [string, PersistedRecord] => isPlainRecord(entry[1]))
      .map(([key, entry]) => [key, normalize(entry, key)])
  );

export type FieldSanitizers<S> = { [K in keyof S]?: (value: unknown) => S[K] };

/**
 * A persist `merge` that behaves like zustand's default (current state, then the
 * persisted fields on top) except that each listed field is coerced first. A
 * persisted value that is not an object at all leaves the current state alone,
 * and a field the blob does not carry keeps its current value.
 */
export function mergeSanitizedState<S extends object>(
  persistedState: unknown,
  currentState: S,
  sanitizers: FieldSanitizers<S>
): S {
  if (!isPlainRecord(persistedState)) {
    return currentState;
  }

  const merged: PersistedRecord = { ...currentState, ...persistedState };
  for (const key of Object.keys(sanitizers) as Array<keyof S & string>) {
    if (key in persistedState) {
      merged[key] = sanitizers[key]?.(persistedState[key]);
    }
  }
  return merged as S;
}
