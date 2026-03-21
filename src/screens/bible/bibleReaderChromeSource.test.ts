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
    /const showMinimalListenChrome =[\s\S]*chapterSessionMode === 'listen' \|\| chapterPresentationMode === 'audio-first';/,
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

test('switching the chapter session into listen mode starts playback for the displayed chapter', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /const handleSessionModePress = \(requestedMode: 'listen' \| 'read'\) => \{[\s\S]*if \(nextMode === 'listen' && !isCurrentAudioChapter\) \{[\s\S]*void playChapter\(bookId, chapter\);[\s\S]*\}/,
    'BibleReaderScreen should start chapter playback when the user switches from read into listen mode'
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
    /Animated\.event\(/,
    'BibleReaderScreen should derive the premium reader motion from scroll-driven Animated events'
  );

  assert.match(
    source,
    /BlurView/,
    'BibleReaderScreen should use blur-backed glass surfaces instead of opaque reader chrome'
  );
});

test('premium read mode removes the old bottom audio bar and uses dedicated floating reader controls instead', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.equal(
    source.includes('AudioPlayerBar'),
    false,
    'BibleReaderScreen should no longer render the old AudioPlayerBar inside read mode'
  );

  assert.match(
    source,
    /styles\.floatingReaderBottomBar/,
    'BibleReaderScreen should define a dedicated floating bottom reader bar for the premium read layout'
  );

  assert.match(
    source,
    /styles\.collapsedReaderChapterPill/,
    'BibleReaderScreen should define the compact collapsed chapter pill used after scrolling'
  );
});

test('premium read mode replaces the bottom library and AA controls with chapter arrows', () => {
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
    /styles\.floatingReaderBottomBar[\s\S]*name="chevron-back"[\s\S]*styles\.expandedReaderChapterPill[\s\S]*name="chevron-forward"/s,
    'BibleReaderScreen should render left and right chapter arrows around the bottom chapter pill in premium read mode'
  );

  assert.equal(
    source.includes('styles.floatingReaderUtilityLabel'),
    false,
    'BibleReaderScreen should remove the standalone AA button from the premium reader bottom bar'
  );
});

test('premium read mode moves the library action under the listen/read rail and drops the bottom translation chip', () => {
  const source = readRelativeSource('./BibleReaderScreen.tsx');

  assert.match(
    source,
    /styles\.floatingReaderTopBar[\s\S]*styles\.floatingReaderLibraryButton/s,
    'BibleReaderScreen should render a dedicated small library button below the listen/read rail'
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
    /const handleReadChapterNavigation = async \(target: \{ bookId: string; chapter: number \} \| null\) => \{[\s\S]*shouldTransferActiveAudioOnChapterChange\([\s\S]*await playChapter\(target\.bookId, target\.chapter\);[\s\S]*syncReaderReference\(target\.bookId, target\.chapter\);/s,
    'BibleReaderScreen should hand active audio off to the next chapter before syncing the read view'
  );
});
