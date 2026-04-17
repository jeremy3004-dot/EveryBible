import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'PlanDetailScreen.tsx'), 'utf8');

test('PlanDetailScreen always passes plan-day context into BibleReader launches', () => {
  assert.match(
    source,
    /const preferredChapterLaunchMode = useBibleStore\(\(state\) => state\.preferredChapterLaunchMode\);/,
    'PlanDetailScreen should read the persisted listen-or-read launch preference before opening the reader'
  );
  assert.match(
    source,
    /buildPlanDayPlaybackSequenceEntries\(dayEntries\)/,
    'PlanDetailScreen should build the day playback sequence before opening BibleReader'
  );
  assert.match(
    source,
    /getPlanDayResume\(planId,\s*dayNumber\)/,
    'PlanDetailScreen should read the saved day resume position before reopening a plan day'
  );
  assert.match(
    source,
    /resolvePlanDayPlaybackStartEntry\(dayEntries,\s*resumeTarget\)/,
    'PlanDetailScreen should resume from the saved chapter when it still belongs to the selected day'
  );
  assert.match(
    source,
    /chapter:\s*playbackStartEntry\.chapter,\s*\n\s*\.\.\.\(preferredChapterLaunchMode === 'listen' \? \{ autoplayAudio: true \} : \{\}\),\s*\n\s*preferredMode:\s*preferredChapterLaunchMode,\s*\n\s*playbackSequenceEntries,\s*\n\s*planId,\s*\n\s*planDayNumber:\s*dayNumber,\s*\n\s*(?:\.\.\.\(sessionKey \? \{ planSessionKey: sessionKey \} : \{\}\),\s*\n\s*)?returnToPlanOnComplete:\s*true/s,
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

test('PlanDetailScreen only renders the active day for recurring rhythm plans', () => {
  assert.match(
    source,
    /getVisiblePlanDayNumbers\(plan,\s*entries,\s*progress,\s*today\)/,
    'PlanDetailScreen should collapse recurring plans to the active chapter set for today'
  );
  assert.match(
    source,
    /const currentDay = plan \? getActivePlanDayNumber\(plan, progress, today\) : progress\?\.current_day \?\? 1;/,
    'PlanDetailScreen should resolve the active day from today even before enrollment'
  );
  assert.match(
    source,
    /visibleDayNumbers\.map\(\(dayNumber\) => \{/,
    'PlanDetailScreen should render only the visible day numbers'
  );
  assert.match(
    source,
    /isRecurringPlan\(plan\)/,
    'PlanDetailScreen should treat all recurring cadence plans as daily rhythms when deciding completion state and date labels'
  );
});

test('PlanDetailScreen exposes direct session buttons for multi-session days', () => {
  assert.match(
    source,
    /const sessionActions = daySessionGroups\.map\(\(group\) => \{/,
    'PlanDetailScreen should derive explicit per-session actions from each day session group'
  );
  assert.match(
    source,
    /sessionActions=\{sessionActions\}/,
    'PlanDetailScreen should pass the per-session actions into each day row'
  );
  assert.match(
    source,
    /sessionActions\.map\(\(action\) => \{/,
    'PlanDetailScreen should render a button for each available session on that day'
  );
  assert.match(
    source,
    /onPress=\{\(\) => onPress\(dayNumber, action\.sessionKey\)\}/,
    'PlanDetailScreen should open the exact tapped session instead of always defaulting to the first one'
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
  assert.match(
    source,
    /from 'react-native-svg'/,
    'PlanDetailScreen should render the progress ring through react-native-svg so the arc matches the displayed percentage'
  );
  assert.match(
    source,
    /strokeDasharray=\{circumference\}[\s\S]*strokeDashoffset=\{strokeDashoffset\}/s,
    'PlanDetailScreen should derive the progress arc from stroke dash math instead of a placeholder dot'
  );
});

test('PlanDetailScreen overlays the plan title on the hero image and removes the duration badge row', () => {
  assert.match(
    source,
    /<View style=\{styles\.coverTitleWrap\}>[\s\S]*<Text style=\{styles\.coverTitle\}/s,
    'PlanDetailScreen should render the plan title inside the cover image so the content below can sit higher'
  );
  assert.match(
    source,
    /coverTitle:\s*{[\s\S]*typography\.pageTitle[\s\S]*color:\s*'#ffffff'/s,
    'PlanDetailScreen should style the hero title for image-overlay contrast'
  );
  assert.doesNotMatch(
    source,
    /durationBadge|durationText|metaRow/,
    'PlanDetailScreen should remove the small duration badge row from beneath the cover'
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
