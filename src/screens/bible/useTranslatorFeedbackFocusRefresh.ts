import { useCallback, type MutableRefObject } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Loads the translator feedback badges whenever the browser is focused. Focus effects
 * also run on a focused mount and when `load` changes, so this one owner covers the
 * initial load, translation changes, and fresh badges after returning from the reader.
 * Losing focus or unmounting bumps the request id so a late response is discarded.
 */
export function useTranslatorFeedbackFocusRefresh(
  load: () => Promise<void>,
  requestIdRef: MutableRefObject<number>
): void {
  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        requestIdRef.current += 1;
      };
    }, [load, requestIdRef])
  );
}
