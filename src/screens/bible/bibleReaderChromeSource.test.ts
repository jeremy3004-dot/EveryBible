import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readRelativeSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url).href), 'utf8');
}

test('BibleReaderScreen no longer renders a duplicate chapter rail under the player', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('styles.chapterRail'),
    false,
    'BibleReaderScreen should not render the old bottom chapter rail once player navigation is in place'
  );

  assert.equal(
    source.includes('handlePrevChapter'),
    false,
    'BibleReaderScreen should not keep the removed chapter rail handlers around'
  );

  assert.equal(
    source.includes('handleNextChapter'),
    false,
    'BibleReaderScreen should not keep the removed chapter rail handlers around'
  );
});

test('Bible listen surfaces leave breathing room above the bottom edge instead of clipping the player controls', () => {
  const readerSource = readRelativeSource('./BibleReaderScreen.tsx');
  const audioFirstSource = readRelativeSource('../../components/audio/AudioFirstChapterCard.tsx');

  assert.match(
    readerSource,
    /listenColumn:\s*{[\s\S]*flex:\s*1,[\s\S]*justifyContent:\s*'flex-start'/,
    'Listen-mode reader layout should top-align the chapter stack so the controls sit higher on screen'
  );

  assert.match(
    audioFirstSource,
    /card:\s*{[\s\S]*flex:\s*1,[\s\S]*paddingBottom:\s*20,[\s\S]*justifyContent:\s*'flex-start'/,
    'Audio-first chapter card should top-align its content and add breathing room below the player'
  );
});

test('BibleReaderScreen reuses the shared top chrome in listen mode and removes the duplicate chapter title under the artwork', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const showMinimalListenChrome =[\s\S]*(stableSessionMode|chapterSessionMode) === 'listen' \|\| chapterPresentationMode === 'audio-first';/,
    'BibleReaderScreen should still compute a dedicated listen-chrome mode for listen and audio-first chapters'
  );

  assert.match(
    source,
    /const renderSharedTopChrome = \(useAnimatedChrome: boolean\) => \(/,
    'BibleReaderScreen should define a shared top chrome renderer so listen and read stay visually aligned'
  );

  assert.match(
    source,
    /const renderLegacyReaderLayout = \(\) => \([\s\S]*\{renderSharedTopChrome\(false\)\}/s,
    'BibleReaderScreen should render the shared top chrome inside the legacy listen/read layout'
  );

  assert.match(
    source,
    /const renderPremiumReadLayout = \(\) => \([\s\S]*\{renderSharedTopChrome\(true\)\}/s,
    'BibleReaderScreen should render the same shared top chrome inside the premium read layout'
  );

  assert.equal(
    source.includes('styles.listenMetaRow'),
    false,
    'BibleReaderScreen should remove the duplicate listen-mode metadata row once the top chrome carries the reference'
  );

  assert.equal(
    source.includes('styles.listenChapterTitle'),
    false,
    'BibleReaderScreen should remove the duplicate listen-mode chapter title below the artwork'
  );

  assert.equal(
    source.includes('styles.listenTimeCenterText'),
    false,
    'BibleReaderScreen should remove the duplicate chapter reference from the listen-mode scrubber row'
  );

  assert.equal(
    source.includes("t('bible.verseCount'"),
    false,
    'BibleReaderScreen should not show the verse count under the listen-mode chapter title'
  );
});

test('BibleReaderScreen lazy-loads verse timestamps only when follow-along opens', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes("from '../../services/bible/verseTimestamps'"),
    false,
    'BibleReaderScreen should keep the large verse timestamp require map off the initial reader import path'
  );

  assert.match(
    source,
    /import\('\.\.\/\.\.\/services\/bible\/verseTimestamps'\)/,
    'BibleReaderScreen should dynamically import the verse timestamp module when follow-along is requested'
  );
});

test('listen mode no longer renders the extra eyebrow and play-CTA card copy above the player', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('styles.listenEyebrow'),
    false,
    'BibleReaderScreen should remove the extra translation eyebrow from the listen-mode hero'
  );

  assert.equal(
    source.includes('styles.listenPrimaryAction'),
    false,
    'BibleReaderScreen should remove the redundant play-chapter CTA from the listen-mode hero'
  );
});

