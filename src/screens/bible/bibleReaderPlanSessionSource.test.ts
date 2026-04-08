import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'BibleReaderScreen.tsx'), 'utf8');
const detailSource = readFileSync(resolve(__dirname, '../learn/ReadingPlanDetailScreen.tsx'), 'utf8');

test('ReadingPlanDetailScreen launches plan chapters with explicit plan-session params', () => {
  assert.match(
    detailSource,
    /params:\s*\{[\s\S]*planId:\s*planId,[\s\S]*planDayNumber:\s*currentDay,[\s\S]*returnToPlanOnComplete:\s*true/s,
    'ReadingPlanDetailScreen should launch BibleReader with plan session metadata so the reader can keep day progress and return cleanly'
  );
});

test('BibleReaderScreen builds a dedicated ordered plan-session chapter list for the active day', () => {
  assert.match(
    source,
    /const activePlanDayEntries = useMemo\(/,
    'BibleReaderScreen should derive the active plan-day entries for the current day session'
  );
  assert.match(
    source,
    /const activePlanDayChapterItems = useMemo\(/,
    'BibleReaderScreen should flatten the current plan day into ordered chapter items'
  );
  assert.match(
    source,
    /const activePlanChapterIndex = useMemo\(/,
    'BibleReaderScreen should track the current chapter position inside the plan session'
  );
});

test('BibleReaderScreen renders a bottom plan session footer with plan title, day label, and chapter progress', () => {
  assert.match(
    source,
    /const renderPlanSessionFooter = \(\) =>/,
    'BibleReaderScreen should centralize the plan-session footer rendering for both read and listen modes'
  );
  assert.match(
    source,
    /readingPlans\.dayLabel/,
    'BibleReaderScreen should localize the day label in the plan session footer'
  );
  assert.match(
    source,
    /readingPlans\.chapterProgress/,
    'BibleReaderScreen should localize the chapter progress copy in the plan session footer'
  );
  assert.match(
    source,
    /planSessionFooterShell/,
    'BibleReaderScreen should define a dedicated bottom footer shell for the plan session UI'
  );
});

test('BibleReaderScreen advances to the next assigned plan chapter before exposing completion', () => {
  assert.match(
    source,
    /const handleAdvancePlanSession = useCallback\(/,
    'BibleReaderScreen should define a dedicated plan-session advance handler'
  );
  assert.match(
    source,
    /activePlanDayChapterItems\[activePlanChapterIndex \+ 1\]/,
    'BibleReaderScreen should advance using the next ordered chapter from the active day'
  );
  assert.match(
    source,
    /const isFinalPlanSessionChapter =/,
    'BibleReaderScreen should detect when the reader is on the last assigned chapter for the day'
  );
  assert.match(
    source,
    /readingPlans\.completeDayCta/,
    'BibleReaderScreen should swap the final footer action to a dedicated completion control'
  );
});

test('BibleReaderScreen mounts the same plan session footer in both read and listen experiences without affecting non-plan sessions', () => {
  assert.match(
    source,
    /\{showPlanSessionFooter \? renderPlanSessionFooter\(\) : null\}/,
    'BibleReaderScreen should gate the footer so normal non-plan reading and listening remain unchanged'
  );
  assert.match(
    source,
    /footer:\s*showPlanSessionFooter \? renderPlanSessionFooter\(\) : null/,
    'BibleReaderScreen should pass the shared plan footer into the listen-mode playback controls'
  );
});
