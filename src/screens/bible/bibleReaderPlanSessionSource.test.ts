import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const source = readFileSync(resolve(__dirname, 'BibleReaderScreen.tsx'), 'utf8');
const detailSource = readFileSync(resolve(__dirname, '../learn/ReadingPlanDetailScreen.tsx'), 'utf8');

test('ReadingPlanDetailScreen launches plan chapters with explicit plan-session params', () => {
  assert.match(
    detailSource,
    /const preferredChapterLaunchMode = useBibleStore\(\(state\) => state\.preferredChapterLaunchMode\);/,
    'ReadingPlanDetailScreen should read the persisted listen-or-read preference before launching the reader'
  );
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
    /\.\.\.\(preferredChapterLaunchMode === 'listen' \? \{ autoplayAudio: true \} : \{\}\),/,
    'ReadingPlanDetailScreen should request autoplay when the persisted launch preference is listen'
  );
  assert.match(
    detailSource,
    /preferredMode:\s*preferredChapterLaunchMode,/,
    'ReadingPlanDetailScreen should forward the persisted listen-or-read preference into BibleReader'
  );
  assert.match(
    detailSource,
    /returnToPlanOnComplete:\s*true,/,
    'ReadingPlanDetailScreen should request a clean return to the plan flow after completion'
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
  assert.match(
    source,
    /if \(!returnToPlanOnComplete\) \{[\s\S]*markChapterRead\(bookId,\s*chapter\);[\s\S]*\}/s,
    'BibleReaderScreen should avoid auto-marking plan sessions as read as soon as the reader loads'
  );
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

test('BibleReaderScreen keeps the shared floating playback dock above the plan strip in read mode', () => {
  assert.match(
    source,
    /Locked-in plan reader behavior: read-mode plans reuse the exact shared floating dock above the red plan strip\./,
    'BibleReaderScreen should document the locked-in read-mode plan dock invariant inline'
  );
  assert.match(
    source,
    /<ReaderPlaybackDock[\s\S]*hasNextChapter=\{hasReaderPlaybackDockNextChapter\}/s,
    'BibleReaderScreen should keep using the shared ReaderPlaybackDock while a plan read session is active'
  );
  assert.match(
    source,
    /onNextChapter=\{\(\) => void handleNextReadChapter\(\)\}/,
    'BibleReaderScreen should route the dock forward action through the shared read-mode next handler'
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

  assert.match(
    source,
    /if \(!returnToPlanOnComplete\) \{[\s\S]*markChapterRead\(bookId, chapter\);[\s\S]*\}/s,
    'BibleReaderScreen should skip automatic markChapterRead when the reader was opened as a plan session'
  );
  assert.match(
    source,
    /if \(shouldRecordReadCompletion && !\(activeChapterKey in chaptersRead\)\) \{[\s\S]*markChapterRead\(bookId, chapter\);[\s\S]*\}/s,
    'BibleReaderScreen should only count the current chapter as read when the user explicitly completes the plan step in read mode'
  );
  assert.match(
    handleCompletePlanDaySource,
    /const shouldReturnToPlanDetail =[\s\S]*activePlanSessionIndex <[\s\S]*sessionSummaries\.length[\s\S]*- 1[\s\S]*await stop\(\);[\s\S]*clearAudioPlaybackSequence\(\);[\s\S]*setAudioTrack\(null,\s*null,\s*null\);[\s\S]*clearPlanDayResume\(activePlanId, planDayNumber\);[\s\S]*rootNavigationRef\.navigate\(\s*'Plans',\s*shouldReturnToPlanDetail[\s\S]*screen:\s*'PlanDetail',[\s\S]*params:\s*\{\s*planId:\s*activePlanId\s*\}[\s\S]*screen:\s*'PlansHome'[\s\S]*\);/s,
    'BibleReaderScreen should fully tear down playback, then return non-final multi-session completion to plan detail while final completion still falls back to My Plans'
  );
});