test('BibleReaderScreen renders scripture section headings with the shared reading heading token', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const headingFontSize = scaleValue\(typography\.readingHeading\.fontSize\);/,
    'BibleReaderScreen should size scripture section headings from the shared reading heading token'
  );

  assert.match(
    source,
    /sectionHeading:\s*{\s*\.\.\.typography\.readingHeading,\s*marginTop:\s*8,/s,
    'BibleReaderScreen should style section headings with the shared reading heading typography'
  );

  assert.match(
    source,
    /color:\s*colors\.biblePrimaryText/,
    'BibleReaderScreen section headings should read like primary scripture text rather than secondary metadata'
  );
});

test('listen mode moves the show-text action into the inline utility row and keeps the controls comfortably above the bottom edge', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('styles.listenActionsRow'),
    false,
    'BibleReaderScreen should remove the standalone listen action row once show text is inline'
  );

  assert.equal(
    source.includes('styles.listenSecondaryAction'),
    false,
    'BibleReaderScreen should remove the large secondary show-text pill from listen mode'
  );

  assert.match(
    source,
    /listenPlayerCard:\s*{[\s\S]*paddingBottom:\s*20,/,
    'BibleReaderScreen should give the listen player card extra bottom breathing room so the utility row does not clip'
  );
});

test('listen mode delegates bundled background-music selection to PlaybackControls', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /<PlaybackControls[\s\S]*backgroundMusicChoice=\{backgroundMusicChoice\}[\s\S]*onChangeBackgroundMusicChoice=\{changeBackgroundMusicChoice\}/,
    'BibleReaderScreen listen mode should pass the bundled background-music props into PlaybackControls'
  );

  assert.equal(
    source.includes('showAudioOptionsSheet'),
    false,
    'BibleReaderScreen should remove the old placeholder audio-options sheet once the inline music picker is live'
  );

  assert.equal(
    source.includes('Ambient layers are not available for this chapter yet'),
    false,
    'BibleReaderScreen should remove the placeholder ambient-copy path once bundled music ships'
  );
});

test('listen mode passes chapter audio sharing into the shared playback controls and removes the old header button', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /<PlaybackControls[\s\S]*onShareAudio=\{\(\) => setShowChapterAudioShareSheet\(true\)\}/s,
    'BibleReaderScreen listen mode should move the audio-share action into PlaybackControls'
  );

  assert.equal(
    source.includes('listenShareButton'),
    false,
    'BibleReaderScreen should remove the old share button from the listen-mode metadata row'
  );
});

test('BibleReaderScreen keeps the root tab bar visible while read mode scroll gestures update the chrome', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /navigation\.setParams\(\{ tabBarVisible: nextVisible \}\);/,
    'BibleReaderScreen should store tab-bar visibility in the reader route params so the tab navigator can react to it'
  );

  assert.match(
    source,
    /getNextBibleTabBarVisibility\(\{\s*sessionMode: chapterSessionMode,\s*action: 'enter'/s,
    'BibleReaderScreen should make listen and read modes enter the reader with the tab bar visible'
  );

  assert.match(
    source,
    /chapterSessionMode !== 'read'/,
    'BibleReaderScreen should leave listen mode alone when scroll gestures occur'
  );

  assert.match(
    source,
    /getNextBibleTabBarVisibility\(\{\s*sessionMode: chapterSessionMode,\s*action: 'scrollEndDrag'/s,
    'BibleReaderScreen should keep the read-mode scroll-end restore logic for the root tab bar'
  );

  assert.equal(
    /getNextBibleTabBarVisibility\(\{\s*sessionMode: chapterSessionMode,\s*action: 'scrollStart'/s.test(
      source
    ),
    false,
    'BibleReaderScreen should no longer hide the root tab bar when read-mode scrolling starts'
  );
});

test('BibleReaderScreen directly hides the RootTab bar while a plan session is active', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /navigation\.getParent\(\)/,
    'BibleReaderScreen should reach up to the RootTab navigator during plan sessions'
  );

  assert.match(
    source,
    /rootTabNavigation\.setOptions\(\{\s*tabBarStyle:\s*\{\s*display:\s*'none'\s*\},\s*\}\)/s,
    'BibleReaderScreen should explicitly hide the RootTab bar while the plan reader is active'
  );

  assert.match(
    source,
    /rootTabNavigation\.setOptions\(\{\s*tabBarStyle:\s*undefined,\s*\}\)/,
    'BibleReaderScreen should restore the RootTab bar styling when plan-reader mode ends'
  );
});

test('BibleReaderScreen resolves chapter navigation targets across book boundaries', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /getAdjacentBibleChapter\(bookId, chapter, -1\)/,
    'BibleReaderScreen should resolve the previous chapter target through the canonical adjacent-book helper'
  );

  assert.match(
    source,
    /getAdjacentBibleChapter\(bookId, chapter, 1\)/,
    'BibleReaderScreen should resolve the next chapter target through the canonical adjacent-book helper'
  );
});

