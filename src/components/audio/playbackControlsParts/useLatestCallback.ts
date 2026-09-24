import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function whose identity never changes but which always calls the latest
 * `callback`. Lets memoised controls take a parent's inline handlers without
 * redrawing each time the parent does.
 */
export function useLatestCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
