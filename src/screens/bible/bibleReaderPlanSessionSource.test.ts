// UI-only source check: asserts on component render code, which the suite cannot render (no component renderer); not a behaviour test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readBibleReaderSource } from './bibleReaderSourceFiles';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readBibleReaderSource();
const detailSource = readFileSync(resolve(__dirname, '../plans/PlanDetailScreen.tsx'), 'utf8');

test('PlanDetailScreen launches plan chapters with explicit plan-session params', () => {
  assert.match(
    detailSource,
    /const preferredChapterLaunchMode = useBibleStore\(\(state\) => state\.preferredChapterLaunchMode\);/,
    'PlanDetailScreen should read the persisted listen-or-read preference before launching the reader'
  );
  assert.match(
    detailSource,
    /screen:\s*'BibleReader'/,
    'PlanDetailScreen should launch into the Bible reader for explicit plan sessions'
  );
  assert.match(
    detailSource,
    /playbackSequenceEntries,/,
    'PlanDetailScreen should pass the full day playback sequence into the reader'
  );
  assert.match(
    detailSource,
    /planId,/,
    'PlanDetailScreen should pass the active plan id into the reader session'
  );
  assert.match(
    detailSource,
    /planDayNumber:\s*dayNumber,/,
    'PlanDetailScreen should anchor the reader session to the tapped day number, not just the store current day'
  );
  assert.match(
    detailSource,
    /shouldAutoplayPlanDayLaunch\(\{\s*trigger: 'open',\s*preferredMode: preferredChapterLaunchMode,[\s\S]*?\.\.\.\(autoplayAudio \? \{ autoplayAudio: true \} : \{\}\),/,
    'PlanDetailScreen should request autoplay under the listen preference through the shared rule that keeps a paused listener paused'
  );
  assert.match(
    detailSource,
    /preferredMode:\s*preferredChapterLaunchMode,/,
    'PlanDetailScreen should forward the persisted listen-or-read preference into BibleReader'
  );
  assert.match(
    detailSource,
    /returnToPlanOnComplete:\s*true,/,
    'PlanDetailScreen should request a clean return to the plan flow after completion'
  );
});

test('BibleReaderScreen constrains plan-session playback to the active session slice', () => {
  assert.match(
    source,
    /const activePlanPlaybackSequenceEntries = useMemo\([\s\S]*buildPlanDayPlaybackSequenceEntries\(activePlanSessionEntries\)/s,
    'BibleReaderScreen should derive a bounded playback sequence from the active plan session entries'
  );
  assert.match(
    source,
    /const playbackSequenceEntriesForAudio = useMemo\([\s\S]*return activePlanPlaybackSequenceEntries;/s,
    'BibleReaderScreen should derive a final audio playback slice that can clamp rhythm playback down to the active segment'
  );
  assert.match(
    source,
    /getAdjacentAudioPlaybackSequenceEntry\([\s\S]*activePlanPlaybackSequenceEntries,/,
    'BibleReaderScreen should resolve previous and next plan chapters from the bounded session slice'
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
  // Skipping the on-load markChapterRead in a plan session is covered behaviourally in
  // readerChapterLoader.test.ts.
});

test('BibleReaderScreen derives rhythm session ownership from the route session context when present', () => {
  assert.match(
    source,
    /const activeRhythmSession = sessionContext\?\.type === 'rhythm' \? sessionContext : null;/,
    'BibleReaderScreen should recognize a rhythm session context from the shared reader route params'
  );
  assert.match(
    source,
    /const resolvePlanSessionRouteParams = useCallback\(/,
    'BibleReaderScreen should centralize plan-or-rhythm route param updates for chapter navigation'
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
    /<PlanSessionBottomBar/,
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
    /minHeight:\s*planSessionBottomBarHeight/,
    'BibleReaderScreen should size the plan strip to at least the full tab-bar footprint, growing only when large text needs it'
  );
  assert.match(
    source,
    /const planSessionBottomBarHeight = rootTabBarHeight;/,
    'BibleReaderScreen should size the plan strip to the exact shared root tab-bar footprint'
  );
  assert.match(
    source,
    /paddingBottom:\s*rootTabBarBottomPadding \+ spacing\.xs/,
    'BibleReaderScreen should align the plan strip padding to the shared tab-bar inset instead of stacking above it'
  );
  assert.match(
    source,
    /const planSessionBottomBarAnimatedStyle = useAnimatedStyle\(/,
    'BibleReaderScreen should animate the plan strip with the shared reader bottom chrome'
  );
  assert.match(
    source,
    /translateY:\s*rootTabBarHeight \* readerBottomChromeProgressShared\.value/,
    'BibleReaderScreen should move the plan strip by the exact tab-bar height as the reader chrome collapses'
  );
  assert.match(
    source,
    /const showPlanChapterArrows = chapterSessionMode === 'listen';/,
    'BibleReaderScreen should keep strip arrows only in listen mode so read mode can reuse the shared floating dock'
  );
  assert.match(
    source,
    /const showPlanPreviousChapterButton = hasPrevChapter;/,
    'BibleReaderScreen should only show the listen-mode back arrow when a previous chapter exists'
  );
  assert.match(
    source,
    /planSessionBottomBarCopyCentered/,
    'BibleReaderScreen should center the plan copy inside the red strip'
  );
  assert.match(
    source,
    /planSessionBottomBarCopyListenMode/,
    'BibleReaderScreen should keep the listen-mode plan strip using the shared centered copy treatment'
  );
  assert.match(
    source,
    /const isLastPlanChapter = activePlanChapterIndex === activePlanDayChapterItems\.length - 1;/,
    'BibleReaderScreen should detect when the current chapter is the final chapter for the active plan day'
  );
  assert.match(
    source,
    /getPlanSessionTrailingActionState\(\{/,
    'BibleReaderScreen should derive the trailing plan-strip action from a shared model helper'
  );
  assert.match(
    source,
    /name=\{showPlanCompletionAction \? 'checkmark' : 'chevron-forward'\}/,
    'BibleReaderScreen should render a checkmark icon instead of a forward arrow on the final plan-day chapter'
  );
  assert.match(
    source,
    /showChapterNavigation=\{!showPlanSessionChrome\}/,
    'BibleReaderScreen should hide the chapter-skip buttons from the listen-mode player once the plan strip owns navigation'
  );
  assert.match(
    source,
    /readingPlans\.completeDayCta/,
    'BibleReaderScreen should label the final plan-day completion action with the localized complete-day copy'
  );
});

test('BibleReaderScreen keeps the shared player capsule above the plan strip in read mode', () => {
  assert.match(
    source,
    /Locked-in plan reader behavior: a plan route hides the root tabs, and the same\s*\/\/ player capsule the tab bar carries floats above the red plan strip instead\./,
    'BibleReaderScreen should document the locked-in read-mode plan transport invariant inline'
  );
  assert.match(
    source,
    /<PlayerBar\s+scope="reader"/,
    'BibleReaderScreen should draw the same PlayerBar the tab bar uses while a plan read session hides the tabs'
  );
  assert.match(
    source,
    /hasNext: hasReaderBarNextChapter,/,
    'BibleReaderScreen should hand the plan-aware next action to the player bar'
  );
  assert.match(
    source,
    /next: \(\) => void handleNextReadChapter\(\),/,
    'BibleReaderScreen should route the bar forward action through the shared read-mode next handler'
  );
});

test('BibleReaderScreen bounds audio playback to the active plan or rhythm slice instead of the full routed session', () => {
  assert.match(
    source,
    /const playbackSequenceEntriesForAudio = useMemo\(\(\) => \{[\s\S]*if \(activeRhythmSession\) \{[\s\S]*slice\(segment\.startIndex, segment\.endIndex\)[\s\S]*return activePlanPlaybackSequenceEntries;/s,
    'BibleReaderScreen should clamp the audio-store playback sequence to the active rhythm segment or active plan-session entries'
  );
  assert.match(
    source,
    /setPlaybackSequence\(playbackSequenceEntriesForAudio\);/,
    'BibleReaderScreen should push the bounded playback slice into the shared audio store'
  );
});

test('BibleReaderScreen avoids auto-completing plan chapters on open and returns completed multi-session plans to plan detail', () => {
  const handleCompletePlanDayMatch = source.match(
    /const handleCompletePlanDay = useCallback\(async \(\) => \{[\s\S]*?\n\s+\}, \[/
  );
  assert.ok(
    handleCompletePlanDayMatch,
    'BibleReaderScreen should define the plan completion handler inline'
  );
  const handleCompletePlanDaySource = handleCompletePlanDayMatch?.[0] ?? '';

  // Skipping the on-load markChapterRead in a plan session is covered behaviourally in
  // readerChapterLoader.test.ts.
  // Which chapters a completed step records is covered behaviourally by
  // getPlanStepReadChapters in readingPlanActivity.test.ts.
  assert.match(
    handleCompletePlanDaySource,
    /if \(chapterSessionMode === 'read'\) \{\s*for \(const read of getPlanStepReadChapters\(activePlanSessionEntries\)\) \{\s*markChapterRead\(read\.bookId, read\.chapter\);/s,
    'BibleReaderScreen should record the step as read only when the user explicitly completes it in read mode, even for chapters read before'
  );
  assert.match(
    handleCompletePlanDaySource,
    /const shouldReturnToPlanDetail =[\s\S]*completionResult.data\?\.current_session[\s\S]*await stop\(\);[\s\S]*clearAudioPlaybackSequence\(\);[\s\S]*setAudioTrack\(null,\s*null,\s*null\);[\s\S]*clearPlanDayResume\(activePlanId, planDayNumber\);[\s\S]*rootNavigationRef\.navigate\(\s*'Plans',\s*shouldReturnToPlanDetail[\s\S]*screen:\s*'PlanDetail',[\s\S]*params:\s*\{\s*planId:\s*activePlanId\s*\}[\s\S]*screen:\s*'PlansHome'[\s\S]*\);/s,
    'BibleReaderScreen should fully tear down playback, then return non-final multi-session completion to plan detail while final completion still falls back to My Plans'
  );
});
