import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadingActivityMonthView, summarizeReadingActivity } from './readingActivity';

test('summarizes chapter reads by local day with counts and recency', () => {
  const summary = summarizeReadingActivity({
    GEN_1: new Date(2026, 2, 18, 8, 15).getTime(),
    EXO_3: new Date(2026, 2, 18, 21, 5).getTime(),
    ROM_8: new Date(2026, 2, 19, 9, 0).getTime(),
  });

  assert.equal(summary.totalReadDays, 2);
  assert.equal(summary.totalChapterReads, 3);
  assert.equal(summary.mostRecentDateKey, '2026-03-19');
  assert.deepEqual(summary.daysByDateKey['2026-03-18'], {
    dateKey: '2026-03-18',
    chapterCount: 2,
    firstReadAt: new Date(2026, 2, 18, 8, 15).getTime(),
    lastReadAt: new Date(2026, 2, 18, 21, 5).getTime(),
    chapterKeys: ['GEN_1', 'EXO_3'],
  });
});

test('builds a month view that highlights the selected day and activity counts', () => {
  const view = buildReadingActivityMonthView(
    {
      GEN_1: new Date(2026, 2, 18, 8, 15).getTime(),
      EXO_3: new Date(2026, 2, 18, 21, 5).getTime(),
      ROM_8: new Date(2026, 2, 19, 9, 0).getTime(),
    },
    new Date(2026, 2, 1),
    '2026-03-18'
  );

  assert.equal(view.monthKey, '2026-03');
  assert.equal(view.totalReadDays, 2);
  assert.equal(view.monthReadDays, 2);
  assert.equal(view.selectedDateKey, '2026-03-18');
  assert.equal(view.weeks.length, 6);
  assert.equal(view.weeks.every((week) => week.length === 7), true);
  assert.deepEqual(view.selectedDay, {
    dateKey: '2026-03-18',
    chapterCount: 2,
    firstReadAt: new Date(2026, 2, 18, 8, 15).getTime(),
    lastReadAt: new Date(2026, 2, 18, 21, 5).getTime(),
    chapterKeys: ['GEN_1', 'EXO_3'],
  });

  const selectedCell = view.weeks.flat().find((cell) => cell.dateKey === '2026-03-18');
  assert.ok(selectedCell);
  assert.equal(selectedCell?.isSelected, true);
  assert.equal(selectedCell?.chapterCount, 2);
  assert.equal(selectedCell?.hasActivity, true);
});
