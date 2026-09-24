import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest committed `value`. Callbacks read it when they run, so
 * they can stay stable while their host passes new functions on every render.
 */
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
