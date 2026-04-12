import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'BibleReaderScreen.tsx'), 'utf8');

test('BibleReaderScreen uses plan-day activity helpers to detect when todays target is complete', () => {
  assert.match(
    source,
    /getCurrentPlanDaySummary/,
    'BibleReaderScreen should evaluate read and listen activity against the current plan day'
  );
});

test('BibleReaderScreen keeps read-mode plan completion explicit while still routing completed days back to PlanDetail', () => {
  assert.match(
    source,
    /await markPlanSessionComplete\(activePlanId,\s*planDayNumber,\s*activePlanSessionKey\)|await markDayComplete\(activePlanId,\s*planDayNumber\)/,
    'BibleReaderScreen should mark plan completion through the shared service flow for both multi-session and single-session plans'
  );
  assert.match(
    source,
    /chapterSessionMode === 'read'/,
    'BibleReaderScreen should gate read-mode day completion behind the current reader session mode'
  );
  assert.match(
    source,
    /const handleCompletePlanDay = useCallback\(/,
    'BibleReaderScreen should define an explicit final-step handler for completing a plan day from read mode'
  );
  assert.equal(
    source.includes('activePlanProgress.current_day !== planDayNumber'),
    false,
    'BibleReaderScreen should not block explicit plan-session completion just because the tapped day differs from progress.current_day'
  );
  assert.match(
    source,
    /rootNavigationRef\.navigate\('Plans',\s*{[\s\S]*screen:\s*'PlanDetail'/s,
    'BibleReaderScreen should return the user to the plan detail after daily completion'
  );
  assert.equal(
    source.includes('readingPlans.dailyTargetCompleteTitle'),
    false,
    'BibleReaderScreen should no longer show the old daily-complete alert once the explicit check action exists'
  );
  assert.equal(
    source.includes('readingPlans.dailyTargetCompleteBody'),
    false,
    'BibleReaderScreen should remove the old daily-complete alert body copy from the reader flow'
  );
  assert.equal(
    source.includes('const shouldAutoCompleteSession ='),
    false,
    'BibleReaderScreen should keep plan completion explicit instead of auto-completing listen sessions'
  );
});

test('BibleReaderScreen keeps rhythm completions inside the reader until the final segment, then returns to RhythmDetail', () => {
  assert.match(
    source,
    /clearPlanDayResume\(activePlanId,\s*planDayNumber\)/,
    'BibleReaderScreen should clear the per-day resume pointer once a rhythm segment is completed'
  );
  assert.match(
    source,
    /if \(activeRhythmSession\) \{/,
    'BibleReaderScreen should branch into dedicated rhythm-session completion behavior when session context is present'
  );
  assert.match(
    source,
    /screen:\s*'RhythmDetail'/,
    'BibleReaderScreen should return to the rhythm detail view after the final rhythm segment finishes'
  );
  assert.match(
    source,
    /sessionContext:\s*activeRhythmSession/,
    'BibleReaderScreen should preserve the active rhythm session context while hopping to the next segment'
  );
});

test('BibleReaderScreen renders the simplified listen-mode plan chrome without the old progress card', () => {
  assert.match(
    source,
    /renderPlanSessionBottomBar/,
    'BibleReaderScreen should render a shared bottom plan strip while listening or reading'
  );
  assert.match(
    source,
    /floatingReaderPlanExitButton/,
    'BibleReaderScreen should render a small exit arrow in plan mode'
  );
  assert.equal(
    source.includes('listenPlanProgressCard'),
    false,
    'BibleReaderScreen should not render the old duplicate plan progress card inside listen mode'
  );
  assert.equal(
    source.includes('LISTEN_PLAN_PROGRESS_CARD_TEST_ID'),
    false,
    'BibleReaderScreen should not keep the old listen-mode plan progress card selector around'
  );
  assert.match(
    source,
    /showPlanChapterArrows = chapterSessionMode === 'listen';/,
    'BibleReaderScreen should keep plan strip chapter arrows only while listening so read mode can use the shared floating dock'
  );
});

test('BibleReaderScreen uses a plan-aware read-mode dock next action and keeps chapter navigation bounded to the active session', () => {
  assert.match(
    source,
    /const shouldConstrainChapterNavigationToSession = activeRhythmSession != null \|\| showPlanSessionChrome;/,
    'BibleReaderScreen should prevent plan and rhythm sessions from leaking into adjacent Bible chapters'
  );
  assert.match(
    source,
    /const hasReaderPlaybackDockNextChapter =[\s\S]*hasNextChapter \|\| hasPlanReadDockNextAction/s,
    'BibleReaderScreen should keep the shared dock enabled for either the next chapter or the explicit plan completion step'
  );
  assert.match(
    source,
    /const handleReaderPlaybackDockNextChapter = async \(\) => \{/,
    'BibleReaderScreen should define a dedicated plan-aware forward action for the shared read-mode dock'
  );
  assert.match(
    source,
    /await handleCompletePlanDay\(\);/,
    'BibleReaderScreen should complete the active plan day from the dock when the final read-mode chapter is reached'
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

test('BibleReaderScreen exposes stable selectors for listen-mode counted feedback surfaces', () => {
  assert.match(
    source,
    /testID=\{LISTEN_COUNTED_NOTICE_TEST_ID\}/,
    'BibleReaderScreen should attach a stable testID to the transient counted notice'
  );
  assert.match(
    source,
    /getListenCountedNoticeViewModel\(listenCountedNotice\)/,
    'BibleReaderScreen should derive notice rendering from the reusable notice view-model helper'
  );
});

test('BibleReaderScreen anchors plan-day completion summary to the explicit session day', () => {
  assert.match(
    source,
    /getCurrentPlanDaySummary\(\{[\s\S]*dayNumber:\s*planDayNumber,[\s\S]*\}\)/s,
    'BibleReaderScreen should calculate completion against the explicit plan session day so multi-passage or manually opened days can finish correctly'
  );
});
