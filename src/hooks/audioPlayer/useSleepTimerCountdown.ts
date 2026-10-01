import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
  /** Selah holds the narration paused with the music playing; the timer counts on. */
  selahActive?: boolean;
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
  selahActive = false,
  clearSleepTimer,
  pause,
}: SleepTimerCountdownInput): number | null {
  const sleepTimerRef = useRef<
    ReturnType<typeof setInterval> | ReturnType<typeof setTimeout> | null
  >(null);
  const [sleepTimerNow, setSleepTimerNow] = useState(() => Date.now());
  // The minutes label is only seen in the foreground, so a backgrounded reader needs
  // just the expiry. Listening in the background (screen off, all night) would
  // otherwise wake the CPU every second for a clock nobody can see.
  const [isForeground, setIsForeground] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setIsForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  const sleepTimerRemaining = useMemo(
    () => sleepTimerRemainingMinutes(sleepTimerEndTime, sleepTimerNow, sleepTimerRemainingMs),
    [sleepTimerEndTime, sleepTimerNow, sleepTimerRemainingMs]
  );

  useEffect(() => {
    // Always clear any stale timer from a prior render before potentially
    // starting a new one, so only one timer is ever active at a time.
    const stopCountdown = () => {
      if (sleepTimerRef.current) {
        // Node and browsers share one id pool for both clear functions.
        clearInterval(sleepTimerRef.current);
        clearTimeout(sleepTimerRef.current);
        sleepTimerRef.current = null;
      }
    };
    stopCountdown();

    const isRunning =
      status === 'playing' || status === 'loading' || (selahActive && status === 'paused');
    if (sleepTimerEndTime && isRunning) {
      // The end time moves on every resume; re-anchor the countdown now rather
      // than showing the stale pre-pause clock for up to a second.
      // Only the whole minutes left are shown, and this runs inside the reader: keep
      // the previous clock reading while the minute is unchanged, so the one-second
      // tick re-renders the screen once a minute rather than every second.
      const advanceClock = (now: number) =>
        setSleepTimerNow((previous) =>
          sleepTimerRemainingMinutes(sleepTimerEndTime, previous, null) ===
          sleepTimerRemainingMinutes(sleepTimerEndTime, now, null)
            ? previous
            : now
        );
      advanceClock(Date.now());
      const tick = () => {
        const now = Date.now();
        // Read the live end time: a pause freezes the timer in the store before
        // this effect re-runs, and a frozen timer must not expire.
        if (hasSleepTimerExpired(useAudioStore.getState().sleepTimerEndTime, now)) {
          // Expire once and use the same cancellation/status path as Pause.
          stopCountdown();
          clearSleepTimer();
          void pause();
          return;
        }
        if (isForeground) advanceClock(now);
      };
      if (isForeground) {
        sleepTimerRef.current = setInterval(tick, 1000);
      } else {
        // One wakeup at the deadline (native progress also enforces expiry while it
        // plays); the clock is re-anchored above when the app returns to the foreground.
        sleepTimerRef.current = setTimeout(tick, Math.max(0, sleepTimerEndTime - Date.now()));
      }
    }

    return stopCountdown;
  }, [sleepTimerEndTime, status, selahActive, isForeground, clearSleepTimer, pause]);

  return sleepTimerRemaining;
}
