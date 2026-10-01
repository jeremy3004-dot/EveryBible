import { useCallback, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Holds an InteractionManager interaction handle from mount until the JS batch after
 * `done` is committed, or for `maxMs` at most. Work queued with `runAfterInteractions`
 * meanwhile, such as a screen mounted underneath or a prefetch, then waits for this
 * screen's first content instead of competing with it on the JS thread. Only the
 * first `done` counts: later changes hold nothing.
 */
export function useInteractionHandleUntil(done: boolean, maxMs: number) {
  const handleRef = useRef<number | null>(null);
  const release = useCallback(() => {
    if (handleRef.current === null) return;
    InteractionManager.clearInteractionHandle(handleRef.current);
    handleRef.current = null;
  }, []);

  useEffect(() => {
    handleRef.current = InteractionManager.createInteractionHandle();
    // A load that fails or never ends must not hold everything else back.
    const timeout = setTimeout(release, maxMs);
    return () => {
      clearTimeout(timeout);
      release();
    };
  }, [maxMs, release]);

  useEffect(() => {
    if (!done || handleRef.current === null) return;
    // Not in this batch: React Native runs the queued work with setImmediate at the
    // end of the current batch, before its view updates reach the native side, so the
    // work would still go ahead of the content. A timer is a later batch.
    const timeout = setTimeout(release, 0);
    return () => clearTimeout(timeout);
  }, [done, release]);
}
