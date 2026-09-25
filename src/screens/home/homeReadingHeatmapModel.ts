import { formatLocalDateKey, getDailyChapterCounts } from '../../services/progress/readingActivity';

/**
 * Pure grid maths for the Home reading heatmap: one square per local day, a
 * column per Monday-first week, the current week last. Kept free of React and
 * `Intl` so the day counts, shading and week boundaries stay unit-testable.
 */

export interface HomeHeatmapActivity {
  /** `{ "GEN_1": timestamp }` — each chapter's latest read. */
  chaptersRead: Record<string, number>;
  /** `{ "GEN_1": timestamp }` — each chapter's latest completed listen. */
  chaptersListened: Record<string, number>;
  /** `{ "2026-09-08": milliseconds }` — listening time per local day. */
  listeningMsByDate: Record<string, number>;
  /** `{ "2026-09-08": 3 }` — distinct chapters read or heard per local day. */
  chaptersByDate: Record<string, number>;
}

export type HomeHeatmapLevel = 0 | 1 | 2 | 3;

export interface HomeHeatmapDay {
  dateKey: string;
  /** Chapters read or heard that day (listening time counts as chapters too). */
  count: number;
  level: HomeHeatmapLevel;
  isToday: boolean;
  /** Later this week: drawn as an empty slot so the grid keeps its shape. */
  isFuture: boolean;
}

export interface HomeHeatmap {
  /** Oldest week first; each week runs Monday to Sunday. */
  weeks: HomeHeatmapDay[][];
  /** Days up to and including today that have any activity. */
  activeDays: number;
  /** Days up to and including today. */
  elapsedDays: number;
}

export const HEATMAP_MIN_WEEKS = 8;
export const HEATMAP_MAX_WEEKS = 26;
/** The square size the week count is chosen around; the squares then stretch to fill. */
export const HEATMAP_TARGET_CELL = 16;
export const HEATMAP_GAP = 3;

/** As many weeks as fit at roughly the target square size. */
export const getHeatmapWeekCount = (width: number): number => {
  if (!Number.isFinite(width) || width <= 0) {
    return HEATMAP_MIN_WEEKS;
  }
  const fit = Math.floor((width + HEATMAP_GAP) / (HEATMAP_TARGET_CELL + HEATMAP_GAP));
  return Math.min(HEATMAP_MAX_WEEKS, Math.max(HEATMAP_MIN_WEEKS, fit));
};

export const getHeatmapLevel = (count: number): HomeHeatmapLevel => {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
};

export const buildHomeReadingHeatmap = (
  activity: HomeHeatmapActivity,
  weekCount: number,
  now: Date
): HomeHeatmap => {
  // Reading and listening count together, by the same day rule as the calendar.
  const counts = getDailyChapterCounts(activity);
  const todayKey = formatLocalDateKey(now);
  // Monday of the current week, then back to the Monday of the oldest column.
  // Dates are built from calendar parts so DST never shifts a square.
  const mondayOffset = (now.getDay() + 6) % 7;
  const firstDay = now.getDate() - mondayOffset - 7 * (weekCount - 1);

  const weeks: HomeHeatmapDay[][] = [];
  let activeDays = 0;
  let elapsedDays = 0;

  for (let week = 0; week < weekCount; week += 1) {
    const days: HomeHeatmapDay[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = new Date(now.getFullYear(), now.getMonth(), firstDay + week * 7 + weekday);
      const dateKey = formatLocalDateKey(date);
      // Local date keys are zero-padded, so string order is calendar order.
      const isFuture = dateKey > todayKey;
      const count = isFuture ? 0 : (counts.get(dateKey) ?? 0);

      if (!isFuture) {
        elapsedDays += 1;
        if (count > 0) activeDays += 1;
      }

      days.push({
        dateKey,
        count,
        level: getHeatmapLevel(count),
        isToday: dateKey === todayKey,
        isFuture,
      });
    }
    weeks.push(days);
  }

  return { weeks, activeDays, elapsedDays };
};