test('BibleReaderScreen removes the legacy header arrows so the session rail stays anchored between listen and read', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('navigation.navigate(\'BibleBrowser\')'),
    false,
    'BibleReaderScreen should remove the old top-left back button from the legacy header'
  );

  assert.equal(
    source.includes('styles.iconButton'),
    false,
    'BibleReaderScreen should remove the old icon-button header row from the top of the reader'
  );

  assert.equal(
    source.includes('styles.headerActions'),
    false,
    'BibleReaderScreen should replace the legacy multi-button header action row with a single anchored overflow action'
  );

  assert.match(
    source,
    /floatingReaderReferencePill:\s*{[\s\S]*maxWidth:\s*212,[\s\S]*height:\s*layout\.minTouchTarget,/s,
    'BibleReaderScreen should keep the top-left reference pill aligned at the same compact height as the other header buttons'
  );

  assert.match(
    source,
    /floatingReaderReferencePillSegment:\s*{[\s\S]*paddingHorizontal:\s*12,/s,
    'BibleReaderScreen should split the book and translation actions inside the top-left pill'
  );

  assert.match(
    source,
    /floatingReaderReferencePillDivider:\s*{[\s\S]*alignSelf:\s*'stretch'/s,
    'BibleReaderScreen should draw a thin divider that spans the full pill height'
  );
});

test('switching the chapter session into listen mode starts playback for the displayed chapter', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handleSessionModePress = \(requestedMode: 'listen' \| 'read'\) => \{[\s\S]*if \(nextMode === 'listen' && !isCurrentAudioChapter\) \{[\s\S]*void playChapter\(bookId, chapter\);[\s\S]*\}/,
    'BibleReaderScreen should start chapter playback when the user switches from read into listen mode'
  );
});

test('switching the chapter session into listen mode dismisses the verse selection tray', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handleSessionModePress = \(requestedMode: 'listen' \| 'read'\) => \{[\s\S]*if \(nextMode === 'listen'\) \{[\s\S]*dismissSelectedVerseSelection\(\);[\s\S]*\}/s,
    'BibleReaderScreen should clear the selection tray as part of entering listen mode'
  );
});

test('chapter feedback renders inline on the listen page while keeping the overflow modal as rollback fallback', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /styles\.listenFeedbackCard[\s\S]*thumbs-up-outline[\s\S]*thumbs-down-outline/s,
    'BibleReaderScreen should render the thumbs feedback composer directly on the listen page'
  );

  assert.match(
    source,
    /chapterFeedbackEnabled && !showInlineChapterFeedbackComposer[\s\S]*key:\s*'chapter-feedback'/s,
    'BibleReaderScreen should keep the overflow feedback action behind the inline composer rollback path'
  );

  assert.match(
    source,
    /handleSubmitChapterFeedback\('listener'\)/,
    'BibleReaderScreen should submit inline feedback as listener feedback'
  );

  assert.equal(
    source.includes('persistentReaderFeedbackButton'),
    false,
    'BibleReaderScreen should not introduce a persistent reader feedback button into the main chrome'
  );
});

test('chapter feedback modal avoids keyboard overlap while typing a comment', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /visible=\{showFeedbackModal\}[\s\S]*<KeyboardAvoidingView[\s\S]*keyboardShouldPersistTaps="handled"/s,
    'BibleReaderScreen should keep the feedback composer above the keyboard and make the modal content scrollable while typing'
  );
});

