import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HEATMAP_MAX_WEEKS,
  HEATMAP_MIN_WEEKS,
  buildHomeReadingHeatmap,
  getHeatmapLevel,
  getHeatmapWeekCount,
  type HomeHeatmapActivity,
} from './homeReadingHeatmapModel';
import { getDailyChapterCounts } from '../../services/progress/readingActivity';

const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour, 0, 0, 0);

const activity = (overrides: Partial<HomeHeatmapActivity> = {}): HomeHeatmapActivity => ({
  chaptersRead: {},
  chaptersListened: {},
  listeningMsByDate: {},
  chaptersByDate: {},
  ...overrides,
});

// Thursday 2026-09-17.
const thursday = at(2026, 9, 17);

test('the grid ends on the current week, Monday first, with later days marked future', () => {
  const { weeks } = buildHomeReadingHeatmap(activity(), 3, thursday);

  assert.equal(weeks.length, 3);
  assert.ok(weeks.every((week) => week.length === 7));
  assert.equal(weeks[0]?.[0]?.dateKey, '2026-08-31', 'oldest column starts on a Monday');
  const current = weeks[2] ?? [];
  assert.deepEqual(
    current.map((day) => day.dateKey),
    [
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]
  );
  assert.deepEqual(
    current.map((day) => [day.isToday, day.isFuture]),
    [
      [false, false],
      [false, false],
      [false, false],
      [true, false],
      [false, true],
      [false, true],
      [false, true],
    ]
  );
});

test('a Sunday is the last square of its own week, not the first of the next', () => {
  const { weeks } = buildHomeReadingHeatmap(activity(), 1, at(2026, 9, 20));

  assert.equal(weeks[0]?.[0]?.dateKey, '2026-09-14');
  assert.equal(weeks[0]?.[6]?.isToday, true);
});

test('active and elapsed days count only up to today', () => {
  const heatmap = buildHomeReadingHeatmap(
    activity({ chaptersByDate: { '2026-09-15': 1, '2026-09-17': 2, '2026-09-18': 5 } }),
    2,
    thursday
  );

  assert.equal(heatmap.elapsedDays, 7 + 4);
  assert.equal(heatmap.activeDays, 2);
});

test('shading steps from none to one chapter, a few, and four or more', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 12].map(getHeatmapLevel), [0, 1, 2, 2, 3, 3]);
});

test('a day with only a chapter timestamp still shows, for history before the tally', () => {
  const counts = getDailyChapterCounts(
    activity({
      chaptersRead: { GEN_1: at(2026, 9, 1).getTime(), GEN_2: at(2026, 9, 1, 20).getTime() },
      chaptersListened: { GEN_2: at(2026, 9, 1, 21).getTime(), JHN_3: at(2026, 9, 2).getTime() },
    })
  );

  assert.equal(counts.get('2026-09-01'), 2, 'read and heard the same chapter is one chapter');
  assert.equal(counts.get('2026-09-02'), 1);
});

test('sources are combined by the largest, never summed', () => {
  const counts = getDailyChapterCounts(
    activity({
      chaptersRead: { GEN_1: at(2026, 9, 1).getTime() },
      chaptersByDate: { '2026-09-01': 3 },
      listeningMsByDate: { '2026-09-01': 8 * 60_000 },
    })
  );

  assert.equal(counts.get('2026-09-01'), 3);
});

test('listening counts like reading, but a stray tap under a minute does not', () => {
  const counts = getDailyChapterCounts(
    activity({
      listeningMsByDate: {
        '2026-09-01': 30_000,
        '2026-09-02': 90_000,
        '2026-09-03': 20 * 60_000,
      },
    })
  );

  assert.equal(counts.get('2026-09-01'), undefined);
  assert.equal(counts.get('2026-09-02'), 1);
  assert.equal(counts.get('2026-09-03'), 5);
});

test('the week count fills the width at about the target square and stays in bounds', () => {
  assert.equal(getHeatmapWeekCount(0), HEATMAP_MIN_WEEKS);
  assert.equal(getHeatmapWeekCount(Number.NaN), HEATMAP_MIN_WEEKS);
  assert.equal(getHeatmapWeekCount(100), HEATMAP_MIN_WEEKS);
  // A 390pt phone leaves about 300pt inside the card.
  assert.equal(getHeatmapWeekCount(300), 15);
  assert.equal(getHeatmapWeekCount(2000), HEATMAP_MAX_WEEKS);
});

test('a DST change inside the window neither skips nor repeats a day', () => {
  // Europe and the US both change clocks inside a 26-week window.
  const { weeks } = buildHomeReadingHeatmap(activity(), HEATMAP_MAX_WEEKS, thursday);
  const keys = weeks.flat().map((day) => day.dateKey);

  assert.equal(new Set(keys).size, keys.length);
  for (let index = 1; index < keys.length; index += 1) {
    const previous = new Date(`${keys[index - 1]}T12:00:00`);
    const next = new Date(`${keys[index]}T12:00:00`);
    assert.equal(Math.round((next.getTime() - previous.getTime()) / 86_400_000), 1);
  }
});
