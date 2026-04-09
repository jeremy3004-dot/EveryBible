import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve(__dirname, 'BibleReaderScreen.tsx'), 'utf8');
const detailSource = readFileSync(resolve(__dirname, '../learn/ReadingPlanDetailScreen.tsx'), 'utf8');

test('ReadingPlanDetailScreen launches plan chapters with explicit plan-session params', () => {
  assert.match(
    detailSource,
    /screen:\s*'BibleReader'/,
    'ReadingPlanDetailScreen should launch into the Bible reader for explicit plan sessions'
  );
  assert.match(
    detailSource,
    /playbackSequenceEntries,/,
    'ReadingPlanDetailScreen should pass the full day playback sequence into the reader'
  );
  assert.match(
    detailSource,
    /planId:\s*planId,/,
    'ReadingPlanDetailScreen should pass the active plan id into the reader session'
  );
  assert.match(
    detailSource,
    /planDayNumber:\s*dayNumber,/,
    'ReadingPlanDetailScreen should anchor the reader session to the tapped day number, not just the store current day'
  );
  assert.match(
    detailSource,
    /returnToPlanOnComplete:\s*true,/,
    'ReadingPlanDetailScreen should request a clean return to the plan flow after completion'
  );
});

test('BibleReaderScreen derives the current plan-day chapter list and chapter index', () => {
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
  assert.match(
    source,
    /setPlanDayResume\(activePlanId,\s*planDayNumber,\s*bookId,\s*chapter\)/,
    'BibleReaderScreen should persist the current plan-day chapter so a reopened day can resume in place'
  );
});

test('BibleReaderScreen renders plan chrome with a top-left exit arrow and bottom plan strip', () => {
  assert.match(
    source,
    /const showPlanSessionChrome =/,
    'BibleReaderScreen should derive a dedicated plan-session chrome guard'
  );
  assert.match(
    source,
    /const handleExitPlanSession = useCallback\(/,
    'BibleReaderScreen should define a plan-session exit handler'
  );
  assert.match(
    source,
    /floatingReaderPlanExitButton/,
    'BibleReaderScreen should render a small exit arrow in the top chrome while in a plan'
  );
  assert.match(
    source,
    /renderPlanSessionBottomBar/,
    'BibleReaderScreen should render a dedicated bottom strip for plan context'
  );
  assert.match(
    source,
    /readingPlans\.dayLabel/,
    'BibleReaderScreen should localize the day label in the plan bottom strip'
  );
  assert.match(
    source,
    /readingPlans\.chapterProgress/,
    'BibleReaderScreen should localize the chapter progress copy in the plan bottom strip'
  );
});

test('BibleReaderScreen removes the old plan-footer next chapter button and duplicated listen plan card', () => {
  assert.equal(
    source.includes('renderPlanSessionFooter'),
    false,
    'BibleReaderScreen should not keep the old in-player plan footer renderer around'
  );
  assert.equal(
    source.includes('handleAdvancePlanSession'),
    false,
    'BibleReaderScreen should not keep the old next-chapter plan footer handler around'
  );
  assert.equal(
    source.includes('LISTEN_PLAN_PROGRESS_CARD_TEST_ID'),
    false,
    'BibleReaderScreen should not keep the old listen-mode plan progress card testID import around'
  );
  assert.equal(
    source.includes('nextChapterCta'),
    false,
    'BibleReaderScreen should not show a Next chapter button in plan mode'
  );
});

test('BibleReaderScreen reuses the bottom strip in read and listen modes without the old footer prop', () => {
  assert.match(
    source,
    /planSessionBottomBar/,
    'BibleReaderScreen should render a bottom plan strip that overlays the tab bar real estate'
  );
  assert.equal(
    source.includes('footer={showPlanSessionFooter ? renderPlanSessionFooter() : null}'),
    false,
    'BibleReaderScreen should not pass a custom plan footer into PlaybackControls anymore'
  );
  assert.match(
    source,
    /height:\s*planSessionBottomBarHeight/,
    'BibleReaderScreen should size the plan strip to the full tab-bar footprint'
  );
  assert.match(
    source,
    /safeInsets\.bottom \+ spacing\.sm/,
    'BibleReaderScreen should include the bottom safe area inside the plan strip instead of leaving the tab bar visible underneath it'
  );
  assert.match(
    source,
    /const showPlanChapterArrows = chapterSessionMode === 'read';/,
    'BibleReaderScreen should only show chapter arrows inside the plan strip while reading'
  );
  assert.match(
    source,
    /planSessionBottomBarCopyCentered/,
    'BibleReaderScreen should center the plan copy inside the red strip'
  );
  assert.match(
    source,
    /planSessionBottomBarCopyListenMode/,
    'BibleReaderScreen should keep the listen-mode plan strip centered without chapter arrows'
  );
  assert.match(
    source,
    /const isLastPlanChapter = activePlanChapterIndex === activePlanDayChapterItems\.length - 1;/,
    'BibleReaderScreen should detect when the current chapter is the final chapter for the active plan day'
  );
  assert.match(
    source,
    /const showPlanCompletionAction = showPlanChapterArrows && isLastPlanChapter;/,
    'BibleReaderScreen should swap the final plan-day read CTA from next to complete'
  );
  assert.match(
    source,
    /name=\{showPlanCompletionAction \? 'checkmark' : 'chevron-forward'\}/,
    'BibleReaderScreen should render a checkmark icon instead of a forward arrow on the final plan-day chapter'
  );
  assert.match(
    source,
    /readingPlans\.completeDayCta/,
    'BibleReaderScreen should label the final plan-day completion action with the localized complete-day copy'
  );
});