test('premium read mode keeps the animated overlay while the top controls stay flat', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /Animated\.ScrollView/,
    'BibleReaderScreen should switch the read canvas to an animated scroll view so chrome can collapse with scroll progress'
  );

  assert.match(
    source,
    /useAnimatedScrollHandler\(/,
    'BibleReaderScreen should derive the premium reader motion from scroll-driven animated scroll handlers'
  );

  assert.equal(
    source.includes('BlurView'),
    false,
    'BibleReaderScreen should keep the premium read header flat instead of using blur-backed glass surfaces'
  );

  assert.equal(
    source.includes('translateY:'),
    false,
    'BibleReaderScreen should keep the shared top chrome fixed in place instead of sliding vertically when scrolling'
  );
});

test('premium read mode moves book, chapter, and translation into the top-left pill', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('styles.persistentReaderBottomBar'),
    false,
    'BibleReaderScreen should remove the persistent bottom chapter rail once the top-left pill handles navigation'
  );

  assert.match(
    source,
    /styles\.floatingReaderReferencePill/,
    'BibleReaderScreen should define a pill surface for the current book, chapter, and translation'
  );

  assert.match(
    source,
    /handleOpenBookPicker/,
    'BibleReaderScreen should open the book picker from the top-left navigation pill'
  );

  assert.match(
    source,
    /getTranslatedBookName\(bookId, t\)[\s\S]*?\{chapter\}[\s\S]*?\{translationLabel\}/s,
    'BibleReaderScreen should render the book, chapter, and translation together inside the navigation pill'
  );

  assert.match(
    source,
    /styles\.floatingReaderTopBar[\s\S]*styles\.floatingReaderModeRail[\s\S]*styles\.floatingReaderMenuButton/s,
    'BibleReaderScreen should keep the read/listen rail centered with the flat overflow button still on the right'
  );

  assert.match(
    source,
    /const premiumReaderBottomPadding = useMemo\([\s\S]*paddingBottom:\s*premiumReaderBottomPadding,/s,
    'BibleReaderScreen should measure the short-chapter spacer so the text can reach the visible root tab bar'
  );

  assert.equal(
    source.includes('styles.floatingReaderTranslationDock'),
    false,
    'BibleReaderScreen should remove the separate translation dock now that translation lives in the navigation pill'
  );

  assert.equal(
    source.includes('styles.premiumReaderTitle'),
    false,
    'BibleReaderScreen should remove the large chapter title that used to sit below the top chrome'
  );

  assert.equal(
    source.includes('name="arrow-back"'),
    false,
    'BibleReaderScreen should remove the old back arrow from the premium read chrome'
  );

  assert.equal(
    source.includes('styles.floatingReaderHero'),
    false,
    'BibleReaderScreen should remove the floating chapter hero because the top-left pill now carries the chapter metadata'
  );
});

test('premium read mode keeps the three-dot overflow menu on the right while removing the duplicate translation chip', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /name="ellipsis-horizontal"/,
    'BibleReaderScreen should keep the overflow menu icon on the right side of the premium read chrome'
  );

  assert.equal(
    source.includes('styles.translationChip'),
    false,
    'BibleReaderScreen should not keep a separate translation chip once both modes share the same top chrome'
  );
});

