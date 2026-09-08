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
    /dateLabel=\{item\.dateLabel\}/,
    'PlanDetailScreen should pass the scheduled label through to each day row'
  );
  assert.match(
    source,
    /dateLabel: string \| null/,
    'PlanDetailScreen should accept an optional scheduled label in the day row props'
  );
});

test('PlanDetailScreen lists the whole plan in the ledger, recurring rhythms included', () => {
  assert.match(
    source,
    /function getLedgerDayNumbers\(entries: ReadingPlanEntry\[\]\): number\[\]/,
    'PlanDetailScreen should derive the ledger day universe from every day the plan has entries for'
  );
  assert.match(
    source,
    /const ledgerDayNumbers = React\.useMemo\(\(\) => getLedgerDayNumbers\(entries\), \[entries\]\);/,
    'PlanDetailScreen should build the ledger from the plan-wide day list'
  );
  assert.doesNotMatch(
    source,
    /getVisiblePlanDayNumbers/,
    'The ledger must show a recurring plan every day of its cycle, not collapse it to today'
  );
  assert.match(
    source,
    /const currentDay = plan\s*\?\s*getActivePlanDayNumber\(plan, progress, today\)\s*:\s*\(progress\?\.current_day \?\? 1\);/,
    'PlanDetailScreen should resolve the active day from today even before enrollment'
  );
  assert.match(
    source,
    /ledgerDayNumbers\.map\(\(dayNumber\) => \{/,
    'PlanDetailScreen should build one row view model per ledger day'
  );
  assert.match(
    source,
    /isRecurringPlan\(plan\)/,
    'PlanDetailScreen should treat all recurring cadence plans as daily rhythms when deciding completion state and date labels'
  );
  assert.match(
    source,
    /return isRecurringPlan\(plan\) \? \(ledgerDayNumbers\[0\] \?\? currentDay \+ 1\) : currentDay \+ 1;/,
    'A recurring cycle should wrap back to its first day when today is the last one, so "tomorrow" still has a row'
  );
});

test('PlanDetailScreen derives ledger cells and ledger rows from one completion record', () => {
  assert.match(
    source,
    /function isLedgerDayComplete\(\{/,
    'PlanDetailScreen should resolve day completion in one shared helper'
  );
  assert.match(
    source,
    /if \(getLedgerDayCompletionKey\(plan, dayNumber, today\) in progress\.completed_entries\)/,
    'The shared helper should read the same completed_entries key the cell grid files days under'
  );
  assert.equal(
    (source.match(/= isLedgerDayComplete\(\{/g) ?? []).length,
    2,
    'Both the cell grid and the ledger rows should derive done/missed state from the shared helper'
  );
  assert.match(
    source,
    /function getRecurringLedgerDayDate\(plan: ReadingPlan, dayNumber: number, today: Date\): Date \| null/,
    'PlanDetailScreen should resolve the cycle date a recurring plan day falls on'
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
    /sessionActions=\{item\.sessionActions\}/,
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
    /<ProgressCard[\s\S]*plan=\{plan\}[\s\S]*progress=\{progress\}[\s\S]*currentDaySummary=\{currentDaySummary\}[\s\S]*today=\{today\}[\s\S]*\/>/,
    'PlanDetailScreen should pass the stable today value into the progress card'
  );
  assert.doesNotMatch(
    source,
    /from 'react-native-svg'/,
    'The ring gauge is gone: progress reads as the day numeral plus the cell ledger, not an arc'
  );
  assert.match(
    source,
    /type LedgerCellState = 'done' \| 'missed' \| 'today' \| 'future';/,
    'PlanDetailScreen should classify every plan day into one of the four ledger cell states'
  );
  assert.match(
    source,
    /<LedgerCells states=\{cellStates\} \/>/,
    'PlanDetailScreen should render the per-day cell ledger inside the progress card'
  );
  assert.match(
    source,
    /Math\.floor\(\(innerWidth - LEDGER_CELL_GAP \* \(LEDGER_COLUMNS - 1\)\) \/ LEDGER_COLUMNS\)/,
    'PlanDetailScreen should size ledger cells from the measured card width instead of a hardcoded cell size'
  );
});

test('PlanDetailScreen overlays the plan title on the hero image and removes the duration badge row', () => {
  assert.match(
    source,
    /<View style=\{styles\.coverTitleWrap\}>[\s\S]*<Text style=\{\[styles\.coverTitle, displayFont\.bold\]\}/s,
    'PlanDetailScreen should render the plan title inside the cover image so the content below can sit higher'
  );
  assert.match(
    source,
    /coverTitle:\s*{[\s\S]*typography\.screenTitle[\s\S]*color:\s*ON_PHOTO_TEXT/s,
    'PlanDetailScreen should style the hero title for image-overlay contrast'
  );
  assert.match(
    source,
    /const ON_PHOTO_TEXT = '#FDFAF5';/,
    'On-photo text is a fixed value in both scopes, so it must be a named constant rather than a theme token'
  );
  assert.match(
    source,
    /<Text\s*\n?\s*style=\{\[styles\.coverEyebrow, displayFont\.regular\]\}/s,
    'PlanDetailScreen should set the cadence/length/book eyebrow over the cover in the display face'
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
    /const accessibilityLabel = isCurrent\s*\? `\$\{t\('interface\.currentPlanDay', \{ day: dayNumber \}\)\}/,
    'PlanDetailScreen should localize the current-day label while retaining its day number'
  );
  assert.match(
    source,
    /testID=\{isCurrent \? CURRENT_PLAN_DAY_ROW_TEST_ID : undefined\}[^<]*accessibilityLabel=\{accessibilityLabel\}/,
    'PlanDetailScreen should apply the localized accessibility label to the row with the stable testID'
  );
});
