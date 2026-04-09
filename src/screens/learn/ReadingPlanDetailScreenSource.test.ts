import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'ReadingPlanDetailScreen.tsx'), 'utf8');

test('ReadingPlanDetailScreen forwards the full day playback sequence into BibleReader', () => {
  assert.match(
    source,
    /buildPlanDayPlaybackSequenceEntries\(dayEntries\)/,
    'ReadingPlanDetailScreen should build a chapter-by-chapter playback sequence for the selected day'
  );
  assert.match(
    source,
    /getPlanDayResume\(planId,\s*dayNumber\)/,
    'ReadingPlanDetailScreen should read the saved day resume position before reopening a plan day'
  );
  assert.match(
    source,
    /resolvePlanDayPlaybackStartEntry\(dayEntries,\s*resumeTarget\)/,
    'ReadingPlanDetailScreen should resume from the saved chapter when it still belongs to the selected day'
  );
  assert.match(
    source,
    /playbackSequenceEntries,\s*[\s\S]*planDayNumber: dayNumber,/s,
    'ReadingPlanDetailScreen should pass the current day playback sequence and selected day number into BibleReader'
  );
  assert.match(
    source,
    /onPress=\{\(\) => firstEntry && onPress\(firstEntry, dayNumber\)\}/,
    'Day rows should forward their own day number when opening the reader'
  );
  assert.match(
    source,
    /if \(!nextProgress\) \{[\s\S]*await enrollInPlan\(planId\);[\s\S]*setProgress\(nextProgress\);[\s\S]*\}/s,
    'ReadingPlanDetailScreen should auto-enroll the plan before launching a day row when the user has not started it yet'
  );
});