test('premium read mode uses flat segmented top buttons with separate chapter and translation actions', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');
  const topChromeMatch = source.match(
    /const renderSharedTopChrome = \(useAnimatedChrome: boolean\)\s*=>\s*\(([\s\S]*?)\n\s{2}\);/
  );

  assert.ok(topChromeMatch, 'BibleReaderScreen should define the shared top chrome render block');

  const topChrome = topChromeMatch?.[1] ?? '';

  assert.equal(
    topChrome.includes('GlassSurface'),
    false,
    'BibleReaderScreen should remove glass surfaces from the shared top chrome buttons'
  );

  assert.match(
    topChrome,
    /styles\.floatingReaderReferencePillDivider/,
    'BibleReaderScreen should keep the small divider between the chapter and translation segments'
  );

  assert.match(
    topChrome,
    /top:\s*sharedTopChromeTop/,
    'BibleReaderScreen should place the shared top chrome from one explicit shared offset in both read and listen modes'
  );

  assert.match(
    source,
    /const sharedTopChromeTop = safeInsets\.top \+ premiumTopInset;/,
    'BibleReaderScreen should compute the top chrome offset once from the safe area and reuse it in both modes'
  );

  assert.match(
    source,
    /paddingTop:\s*readerContentTopPadding/,
    'BibleReaderScreen should reuse the same content top padding in read and listen so the header does not jump when toggling modes'
  );

  assert.match(
    topChrome,
    /backgroundColor:\s*colors\.bibleElevatedSurface,\s*borderColor:\s*colors\.bibleElevatedSurface/s,
    'BibleReaderScreen should use the single elevated secondary surface for the shared top controls instead of the older grayscale treatment'
  );

  assert.equal(
    source.includes('paddingTop: safeInsets.top,'),
    false,
    'BibleReaderScreen should not keep a root safe-area top padding that would offset read and listen differently'
  );

  assert.match(
    topChrome,
    /onPress=\{handleOpenBookPicker\}/,
    'BibleReaderScreen should keep the chapter segment opening the book picker'
  );

  assert.match(
    topChrome,
    /onPress=\{handleOpenTranslationOptions\}/,
    'BibleReaderScreen should make the translation segment open translation options'
  );
});

test('read mode occludes the dynamic-island area so verse text does not bleed into the notch region', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /chapterSessionMode === 'read'[\s\S]*styles\.dynamicIslandTopMask/s,
    'BibleReaderScreen should render a read-mode top mask to keep the notch area visually black'
  );

  assert.match(
    source,
    /dynamicIslandTopMask:\s*{[\s\S]*position:\s*'absolute'[\s\S]*top:\s*0[\s\S]*zIndex:\s*29/s,
    'BibleReaderScreen should pin the top mask above reader content and below floating chrome controls'
  );
});

test('premium read mode restores the bottom previous and next chapter circles', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('floatingReaderChapterNavOverlay'),
    true,
    'BibleReaderScreen should render a pinned bottom overlay for the chapter navigation circles'
  );

  assert.equal(
    source.includes('bottom: layout.tabBarBaseHeight + spacing.lg'),
    true,
    'BibleReaderScreen should keep the chapter navigation circles above the visible root tab bar'
  );

  assert.equal(
    source.includes('handlePreviousReadChapter'),
    true,
    'BibleReaderScreen should keep the previous chapter action wired into premium read mode'
  );

  assert.equal(
    source.includes('handleNextReadChapter'),
    true,
    'BibleReaderScreen should keep the next chapter action wired into premium read mode'
  );

  assert.equal(
    source.includes('name="chevron-back"'),
    true,
    'BibleReaderScreen should render a back chevron inside the previous chapter circle'
  );

  assert.equal(
    source.includes('name="chevron-forward"'),
    true,
    'BibleReaderScreen should render a forward chevron inside the next chapter circle'
  );

  assert.match(
    source,
    /floatingReaderChapterNavButton:\s*{[\s\S]*width:\s*layout\.minTouchTarget,[\s\S]*height:\s*layout\.minTouchTarget,[\s\S]*borderRadius:\s*radius\.pill,/s,
    'BibleReaderScreen should give both chapter navigation buttons the same circular size'
  );
});

test('BibleReaderScreen still exposes font size from the overflow menu', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /key: 'font-size'[\s\S]*label: t\('settings\.fontSize'\)/,
    'BibleReaderScreen should keep font size inside the overflow menu'
  );
});

test('BibleReaderScreen closes the font size sheet when tapping outside the modal', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handleCloseFontSizeSheet = \(\) => \{[\s\S]*setShowFontSizeSheet\(false\);[\s\S]*\};/,
    'BibleReaderScreen should define a dedicated close helper for the font size sheet'
  );

  assert.match(
    source,
    /visible=\{showFontSizeSheet && canAdjustFontSize\}[\s\S]*onRequestClose=\{handleCloseFontSizeSheet\}[\s\S]*styles\.fontSheetBackdrop[\s\S]*onPress=\{handleCloseFontSizeSheet\}/s,
    'BibleReaderScreen should dismiss the font size sheet from the backdrop and the hardware close gesture'
  );

  assert.equal(
    source.includes('onTouchStart={showFontSizeSheet ? dismissFontSizeSheetFromReader : undefined}'),
    false,
    'BibleReaderScreen should stop relying on touch-through content taps to close the font size sheet'
  );
});

