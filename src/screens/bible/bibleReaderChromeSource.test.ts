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

test('Bible listen surfaces stretch to fill the reader canvas instead of floating mid-screen', () => {
  const readerSource = readRelativeSource('./BibleReaderScreen.tsx');
  const audioFirstSource = readRelativeSource('../../components/audio/AudioFirstChapterCard.tsx');

  assert.match(
    readerSource,
    /listenColumn:\s*{[\s\S]*flex:\s*1,[\s\S]*justifyContent:\s*'space-between'/,
    'Listen-mode reader layout should fill the available height and push controls lower'
  );

  assert.match(
    audioFirstSource,
    /card:\s*{[\s\S]*flex:\s*1,[\s\S]*justifyContent:\s*'space-between'/,
    'Audio-first chapter card should fill the reader canvas and distribute content vertically'
  );
});

test('BibleReaderScreen uses minimal listen chrome instead of repeating chapter metadata in the header', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const showMinimalListenChrome =[\s\S]*(stableSessionMode|chapterSessionMode) === 'listen' \|\| chapterPresentationMode === 'audio-first';/,
    'BibleReaderScreen should compute a dedicated minimal-header mode for listen and audio-first chapters'
  );

  assert.match(
    source,
    /!showMinimalListenChrome && \([\s\S]*styles\.title/s,
    'BibleReaderScreen should hide the duplicated chapter title when minimal listen chrome is active'
  );

  assert.match(
    source,
    /!showMinimalListenChrome && \([\s\S]*styles\.translationChip/s,
    'BibleReaderScreen should hide the translation chip when minimal listen chrome is active'
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

test('listen mode moves the show-text action into the inline utility row and anchors controls lower', () => {
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
    /listenPlayerCard:\s*{[\s\S]*marginTop:\s*'auto'/,
    'BibleReaderScreen should pull the player cluster lower by anchoring the listen player card to the bottom'
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

test('premium read mode uses animated overlay chrome with blur-backed glass surfaces', () => {
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

  assert.match(
    source,
    /BlurView/,
    'BibleReaderScreen should use blur-backed glass surfaces instead of opaque reader chrome'
  );
});

test('premium read mode removes the old bottom audio bar and keeps the Genesis pill plus matching arrow circles', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('AudioPlayerBar'),
    false,
    'BibleReaderScreen should no longer render the old AudioPlayerBar inside read mode'
  );

  assert.match(
    source,
    /styles\.persistentReaderBottomBar/,
    'BibleReaderScreen should define one persistent bottom reader bar for the premium read layout'
  );

  assert.equal(
    source.includes('styles.collapsedReaderChapterPill'),
    false,
    'BibleReaderScreen should not swap to a chapter-only collapsed pill when the user scrolls'
  );

  assert.equal(
    source.includes('styles.persistentReaderBottomBarSurface'),
    false,
    'BibleReaderScreen should stop rendering the long shared glass bar around the premium reader controls'
  );

  assert.match(
    source,
    /styles\.persistentReaderBottomBarLayout/,
    'BibleReaderScreen should render the premium reader controls in a plain layout row without a capsule background'
  );

  assert.match(
    source,
    /styles\.persistentReaderChapterSurface/,
    'BibleReaderScreen should render a dedicated pill surface for the chapter label'
  );
});

test('premium read mode keeps circular chapter arrows and a Genesis pill inside the persistent bottom bar while scrolling', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handlePreviousReadChapter = async \(\) => \{/,
    'BibleReaderScreen should define a previous-chapter handler for the premium read controls'
  );

  assert.match(
    source,
    /const handleNextReadChapter = async \(\) => \{/,
    'BibleReaderScreen should define a next-chapter handler for the premium read controls'
  );

  assert.match(
    source,
    /styles\.persistentReaderBottomBar[\s\S]*styles\.persistentReaderBottomBarLayout[\s\S]*styles\.persistentReaderArrowSurface[\s\S]*styles\.persistentReaderChapterSurface[\s\S]*name="chevron-forward"/s,
    'BibleReaderScreen should keep the chapter arrows and Genesis pill on the persistent bottom bar in premium read mode'
  );

  assert.equal(
    source.includes('styles.floatingReaderUtilityLabel'),
    false,
    'BibleReaderScreen should remove the standalone AA button from the premium reader bottom bar'
  );
});

test('premium read mode centers a translation-list button under the listen and read rail', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /styles\.floatingReaderTopBar[\s\S]*styles\.floatingReaderTranslationDock/s,
    'BibleReaderScreen should render a centered translation dock below the listen/read rail'
  );

  assert.match(
    source,
    /styles\.floatingReaderTranslationDock[\s\S]*handleOpenTranslationOptions/s,
    'BibleReaderScreen should open translation options from the centered dock instead of the saved library'
  );

  assert.match(
    source,
    /floatingReaderTranslationDock:[\s\S]*alignItems:\s*'center'/,
    'BibleReaderScreen should center the translation dock container under the listen/read rail'
  );

  assert.match(
    source,
    /floatingReaderTranslationButtonTouchable:[\s\S]*alignSelf:\s*'center'/,
    'BibleReaderScreen should center the translation chip touch target instead of pinning it to the left edge'
  );

  assert.match(
    source,
    /\{translationLabel\}/,
    'BibleReaderScreen should show only the currently selected translation in the centered dock'
  );

  assert.equal(
    source.includes('availableListenTranslationLabel'),
    false,
    'BibleReaderScreen should not show a combined available-translation list in the centered dock'
  );

  assert.equal(
    source.includes('handleOpenLibrary'),
    false,
    'BibleReaderScreen should remove the saved library overflow action after the More tab reverts to settings'
  );

  assert.equal(
    source.includes('styles.floatingReaderLibraryButton'),
    false,
    'BibleReaderScreen should remove the old small library button from under the session rail'
  );

  assert.equal(
    source.includes('styles.expandedReaderChapterMeta'),
    false,
    'BibleReaderScreen should remove the translation/meta row from the expanded bottom chapter pill'
  );

  assert.equal(
    source.includes('styles.expandedReaderTranslationLabel'),
    false,
    'BibleReaderScreen should stop rendering the translation abbreviation inside the premium bottom pill'
  );
});

test('premium read mode uses a Genesis pill and matching arrow circles inside the persistent bottom bar', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /persistentReaderBottomBarLayout:\s*{[\s\S]*width:\s*'100%'/,
    'BibleReaderScreen should stretch the premium read control row across the available width'
  );

  assert.match(
    source,
    /persistentReaderBottomBarLayout:\s*{[\s\S]*flexDirection:\s*'row'/,
    'BibleReaderScreen should lay out the bottom bar controls in a single horizontal row'
  );

  assert.match(
    source,
    /persistentReaderArrowButton:\s*{[\s\S]*width:\s*layout\.minTouchTarget,[\s\S]*height:\s*layout\.minTouchTarget/,
    'BibleReaderScreen should render the chapter arrows as circular glass buttons'
  );

  assert.match(
    source,
    /persistentReaderChapterSlot:\s*{[\s\S]*flex:\s*1,[\s\S]*alignItems:\s*'center'/,
    'BibleReaderScreen should keep the Genesis label centered between the arrows'
  );

  assert.match(
    source,
    /persistentReaderChapterTouchable:\s*{[\s\S]*alignSelf:\s*'center'/,
    'BibleReaderScreen should keep the chapter touch target centered without adding a second bar'
  );

  assert.match(
    source,
    /persistentReaderChapterSurface:\s*{[\s\S]*minHeight:\s*layout\.minTouchTarget,[\s\S]*borderRadius:\s*radius\.pill/,
    'BibleReaderScreen should render the Genesis label inside a pill surface'
  );

  assert.match(
    source,
    /navigation\.push\('BiblePicker',\s*\{\s*initialBookId:\s*bookId,?\s*\}\)/,
    'BibleReaderScreen should open the book-and-chapter picker modal from the chapter pill'
  );

  assert.equal(
    source.includes('persistentReaderChapterCenter'),
    false,
    'BibleReaderScreen should remove the wide flex chapter-center column from the persistent bottom bar'
  );

  assert.equal(
    source.includes('persistentReaderChapterButton'),
    false,
    'BibleReaderScreen should remove the chapter pill from the persistent bottom bar'
  );

  const bottomBarSource = source.slice(
    source.indexOf('<View style={[styles.persistentReaderBottomBar'),
    source.indexOf('const renderLegacyReaderLayout')
  );

  assert.equal(
    bottomBarSource.includes('disabledIconButton'),
    false,
    'BibleReaderScreen should keep both arrow circles visually consistent and avoid dimming one side in the bottom bar'
  );
});

test('premium read mode uses a left-facing back arrow in the top-left control', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /onPress=\{\(\) => navigation\.navigate\('BibleBrowser'\)\}[\s\S]*?<GlassSurface style=\{styles\.glassIconButton\} intensity=\{44\}>[\s\S]*?name="arrow-back"/s,
    'BibleReaderScreen should use a left-facing back arrow for the top-left reader control that navigates to BibleBrowser'
  );
});

test('BibleReaderScreen exposes font size from the overflow menu instead of a standalone AA control', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /key: 'font-size'[\s\S]*label: t\('settings\.fontSize'\)/,
    'BibleReaderScreen should offer font size from the chapter actions sheet'
  );

  assert.equal(
    source.includes('styles.fontButtonLabel'),
    false,
    'BibleReaderScreen should remove the standalone AA header button once font size lives in overflow'
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
});

test('premium read chapter arrows transfer active audio before syncing the displayed chapter', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handleReadChapterNavigation = async \([\s\S]*?target:\s*\{ bookId: string; chapter: number \} \| null[\s\S]*?=> \{[\s\S]*?shouldTransferActiveAudioOnChapterChange\([\s\S]*?await playChapter\(target\.bookId, target\.chapter\);[\s\S]*?syncReaderReference\(target\.bookId, target\.chapter\);/s,
    'BibleReaderScreen should hand active audio off to the next chapter before syncing the read view'
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
