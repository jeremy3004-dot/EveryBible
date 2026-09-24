import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (search query text) so downstream result
 * memos and the row lists only recompute after the user stops typing, rather
 * than on every keystroke. The TextInput keeps binding the raw value so typing
 * still feels immediate; only the expensive filtering/search follows the
 * debounced value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedValue(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debouncedValue;
}