test('BibleReaderScreen keeps translation selection reachable from overflow after removing the bottom translation pill', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handleOpenTranslationOptions = \(\) => \{/,
    'BibleReaderScreen should define a dedicated overflow action for translation selection'
  );

  assert.match(
    source,
    /key: 'translation'[\s\S]*label: t\('bible\.selectTranslation'\)[\s\S]*onPress: handleOpenTranslationOptions/s,
    'BibleReaderScreen should expose translation selection in the overflow menu'
  );

  assert.equal(
    source.includes('TranslationPickerList'),
    true,
    'BibleReaderScreen should render the shared TranslationPickerList so the reader uses the same selector structure as Bible and Settings'
  );
});

test('BibleReaderScreen gives the translation sheet a fixed-height modal body so the shared picker list stays visible', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /modalContent:\s*{[\s\S]*height:\s*'78%',[\s\S]*overflow:\s*'hidden'/,
    'BibleReaderScreen should keep the translation modal tall enough for the shared picker contents on device'
  );
});

test('premium read chapter arrows only sync the displayed chapter without starting audio', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.doesNotMatch(
    source,
    /const handleReadChapterNavigation = async \([\s\S]*?target:\s*\{ bookId: string; chapter: number \} \| null[\s\S]*?=> \{[\s\S]*?await playChapter\(target\.bookId, target\.chapter\);/s,
    'BibleReaderScreen should not start audio playback from the read-tab chapter arrows'
  );

  assert.match(
    source,
    /const handleReadChapterNavigation = async \([\s\S]*?target:\s*\{ bookId: string; chapter: number \} \| null[\s\S]*?=> \{[\s\S]*?syncReaderReference\(target\.bookId, target\.chapter\);/s,
    'BibleReaderScreen should still update the displayed chapter when the user navigates in read mode'
  );
});

test('chapter sync preserves the current reader session mode in navigation params', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const syncReaderReference = \(nextBookId: string, nextChapter: number\) => \{[\s\S]*navigation\.setParams\([\s\S]*buildReaderChapterRouteParams\({[\s\S]*preferredMode: chapterSessionMode,[\s\S]*}\)[\s\S]*\);/s,
    'BibleReaderScreen should preserve the active listen-or-read session mode by passing it into the shared reader route-param builder'
  );
});

test('active audio chapter sync preserves the current session mode when the reader follows playback into a new chapter', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /navigation\.setParams\(\s*buildReaderChapterRouteParams\(\{[\s\S]*bookId: activeAudioBookId \?\? bookId,[\s\S]*chapter: activeAudioChapter,[\s\S]*preferredMode: chapterSessionMode,[\s\S]*}\)\s*\);/s,
    'BibleReaderScreen should preserve the active listen-or-read mode when auto-syncing the reader to the next playing chapter'
  );
});

test('changing the listen-or-read rail keeps the route preferred mode in sync for later chapter and translation changes', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handleSessionModePress = \(requestedMode: 'listen' \| 'read'\) => \{[\s\S]*navigation\.setParams\(\{[\s\S]*preferredMode: nextMode,[\s\S]*}\);/s,
    'BibleReaderScreen should update the route preferredMode whenever the user switches between listen and read'
  );
});

test('chapter session resets preserve the live transcript when the next chapter remains in listen mode with text', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const nextSessionMode = getInitialChapterSessionMode\(/,
    'BibleReaderScreen should derive the next chapter session mode before deciding whether to keep live transcript open'
  );

  assert.match(
    source,
    /setShowFollowAlongText\(\(current\) =>\s*getNextFollowAlongVisibility\(\{[\s\S]*currentlyVisible: current,[\s\S]*nextSessionMode,[\s\S]*hasText: verses.length > 0,[\s\S]*}\)\s*\);/s,
    'BibleReaderScreen should preserve the live transcript when chapter changes stay in listen mode with readable text'
  );

  assert.doesNotMatch(
    source,
    /sessionKeyRef\.current = sessionKey;\s*setShowFollowAlongText\(false\);/,
    'BibleReaderScreen should not unconditionally close the live transcript on every chapter session reset'
  );
});
