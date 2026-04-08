import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'PlanDetailScreen.tsx'), 'utf8');

test('PlanDetailScreen always passes plan-day context into BibleReader launches', () => {
  assert.match(
    source,
    /buildPlanDayPlaybackSequenceEntries\(dayEntries\)/,
    'PlanDetailScreen should build the day playback sequence before opening BibleReader'
  );
  assert.match(
    source,
    /playbackSequenceEntries,\s*\n\s*planId,\s*\n\s*planDayNumber:\s*dayNumber,\s*\n\s*returnToPlanOnComplete:\s*true/s,
    'PlanDetailScreen should pass the plan day playback sequence and day context into BibleReader so next stays inside the plan'
  );
  assert.doesNotMatch(
    source,
    /shouldTrackPlanDay/,
    'PlanDetailScreen should not conditionally drop plan-session params when opening a plan day'
  );
  assert.match(
    source,
    /if \(!progress\) \{[\s\S]*await enrollInPlan\(planId\);[\s\S]*\}/s,
    'PlanDetailScreen should auto-enroll the plan before launching a tapped day when the user has not started it yet'
  );
});

test('PlanDetailScreen derives scheduled labels from the plan start date', () => {
  assert.match(
    source,
    /formatScheduledPlanDayLabel\(progress\.started_at,\s*dayNumber\)/,
    'PlanDetailScreen should derive a scheduled label for each day from the plan start date'
  );
  assert.match(
    source,
    /dateLabel=\{dateLabel\}/,
    'PlanDetailScreen should pass the scheduled label through to each day row'
  );
  assert.match(
    source,
    /dateLabel: string \| null/,
    'PlanDetailScreen should accept an optional scheduled label in the day row props'
  );
});

test('PlanDetailScreen does not render save, sample, or public completion controls', () => {
  assert.doesNotMatch(
    source,
    /savePlanForLater|unsavePlan|handleToggleSave/,
    'PlanDetailScreen should not expose save-for-later behavior'
  );
  assert.doesNotMatch(
    source,
    /readingPlans\.saveForLater|readingPlans\.sample|handleSample/,
    'PlanDetailScreen should not expose save-for-later or sample controls'
  );
  assert.doesNotMatch(
    source,
    /plan\.completion_count|readingPlans\.completions|completionsRow/,
    'PlanDetailScreen should not render the public completions count'
  );
});

test('PlanDetailScreen does not render a manual mark-complete control', () => {
  assert.doesNotMatch(
    source,
    /MarkCompleteButton/,
    'PlanDetailScreen should not expose a manual completion action'
  );
  assert.doesNotMatch(
    source,
    /readingPlans\.markComplete/,
    'PlanDetailScreen should not label any control as manual mark complete'
  );
});

test('PlanDetailScreen surfaces today target progress on the progress card', () => {
  assert.match(
    source,
    /todayTargetProgress/,
    'PlanDetailScreen should show the current plan-day target progress to the user'
  );
});

test('PlanDetailScreen exposes a stable selector for the active current-day row', () => {
  assert.match(
    source,
    /CURRENT_PLAN_DAY_ROW_TEST_ID = 'plan-detail-current-day-row'/,
    'PlanDetailScreen should define one stable testID for the current-day row'
  );
  assert.match(
    source,
    /testID=\{isCurrent \? CURRENT_PLAN_DAY_ROW_TEST_ID : undefined\}/,
    'PlanDetailScreen should attach the stable current-day row testID only to the active row'
  );
  assert.match(
    source,
    /Current plan day \$\{dayNumber\}/,
    'PlanDetailScreen should give the current-day row a deterministic accessibility label'
  );
});
