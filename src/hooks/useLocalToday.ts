import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RECURRING_CYCLE_ROLLOVER_GRACE_HOURS } from '../services/plans/readingPlanModel';
import { getMillisecondsUntilNextLocalMidnight } from '../services/bible/dailyScriptureRefresh';

const isSmallHours = (date: Date) => date.getHours() < RECURRING_CYCLE_ROLLOVER_GRACE_HOURS;

/**
 * Same local day and the same side of the small-hours cutoff. A recurring plan reads the
 * hour of "now" for the cycle rollover grace, so a Date from 01:00 cannot stand in for 08:00.
 */
const isSameLocalMoment = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate() &&
  isSmallHours(left) === isSmallHours(right);

/**
 * "Now" for a screen that shows today's plan day or reading. It is refreshed when
 * the screen regains focus, when the app returns to the foreground and at each
 * local midnight while the screen stays open.
 *
 * Focus alone is not enough: a plan left open in the evening and resumed the next
 * morning never loses focus, so the screen went on offering (and ticking)
 * yesterday's reading. The midnight timer is re-armed on every foreground, because
 * a timer set before the app was suspended or moved to another zone is stale.
 */
export function useLocalToday(): Date {
  const [today, setToday] = useState(() => new Date());
  const refresh = useCallback(() => {
    const now = new Date();
    // Keep the same instance while nothing a consumer can see has changed, so memos keyed
    // on it (plan cards, sessions, the activity calendar) do not recompute on every focus.
    setToday((previous) => (isSameLocalMoment(previous, now) ? previous : now));
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    let midnightTimer: ReturnType<typeof setTimeout> | null = null;
    const armMidnightTimer = () => {
      if (midnightTimer) clearTimeout(midnightTimer);
      midnightTimer = setTimeout(() => {
        refresh();
        armMidnightTimer();
      }, getMillisecondsUntilNextLocalMidnight());
    };

    armMidnightTimer();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refresh();
        armMidnightTimer();
      }
    });

    return () => {
      subscription.remove();
      if (midnightTimer) clearTimeout(midnightTimer);
    };
  }, [refresh]);

  return today;
}
