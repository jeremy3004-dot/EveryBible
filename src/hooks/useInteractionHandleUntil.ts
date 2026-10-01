import { useCallback, useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';

/**
 * Holds an InteractionManager interaction handle from mount until `done` is
 * committed, or for `maxMs` at most. Work queued with `runAfterInteractions`
 * meanwhile, such as a screen mounted underneath or a prefetch, then waits for this
 * screen's first content instead of competing with it on the JS thread. Queued work
 * starts in a later task, after this commit has gone to the native side. Only the
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
    if (done) release();
  }, [done, release]);
}
