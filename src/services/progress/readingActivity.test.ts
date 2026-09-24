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
  assert.equal(
    view.weeks.every((week) => week.length === 7),
    true
  );
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

// ---- Reading and listening are one activity ---------------------------------

test('a day heard but not read is still a day in the Word, with its chapters', () => {
  const summary = summarizeReadingActivity({
    chaptersRead: { GEN_1: new Date(2026, 2, 18, 8, 0).getTime() },
    chaptersListened: {
      GEN_1: new Date(2026, 2, 18, 9, 0).getTime(),
      PSA_23: new Date(2026, 2, 19, 7, 30).getTime(),
    },
  });

  assert.deepEqual(summary.daysByDateKey['2026-03-18']?.chapterKeys, ['GEN_1']);
  assert.equal(summary.daysByDateKey['2026-03-18']?.chapterCount, 1, 'read and heard is one');
  assert.deepEqual(summary.daysByDateKey['2026-03-19']?.chapterKeys, ['PSA_23']);
  assert.equal(summary.totalReadDays, 2);
  assert.equal(summary.totalChapterReads, 2);
  assert.equal(summary.mostRecentDateKey, '2026-03-19');
});

test('days known only from the tally or listening time still count', () => {
  const summary = summarizeReadingActivity({
    chaptersRead: { GEN_1: new Date(2026, 2, 20, 8, 0).getTime() },
    chaptersByDate: { '2026-03-18': 2, '2026-03-20': 3 },
    listeningMsByDate: { '2026-03-19': 9 * 60_000, '2026-03-21': 20_000 },
  });

  assert.deepEqual(summary.daysByDateKey['2026-03-18'], {
    dateKey: '2026-03-18',
    chapterCount: 2,
    firstReadAt: new Date(2026, 2, 18, 12, 0).getTime(),
    lastReadAt: new Date(2026, 2, 18, 12, 0).getTime(),
    chapterKeys: [],
  });
  assert.equal(summary.daysByDateKey['2026-03-19']?.chapterCount, 2, 'nine minutes heard');
  assert.equal(summary.daysByDateKey['2026-03-20']?.chapterCount, 3, 'the larger source wins');
  assert.equal(summary.daysByDateKey['2026-03-21'], undefined, 'twenty seconds is a stray tap');
  assert.equal(summary.totalReadDays, 3);
});
