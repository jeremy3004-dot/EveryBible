import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { traceScreenReaderSignal } from '../services/diagnostics/screenReaderTrace';

/**
 * Whether VoiceOver or TalkBack is running, kept current while mounted. Starts
 * false so first paint never waits on the native query; a change event that
 * lands before the query answers wins over the (older) answer.
 *
 * On Android both the query and 'screenReaderChanged' report touch exploration
 * (AccessibilityInfoModule.isTouchExplorationEnabled / touchExplorationDidChange),
 * which is what TalkBack turns on. `isAccessibilityServiceEnabled()` is deliberately
 * not consulted: it is true for any accessibility service (autofill, Switch Access,
 * UiAutomation itself) and would put sighted readers on the per-verse layout.
 * The native module already re-reads the state and emits a change on every host
 * resume, so no AppState re-query is needed here either.
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
        traceScreenReaderSignal(next, 'event');
        if (active) setEnabled(next);
      }
    );
    AccessibilityInfo.isScreenReaderEnabled()
      .then((next) => {
        if (!changedSinceQuery) traceScreenReaderSignal(next, 'query');
        if (active && !changedSinceQuery) setEnabled(next);
      })
      .catch(() => {
        traceScreenReaderSignal(false, 'queryFailed');
        // Unknown means off: the default layout is the sighted one.
      });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return enabled;
}
