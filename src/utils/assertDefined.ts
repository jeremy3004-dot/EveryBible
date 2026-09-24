/**
 * Narrows away `undefined` where the caller has already established that the value
 * exists (an index inside the bounds it just checked, a key read back from the same
 * object) but `noUncheckedIndexedAccess` cannot follow the reasoning. Throws instead
 * of letting `undefined` travel on, so a broken invariant fails where it breaks.
 */
export function assertDefined<T>(value: T, description: string): Exclude<T, undefined> {
  if (value === undefined) {
    throw new Error(`Expected ${description} to be defined`);
  }
  return value as Exclude<T, undefined>;
}
