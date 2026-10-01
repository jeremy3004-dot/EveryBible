import { useCallback, useMemo, useState } from 'react';
import { useLocalToday } from '../../../hooks/useLocalToday';
import {
  formatLocalDateKey,
  parseLocalDateKey,
  type ReadingActivityDaySummary,
} from '../../../services/progress/readingActivity';
import {
  buildReadingActivityGrid,
  chunkCalendarWeeks,
  shiftMonth,
} from '../readingActivityCalendarModel';
import { buildCellLabels, getMonthSelectionKey } from './readingActivityScreenModel';

/**
 * The month on screen, its week rows, and which day is chosen.
 *
 * The grid is built without the selection, so its cells stay the same objects
 * when a day is chosen and only the two cells whose selection changed re-render;
 * the cell names are formatted once per month and language, not per press.
 */
export function useReadingActivityCalendar(
  daysByDateKey: Record<string, ReadingActivityDaySummary>,
  dayLabelFormatter: Intl.DateTimeFormat
) {
  const [viewDate, setViewDate] = useState(() => new Date());
  // Which cell is today, refreshed on foreground and at midnight as well as on focus.
  const now = useLocalToday();
  // useLocalToday hands back a fresh Date on every focus and foreground; the grid
  // only depends on which day it is, so key it on that and a same-day return
  // leaves the grid, its cell names and every cell untouched.
  const todayKey = formatLocalDateKey(now);
  const today = useMemo(() => parseLocalDateKey(todayKey), [todayKey]);
  const [chosenDateKey, setChosenDateKey] = useState<string | null>(null);

  // Scanning + sorting every read day only has to happen when the month or the
  // activity data changes, not on every render of the screen.
  const monthSelectionKey = useMemo(
    () => getMonthSelectionKey(viewDate, daysByDateKey),
    [viewDate, daysByDateKey]
  );
  const selectedDateKey = chosenDateKey ?? monthSelectionKey;

  const grid = useMemo(
    () => buildReadingActivityGrid({ daysByDateKey, viewDate, selectedDateKey: null, today }),
    [daysByDateKey, viewDate, today]
  );
  // Each week is its own row of seven flex slots, and the headers share that row
  // shape: every column is a seventh of the card whatever its width, where cells
  // sized width/7 from a measured width wrapped at six columns on device.
  const weeks = useMemo(() => chunkCalendarWeeks(grid.cells), [grid.cells]);
  const cellLabels = useMemo(
    () => buildCellLabels(grid.cells, dayLabelFormatter),
    [dayLabelFormatter, grid.cells]
  );

  const goToMonth = useCallback((delta: number) => {
    setChosenDateKey(null);
    setViewDate((current) => shiftMonth(current, delta));
  }, []);

  return {
    viewDate,
    grid,
    weeks,
    cellLabels,
    selectedDateKey,
    selectedDay: selectedDateKey ? (daysByDateKey[selectedDateKey] ?? null) : null,
    selectDay: setChosenDateKey,
    goToMonth,
  };
}
