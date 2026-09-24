import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether VoiceOver or TalkBack is running, kept current while mounted. Starts
 * false so first paint never waits on the native query; a change event that
 * lands before the query answers wins over the (older) answer.
 */
export function useScreenReaderEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    let changedSinceQuery = false;
    const subscription = AccessibilityInfo.addEventListener(
      'screenReaderChanged',
      (next: boolean) => {
        changedSinceQuery = true;
        if (active) setEnabled(next);
      }
    );
    AccessibilityInfo.isScreenReaderEnabled()
      .then((next) => {
        if (active && !changedSinceQuery) setEnabled(next);
      })
      .catch(() => {
        // Unknown means off: the default layout is the sighted one.
      });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
