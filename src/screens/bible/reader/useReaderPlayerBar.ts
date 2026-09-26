import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  publishReaderPlayerBar,
  releaseReaderPlayerBar,
  type ReaderPlayerBarActions,
  type ReaderPlayerBarControls,
} from '../../../stores/readerPlayerBarStore';

export interface UseReaderPlayerBarInput {
  routeKey: string;
  controls: ReaderPlayerBarControls;
  actions: ReaderPlayerBarActions;
}

/**
 * Hands this reader's transport to the player bar while the reader is focused:
 * Play starts the displayed chapter, the chevrons move within the plan or rhythm
 * session, the sound button opens the Audio sheet. Handlers are read when pressed,
 * so the reader's inline handlers never republish; changed values do, and only
 * those, so an unrelated reader render leaves the bar alone.
 */
export function useReaderPlayerBar({ routeKey, controls, actions }: UseReaderPlayerBarInput) {
  const latestActions = useRef(actions);
  useLayoutEffect(() => {
    latestActions.current = actions;
  });
  const stableActions = useMemo<ReaderPlayerBarActions>(
    () => ({
      playPause: () => latestActions.current.playPause(),
      previous: () => latestActions.current.previous(),
      next: () => latestActions.current.next(),
      openAudioSheet: () => latestActions.current.openAudioSheet(),
    }),
    []
  );
  const latestControls = useRef(controls);
  const isFocusedRef = useRef(false);

  // Retained readers keep their state; only the focused one drives the bar, and a
  // blur never withdraws what a newer reader has published since.
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      publishReaderPlayerBar(routeKey, latestControls.current, stableActions);
      return () => {
        isFocusedRef.current = false;
        releaseReaderPlayerBar(routeKey);
      };
    }, [routeKey, stableActions])
  );

  // Runs after every render; publishing compares field by field and stops there.
  useEffect(() => {
    latestControls.current = controls;
    if (isFocusedRef.current) {
      publishReaderPlayerBar(routeKey, controls, stableActions);
    }
  });
}
