import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'BibleReaderScreen.tsx'), 'utf8');

test('BibleReaderScreen uses plan-day activity helpers to detect when todays target is complete', () => {
  assert.match(
    source,
    /getCurrentPlanDaySummary/,
    'BibleReaderScreen should evaluate read and listen activity against the current plan day'
  );
});

test('BibleReaderScreen marks the active plan day complete and routes back to PlanDetail', () => {
  assert.match(
    source,
    /await markDayComplete\(activePlanId,\s*planDayNumber\)/,
    'BibleReaderScreen should auto-complete the active plan day when the target is met'
  );
  assert.match(
    source,
    /rootNavigationRef\.navigate\('Plans',\s*{[\s\S]*screen:\s*'PlanDetail'/s,
    'BibleReaderScreen should return the user to the plan detail after daily completion'
  );
});

test('BibleReaderScreen uses a dedicated guard for plan-day completion so rerenders do not suppress the success alert', () => {
  assert.match(
    source,
    /const planDayCompletionGuardRef = useRef<string \| null>\(null\);/,
    'BibleReaderScreen should keep plan-day completion separate from the chapter analytics guard'
  );
  assert.match(
    source,
    /if \(!result\.success\) \{[\s\S]*planDayCompletionGuardRef\.current = null;[\s\S]*return;[\s\S]*\}/s,
    'BibleReaderScreen should clear the plan-day completion guard when persisting completion fails so the effect can retry'
  );
});

test('BibleReaderScreen renders explicit todays plan progress inside listen mode', () => {
  assert.match(source, /const renderListenMode = \(\) =>/, 'BibleReaderScreen should render a listen-mode UI block');
  assert.match(
    source,
    /listenPlanProgressCard/,
    'BibleReaderScreen should render a dedicated plan progress card while listening'
  );
  assert.match(
    source,
    /listenTargetProgress/,
    'BibleReaderScreen should show the current day target and completion count while listening'
  );
});

test('BibleReaderScreen shows transient chapter-counted feedback when listening satisfies a plan chapter', () => {
  assert.match(
    source,
    /const \[listenCountedNotice,\s*setListenCountedNotice\] = useState<string \| null>\(null\);/,
    'BibleReaderScreen should track a transient listen-counted notice in state'
  );
  assert.match(
    source,
    /alreadyCountedForPlan:/,
    'BibleReaderScreen should capture whether the active chapter was already counted for the plan before the current listen session'
  );
  assert.match(
    source,
    /readingPlans\.listenChapterCounted/,
    'BibleReaderScreen should localize the listen-counted micro-feedback copy'
  );
  assert.match(
    source,
    /listenCountedNoticeCard/,
    'BibleReaderScreen should render a dedicated micro-feedback notice when a chapter is counted by listening'
  );
});

test('BibleReaderScreen shows a transient listen-mode plan-counted message only after a fresh listen completion', () => {
  assert.match(
    source,
    /listenCountedNotice/,
    'BibleReaderScreen should keep listen-mode plan-counted feedback in transient local state'
  );
  assert.match(
    source,
    /getPlanChapterListenStatus/,
    'BibleReaderScreen should derive listen-mode counted-notice eligibility from a plan-aware helper'
  );
  assert.match(
    source,
    /listenChapterCounted/,
    'BibleReaderScreen should render the counted-for-today listen-mode micro-feedback copy'
  );
});

test('BibleReaderScreen exposes stable selectors for listen-mode plan progress and counted notice surfaces', () => {
  assert.match(
    source,
    /testID=\{LISTEN_PLAN_PROGRESS_CARD_TEST_ID\}/,
    'BibleReaderScreen should attach a stable testID to the listen-mode plan progress card'
  );
  assert.match(
    source,
    /getListenCountedNoticeViewModel\(listenCountedNotice\)/,
    'BibleReaderScreen should derive notice rendering from the reusable notice view-model helper'
  );
  assert.match(
    source,
    /testID=\{LISTEN_COUNTED_NOTICE_TEST_ID\}/,
    'BibleReaderScreen should attach a stable testID to the transient counted notice'
  );
});
