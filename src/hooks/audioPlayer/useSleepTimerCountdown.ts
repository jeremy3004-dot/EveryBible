import { useEffect, useMemo, useRef, useState } from 'react';
import {
  hasSleepTimerExpired,
  sleepTimerRemainingMinutes,
} from '../../services/audio/audioSleepTimerModel';
import { useAudioStore } from '../../stores/audioStore';
import type { AudioStatus } from '../../types';

export interface SleepTimerCountdownInput {
  sleepTimerEndTime: number | null;
  sleepTimerRemainingMs: number | null;
  status: AudioStatus;
  clearSleepTimer: () => void;
  pause: () => Promise<void>;
}

/**
 * Counts the sleep timer down while the reader is mounted and pauses playback when
 * it runs out. Returns the whole minutes left, or null with no timer set. (With the
 * reader closed, native progress enforces the expiry instead.)
 */
export function useSleepTimerCountdown({
  sleepTimerEndTime,
  sleepTimerRemainingMs,
  status,
  clearSleepTimer,
  pause,
}: SleepTimerCountdownInput): number | null {
  const sleepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [sleepTimerNow, setSleepTimerNow] = useState(() => Date.now());

  const sleepTimerRemaining = useMemo(
    () => sleepTimerRemainingMinutes(sleepTimerEndTime, sleepTimerNow, sleepTimerRemainingMs),
    [sleepTimerEndTime, sleepTimerNow, sleepTimerRemainingMs]
  );

  useEffect(() => {
    // Always clear any stale interval from a prior render before potentially
    // starting a new one, so only one interval is ever active at a time.
    if (sleepTimerRef.current) {
      clearInterval(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }

    if (sleepTimerEndTime && (status === 'playing' || status === 'loading')) {
      // The end time moves on every resume; re-anchor the countdown now rather
      // than showing the stale pre-pause clock for up to a second.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- re-anchors the countdown clock
      setSleepTimerNow(Date.now());
      sleepTimerRef.current = setInterval(() => {
        const now = Date.now();
        setSleepTimerNow(now);
        // Read the live end time: a pause freezes the timer in the store before
        // this effect re-runs, and a frozen timer must not expire.
        if (hasSleepTimerExpired(useAudioStore.getState().sleepTimerEndTime, now)) {
          // Expire once and use the same cancellation/status path as Pause.
          if (sleepTimerRef.current) clearInterval(sleepTimerRef.current);
          sleepTimerRef.current = null;
          clearSleepTimer();
          void pause();
        }
      }, 1000);
    }

    return () => {
      if (sleepTimerRef.current) {
        clearInterval(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
    };
  }, [sleepTimerEndTime, status, clearSleepTimer, pause]);

  return sleepTimerRemaining;
}
